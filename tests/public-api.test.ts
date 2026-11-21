import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ApiDocsPage from "../app/agents/api/page";
import { generateAgentsMd, generateLlmsTxt } from "../lib/llm-discoverability";
import lock from "../benchmark-data.lock.json";
import * as route from "../app/api/v1/[[...path]]/route";
import { buildCatalogue } from "../lib/catalogue-build";
import { indexRecords, indexSource } from "../lib/catalogue-index";
import { DATA_LICENCE, releaseCitation } from "../lib/data-licence";
import { API_BASE, API_CACHE_CONTROL, ENDPOINTS, ErrorShape, openApiDocument, responseSchema, resultItem, type Endpoint } from "../lib/public-api";
import { allUseCaseLeaderboards, leaderboardForUseCase, rankingsForRecord, runReceiptSources } from "../lib/release-leaderboard";
import { boardStats, boardStatsText } from "../lib/use-case-leaderboard";
import { reviewOf } from "../lib/use-case-ranking";
import { buildUseCases } from "../lib/use-cases-build";
import type { CatalogueRecord, ResultRow } from "../shared/omics/catalogue-query";

// Against the pinned release. Expected values are read from the release through the functions the
// pages use, never written out, so adopting a new release does not need this file changed.
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
  it("has a model with results and a leaderboard rank, use cases and benchmarks to test against", () => {
    expect(rankedModel).toBeDefined();
    expect(useCases.length).toBeGreaterThan(0);
    expect(benchmarks.length).toBeGreaterThan(0);
  });

  it.each(ENDPOINTS.map((endpoint) => [endpoint.path, endpoint] as const))("%s answers in its documented shape, with release, licence, citation and cache headers", async (_path, endpoint) => {
    const address = addressOf(endpoint);
    // Only a release with no contested findings has no address for /contested/{id}/.
    if (!address) return expect(endpoint.path).toBe("/contested/{id}/");
    const response = await get(address);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe(API_CACHE_CONTROL);
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

  it("states no licence it has not been given", () => {
    // Until the owner states a data licence, the API must not name one. Stating one is an edit to lib/data-licence.ts and to this test.
    expect(DATA_LICENCE).toEqual({ spdx_id: null, name: null, url: null, statement: "No data licence has been stated for this release." });
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
    const record = query.record(rankedModel.id)!;
    const { data } = await read(`/models/${record.id}/`);
    expect(data.id).toBe(record.id);
    expect(data.sources.map((s: { id: string }) => s.id)).toEqual([...new Set(record.source_ids)].filter((id) => query.record(id)));
    for (const source of data.sources) expect(source.url).toBe(`${SITE}/database/source/${source.id}/`);
    const rankings = rankingsForRecord(record.id);
    expect(data.rankings.map((r: any) => [r.use_case_slug, r.rank, r.result_id, r.relevance, r.ranked_rows]))
      .toEqual(rankings.map(({ board, row }) => [board.use_case_slug, row.rank, row.source_record_id, board.protocol!.relevance, board.rows.length]));
    // One entry per board, each with its own protocol: nothing is averaged or combined.
    expect(new Set(data.rankings.map((r: any) => r.use_case_slug)).size).toBe(data.rankings.length);
    expect(Object.keys(data)).not.toContain("score");
    expect(data.open_findings.map((f: { id: string }) => f.id)).toEqual(query.discrepanciesForSystem(record.id).filter((d) => !d.settled).map((d) => d.id));
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
    for (const [index, row] of expected.items.entries()) {
      const item = body.data.results[index];
      expect(item.url).toBe(`${SITE}/database/result/${row.result.id}/`);
      expect(item.sources.map((s: { id: string }) => s.id)).toEqual([...new Set(row.result.source_ids)]);
      expect(item.sources.length).toBeGreaterThan(0);
      for (const source of item.sources) expect(source.url).toBe(`${SITE}/database/source/${source.id}/`);
      expect(item.origin).toBe(row.evaluation?.attributes.origin ?? null);
      expect(item.independent).toBe(item.origin === "independent_paper");
      expect(item.printed_value).toBe(row.result.attributes.printed_value == null ? null : String(row.result.attributes.printed_value));
      if (item.numeric_value !== null) expect(item.numeric_value).toBe(Number(row.result.attributes.numeric_value));
    }
    // Filters are the reader's own.
    const metric = String(expected.items[0].result.attributes.metric);
    const filtered = await read(`/models/${rankedModel.id}/results/?metric=${encodeURIComponent(metric)}&limit=5`);
    expect(filtered.page.total).toBe(query.results({ id: rankedModel.id, metric, limit: 5 }).total);
    for (const item of filtered.data.results) expect(item.metric).toBe(metric);
    // The origin filter is the reader's too: "unreported" also matches an evaluation with no origin, given here as null.
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

  it("holds for every board row and every result of the release marked reproduced", async () => {
    const receipts = runReceiptSources(query);
    for (const entry of useCases) {
      const { data } = await read(`/use-cases/${entry.slug}/board/`);
      for (const r of data.rows) {
        expect(r.reviewed_status === "reproduced").toBe(r.receipt !== null);
        if (r.receipt) expect(receipts.has(r.receipt.id)).toBe(true);
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
      expect(item.board_url).toBe(`${SITE}${API_BASE}/use-cases/${item.slug}/board/`);
    }
  });

  it("serves each use case's board exactly as its page builds it, proxy protocols labelled", async () => {
    expect(boards.length).toBe(useCases.length);
    let proxies = 0, direct = 0;
    for (const board of boards) {
      const { data } = await read(`/use-cases/${board.use_case_slug}/board/`);
      const ranked = !!board.protocol && board.rows.length > 0;
      expect(data.ranked).toBe(ranked);
      expect(data.protocol).toEqual(plain(board.protocol));
      expect(data.baseline).toEqual(plain(board.baseline));
      expect(data.empty_reason).toBe(board.empty_reason);
      if (!ranked) expect(data.empty_reason).toBeTruthy();
      // Every row is the page's row, field for field, plus links and sources: no row is added, dropped or reordered.
      expect(data.rows.map(({ links: _links, sources: _sources, ...rest }: any) => rest)).toEqual(plain(board.rows));
      expect(data.unranked.map((m: { model_id: string }) => m.model_id)).toEqual(board.unranked.map((m) => m.model_id));
      if (ranked) {
        const stats = boardStats(board);
        expect(data.stats).toEqual(plain({ ...stats, text: boardStatsText(stats) }));
        if (board.protocol!.relevance === "proxy") proxies++; else direct++;
      } else expect(data.stats).toBeNull();
      for (const [index, r] of board.rows.entries()) {
        const item = data.rows[index];
        // Every ranked value is a result record of the release, and links every source it cites.
        expect(query.record(r.source_record_id)?.kind).toBe("result");
        expect(item.links.result).toBe(`${SITE}/database/result/${r.source_record_id}/`);
        expect(item.sources.map((s: { id: string }) => s.id)).toEqual([...new Set(r.source_ids)].filter((id) => query.record(id)));
        expect(item.independent).toBe(item.origin === "independent_paper");
      }
      // No score spans protocols: a board names one comparison and one metric.
      expect(Object.keys(data)).not.toContain("score");
    }
    // The release ranks some use cases on a proxy protocol and some directly; both kinds went through the checks above.
    expect(proxies + direct).toBe(boards.filter((b) => b.protocol && b.rows.length).length);
  });

  it("answers 404 for a use case the release does not have", async () => {
    const response = await get("/use-cases/no-such-use-case/board/");
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});

describe("JSON API: contested findings", () => {
  it("lists the findings the reader returns, with the same filters", async () => {
    const body = await read("/contested/?limit=500");
    expect(body.data.available).toBe(query.hasDiscrepancies());
    expect(body.page.total).toBe(findings.total);
    expect(body.data.counts).toEqual(plain(findings.counts));
    expect(body.data.findings.map(({ url: _url, api_url: _api, ...rest }: any) => rest)).toEqual(plain(findings.items));
    for (const [filter, input] of [
      ["status=open", { settled: "open" }], ["status=settled", { settled: "settled" }],
      ["severity=low", { severity: "low" }], ["listing=public", { listing: "public" }],
      ...(findings.items[0] ? [[`system=${findings.items[0].systems[0]}`, { system: findings.items[0].systems[0] }] as const] : []),
    ] as const) {
      const filtered = await read(`/contested/?${filter}&limit=500`);
      const expected = query.discrepancies({ ...input, limit: 500 } as Parameters<typeof query.discrepancies>[0]);
      expect(filtered.page.total, filter).toBe(expected.total);
      expect(filtered.data.findings.map((f: { id: string }) => f.id), filter).toEqual(expected.items.map((d) => d.id));
    }
    const paged = await read("/contested/?limit=1");
    if (findings.total > 1) {
      const next = await read(paged.page.next_url.slice(`${SITE}${API_BASE}`.length));
      expect(next.data.findings[0].id).toBe(findings.items[1].id);
    } else expect(paged.page.next_url).toBeNull();
  });

  it("gives one finding as stored, with links to the sources and results on each side", async () => {
    for (const summary of findings.items.slice(0, 5)) {
      const stored = query.discrepancy(summary.id)!;
      const { data } = await read(`/contested/${summary.id}/`);
      expect(data.finding).toEqual(plain(stored));
      expect(data.url).toBe(`${SITE}/contested/${summary.id}/`);
      for (const side of ["outlier", "consensus", "party"] as const) {
        expect(data.sources[side].map((s: { id: string }) => s.id)).toEqual([...new Set(stored[`${side}_sources`])].filter((id) => query.record(id)));
        expect(data.results[side].map((r: { id: string }) => r.id)).toEqual(stored[`${side}_results`]);
      }
      expect(data.systems.map((s: { id: string }) => s.id)).toEqual(stored.systems.filter((id) => query.record(id)));
    }
    expect((await get("/contested/discrepancy-0000000000000000/")).status).toBe(404);
  });
});

describe("JSON API: requests it refuses", () => {
  it.each([
    ["/models/?unknown=1", 400, "unknown_parameter"],
    ["/models/?limit=0", 400, "invalid_parameter"],
    ["/models/?limit=101", 400, "invalid_parameter"],
    ["/models/?limit=ten", 400, "invalid_parameter"],
    ["/models/?limit=5&limit=6", 400, "invalid_parameter"],
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
  });

  it("is linked from the plain-text agent guides", () => {
    expect(generateLlmsTxt(lock.release_id)).toContain(`[JSON API](${SITE}/agents/api/)`);
    const agents = generateAgentsMd(lock.release_id);
    expect(agents).toContain("`GET /api/v1/`");
    expect(agents).toContain(`${SITE}/agents/api/`);
  });
});
