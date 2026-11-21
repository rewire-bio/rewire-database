import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import ApiDocsPage from "../app/agents/api/page";
import { generateAgentsMd, generateLlmsTxt } from "../lib/llm-discoverability";
import lock from "../benchmark-data.lock.json";
import * as route from "../app/api/v1/[[...path]]/route";
import { buildCatalogue } from "../lib/catalogue-build";
import { indexRecords, indexSource } from "../lib/catalogue-index";
import { DATA_LICENCE, releaseCitation } from "../lib/data-licence";
import { API_BROWSER_CACHE } from "../cloudflare/page-cache.mjs";
import { safeSourceUrl } from "../lib/omics";
import { telemetryFromRecord } from "../lib/operational-telemetry";
import { API_BASE, API_CACHE_CONTROL, ENDPOINTS, ErrorShape, EXAMPLE_METRIC, NO_RULE, openApiDocument, responseSchema, resultItem, type Endpoint } from "../lib/public-api";
import { allUseCaseLeaderboards, leaderboardForUseCase, rankingsForRecord, runReceiptSources } from "../lib/release-leaderboard";
import { boardStats, boardStatsText } from "../lib/use-case-leaderboard";
import { reviewOf } from "../lib/use-case-ranking";
import { buildUseCases } from "../lib/use-cases-build";
import type { CatalogueRecord, ResultRow } from "../shared/omics/catalogue-query";

// Against the pinned release. Ids, order and totals are compared with the functions the pages use.
// Values (numbers, units, origins, statuses, links, findings) are compared with the raw records of
// the release, read here by id, so a wrong value cannot agree with itself. Nothing is written out,
// so adopting a new release does not need this file changed.
const ORIGIN = "https://origin.test";
const SITE = "https://benchmarks.rewirebio.io";
const get = (path: string, init: RequestInit = {}) => route.GET(new Request(`${ORIGIN}${API_BASE}${path}`, init));
const read = async (path: string) => {
  const response = await get(path);
  expect(response.status, path).toBe(200);
  return await response.json();
};
const plain = (value: unknown) => JSON.parse(JSON.stringify(value));

const { query } = buildCatalogue();
const models = indexRecords(indexSource(query, "model"), "model");
const benchmarks = indexRecords(indexSource(query, "benchmark"), "benchmark");
const useCases = buildUseCases().entries;
const boards = allUseCaseLeaderboards();
const findings = query.discrepancies({ limit: 500 });
const rankedModel = models.find((m) => rankingsForRecord(m.id).length > 0 && query.results({ id: m.id, limit: 1 }).total > 0)!;

// The release as stored, read without the API's own readers.
const raw = (id: string) => query.record(id)!;
const stored = findings.items.map((summary) => query.discrepancy(summary.id)!);
/** Result id to the unsettled findings it takes part in, from the findings' own result lists. */
const openByResult = new Map<string, Set<string>>();
for (const d of stored) if (!d.settled) for (const id of [...d.outlier_results, ...d.consensus_results, ...d.party_results])
  openByResult.set(id, (openByResult.get(id) ?? new Set()).add(d.id));
