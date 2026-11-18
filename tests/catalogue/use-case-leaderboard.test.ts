import { describe, expect, it } from "vitest";
import type { CatalogueRecord, ResultRow } from "../../shared/omics/catalogue-query";
import type { ResolvedMapping } from "../../shared/omics/use-cases";
import { buildComparisons } from "../../lib/use-case-comparisons";
import { buildLeaderboard, selectRankingComparison, type RankingInputs } from "../../lib/use-case-ranking";
import { calculateConventionalMargin, computeParetoOptimal, protocolLabel } from "../../lib/use-case-leaderboard";
import { shortFact, telemetryFromRecord } from "../../lib/operational-telemetry";
import type { ResultContest } from "../../lib/discrepancy-helpers";

// Synthetic records; ids and names are invented.
const record = (id: string, kind: CatalogueRecord["kind"], attributes: Record<string, unknown> = {}, extra: Partial<CatalogueRecord> = {}): CatalogueRecord =>
  ({ id, kind, name: `Name ${id}`, description: "", status: "source_checked", facets: {}, source_ids: [], links: [], attributes, ...extra });

const records = new Map<string, CatalogueRecord>();
const put = (r: CatalogueRecord) => (records.set(r.id, r), r);

function result(id: string, metric: string, value: string, direction = "higher", extra: Partial<CatalogueRecord> = {}) {
  const r = put(record(id, "result", { metric, printed_value: value, numeric_value: value, metric_direction: direction }, { source_ids: ["study"], ...extra }));
  return { result: r } as unknown as ResultRow;
}
function evaluation(config: string, results: ResultRow[], { origin = "independent_paper", parent = `method-${config}`, sources = [] as string[] } = {}) {
  const configuration = record(config, "configuration", { reported_name: config.toUpperCase() }, { links: [{ relation: "configuration_of", target_id: parent }] });
  const evaluationRecord = put(record(`e-${config}-${Math.random()}`, "evaluation", { origin }, { source_ids: sources }));
  return { evaluation: evaluationRecord, configurations: [configuration], results, results_total: results.length, results_next_cursor: null };
}
function mapping(id: string, evaluations: ReturnType<typeof evaluation>[], relevance: "direct" | "proxy" = "direct"): ResolvedMapping {
  return {
    id, use_case_id: "u", lifecycle: "active", revision: 1, reason: "Reviewed", protocol_id: `p-${id}`, evaluation_ids: [],
    endpoint: `Endpoint ${id}`, relevance, rationale: "", constraints: [], limitations: [], citations: [],
    protocol: record(`p-${id}`, "protocol", {}, { name: `Protocol ${id}` }), task: null, sources: [], evaluations,
  } as unknown as ResolvedMapping;
}

put(record("study", "source", { doi: "10.0000/study" }, { name: "Fixture comparison study" }));
put(record("method-alpha", "model", { profile: { facts: [
  { label: "Parameters", value: "650M", status: "source_checked" },
  { label: "Weights licence", value: "MIT", status: "source_checked" },
  { label: "Context limits", value: "Not stated", status: "unreported" },
] } }, { name: "Alpha" }));

function inputs(mappings: ResolvedMapping[], overrides: Partial<RankingInputs> = {}): RankingInputs {
  return {
    slug: "u", title: "Use case", baselineIds: ["method-base"], comparisons: buildComparisons(mappings),
    record: (id) => records.get(id) ?? null, findings: () => ({}), receiptSources: new Set(), ...overrides,
  };
}

describe("choosing the protocol a use case is ranked on", () => {
  const direct = mapping("direct", [evaluation("alpha", [result("d-a", "auroc", "0.9")]), evaluation("beta", [result("d-b", "auroc", "0.8")])]);
  const bigProxy = mapping("proxy", ["alpha", "beta", "gamma"].map((c, i) => evaluation(c, [result(`p-${c}`, "auroc", String(0.7 - i / 10))])), "proxy");

  it("prefers a directly relevant comparison over a larger proxy one", () => {
    const board = buildLeaderboard(inputs([direct, bigProxy]));
    expect(board.protocol).toMatchObject({ comparison_id: "direct", relevance: "direct", metric_label: "AUROC", direction: "higher" });
    expect(board.rows.map((r) => r.source_record_id)).toEqual(["d-a", "d-b"]);
  });

  it("falls back to a proxy comparison, labelled, only when allowed", () => {
    expect(buildLeaderboard(inputs([bigProxy])).protocol?.relevance).toBe("proxy");
    const strict = buildLeaderboard(inputs([bigProxy], { allowProxy: false }));
    expect(strict.rows).toEqual([]);
    expect(strict.empty_reason).toContain("directly relevant");
  });

  it("needs two valued rows and a stated direction", () => {
    const single = mapping("single", [evaluation("alpha", [result("s-a", "auroc", "0.9")])]);
    const unknown = mapping("unknown", [evaluation("alpha", [result("u-a", "count", "3", "unknown")]), evaluation("beta", [result("u-b", "count", "4", "unknown")])]);
    expect(selectRankingComparison(buildComparisons([single, unknown]), [])).toBeNull();
    expect(buildLeaderboard(inputs([single, unknown])).empty_reason).toContain("two or more tools");
    expect(buildLeaderboard(inputs([])).empty_reason).toBe("No comparable results yet: no comparison has been collected for this use case.");
  });

  it("labels the column when it is a stratum, not the metric", () => {
    const board = buildLeaderboard(inputs([direct]));
    expect(protocolLabel(board.protocol!)).toBe("Protocol direct");
    expect(protocolLabel({ ...board.protocol!, column_label: "Deletions 1 to 5 kb" })).toBe("Protocol direct, Deletions 1 to 5 kb");
  });
});

