import { describe, expect, it } from "vitest";
import type { CatalogueRecord, ResultRow } from "../shared/omics/catalogue-query";
import type { ResolvedMapping } from "../shared/omics/use-cases";
import { buildComparisons, heldJudgements, toolsCompared } from "../lib/use-case-comparisons";

const record = (id: string, kind: CatalogueRecord["kind"], attributes: Record<string, unknown> = {}, extra: Partial<CatalogueRecord> = {}): CatalogueRecord =>
  ({ id, kind, name: `Name ${id}`, description: "", status: "source_checked", facets: {}, source_ids: [], links: [], attributes, ...extra });
const result = (metric: string, value: string | null, printed = value ?? "NaN") =>
  ({ result: record(`r-${metric}-${printed}`, "result", { metric, printed_value: printed, numeric_value: value, metric_direction: "higher" }) }) as unknown as ResultRow;
function evaluation(config: string, results: ResultRow[], origin = "author_reported") {
  const configuration = record(config, "configuration", { reported_name: config.toUpperCase() }, { links: [{ relation: "configuration_of", target_id: `method-${config}` }] });
  return { evaluation: record(`e-${config}-${results.length}-${Math.random()}`, "evaluation", { origin }), configurations: [configuration], results, results_total: results.length, results_next_cursor: null };
}
function mapping(id: string, evaluations: ReturnType<typeof evaluation>[], presentation?: Record<string, unknown>, lifecycle = "active"): ResolvedMapping {
  return {
    id, use_case_id: "u", lifecycle, revision: 1, reason: lifecycle === "active" ? "Reviewed" : "Withheld: source concern.", protocol_id: `p-${id}`,
    evaluation_ids: [], endpoint: `Endpoint ${id}`, relevance: "direct", rationale: "", constraints: [], limitations: [`Limit ${id}`], citations: [],
    protocol: record(`p-${id}`, "protocol"), task: null, sources: [], evaluations, ...(presentation ? { presentation } : {}),
  } as unknown as ResolvedMapping;
}
const bin = (label: string, order: number) => ({ group: "bins", title: "Deletions by size", stratum_label: label, stratum_order: order, headline_metric: "f1-score" });

describe("use-case comparisons", () => {
  it("joins strata of one study into one table, in stratum order, with the headline metric and the others below", () => {
    const [comparison] = buildComparisons([
      mapping("b2", [evaluation("dragen", [result("f1-score", "0.966"), result("recall", "0.933")]), evaluation("cnvnator", [result("f1-score", "0.618")])], bin("5 to 10 kb", 2)),
      mapping("b1", [evaluation("dragen", [result("f1-score", "0.926"), result("recall", "0.873")]), evaluation("cnvnator", [result("f1-score", "0.391")])], bin("1 to 5 kb", 1)),
    ]);
    expect(comparison.layout).toBe("strata");
    expect(comparison.columns.map((c) => c.label)).toEqual(["1 to 5 kb", "5 to 10 kb"]);
    expect(comparison.rows.map((r) => r.name)).toEqual(["DRAGEN", "CNVNATOR"]);
    expect(comparison.rows[0].cells.map((c) => c.printed)).toEqual(["0.926", "0.966"]);
    expect(comparison.rows[0].cells[0].secondary).toEqual([{ label: "R", printed: "0.873" }]);
    expect(comparison.rows[0].cells.every((c) => c.best)).toBe(true);
    expect(comparison.rows[1].cells.some((c) => c.best)).toBe(false);
  });

  it("keeps a printed non-number visible and never marks it best", () => {
    const [comparison] = buildComparisons([
      mapping("b1", [evaluation("cnv-only", [result("f1-score", null, "NaN")]), evaluation("cnvnator", [result("f1-score", "0.391")])], bin("1 to 5 kb", 1)),
    ]);
    const cnvOnly = comparison.rows.find((r) => r.name === "CNV-ONLY")!;
    expect(cnvOnly.cells[0]).toMatchObject({ printed: "NaN", numeric: null, best: false });
    // A single numeric value is not a comparison, so nothing is marked best.
    expect(comparison.rows.some((r) => r.cells[0].best)).toBe(false);
  });

  it("gives an ungrouped protocol its own table with metric columns, sorted by the headline", () => {
    const [comparison] = buildComparisons([mapping("single", [
      evaluation("lumpy", [result("recall", "0.941"), result("precision", "0.310")], "independent_paper"),
      evaluation("clc", [result("recall", "0.012"), result("precision", "0.667")], "independent_paper"),
    ], { group: "na12878", title: "Known CNVs in NA12878", headline_metric: "recall" })]);
    expect(comparison.layout).toBe("metrics");
    expect(comparison.columns.map((c) => c.metric)).toEqual(["recall", "precision"]);
    expect(comparison.rows.map((r) => r.name)).toEqual(["LUMPY", "CLC"]);
    expect(comparison.rows[0].cells[0].best).toBe(true);
    expect(comparison.rows[1].cells[1].best).toBe(true);
    expect(comparison.origins).toEqual(["independent_paper"]);
  });

  it("never mixes values across groups, and lists held judgements and each tool once", () => {
    const mappings = [
      mapping("a", [evaluation("cnvnator", [result("recall", "0.5")])]),
      mapping("b", [evaluation("cnvnator", [result("recall", "0.9")])]),
      mapping("held", [], undefined, "draft"),
    ];
    const comparisons = buildComparisons(mappings);
    expect(comparisons).toHaveLength(2);
    expect(comparisons.every((c) => c.rows.every((r) => r.cells.every((cell) => !cell.best)))).toBe(true);
    expect(heldJudgements(mappings)).toEqual([expect.objectContaining({ id: "held", lifecycle: "draft", reason: "Withheld: source concern." })]);
    expect(toolsCompared(comparisons).map((t) => t.name)).toEqual(["CNVNATOR"]);
  });
});
