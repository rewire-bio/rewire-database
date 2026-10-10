import { describe, expect, it } from "vitest";
import type { CatalogueRecord, ResultRow } from "../shared/omics/catalogue-query";
import type { ResolvedMapping } from "../shared/omics/use-cases";
import { buildComparisons, heldJudgements, toolsCompared } from "../lib/use-case-comparisons";
import { acronymCase, metricLabel, unitSuffix } from "../lib/metric-labels";
import { columnDecimals, formatReading, readValue } from "../lib/use-case-values";

const record = (id: string, kind: CatalogueRecord["kind"], attributes: Record<string, unknown> = {}, extra: Partial<CatalogueRecord> = {}): CatalogueRecord =>
  ({ id, kind, name: `Name ${id}`, description: "", status: "source_checked", facets: {}, source_ids: [], links: [], attributes, ...extra });
const result = (metric: string, value: string | null, printed = value ?? "NaN", extra: Record<string, unknown> = {}) =>
  ({ result: record(`r-${metric}-${printed}`, "result", { metric, printed_value: printed, numeric_value: value, metric_direction: "higher", ...extra }) }) as unknown as ResultRow;
function evaluation(config: string, results: ResultRow[], origin = "author_reported", reported = config.toUpperCase(), parent = `method-${config}`) {
  const configuration = record(config, "configuration", { reported_name: reported }, { name: `${reported}, ${config} setting (Smith et al. 2024)`, links: [{ relation: "configuration_of", target_id: parent }] });
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
    expect(comparison.rows[0].cells[0].secondary).toEqual([{ label: "R", text: "0.873", missing: false }]);
    expect(comparison.rows[0].cells.every((c) => c.best)).toBe(true);
    expect(comparison.rows[1].cells.some((c) => c.best)).toBe(false);
  });

  it("keeps a printed non-number visible and never marks it best", () => {
    const [comparison] = buildComparisons([
      mapping("b1", [evaluation("cnv-only", [result("f1-score", null, "NaN")]), evaluation("cnvnator", [result("f1-score", "0.391")])], bin("1 to 5 kb", 1)),
    ]);
    const cnvOnly = comparison.rows.find((r) => r.name === "CNV-ONLY")!;
    expect(cnvOnly.cells[0]).toMatchObject({ printed: "NaN", numeric: null, best: false });
    // The raw token is not shown as a value; it stays in the title.
    expect(cnvOnly.cells[0].shown).toEqual({ text: "Not reported", title: "Printed NaN", missing: true });
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

  it("rounds long computed values to three significant figures, one precision per column, and keeps the printed value in the title", () => {
    const [comparison] = buildComparisons([mapping("single", [
      evaluation("lumpy", [result("recall", "0.940751445086705"), result("precision", "0.31")]),
      evaluation("delly", [result("recall", "0.7"), result("precision", "0.198791988979549")]),
      evaluation("manta", [result("recall", "0.5"), result("precision", "0.000000385119467179515")]),
    ], { group: "g", title: "Known CNVs", headline_metric: "recall" })]);
    expect(comparison.rows.map((r) => r.cells[0].shown.text)).toEqual(["0.941", "0.700", "0.500"]);
    expect(comparison.rows[0].cells[0].shown.title).toBe("Printed 0.940751445086705");
    expect(comparison.rows.map((r) => r.cells[1].shown.text)).toEqual(["0.310", "0.199", "3.85 × 10⁻⁷"]);
  });

  it("shows a metric printed both as a percentage and as a fraction on one page as percentages, and marks best on that scale", () => {
    const comparisons = buildComparisons([
      mapping("a", [evaluation("talos", [result("recall", "87", "87%", { unit: "percent" })])], { group: "a", title: "A" }),
      mapping("b", [
        evaluation("lirical", [result("recall", "0.81", "0.81", { unit: "fraction" })]),
        evaluation("amelie", [result("recall", "86.2", "86.2", { unit: "percent" })]),
      ], { group: "b", title: "B" }),
    ]);
    expect(comparisons[0].rows[0].cells[0].shown.text).toBe("87%");
    const [first, second] = comparisons[1].rows;
    expect([first.name, first.cells[0].shown.text, first.cells[0].best]).toEqual(["AMELIE", "86.2%", true]);
    expect(second.cells[0].shown).toEqual({ text: "81.0%", title: "Printed 0.81", missing: false });
  });

  it("explains a value the source printed but that cannot be read, without showing the token as a number", () => {
    const [comparison] = buildComparisons([mapping("m", [
      evaluation("kaiju", [result("recall", null, "10000", { source_anomaly: "Probably 1.0000 with the decimal point lost." })]),
      evaluation("clark", [result("recall", null, "undefined", { undefined_reason: "Constant predictions." })]),
      evaluation("caller", [result("recall", null, "Yes")]),
    ], { group: "g", title: "T", headline_metric: "recall" })]);
    const shown = Object.fromEntries(comparison.rows.map((r) => [r.name, r.cells[0].shown]));
    expect(shown.KAIJU).toEqual({ text: "Unreadable in source", title: "Printed 10000. Probably 1.0000 with the decimal point lost.", missing: true });
    expect(shown.CLARK).toEqual({ text: "Undefined", title: "Printed undefined. Constant predictions.", missing: true });
    expect(shown.CALLER).toEqual({ text: "Yes", missing: false });
  });

  it("labels secondary values with their qualifier and unit, and explains abbreviations and uncertainty", () => {
    const [comparison] = buildComparisons([mapping("m", [
      evaluation("parabricks", [
        result("runtime", "27.05", "27.05", { unit: "minute", metric_direction: "lower" }),
        result("compute-cost", "0.77", "0.77", { unit: "us-dollar", metric_qualifier: "GCP cost per sample; sample A" }),
        result("compute-cost", "0.71", "0.71", { unit: "us-dollar", metric_qualifier: "GCP cost per sample; sample B" }),
        result("count", "487", "487", { metric_qualifier: "candidate variants flagged" }),
        result("precision", "0.216", "0.216 ± 0.053", { uncertainty: { type: "standard_deviation", value: "0.053" } }),
      ]),
    ], { group: "g", title: "Runtime", stratum_label: "WES", headline_metric: "runtime" })]);
    const cell = comparison.rows[0].cells[0];
    expect(cell.shown.text).toBe("27.05 min");
    expect(cell.secondary.map((s) => `${s.label} ${s.text}`)).toEqual([
      "Compute cost (sample A) 0.77 USD", "Compute cost (sample B) 0.71 USD", "Count (candidate variants flagged) 487", "P 0.216 ± 0.053",
    ]);
    expect(cell.secondary[0].title).toBe("GCP cost per sample; sample A");
    expect(comparison.legend).toEqual(["P precision.", "± is a standard deviation."]);
  });

  it("tells apart rows that share a printed name, from their configuration names", () => {
    const [comparison] = buildComparisons([mapping("m", [
      evaluation("kaiju-excl", [result("recall", "0.9")], "author_reported", "Kaiju"),
      evaluation("kaiju-norm", [result("recall", "0.8")], "author_reported", "Kaiju"),
      evaluation("clark", [result("recall", "0.7")], "author_reported", "CLARK"),
    ], { group: "g", title: "T", headline_metric: "recall" })]);
    expect(comparison.rows.map((r) => [r.name, r.detail])).toEqual([["Kaiju", "kaiju-excl setting"], ["Kaiju", "kaiju-norm setting"], ["CLARK", null]]);
  });

  it("does not caption a strata table with one stratum's endpoint", () => {
    const [comparison] = buildComparisons([
      mapping("b1", [evaluation("dragen", [result("f1-score", "0.9")])], bin("1 to 5 kb", 1)),
      mapping("b2", [evaluation("dragen", [result("f1-score", "0.95")])], bin("5 to 10 kb", 2)),
    ]);
    expect(comparison.endpoint).toBe("");
    expect(comparison.columnEndpoints).toEqual([{ label: "1 to 5 kb", endpoint: "Endpoint b1" }, { label: "5 to 10 kb", endpoint: "Endpoint b2" }]);
  });

  it("lists each tool once by its parent record, linked, with every configuration in the rendered rows counted", () => {
    const comparisons = buildComparisons([mapping("m", [
      evaluation("framepool-50", [result("pearson-correlation", "0.8")], "author_reported", "FramePool 50", "model-framepool"),
      evaluation("framepool-100", [result("pearson-correlation", "0.7")], "author_reported", "FramePool 100", "model-framepool"),
      evaluation("optimus", [result("pearson-correlation", "0.6")], "author_reported", "Optimus 50", "model-optimus"),
    ])]);
    const parents: Record<string, CatalogueRecord> = { "model-framepool": record("model-framepool", "model", {}, { name: "FramePool", facets: { method_types: ["supervised_machine_learning"] } }) };
    expect(toolsCompared(comparisons, (id) => parents[id] ?? null)).toEqual([
      { id: "model-framepool", name: "FramePool", href: "/database/model/model-framepool/", methodTypes: ["supervised_machine_learning"], configurations: 2 },
      { id: "model-optimus", name: "Optimus 50", href: "/database/configuration/optimus/", methodTypes: [], configurations: 1 },
    ]);
  });
});