describe("ranked rows", () => {
  it("ranks in the metric's direction with competition ranks for ties", () => {
    const m = mapping("rmsd", [
      evaluation("alpha", [result("r-a", "rmsd", "1.5", "lower")]),
      evaluation("beta", [result("r-b", "rmsd", "1.0", "lower")]),
      evaluation("gamma", [result("r-g", "rmsd", "1.0", "lower")]),
      evaluation("delta", [result("r-d", "rmsd", "2.0", "lower")]),
    ]);
    const board = buildLeaderboard(inputs([m]));
    expect(board.protocol?.direction).toBe("lower");
    expect(board.rows.map((r) => [r.model_id, r.rank])).toEqual([["beta", 1], ["gamma", 1], ["alpha", 3], ["delta", 4]]);
  });

  it("reads value, source, origin and telemetry from the release records", () => {
    const m = mapping("t", [
      evaluation("alpha", [result("t-a", "auroc", "0.91")], { origin: "author_reported" }),
      evaluation("beta", [result("t-b", "auroc", "0.85")]),
    ]);
    const [alpha, beta] = buildLeaderboard(inputs([m])).rows;
    expect(alpha).toMatchObject({
      model_name: "ALPHA", parent_id: "method-alpha", model_href: "/database/model/method-alpha/", display_value: "0.91",
      source_record_id: "t-a", reviewed_status: "source_checked", origin: "author_reported", independent: false,
      source: { id: "study", name: "Fixture comparison study", doi: "10.0000/study" },
    });
    expect(alpha.telemetry).toMatchObject({ parameters: "650M", license: "MIT", context_window: null, min_vram_gb: null, open_weights: null });
    expect(beta.independent).toBe(true);
    expect(beta.model_href).toBe("/database/configuration/beta/");
  });

  it("marks reproduced only when the result or its evaluation cites a run receipt", () => {
    const m = mapping("rx", [
      evaluation("alpha", [result("rx-a", "auroc", "0.9", "higher", { status: "reproduced" })], { origin: "rewire_run", sources: ["receipt-1"] }),
      evaluation("beta", [result("rx-b", "auroc", "0.8", "higher", { status: "reproduced" })], { origin: "rewire_run" }),
      evaluation("gamma", [result("rx-g", "auroc", "0.7", "higher", { status: "discovered" })]),
    ]);
    const rows = buildLeaderboard(inputs([m], { receiptSources: new Set(["receipt-1"]) })).rows;
    expect(rows.map((r) => r.reviewed_status)).toEqual(["reproduced", "source_checked", "author_reported"]);
    expect(buildLeaderboard(inputs([m])).rows.some((r) => r.reviewed_status === "reproduced")).toBe(false);
  });

  it("computes a margin only against exactly one baseline on the same protocol", () => {
    const one = mapping("b1", [
      evaluation("alpha", [result("b1-a", "auroc", "0.9")]),
      evaluation("base", [result("b1-base", "auroc", "0.6")], { parent: "method-base" }),
    ]);
    const board = buildLeaderboard(inputs([one]));
    expect(board.baseline).toMatchObject({ model_id: "base", value: 0.6, source_record_id: "b1-base" });
    expect(board.rows[0].margin_over_conventional).toBeCloseTo(50, 3);
    expect(board.rows[1]).toMatchObject({ is_baseline: true, margin_over_conventional: null });

    const none = buildLeaderboard(inputs([mapping("b0", [evaluation("alpha", [result("b0-a", "auroc", "0.9")]), evaluation("beta", [result("b0-b", "auroc", "0.8")])])]));
    expect(none.baseline).toBeNull();
    expect(none.rows.every((r) => r.margin_over_conventional === null)).toBe(true);

    const two = buildLeaderboard(inputs([mapping("b2", [
      evaluation("alpha", [result("b2-a", "auroc", "0.9")]),
      evaluation("base", [result("b2-base", "auroc", "0.6")], { parent: "method-base" }),
      evaluation("base2", [result("b2-base2", "auroc", "0.5")], { parent: "method-base2" }),
    ])], { baselineIds: ["method-base", "method-base2"] }));
    expect(two.baseline).toBeNull();
  });

  it("flags unsettled findings on the row's results and ignores settled ones", () => {
    const m = mapping("f", [evaluation("alpha", [result("f-a", "auroc", "0.9")]), evaluation("beta", [result("f-b", "auroc", "0.8")])]);
    const contest = (id: string, settled: boolean): ResultContest => ({ role: "outlier", discrepancy: { id, label: `Finding ${id}`, settled } as ResultContest["discrepancy"] });
    const findings = () => ({ "f-a": [contest("open-1", false), contest("closed-1", true)] });
    const [alpha, beta] = buildLeaderboard(inputs([m], { findings })).rows;
    expect(alpha.open_findings).toEqual([{ id: "open-1", href: "/contested/open-1/", label: "Finding open-1" }]);
    expect(beta.open_findings).toEqual([]);
  });

  it("lists tools from other comparisons below the ranking, with coverage", () => {
    const ranked = mapping("main", [evaluation("alpha", [result("m-a", "auroc", "0.9")]), evaluation("beta", [result("m-b", "auroc", "0.8")])]);
    const other = mapping("other", [evaluation("alpha", [result("o-a", "count", "3", "unknown")]), evaluation("zeta", [result("o-z", "count", "4", "unknown")])]);
    const board = buildLeaderboard(inputs([ranked, other]));
    expect(board.rows.find((r) => r.model_id === "alpha")!.coverage).toEqual({ evaluated: 2, relevant: 2 });
    expect(board.rows.find((r) => r.model_id === "beta")!.coverage).toEqual({ evaluated: 1, relevant: 2 });
    expect(board.unranked).toEqual([{ model_id: "method-zeta", model_name: "ZETA", model_href: "/database/configuration/zeta/", coverage: { evaluated: 1, relevant: 2 } }]);
  });

  it("marks no Pareto frontier without recorded latency", () => {
    const m = mapping("p", [evaluation("alpha", [result("p-a", "auroc", "0.9")]), evaluation("beta", [result("p-b", "auroc", "0.8")])]);
    expect(buildLeaderboard(inputs([m])).rows.some((r) => r.pareto_optimal)).toBe(false);
  });
});