const listingOf = new Map(stored.map((d) => [d.id, d.listing]));
const rawNumber = (id: string) => {
  const value = raw(id).attributes.numeric_value;
  return value === undefined || value === null || value === "" ? null : Number(value);
};
const rawText = (value: unknown) => (typeof value === "string" && value.trim() ? value : null);
const evaluationOf = (resultId: string) => {
  const id = raw(resultId).links.find((link) => link.relation === "evaluation")?.target_id;
  return id ? query.record(id) : null;
};
const rawOrigin = (resultId: string) => rawText(evaluationOf(resultId)?.attributes.origin);
const receiptIds = runReceiptSources(query);
/** What a result's status and receipt must be, from the raw records alone: the receipt it or its evaluation cites, else its own status. */
const expectReview = (item: { review_status: string; receipt: { id: string; url: string } | null }, resultId: string) => {
  const result = raw(resultId);
  const cited = [...result.source_ids, ...(evaluationOf(resultId)?.source_ids ?? [])].find((id) => receiptIds.has(id) && query.record(id)) ?? null;
  expect(item.receipt?.id ?? null, resultId).toBe(cited);
  if (cited) expect(item.receipt!.url).toBe(`${SITE}/database/source/${cited}/`);
  expect(item.review_status, resultId).toBe(cited ? "reproduced"
    : result.status === "superseded" ? "superseded" : ["source_checked", "reproduced"].includes(result.status) ? "source_checked" : "author_reported");
};
const expectSources = (given: any[], ids: readonly string[]) => {
  const present = [...new Set(ids)].filter((id) => query.record(id));
  expect(given.map((s) => s.id)).toEqual(present);
  for (const source of given) {
    const record = raw(source.id);
    expect(record.kind).toBe("source");
    expect(source.url).toBe(`${SITE}/database/source/${source.id}/`);
    expect(source.source_url).toBe(safeSourceUrl(record.attributes.url) ?? null);
    if (typeof record.attributes.url === "string" && /^https:\/\//.test(record.attributes.url)) expect(source.source_url).toBe(record.attributes.url);
    expect(source.doi).toBe(rawText(record.attributes.doi));
  }
};
const expectFindingLinks = (given: any[], ids: Iterable<string>) => {
  expect(given.map((f) => f.id).sort()).toEqual([...ids].sort());
  for (const f of given) {
    expect(f.listing).toBe(listingOf.get(f.id));
    expect(f.url).toBe(`${SITE}/contested/${f.id}/`);
    expect(f.api_url).toBe(`${SITE}${API_BASE}/contested/${f.id}/`);
  }
};

afterEach(() => { vi.restoreAllMocks(); });

/** A real address for every endpoint, with ids taken from the release. */
function addressOf(endpoint: Endpoint): string | null {
  const ids: Record<string, string | undefined> = {
    "/models/{id}/": rankedModel.id,
    "/models/{id}/results/": rankedModel.id,
    "/use-cases/{slug}/board/": useCases[0]?.slug,
    "/contested/{id}/": findings.items[0]?.id,
  };
  if (!endpoint.path.includes("{")) return endpoint.path;
  const id = ids[endpoint.path];
  return id ? endpoint.path.replace(/\{[a-z]+\}/, id) : null;
}

describe("JSON API: every endpoint", () => {
  it("has a model with results and a leaderboard rank, use cases, benchmarks and findings to test against", () => {
    expect(rankedModel).toBeDefined();
    expect(useCases.length).toBeGreaterThan(0);
    expect(benchmarks.length).toBeGreaterThan(0);
    expect(findings.total).toBeGreaterThan(0);
  });

  it.each(ENDPOINTS.map((endpoint) => [endpoint.path, endpoint] as const))("%s answers in its documented shape, with release, licence, citation and cache headers", async (_path, endpoint) => {
    const address = addressOf(endpoint)!;
    expect(address, endpoint.path).toBeTruthy();
    const response = await get(address);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe(API_CACHE_CONTROL);
    // The Worker gives clients the same lifetime for an answer it serves from its cache.
    expect(API_CACHE_CONTROL).toBe(API_BROWSER_CACHE);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-expose-headers")).toBe("X-Rewire-Data-Release, X-Rewire-Frontend");
    // The edge cache refuses any Vary it does not key on; the handler sets none.
    expect(response.headers.get("vary")).toBeNull();
    expect(response.headers.has("set-cookie")).toBe(false);
    const body = await response.json();
    // Strict: a field the description does not name, or a missing one, fails here.
    expect(() => responseSchema(endpoint).parse(body)).not.toThrow();
    expect(body.release).toEqual({
      id: lock.release_id, released_at: query.release().released_at,
      repository: `https://github.com/${lock.repository}`, revision: lock.revision, manifest_url: `${SITE}/release-manifest.json`,
    });
    expect(body.licence).toEqual(DATA_LICENCE);
    expect(body.citation).toBe(releaseCitation(lock.release_id, SITE));
    expect(body.citation).toContain(lock.release_id);
    expect(body.links.self).toBe(`${SITE}${API_BASE}${address}`);
    expect(body.links.html).toMatch(/^https:\/\/benchmarks\.rewirebio\.io\//);
    expect("page" in body).toBe(!!endpoint.query?.cursor);
  });

  it("states the data licence with its limit, and no licence for the API description", () => {
    // The owner's licence for Rewire's compilation and annotations. Changing it is an edit to lib/data-licence.ts and to this test.
    expect(DATA_LICENCE).toEqual({
      spdx_id: "CC-BY-4.0",
      name: "Creative Commons Attribution 4.0 International",
      url: "https://creativecommons.org/licenses/by/4.0/",
      statement: "The compilation and annotations made by Rewire in this release are offered under CC BY 4.0; values and text taken from cited sources stay under the terms of those sources and are not covered by this licence.",
    });
    // info.license would state terms for the whole API without the limit, so it stays unset; the licence field and the description carry both.
    expect((openApiDocument() as { info: Record<string, unknown> }).info.license).toBeUndefined();
  });

  it("exports only a GET handler: the API cannot write", () => {
    expect(Object.keys(route).sort()).toEqual(["GET", "dynamic"]);
  });
});

describe("JSON API: models and benchmarks", () => {
  it("lists the records of the site's indexes, in their order, across pages", async () => {
    for (const [path, expected] of [["/models/", models], ["/benchmarks/", benchmarks]] as const) {
      const seen: string[] = [];
      let address: string | null = `${path}?limit=100`;
      while (address) {
        const body: any = await read(address);
        expect(body.page.total).toBe(expected.length);
        seen.push(...body.data.map((item: { id: string }) => item.id));
        expect(body.page.next_url === null).toBe(body.page.next_cursor === null);
        address = body.page.next_url ? body.page.next_url.slice(`${SITE}${API_BASE}`.length) : null;
      }
      expect(seen).toEqual(expected.map((r) => r.id));
    }
    const first = (await read("/models/?limit=1")).data[0];
    expect(first.url).toBe(`${SITE}/database/model/${models[0].id}/`);
    expect(first.api_url).toBe(`${SITE}${API_BASE}/models/${models[0].id}/`);
    expect(first.record_status).toBe(models[0].status === "reproduced" ? "source_checked" : models[0].status);
  });

  it("gives one model with its sources, its rank on each board and its open findings", async () => {
    const record = raw(rankedModel.id);
    const { data } = await read(`/models/${record.id}/`);
    expect(data.id).toBe(record.id);
    expect(data.record_status).toBe(record.status === "reproduced" ? "source_checked" : record.status);
    expect(data.facets).toEqual(plain(record.facets));
    expect(data.alias_of).toBeNull();
    expectSources(data.sources, record.source_ids);
    const rankings = rankingsForRecord(record.id);
    expect(rankings.length).toBeGreaterThan(0);
    expect(data.rankings.map((r: any) => [r.use_case_slug, r.rank, r.result_id, r.relevance, r.ranked_rows, r.display_value, r.configuration_id]))
      .toEqual(rankings.map(({ board, row }) => [board.use_case_slug, row.rank, row.source_record_id, board.protocol!.relevance, board.rows.length, row.display_value, row.model_id]));
    for (const ranking of data.rankings) {
      // The value, its unit and its origin are the result record's and its evaluation's, not the site's display scale.
      const result = raw(ranking.result_id);
      expect(result.kind).toBe("result");
      expect(ranking.numeric_value).toBe(rawNumber(ranking.result_id));
      expect(ranking.numeric_value).not.toBeNull();
      expect(ranking.unit).toBe(rawText(result.attributes.unit));
      expect(ranking.origin).toBe(rawOrigin(ranking.result_id));
      expect(ranking.independent).toBe(rawOrigin(ranking.result_id) === "independent_paper");
      expectReview(ranking, ranking.result_id);
      expect(ranking.result_url).toBe(`${SITE}/database/result/${ranking.result_id}/`);
      expect(ranking.board_url).toBe(`${SITE}${API_BASE}/use-cases/${ranking.use_case_slug}/board/`);
      expect(ranking).not.toHaveProperty("reviewed_status");
    }
    // One entry per board, each with its own protocol: nothing is averaged or combined.
    expect(new Set(data.rankings.map((r: any) => r.use_case_slug)).size).toBe(data.rankings.length);
    expect(Object.keys(data)).not.toContain("score");
    expectFindingLinks(data.open_findings, stored.filter((d) => !d.settled && d.systems.includes(record.id)).map((d) => d.id));
  });

  it("gives a model's recorded hardware and access facts, and its unsettled findings only", async () => {
    // A model whose record carries at least one fact, so an empty answer cannot pass.
    const withFacts = models.find((m) => Object.values(telemetryFromRecord(raw(m.id))).some((value) => value !== null))!;
    expect(withFacts).toBeDefined();
    expect((await read(`/models/${withFacts.id}/`)).data.telemetry).toEqual(plain(telemetryFromRecord(raw(withFacts.id))));
    // A model that unsettled findings compare, and one that only settled findings compare.
    const isModel = (id: string) => query.record(id)?.kind === "model";
    const contested = stored.find((d) => !d.settled && d.systems.some(isModel))!.systems.find(isModel)!;
    const open = stored.filter((d) => !d.settled && d.systems.includes(contested)).map((d) => d.id);
    expect(open.length).toBeGreaterThan(0);
    expectFindingLinks((await read(`/models/${contested}/`)).data.open_findings, open);
    const settledOnly = stored.flatMap((d) => d.systems).filter(isModel)
      .find((id) => stored.some((d) => d.settled && d.systems.includes(id)) && !stored.some((d) => !d.settled && d.systems.includes(id)));
    if (settledOnly) expect((await read(`/models/${settledOnly}/`)).data.open_findings).toEqual([]);
  });

  it("names the model an earlier id belongs to, and lists that model only once", async () => {
    const aliases = (query.recordsOfKind("model") as CatalogueRecord[]).flatMap((record) => record.links
      .filter((link) => link.relation === "alias_of" && query.record(link.target_id)?.kind === "model" && query.verifiedAssociation(record.id, "alias_of", link.target_id))
      .slice(0, 1).map((link) => [record.id, link.target_id] as const));
    expect(aliases.length).toBeGreaterThan(0);
    for (const [alias, target] of aliases.slice(0, 3)) {
      const { data } = await read(`/models/${alias}/`);
      expect(data.alias_of).toEqual({ id: target, name: expect.any(String), url: `${SITE}/database/model/${target}/`, api_url: `${SITE}${API_BASE}/models/${target}/` });
      expect(models.map((m) => m.id)).not.toContain(alias);
      expect((await read(`/models/${target}/`)).data.id).toBe(target);
    }
  });

  it("does not serve a model the release excludes", async () => {
    const record = raw(rankedModel.id);
    const real = query.record;
    const spy = vi.spyOn(query, "record").mockImplementation((id: string) => (id === record.id ? { ...record, status: "excluded" } : real(id)));
    for (const path of [`/models/${record.id}/`, `/models/${record.id}/results/`]) {
      const response = await get(path);
      expect(response.status, path).toBe(404);
      expect((await response.json()).error.code).toBe("not_found");
    }
    spy.mockRestore();
    expect((await get(`/models/${record.id}/`)).status).toBe(200);
  });

  it("answers 404 for an id that is not a model in this release", async () => {
    for (const id of ["no-such-model", benchmarks[0].id, "UPPER", "a".repeat(300)]) {
      const response = await get(`/models/${id}/`);
      expect(response.status, id).toBe(404);
      const body = await response.json();
      expect(() => ErrorShape.parse(body)).not.toThrow();
      expect((await get(`/models/${id}/results/`)).status, id).toBe(404);
    }
  });

  it("lists a model's results as the reader returns them, each with every source it cites", async () => {
    const expected = query.results({ id: rankedModel.id, limit: 25 });
    const body = await read(`/models/${rankedModel.id}/results/`);
    expect(body.page.total).toBe(expected.total);
    expect(body.data.evaluation_count).toBe(expected.evaluation_count);
    expect(body.data.results.map((r: { id: string }) => r.id)).toEqual(expected.items.map((row) => row.result.id));
    expect(body.data.metrics).toEqual([...new Set(query.results({ id: rankedModel.id, limit: 1 }).facets.metrics)].sort());
    for (const [index, row] of expected.items.entries()) {
      const item = body.data.results[index];
      // Every value below is read from the raw result and evaluation records.
      const result = raw(item.id);
      expect(result.kind).toBe("result");
      expect(item.url).toBe(`${SITE}/database/result/${row.result.id}/`);
      expectSources(item.sources, result.source_ids);
      expect(item.sources.length).toBeGreaterThan(0);
      expect(item.metric).toBe(rawText(result.attributes.metric));
      expect(item.metric).not.toBeNull();
      expect(item.metric_qualifier).toBe(rawText(result.attributes.metric_qualifier));
      expect(item.metric_direction).toBe(rawText(result.attributes.metric_direction));
      expect(item.unit).toBe(rawText(result.attributes.unit));
      expect(item.numeric_value).toBe(rawNumber(item.id));
      expect(item.printed_value).toBe(result.attributes.printed_value == null ? null : String(result.attributes.printed_value));
      expect(item.origin).toBe(rawOrigin(item.id));
      expect(item.independent).toBe(rawOrigin(item.id) === "independent_paper");
      expect(item.record_status).toBe(result.status === "reproduced" ? "source_checked" : result.status);
      expectReview(item, item.id);
      expect(item.evaluation?.id ?? null).toBe(evaluationOf(item.id)?.id ?? null);
      if (item.evaluation) expect(item.evaluation.url).toBe(`${SITE}/database/evaluation/${item.evaluation.id}/`);
      expectFindingLinks(item.open_findings, openByResult.get(item.id) ?? []);
    }
    // The release records a number and a direction for at least one of them, so nulls alone cannot pass.
    expect(body.data.results.some((item: any) => item.numeric_value !== null && ["higher", "lower"].includes(item.metric_direction))).toBe(true);
    // Filters are the reader's own.
    const metric = String(expected.items[0].result.attributes.metric);
    const filtered = await read(`/models/${rankedModel.id}/results/?metric=${encodeURIComponent(metric)}&limit=5`);
    expect(filtered.page.total).toBe(query.results({ id: rankedModel.id, metric, limit: 5 }).total);
    for (const item of filtered.data.results) expect(item.metric).toBe(metric);
    // The origin filter is the reader's too: "unreported" also matches an evaluation with no origin, given here as null.
    expect(body.data.origins).toEqual([...new Set(query.results({ id: rankedModel.id, limit: 1 }).facets.origins)].sort());
    for (const origin of ["independent_paper", "author_reported", "unreported"]) {
      const byOrigin = await read(`/models/${rankedModel.id}/results/?origin=${origin}&limit=100`);
      expect(byOrigin.page.total, origin).toBe(query.results({ id: rankedModel.id, origin, limit: 100 }).total);
      for (const item of byOrigin.data.results) expect(item.origin ?? "unreported", origin).toBe(origin);
    }
    // A second page continues where the first stopped.
    if (body.page.next_url) {
      const next = await read(body.page.next_url.slice(`${SITE}${API_BASE}`.length));
      expect(next.data.results[0].id).toBe(query.results({ id: rankedModel.id, limit: 25, cursor: expected.next_cursor! }).items[0].result.id);
    }
  });
});

describe("JSON API: a result's findings and filters", () => {
  it("links the unsettled findings a result takes part in, and no settled one", async () => {
    // From the release: a model with a result in an unsettled finding.
    const contestedModel = models.find((m) => query.results({ id: m.id, limit: 100 }).items.some((row) => openByResult.has(row.result.id)))!;
    expect(contestedModel).toBeDefined();
    const { data } = await read(`/models/${contestedModel.id}/results/?limit=100`);
    const contested = data.results.filter((item: any) => item.open_findings.length);
    expect(contested.length).toBeGreaterThan(0);
    for (const item of data.results) expectFindingLinks(item.open_findings, openByResult.get(item.id) ?? []);
    // Settled findings are left out even when they are passed in.
    const result = raw(contested[0].id);
    const finding = (id: string, settled: boolean) => ({ role: "outlier", discrepancy: { ...findings.items[0], id, label: id, listing: "review", settled } });
    const row = query.results({ id: contestedModel.id, limit: 100 }).items.find((r) => r.result.id === result.id)!;
    const item = resultItem(row, (id) => query.record(id), new Set(), { [result.id]: [finding("discrepancy-settled", true), finding("discrepancy-open", false)] });
    expect(item.open_findings).toEqual([{ id: "discrepancy-open", label: "discrepancy-open", listing: "review", url: `${SITE}/contested/discrepancy-open/`, api_url: `${SITE}${API_BASE}/contested/discrepancy-open/` }]);
  });

  it("documents a metric example the release has, and refuses a metric the model has no result for", async () => {
    const withExample = models.find((m) => query.results({ id: m.id, metric: EXAMPLE_METRIC, limit: 1 }).total > 0)!;
    expect(withExample, EXAMPLE_METRIC).toBeDefined();
    const body = await read(`/models/${withExample.id}/results/?metric=${EXAMPLE_METRIC}&limit=5`);
    expect(body.page.total).toBeGreaterThan(0);
    expect(body.data.metrics).toContain(EXAMPLE_METRIC);
    for (const item of body.data.results) expect(raw(item.id).attributes.metric).toBe(EXAMPLE_METRIC);
    const parameter = (openApiDocument() as any).paths["/models/{id}/results/"].get.parameters.find((p: any) => p.name === "metric");
    expect(parameter.description).toContain(`for example ${EXAMPLE_METRIC})`);
    // Every metric id in the release is one the parameter's pattern takes, so no listed metric is refused.
    const pattern = new RegExp(parameter.schema.pattern);
    const ids = new Set(query.recordIds().filter((r) => r.kind === "result").map((r) => raw(r.id).attributes.metric));
    expect(ids.size).toBeGreaterThan(0);
    for (const id of ids) expect(typeof id === "string" && pattern.test(id), String(id)).toBe(true);
    // "spearman" is not a metric id in the release: it must not read as "this model has no such results".
    for (const metric of ["spearman", "zz"]) {
      const response = await get(`/models/${withExample.id}/results/?metric=${metric}`);
      expect(response.status, metric).toBe(400);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect((await response.json()).error.code).toBe("invalid_parameter");
    }
  });
});

describe("JSON API: reproduced needs a run receipt", () => {
  const record = (overrides: Partial<CatalogueRecord>): CatalogueRecord =>
    ({ id: "x", kind: "result", name: "x", description: "", status: "source_checked", facets: {}, source_ids: [], links: [], attributes: {}, ...overrides });
  const row = (result: CatalogueRecord, evaluation: CatalogueRecord | null): ResultRow => ({
    result, evaluation, models: [], benchmarks: [], methods: [], configurations: [], pipelines: [], services: [], tasks: [], protocols: [],
    evaluators: [], datasets: [], dataset_subsets: [], sources: [], origin: "unreported", review_status: result.status,
  });
  const receipt = record({ id: "receipt-source", kind: "source", name: "Run receipt" });
  const lookup = (id: string) => (id === receipt.id ? receipt : null);

  it("does not pass on a record's own reproduced status", () => {
    const marked = record({ id: "r1", status: "reproduced", source_ids: ["some-source"], attributes: { numeric_value: "0.5", printed_value: "0.5" } });
    const item = resultItem(row(marked, record({ id: "e1", kind: "evaluation", attributes: { origin: "rewire_run" } })), lookup, new Set([receipt.id]), {});
    expect(item.review_status).toBe("source_checked");
    expect(item.record_status).toBe("source_checked");
    expect(item.receipt).toBeNull();
    expect(item.origin).toBe("rewire_run");
    expect(item.independent).toBe(false);
    expect(item.numeric_value).toBe(0.5);
    expect(JSON.stringify(item)).not.toContain("reproduced");
  });

  it("says reproduced, with the receipt, when the result or its evaluation cites one", () => {
    for (const [result, evaluation] of [
      [record({ id: "r2", source_ids: [receipt.id] }), null],
      [record({ id: "r3" }), record({ id: "e3", kind: "evaluation", source_ids: [receipt.id] })],
    ] as const) {
      const item = resultItem(row(result, evaluation), lookup, new Set([receipt.id]), {});
      expect(item.review_status).toBe("reproduced");
      expect(item.receipt).toEqual({ id: receipt.id, name: "Run receipt", url: `${SITE}/database/source/${receipt.id}/` });
    }
    // A receipt id that is not a record in the release does not count.
    expect(resultItem(row(record({ id: "r4", source_ids: ["missing"] }), null), lookup, new Set(["missing"]), {}).review_status).toBe("source_checked");
    expect(reviewOf(record({ status: "discovered" }), null, new Set(), lookup).status).toBe("author_reported");
  });

  it("calls a result the release has replaced superseded, not as reported", () => {
    const superseded = query.recordIds().filter((r) => r.kind === "result" && r.status === "superseded").map((r) => raw(r.id));
    for (const result of [...superseded, record({ id: "r5", status: "superseded" })]) {
      const item = resultItem(row(result, null), (id) => query.record(id), runReceiptSources(query), {});
      expect(item.review_status, result.id).toBe("superseded");
      expect(item.record_status, result.id).toBe("superseded");
      expect(item.receipt).toBeNull();
    }
    expect(resultItem(row(record({ id: "r6", status: "discovered" }), null), lookup, new Set(), {}).review_status).toBe("author_reported");
  });

  it("holds for every board row and every result of the release marked reproduced", async () => {
    const receipts = runReceiptSources(query);
    for (const entry of useCases) {
      const { data } = await read(`/use-cases/${entry.slug}/board/`);
      for (const r of data.rows) {
        expect(r.review_status === "reproduced").toBe(r.receipt !== null);
        if (r.receipt) expect(receipts.has(r.receipt.id)).toBe(true);
        // Whatever the record's own status says, a row is reproduced only if the raw result or its evaluation cites a receipt.
        const cited = [...raw(r.result_id).source_ids, ...(evaluationOf(r.result_id)?.source_ids ?? [])];
        expect(r.review_status === "reproduced", r.result_id).toBe(cited.some((id) => receipts.has(id) && query.record(id)));
      }
    }
    const marked = query.recordIds().filter((r) => r.kind === "result" && r.status === "reproduced").map((r) => query.record(r.id)!);
    for (const result of marked) {
      const evaluationId = result.links.find((link) => link.relation === "evaluation")?.target_id;
      const evaluation = evaluationId ? query.record(evaluationId) : null;
      const item = resultItem(row(result, evaluation), (id) => query.record(id), receipts, {});
      const cites = [...result.source_ids, ...(evaluation?.source_ids ?? [])].some((id) => receipts.has(id) && query.record(id));
      expect(item.review_status === "reproduced", result.id).toBe(cites);
      expect(item.record_status, result.id).toBe("source_checked");
    }
  });
});

describe("JSON API: use cases and boards", () => {
  it("lists every use case with the protocol its board is ranked on", async () => {
    const { data } = await read("/use-cases/");
    expect(data.map((u: { slug: string }) => u.slug)).toEqual(useCases.map((u) => u.slug));
    for (const item of data) {
      const board = leaderboardForUseCase(item.slug)!;
      const ranked = !!board.protocol && board.rows.length > 0;
      expect(item.board.ranked).toBe(ranked);
      expect(item.board.rows).toBe(ranked ? board.rows.length : 0);
      expect(item.board.relevance).toBe(ranked ? board.protocol!.relevance : null);
      expect(item.board.metric_label).toBe(ranked ? board.protocol!.metric_label : null);
      expect(item.board.direction).toBe(ranked ? board.protocol!.direction : null);
      // The direction is the one the ranked results state themselves, and the one the rows are ordered by.
      if (ranked) {
        expect(new Set(board.rows.map((r) => raw(r.source_record_id).attributes.metric_direction))).toEqual(new Set([item.board.direction]));
        const values = board.rows.map((r) => r.raw_metric_value!);
        for (let i = 1; i < values.length; i++) expect(item.board.direction === "higher" ? values[i - 1] >= values[i] : values[i - 1] <= values[i], item.slug).toBe(true);
      }
      expect(item.board_url).toBe(`${SITE}${API_BASE}/use-cases/${item.slug}/board/`);
    }
  });

  it("serves each use case's board as its page builds it, every value read from its result record, proxy protocols labelled", async () => {
    expect(boards.length).toBe(useCases.length);
    let proxies = 0, direct = 0, percentOfFraction = 0, withFindings = 0, withMargin = 0;
    for (const board of boards) {
      const { data } = await read(`/use-cases/${board.use_case_slug}/board/`);
      const ranked = !!board.protocol && board.rows.length > 0;
      expect(data.ranked).toBe(ranked);
      expect(data.protocol).toEqual(plain(board.protocol));
      expect(data.empty_reason).toBe(board.empty_reason);
      if (!ranked) expect(data.empty_reason).toBeTruthy();
      // No row is added, dropped or reordered.
      expect(data.rows.map((r: any) => [r.rank, r.configuration_id, r.result_id])).toEqual(board.rows.map((r) => [r.rank, r.model_id, r.source_record_id]));
      expect(data.unranked).toEqual(board.unranked.map((m) => ({ id: m.model_id, name: m.model_name, url: `${SITE}${m.model_href}`, coverage: m.coverage })));
      if (ranked) {
        const stats = boardStats(board);
        expect(data.stats).toEqual(plain({ ...stats, text: boardStatsText(stats) }));
        if (board.protocol!.relevance === "proxy") proxies++; else direct++;
      } else expect(data.stats).toBeNull();
      if (board.baseline) {
        const id = board.baseline.source_record_id;
        expect(data.baseline).toEqual({
          name: board.baseline.name, configuration_id: board.baseline.model_id, numeric_value: rawNumber(id), unit: rawText(raw(id).attributes.unit),
          display_value: board.baseline.display_value, result_id: id, result_url: `${SITE}/database/result/${id}/`,
        });
      } else expect(data.baseline).toBeNull();
      for (const [index, r] of board.rows.entries()) {
        const item = data.rows[index];
        // Every ranked value is a result record of the release. The number, unit and origin are that record's and its evaluation's.
        const result = raw(r.source_record_id);
        expect(result.kind).toBe("result");
        expect(item.numeric_value, item.result_id).toBe(rawNumber(item.result_id));
        expect(item.numeric_value, item.result_id).not.toBeNull();
        expect(item.unit).toBe(rawText(result.attributes.unit));
        expect(item.origin).toBe(rawOrigin(item.result_id));
        expect(item.independent).toBe(rawOrigin(item.result_id) === "independent_paper");
        expectReview(item, item.result_id);
        expect(item.evaluation_id).toBe(evaluationOf(item.result_id)?.id ?? null);
        expect(item.evaluation_url).toBe(item.evaluation_id ? `${SITE}/database/evaluation/${item.evaluation_id}/` : null);
        expect(item.result_url).toBe(`${SITE}/database/result/${item.result_id}/`);
        expectSources(item.sources, result.source_ids);
        expectFindingLinks(item.open_findings, openByResult.get(item.result_id) ?? []);
        if (item.open_findings.length) withFindings++;
        // The rest is the page's row.
        expect([item.name, item.detail, item.url, item.parent_id, item.metric_label, item.display_value, item.margin_over_baseline_percent, item.pareto_optimal, item.is_baseline])
          .toEqual([r.model_name, r.model_detail, `${SITE}${r.model_href}`, r.parent_id, r.primary_metric_name, r.display_value, r.margin_over_conventional, r.pareto_optimal, r.is_baseline]);
        expect(item.telemetry).toEqual(plain(r.telemetry));
        expect(item.coverage).toEqual(r.coverage);
        expect(item.method_types).toEqual(r.method_types);
        // The margin is the percent difference of the two record values, in the metric's direction.
        if (item.margin_over_baseline_percent !== null) {
          withMargin++;
          const base = data.baseline.numeric_value;
          const sign = data.protocol.direction === "lower" ? -1 : 1;
          if (base !== 0 && item.unit === data.baseline.unit)
            expect(item.margin_over_baseline_percent).toBeCloseTo(sign * ((item.numeric_value - base) / Math.abs(base)) * 100, 6);
        }
        // The site prints a fraction as a percentage; the number given is still the record's.
        if (item.unit === "fraction" && item.display_value.endsWith("%")) {
          percentOfFraction++;
          expect(Number.parseFloat(item.display_value)).toBeCloseTo(item.numeric_value * 100, 1);
        }
        for (const gone of ["raw_metric_value", "reviewed_status", "model_href", "source_record_id", "links"]) expect(item).not.toHaveProperty(gone);
      }
      // No score spans protocols: a board names one comparison and one metric.
      expect(Object.keys(data)).not.toContain("score");
    }
    // The release ranks some use cases on a proxy protocol and some directly; both kinds went through the checks above.
    expect(proxies + direct).toBe(boards.filter((b) => b.protocol && b.rows.length).length);
    // The cases the checks above depend on are in the release.
    expect(percentOfFraction).toBeGreaterThan(0);
    expect(withFindings).toBeGreaterThan(0);
    expect(withMargin).toBeGreaterThan(0);
  });

  it("answers 404 for a use case the release does not have", async () => {
    const response = await get("/use-cases/no-such-use-case/board/");
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});

describe("JSON API: contested findings", () => {
  it("lists the findings the reader returns, each as the release stores it, with the same filters", async () => {
    const body = await read("/contested/?limit=500");
    expect(body.data.available).toBe(query.hasDiscrepancies());
    expect(body.page.total).toBe(findings.total);
    expect(body.data.findings.map((f: { id: string }) => f.id)).toEqual(findings.items.map((d) => d.id));
    for (const [index, d] of stored.entries()) {
      const last = d.actions[d.actions.length - 1];
      expect(body.data.findings[index]).toEqual({
        id: d.id, rule: d.rule || null, label: d.label, summary: d.summary, severity: d.severity, scope: d.scope, listing: d.listing,
        state: d.state, settled: d.settled, resolved: d.resolved === true, systems: d.systems,
        action_count: d.actions.length, last_action_date: last?.date ?? null, next_check: findings.items[index].next_check,
        url: `${SITE}/contested/${d.id}/`, api_url: `${SITE}${API_BASE}/contested/${d.id}/`,
      });
    }
    // Counts are over the stored findings. Findings with no rule are counted under a name, not an empty key.
    type Stored = (typeof stored)[number];
    const tally = (list: Stored[], key: (d: Stored) => string) => list.reduce<Record<string, number>>((all, d) => ({ ...all, [key(d)]: (all[key(d)] ?? 0) + 1 }), {});
    const counts = (list: Stored[]) => ({ severity: tally(list, (d) => d.severity), state: tally(list, (d) => d.state), listing: tally(list, (d) => d.listing), rule: tally(list, (d) => d.rule || NO_RULE) });
    expect(body.data.counts).toEqual(counts(stored));
    expect(Object.keys(body.data.counts.rule)).not.toContain("");
    for (const [filter, keep] of [
      ["status=open", (d) => !d.settled], ["status=settled", (d) => d.settled],
      ["severity=low", (d) => d.severity === "low"], ["listing=public", (d) => d.listing === "public"], ["listing=review", (d) => d.listing === "review"],
      [`system=${stored[0].systems[0]}`, (d) => d.systems.includes(stored[0].systems[0])],
    ] as [string, (d: (typeof stored)[number]) => boolean][]) {
      const filtered = await read(`/contested/?${filter}&limit=500`);
      const expected = stored.filter(keep).map((d) => d.id);
      expect(filtered.page.total, filter).toBe(expected.length);
      expect(filtered.data.findings.map((f: { id: string }) => f.id), filter).toEqual(expected);
      // The counts are of the findings the filter keeps.
      expect(filtered.data.counts, filter).toEqual(counts(stored.filter(keep)));
    }
    const paged = await read("/contested/?limit=1");
    if (findings.total > 1) {
      const next = await read(paged.page.next_url.slice(`${SITE}${API_BASE}`.length));
      expect(next.data.findings[0].id).toBe(findings.items[1].id);
    } else expect(paged.page.next_url).toBeNull();
  });

  it("gives one finding as stored, with links to the sources and results on each side", async () => {
    // One of each kind the release holds: a rule's finding, one with follow-up actions and a resolved one, when there are any.
    const sample = [...new Set([stored[0], stored.find((d) => d.actions.length), stored.find((d) => d.resolved), ...stored.slice(1, 4)].filter((d) => !!d))];
    for (const d of sample) {
      const { data } = await read(`/contested/${d.id}/`);
      const { outlier_sources, consensus_sources, party_sources, outlier_results, consensus_results, party_results, ...rest } = d;
      expect(data.finding).toEqual(plain({
        ...rest, resolved: d.resolved === true, rule: d.rule || null,
        studies: (d.studies ?? []).map((study) => ({ ...study, verdict: study.verdict ?? null, configurations: study.configurations ?? {}, gap: study.gap ?? null })),
      }));
      expect(data.url).toBe(`${SITE}/contested/${d.id}/`);
      expectSources(data.sources.outlier, outlier_sources);
      expectSources(data.sources.consensus, consensus_sources);
      expectSources(data.sources.party, party_sources);
      for (const [side, ids] of [["outlier", outlier_results], ["consensus", consensus_results], ["party", party_results]] as const)
        expect(data.results[side]).toEqual(ids.map((id) => ({ id, url: `${SITE}/database/result/${id}/` })));
      expect(data.systems.map((s: { id: string }) => s.id)).toEqual(d.systems.filter((id) => query.record(id)));
    }
    expect(sample.some((d) => (d.studies ?? []).length > 0)).toBe(true);
    expect((await get("/contested/discrepancy-0000000000000000/")).status).toBe(404);
  });

  it("publishes only the fields of a finding it names", async () => {
    const real = query.discrepancy;
    const base = stored.find((d) => (d.studies ?? []).length && d.studies![0].comparisons.length) ?? stored[0];
    const extra = { ...base, internal_note: "not for publication", actions: [{ ...(base.actions[0] ?? { revision: 1, claim_id: null, action: null, state: "open", date: null, rationale: null, investigation_url: null, report_url: null, upstream_response: null, awaiting: null, expected_by: null, next_check: null, resolved_by: [] }), reviewer_email: "someone@example.org" }],
      studies: (base.studies ?? []).map((study) => ({ ...study, local_path: "/Users/someone/file", comparisons: study.comparisons.map((c) => ({ ...c, scratch: 1 })) })) };
    vi.spyOn(query, "discrepancy").mockImplementation((id: string) => (id === base.id ? extra as typeof base : real(id)));
    const response = await get(`/contested/${base.id}/`);
    expect(response.status).toBe(200);
    const text = await response.text();
    for (const leaked of ["internal_note", "not for publication", "reviewer_email", "someone@example.org", "local_path", "/Users/someone", "scratch"]) expect(text).not.toContain(leaked);
    expect(() => responseSchema(ENDPOINTS.find((e) => e.path === "/contested/{id}/")!).parse(JSON.parse(text))).not.toThrow();
  });

  it("answers an earlier id of a finding with the finding as it is now", async () => {
    // From the release when it has one, and in any case with a stand-in for the reader's lookup.
    const renamed = stored.find((d) => d.previous_ids.length);
    if (renamed) {
      const body = await read(`/contested/${renamed.previous_ids[0]}/`);
      expect(body.data.finding.id).toBe(renamed.id);
      expect(body.data.finding.previous_ids).toContain(renamed.previous_ids[0]);
      expect(body.data.url).toBe(`${SITE}/contested/${renamed.id}/`);
      expect(body.links.html).toBe(`${SITE}/contested/${renamed.id}/`);
    }
    const real = query.discrepancy;
    vi.spyOn(query, "discrepancy").mockImplementation((id: string) => (id === "discrepancy-earlier" ? { ...stored[0], previous_ids: ["discrepancy-earlier"] } : real(id)));
    const body = await read("/contested/discrepancy-earlier/");
    expect(body.data.finding.id).toBe(stored[0].id);
    expect(body.data.finding.previous_ids).toEqual(["discrepancy-earlier"]);
    expect(body.links.html).toBe(`${SITE}/contested/${stored[0].id}/`);
  });
});

describe("JSON API: requests it refuses", () => {
  it.each([
    ["/models/?unknown=1", 400, "unknown_parameter"],
    ["/models/?limit=0", 400, "invalid_parameter"],
    ["/models/?limit=101", 400, "invalid_parameter"],
    ["/models/?limit=ten", 400, "invalid_parameter"],
    ["/models/?limit=5&limit=6", 400, "invalid_parameter"],
    ["/models/?limit=0100", 400, "invalid_parameter"],
    ["/models/?limit=05", 400, "invalid_parameter"],
    ["/models/?limit=%2B5", 400, "invalid_parameter"],
    ["/contested/?system=zz-none", 400, "invalid_parameter"],
    ["/contested/?listing=private", 400, "invalid_parameter"],
    ["/models/?cursor=not-a-cursor", 400, "invalid_request"],
    ["/use-cases/?limit=5", 400, "unknown_parameter"],
    ["/contested/?status=closed", 400, "invalid_parameter"],
    ["/contested/?severity=extreme", 400, "invalid_parameter"],
    ["/contested/?cursor=AAAA", 400, "invalid_request"],
    ["/contested/?system=Not%20An%20Id", 400, "invalid_parameter"],
    ["/openapi.json?x=1", 400, "unknown_parameter"],
    ["/models/?release_id=2000-01-01-000000000000", 404, "release_not_served"],
    ["/models/?release_id=latest", 400, "invalid_parameter"],
    ["/nothing/", 404, "not_found"],
    ["/models/a/b/c/", 404, "not_found"],
  ])("%s is answered %i %s, uncached, naming the release", async (path, status, code) => {
    const response = await get(path);
    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    const body = await response.json();
    expect(() => ErrorShape.parse(body)).not.toThrow();
    expect(body.error.code).toBe(code);
    expect(body.release.id).toBe(lock.release_id);
  });

  it("accepts the served release as a pin, and a cursor only with the filters it came from", async () => {
    const pinned = await read(`/models/?limit=2&release_id=${lock.release_id}`);
    expect(pinned.links.self).toBe(`${SITE}${API_BASE}/models/?limit=2&release_id=${lock.release_id}`);
    expect(pinned.page.next_url).toContain(`release_id=${lock.release_id}`);
    const cursor = encodeURIComponent(pinned.page.next_cursor);
    expect((await get(`/models/?limit=2&cursor=${cursor}`)).status).toBe(200);
    expect((await get(`/benchmarks/?limit=2&cursor=${cursor}`)).status).toBe(400);
  });

  it("answers a cursor it cannot use with 400 on every paged endpoint", async () => {
    const paged = ENDPOINTS.filter((e) => e.query?.cursor);
    expect(paged.length).toBeGreaterThan(0);
    const other = encodeURIComponent((await read("/benchmarks/?limit=1")).page.next_cursor);
    for (const endpoint of paged) for (const cursor of ["not-a-cursor", "AAAA", "%7B%7D", other]) {
      if (endpoint.path === "/benchmarks/" && cursor === other) continue;
      const response = await get(`${addressOf(endpoint)}?cursor=${cursor}`);
      expect(response.status, `${endpoint.path} ${cursor}`).toBe(400);
      expect((await response.json()).error.code).toBe("invalid_request");
    }
  });

  it("refuses an origin that is not one of the release's, on a model's results", async () => {
    const response = await get(`/models/${rankedModel.id}/results/?origin=zz`);
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).error.code).toBe("invalid_parameter");
    // Every origin an evaluation of the release has is one the parameter takes.
    const accepted = (openApiDocument() as any).paths["/models/{id}/results/"].get.parameters.find((p: any) => p.name === "origin").schema.enum;
    const used = new Set(query.recordIds().filter((r) => r.kind === "evaluation").map((r) => rawText(raw(r.id).attributes.origin) ?? "unreported"));
    for (const origin of used) expect(accepted).toContain(origin);
  });

  it("answers a fault of its own with 500, uncached, and keeps the fault's message to the log", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const endpoint = ENDPOINTS.find((e) => e.path === "/use-cases/")!;
    for (const thrown of [new Error("ENOENT: /Users/someone/secret.sqlite"), new TypeError("Invalid catalogue cursor"), "a string"]) {
      vi.spyOn(endpoint, "run").mockImplementation(() => { throw thrown; });
      const response = await get("/use-cases/");
      expect(response.status).toBe(500);
      expect(response.headers.get("cache-control")).toBe("no-store");
      const text = await response.text();
      expect(() => ErrorShape.parse(JSON.parse(text))).not.toThrow();
      expect(JSON.parse(text).error.code).toBe("internal_error");
      expect(text).not.toContain("secret");
      expect(text).not.toContain("cursor");
    }
    expect(log).toHaveBeenCalledTimes(3);
    // A fault outside an endpoint is answered the same way, not thrown.
    vi.restoreAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = await route.GET({ url: "not a url" } as Request);
    expect(broken.status).toBe(500);
    expect((await broken.json()).error.code).toBe("internal_error");
  });

  it("answers an address without the closing slash the same way", async () => {
    expect(await (await get("/use-cases")).json()).toEqual(await read("/use-cases/"));
  });
});

describe("JSON API: OpenAPI description", () => {
  const spec = openApiDocument() as any;

  it("is served as written, describes the API and names no licence", async () => {
    const response = await get("/openapi.json");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(API_CACHE_CONTROL);
    expect(await response.json()).toEqual(plain(spec));
    expect(spec.openapi).toBe("3.1.0");
    expect(spec.servers).toEqual([{ url: `${SITE}${API_BASE}` }]);
    expect(spec.info.license).toBeUndefined();
    expect(spec.info.description).toContain(DATA_LICENCE.statement);
  });

  it("describes exactly the endpoints the handler serves, and each described path answers", async () => {
    expect(Object.keys(spec.paths).sort()).toEqual([...ENDPOINTS.map((e) => e.path), "/openapi.json"].sort());
    expect(new Set(ENDPOINTS.map((e) => e.id)).size).toBe(ENDPOINTS.length);
    for (const [path, item] of Object.entries<any>(spec.paths)) {
      expect(Object.keys(item)).toEqual(["get"]);
      if (path === "/openapi.json") continue;
      const endpoint = ENDPOINTS.find((e) => e.path === path)!;
      expect(item.get.operationId).toBe(endpoint.id);
      const named = [...path.matchAll(/\{([a-z]+)\}/g)].map((m) => m[1]);
      expect(item.get.parameters.filter((p: any) => p.in === "path").map((p: any) => p.name)).toEqual(named);
      // Every documented query parameter is accepted, and release_id is on every endpoint.
      const queryNames = item.get.parameters.filter((p: any) => p.in === "query").map((p: any) => p.name);
      expect(queryNames).toContain("release_id");
      expect(queryNames.sort()).toEqual([...Object.keys(endpoint.query ?? {}), "release_id"].sort());
      const schema = item.get.responses[200].content["application/json"].schema;
      expect(schema.required).toEqual(expect.arrayContaining(["release", "licence", "citation", "links", "data"]));
      expect(schema.properties.licence.required).toEqual(expect.arrayContaining(["spdx_id", "statement"]));
      const address = addressOf(endpoint);
      if (address) expect((await get(address)).status, path).toBe(200);
    }
  });

  it("lists the same endpoints at the index", async () => {
    const { data } = await read("/");
    expect(data.endpoints.map((e: { path: string }) => e.path)).toEqual(ENDPOINTS.map((e) => `${API_BASE}${e.path}`));
    expect(data.openapi_url).toBe(`${SITE}${API_BASE}/openapi.json`);
    expect(data.docs_url).toBe(`${SITE}/agents/api/`);
  });
});

describe("JSON API: docs", () => {
  it("lists every endpoint on the docs page, with the licence position and the citation", () => {
    const html = renderToStaticMarkup(createElement(ApiDocsPage));
    for (const endpoint of ENDPOINTS) {
      expect(html).toContain(`GET ${API_BASE}${endpoint.path}`);
      for (const name of Object.keys(endpoint.query ?? {})) expect(html).toContain(`<code>${name}</code>`);
    }
    expect(html).toContain(DATA_LICENCE.statement);
    expect(html).toContain(releaseCitation(lock.release_id, SITE));
    expect(html).toContain(`href="${API_BASE}/openapi.json"`);
    expect(html).toContain(`Release ${lock.release_id}`);
    // What the page says about reuse is the header the answers carry.
    expect(html).toContain(`Cache-Control: ${API_CACHE_CONTROL}`);
    expect(API_CACHE_CONTROL).toBe("public, max-age=300");
    for (const field of ["numeric_value", "display_value", "review_status", "record_status", "listing"]) expect(html).toContain(field);
    expect(html).not.toContain("reviewed_status");
  });

  it("is linked from the plain-text agent guides", () => {
    expect(generateLlmsTxt(lock.release_id)).toContain(`[JSON API](${SITE}/agents/api/)`);
    const agents = generateAgentsMd(lock.release_id);
    expect(agents).toContain("`GET /api/v1/`");
    expect(agents).toContain(`${SITE}/agents/api/`);
  });
});