describe("metric labels", () => {
  it("names metric keys with acronyms and decimal thresholds intact", () => {
    expect(["f1-score", "sensitivity-at-97-9-percent-specificity", "precision-at-70-percent-recall", "top-10-accuracy", "top-10-percent-recall", "capri-interface-rmsd", "adjusted-ndcg-at-100", "auspc", "cohens-d"].map((k) => metricLabel(k)))
      .toEqual(["F1", "Sensitivity at 97.9% specificity", "Precision at 70% recall", "Top-10 accuracy", "Top 10% recall", "CAPRI interface RMSD", "Adjusted NDCG at 100", "AUSPC", "Cohen's d"]);
    expect(metricLabel("recall", "Recall (sensitivity)")).toBe("Recall (sensitivity)");
  });
  it("fixes the case of acronyms and ACMG codes in free text only", () => {
    expect(acronymCase("benign reference variants assigned bp4, na12878 wgs, 1 bp overlap")).toBe("benign reference variants assigned BP4, NA12878 WGS, 1 bp overlap");
    expect(acronymCase("Kaiju vus")).toBe("Kaiju VUS");
    expect(unitSuffix("minute")).toBe(" min");
    expect(unitSuffix("count")).toBe("");
  });
});

describe("value display", () => {
  it("keeps printed text after the number and reads decimal commas", () => {
    expect(formatReading(readValue({ printed: "93.6% (103 of 110)", numeric: 93.6, unit: "percent" })).text).toBe("93.6% (103 of 110)");
    expect(formatReading(readValue({ printed: "0,44", numeric: 0.44, unit: "fraction" })).text).toBe("0.44");
    expect(formatReading(readValue({ printed: "+2.083", numeric: 2.083, unit: "unitless" })).text).toBe("+2.083");
    expect(formatReading(readValue({ printed: "37/40 (92.5%)", numeric: 92.5, unit: "percent" })).text).toBe("37/40 (92.5%)");
    expect(formatReading(readValue({ printed: "0.0015 ± 0.0002", numeric: 0.0015, unit: "fraction" }, true)).text).toBe("0.15% ± 0.02");
    expect(columnDecimals([readValue({ printed: "0.31", numeric: 0.31, unit: null }), null])).toBe(2);
  });
});