describe("arithmetic", () => {
  it("computes direction-adjusted margins", () => {
    expect(calculateConventionalMargin(0.6, 0.4, 1)).toBeCloseTo(50, 3);
    expect(calculateConventionalMargin(1.0, 2.0, -1)).toBeCloseTo(50, 3);
    expect(calculateConventionalMargin(0.1, 0, 1)).toBeCloseTo(10, 6);
  });

  it("finds the non-dominated set among candidates with a recorded cost", () => {
    const set = computeParetoOptimal([
      { id: "fast", quality: 0.5, cost: 10 },
      { id: "good", quality: 0.9, cost: 100 },
      { id: "dominated", quality: 0.4, cost: 50 },
      { id: "unmeasured", quality: 1, cost: null },
    ]);
    expect([...set].sort()).toEqual(["fast", "good"]);
  });
});

describe("telemetry from a record", () => {
  it("uses only fields the record carries, never inferring from names or licence text", () => {
    expect(telemetryFromRecord(null)).toEqual({
      inference_latency_ms: null, throughput_items_per_sec: null, min_vram_gb: null, estimated_cost_per_1k_evals_usd: null,
      parameters: null, context_window: null, license: null, access: null, open_weights: null,
    });
    const t = telemetryFromRecord({ id: "alphafold-3", name: "AlphaFold 3", attributes: {
      min_vram_gb: 24, access: "Public checkpoint", licence: "Apache-2.0 for code",
      profile: { facts: [{ label: "Parameters", value: "Not reported", status: "unreported" }, { label: "Code licence", value: "MIT", status: "source_checked" }] },
    } });
    expect(t).toMatchObject({ min_vram_gb: 24, access: "Public checkpoint", license: "Apache-2.0 for code", parameters: null, open_weights: null, inference_latency_ms: null });
  });

  it("shortens recorded text for table cells", () => {
    expect(shortFact(null)).toBe("Not recorded");
    expect(shortFact("MIT; stated in the model card")).toBe("MIT");
    expect(shortFact("A".repeat(50), 10)).toBe(`${"A".repeat(9)}…`);
  });
});
