import { describe, expect, it } from "vitest";
import type { CatalogueRecord, ResultRow } from "../../shared/omics/catalogue-query";
import type { ResolvedMapping } from "../../shared/omics/use-cases";
import { buildComparisons } from "../../lib/use-case-comparisons";
import { buildLeaderboard, selectRankingComparison, type RankingInputs } from "../../lib/use-case-ranking";
import { boardStats, boardStatsText, calculateConventionalMargin, computeParetoOptimal, protocolLabel, type BiologicalModelRankingRow } from "../../lib/use-case-leaderboard";
import { licenceLabel, licenceText, shortFact, telemetryFromRecord } from "../../lib/operational-telemetry";
import {
  ORIGIN_COUNT_LABELS, ORIGIN_DESCRIPTIONS, ORIGIN_EVALUATION_LABELS, ORIGIN_LABELS,
  isIndependentOrigin, originCountLabel, originDescription, originEvaluationLabel, originLabel,
} from "../../lib/result-origin";
import { originLabel as recordPageOriginLabel } from "../../lib/omics";
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
    put(record("receipt-1", "source", {}, { name: "Fixture run receipt" }));
    const m = mapping("rx", [
      evaluation("alpha", [result("rx-a", "auroc", "0.9", "higher", { status: "reproduced" })], { origin: "rewire_run", sources: ["receipt-1"] }),
      evaluation("beta", [result("rx-b", "auroc", "0.8", "higher", { status: "reproduced" })], { origin: "rewire_run" }),
      evaluation("gamma", [result("rx-g", "auroc", "0.7", "higher", { status: "discovered" })]),
    ]);
    const rows = buildLeaderboard(inputs([m], { receiptSources: new Set(["receipt-1"]) })).rows;
    expect(rows.map((r) => r.reviewed_status)).toEqual(["reproduced", "source_checked", "author_reported"]);
    expect(buildLeaderboard(inputs([m])).rows.some((r) => r.reviewed_status === "reproduced")).toBe(false);
  });

  it("carries the cited run receipt on a reproduced row and on no other", () => {
    put(record("receipt-2", "source", {}, { name: "Fixture full-protocol run" }));
    const m = mapping("rc", [
      evaluation("alpha", [result("rc-a", "auroc", "0.9")], { origin: "rewire_run", sources: ["receipt-2"] }),
      evaluation("beta", [result("rc-b", "auroc", "0.8", "higher", { source_ids: ["study", "receipt-unknown"] })], { origin: "rewire_run" }),
      evaluation("gamma", [result("rc-g", "auroc", "0.7")], { origin: "rewire_run" }),
    ]);
    const rows = buildLeaderboard(inputs([m], { receiptSources: new Set(["receipt-2", "receipt-unknown"]) })).rows;
    expect(rows[0]).toMatchObject({ reviewed_status: "reproduced", receipt: { id: "receipt-2", name: "Fixture full-protocol run", href: "/database/source/receipt-2/" } });
    // A receipt id with no source record in the release has nothing to link to, so the row is not reproduced.
    expect(rows[1]).toMatchObject({ reviewed_status: "source_checked", receipt: null });
    // A Rewire run is labelled as one and is not flagged independent of the tool's developers.
    expect(rows[2]).toMatchObject({ reviewed_status: "source_checked", receipt: null, origin: "rewire_run", independent: false });
  });

  it("takes the origin from the evaluation behind the ranked value, not the row's first evaluation", () => {
    // One configuration evaluated twice in a protocol: the later evaluation supplies the ranked value.
    const m = mapping("two", [
      evaluation("alpha", [result("two-a1", "auroc", "0.70")], { origin: "author_reported" }),
      evaluation("alpha", [result("two-a2", "auroc", "0.90")], { origin: "independent_paper" }),
      evaluation("beta", [result("two-b", "auroc", "0.80")], { origin: "unreported" }),
    ]);
    const [alpha, beta] = buildLeaderboard(inputs([m])).rows;
    expect(alpha).toMatchObject({ source_record_id: "two-a2", origin: "independent_paper", independent: true });
    expect(beta).toMatchObject({ origin: "unreported", independent: false });
  });

  it("leaves the origin empty when the ranked evaluation has none, instead of borrowing another evaluation's", () => {
    const later = evaluation("alpha", [result("no-a2", "auroc", "0.90")]);
    delete later.evaluation.attributes.origin;
    const m = mapping("no", [
      evaluation("alpha", [result("no-a1", "auroc", "0.70")], { origin: "independent_paper" }),
      later,
      evaluation("beta", [result("no-b", "auroc", "0.80")]),
    ]);
    const [alpha] = buildLeaderboard(inputs([m])).rows;
    expect(alpha).toMatchObject({ source_record_id: "no-a2", origin: null, independent: false });
    expect(originLabel(alpha.origin)).toBe("Origin not recorded");
  });

  it("labels every origin in the vocabulary and keeps an unknown one readable", () => {
    expect(["author_reported", "independent_paper", "rewire_run", "paper_compilation", "unreported"].map(originLabel)).toEqual([
      "Developer-reported", "Independent study", "Rewire run", "Quoted from another paper", "Source does not say who ran it",
    ]);
    expect(originLabel("benchmark_reported")).toBe("benchmark reported");
    expect(originLabel(null)).toBe("Origin not recorded");
  });

  it("keeps every origin label in one module, with the same origins in each form", () => {
    const origins = Object.keys(ORIGIN_LABELS).sort();
    for (const map of [ORIGIN_EVALUATION_LABELS, ORIGIN_COUNT_LABELS, ORIGIN_DESCRIPTIONS]) expect(Object.keys(map).sort()).toEqual(origins);
    // Record pages (lib/omics.ts) read the same module.
    expect(recordPageOriginLabel).toBe(originEvaluationLabel);
    expect(origins.map((o) => recordPageOriginLabel(o))).toEqual(origins.map((o) => ORIGIN_EVALUATION_LABELS[o]));
    // Unreported, an unknown value and a missing one are three different statements in every form.
    for (const label of [originLabel, originEvaluationLabel, originDescription])
      expect(new Set([label("unreported"), label("benchmark_reported"), label(null as never)]).size).toBe(3);
    expect(originEvaluationLabel("unreported")).toBe("Source does not say who ran the evaluation");
    expect(originEvaluationLabel("benchmark_reported")).toBe("Evaluation origin: benchmark reported");
    expect(originEvaluationLabel(undefined)).toBe("Evaluation origin not recorded");
    expect(originCountLabel("unreported")).toBe("Evaluations whose source does not say who ran them");
    expect(originCountLabel("benchmark_reported")).toBe("Evaluations with origin benchmark reported");
  });

  it("counts only an independent study as independent of the tool's developers", () => {
    expect(Object.keys(ORIGIN_LABELS).filter(isIndependentOrigin)).toEqual(["independent_paper"]);
    expect(isIndependentOrigin(null)).toBe(false);
    expect(ORIGIN_DESCRIPTIONS.rewire_run).toContain("not counted as independent");
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
      parameters: null, context_window: null, license: null, license_scope: null, access: null, open_weights: null,
    });
    const t = telemetryFromRecord({ id: "alphafold-3", name: "AlphaFold 3", attributes: {
      min_vram_gb: 24, access: "Public checkpoint", licence: "Apache-2.0 for code",
      profile: { facts: [{ label: "Parameters", value: "Not reported", status: "unreported" }, { label: "Code licence", value: "MIT", status: "source_checked" }] },
    } });
    expect(t).toMatchObject({ min_vram_gb: 24, access: "Public checkpoint", license: "Apache-2.0 for code", license_scope: "record", parameters: null, open_weights: null, inference_latency_ms: null });
  });

  it("says which licence it shows and never presents a code licence as the model's", () => {
    const facts = (...list: [string, string, string][]) => ({ profile: { facts: list.map(([label, value, status]) => ({ label, value, status })) } });
    const weights = telemetryFromRecord({ attributes: facts(["Weights licence", "CC BY-NC 4.0", "source_checked"], ["Code licence", "MIT", "source_checked"]) });
    expect(weights).toMatchObject({ license: "CC BY-NC 4.0", license_scope: "weights" });
    expect([licenceLabel(weights), licenceText(weights)]).toEqual(["License", "CC BY-NC 4.0"]);
    // The weights terms are explicitly unreported, so only the code licence is known.
    const code = telemetryFromRecord({ attributes: facts(["Weights licence", "Separate checkpoint terms are not stated", "unreported"], ["Code licence", "MIT", "source_checked"]) });
    expect(code).toMatchObject({ license: "MIT", license_scope: "code" });
    expect([licenceLabel(code), licenceLabel(code, "Licence"), licenceText(code)]).toEqual(["Code licence", "Code licence", "Code: MIT"]);
    // The record says a weights licence does not apply (the tool has no weights): the code licence is the tool's.
    const tool = telemetryFromRecord({ attributes: facts(["Weights licence", "Not applicable: no trained weights", "inapplicable"], ["Code licence", "GPL-3.0", "source_checked"]) });
    expect(tool).toMatchObject({ license: "GPL-3.0", license_scope: "tool" });
    expect([licenceLabel(tool), licenceText(tool)]).toEqual(["License", "GPL-3.0"]);
    const none = telemetryFromRecord({ attributes: facts(["Weights licence", "Not stated", "unreported"]) });
    expect([none.license, none.license_scope, licenceLabel(none), licenceText(none)]).toEqual([null, null, "License", null]);
  });

  it("shortens recorded text for table cells and marks every cut", () => {
    expect(shortFact(null)).toBe("Not recorded");
    expect(shortFact("  ")).toBe("Not recorded");
    expect(shortFact("Apache-2.0")).toBe("Apache-2.0");
    expect(shortFact("Apache-2.0.")).toBe("Apache-2.0");
    expect(shortFact("MIT; stated in the model card")).toBe("MIT; stated in the model card");
    expect(shortFact("Public. Weights are gated.")).toBe("Public. Weights are gated");
    expect(shortFact("A".repeat(50), 10)).toBe(`${"A".repeat(9)}…`);
    // A qualifier after a comma, a semicolon or a sentence end is part of the statement: the text is
    // cut only at the length limit, at a word, and the cut is marked. Text from the release:
    expect(shortFact("Listed in the README, but the download returned HTTP 401", 60)).toBe("Listed in the README, but the download returned HTTP 401");
    expect(shortFact("Public code; model weights have separate terms that must be checked.", 48)).toBe("Public code; model weights have separate terms…");
    expect(shortFact("Public checkpoint; remote model code needs review before local use.", 48)).toBe("Public checkpoint; remote model code needs…");
    expect(shortFact("GPL-3.0; inspect the pinned licence and any file-specific terms.", 28)).toBe("GPL-3.0; inspect the pinned…");
    expect(shortFact("Web site, per Riepe et al. Methods", 48)).toBe("Web site, per Riepe et al. Methods");
    expect(shortFact("Smith et al. 2025, Supplementary Table 4", 60)).toBe("Smith et al. 2025, Supplementary Table 4");
    // A cut never ends on punctuation or a split word, and a long unbroken string is still cut.
    expect(shortFact("Open weights, gated access for commercial use", 14)).toBe("Open weights…");
    expect(shortFact("https://example.org/a-very-long-path/to/the/licence", 20)).toBe("https://example.org…");
    for (const max of [10, 28, 48, 60]) expect(shortFact("Public code; model weights have separate terms that must be checked.", max).length).toBeLessThanOrEqual(max);
  });
});

// #230: the deployment card once mapped these records' access and licence text to "Hosted API Only",
// "Open Weights" and "Academic / Research". The text below is copied from release
// 2026-11-20-72316db0764b (shortened where marked "..."); the labels must stay what the record says.
describe("access and licence labels (#230)", () => {
  const model = (access: string | null, licence: string | null) =>
    telemetryFromRecord({ kind: "model", attributes: { ...(access ? { access } : {}), ...(licence ? { licence } : {}) } });
  const card = (t: ReturnType<typeof telemetryFromRecord>) => [shortFact(t.access, 60), shortFact(t.license, 60)];
  const cases: [string, string | null, string | null, [string, string]][] = [
    ["Bacformer", "Public checkpoints on Hugging Face under macwiatrak, installed through the bacformer package; inference needs protein embeddings from a base protein language model.",
      "Apache-2.0 for the code and models in the Bacformer repository",
      ["Public checkpoints on Hugging Face under macwiatrak…", "Apache-2.0 for the code and models in the Bacformer…"]],
    ["Ladon", "No model weights, code repository or model licence is published with the report. As checked on 2026-11-15, the GitHub organisation blankbio lists 0 public repositories ...",
      null,
      ["No model weights, code repository or model licence is…", "Not recorded"]],
    ["PerturbPFN", "Not openly available as checked. The paper links no code repository, weights or checkpoint ...",
      null,
      ["Not openly available as checked. The paper links no code…", "Not recorded"]],
    ["Novae", null,
      null,
      ["Not recorded", "Not recorded"]],
    ["HyInv", "Public: the hyinv package, its command line and Python API, and the FP32 weights (model.safetensors, 7.8 MB) ship in AI4Science/hyinv/ ...",
      "MIT (AI4Science/hyinv/LICENSE), which also carries the ProteinMPNN copyright the model modules come from",
      ["Public: the hyinv package, its command line and Python API…", "MIT (AI4Science/hyinv/LICENSE), which also carries the…"]],
    ["HyCell", "Public: the hycell package installs from the repository subdirectory and ships the 64 MB weights inside it, so it runs offline; ...",
      "Apache-2.0 for the code and weights. The hycell NOTICE opens ...",
      ["Public: the hycell package installs from the repository…", "Apache-2.0 for the code and weights. The hycell NOTICE…"]],
    ["Carbon-X", "Public weights on Hugging Face; 14.8B parameters in bfloat16, served with vLLM on a single 80 GB GPU.",
      "Apache-2.0",
      ["Public weights on Hugging Face; 14.8B parameters in…", "Apache-2.0"]],
    ["BioEmu-2", "Public. Inference code at https://github.com/microsoft/bioemu2 and weights at https://huggingface.co/microsoft/bioemu2, neither gated. ...",
      "MIT, printed in the model card License row, in the repository LICENSE and in the Hugging Face card metadata. NOTICES.md separately covers borrowed components ...",
      ["Public. Inference code at https://github.com/microsoft/bioe…", "MIT, printed in the model card License row, in the…"]],
    ["RFD4-Proteina", "Code at https://github.com/RosettaCommons/RFD4-Proteina, weights at https://huggingface.co/nvidia/RFD4-Proteina ...",
      "BSD 3-Clause for the RFD4-Proteina model, weights and code, Copyright (c) 2026, Institute for Protein Design, University of Washington. ...",
      ["Code at https://github.com/RosettaCommons/RFD4-Proteina…", "BSD 3-Clause for the RFD4-Proteina model, weights and code…"]],
    ["TorchCraft", "Public code in the TorchX repository under Apache-2.0; the weights it optimises through are obtained separately.",
      null,
      ["Public code in the TorchX repository under Apache-2.0; the…", "Not recorded"]],
  ];

  it.each(cases)("%s keeps the record's own words", (_name, access, licence, shown) => {
    const t = model(access, licence);
    expect(t.access).toBe(access);
    expect(t.license).toBe(licence);
    expect(t.license_scope).toBe(licence ? "record" : null);
    expect(t.open_weights).toBeNull();
    expect(card(t)).toEqual(shown);
    for (const invented of ["Hosted API", "Open Weights", "Academic / Research", "Unspecified", "Proprietary"])
      expect(card(t).join(" ")).not.toContain(invented);
  });

  it("does not turn a negated or missing statement into a permission", () => {
    const shown = cases.filter(([name]) => ["Ladon", "PerturbPFN", "Novae"].includes(name)).map(([, access, licence]) => card(model(access, licence)));
    expect(shown.map(([access]) => access.split(" ")[0])).toEqual(["No", "Not", "Not"]);
    expect(shown.every(([, licence]) => licence === "Not recorded")).toBe(true);
  });
});

describe("board statistics", () => {
  const row = (model_id: string, extra: Partial<BiologicalModelRankingRow> = {}) =>
    ({ model_id, parent_id: null, source_ids: ["s1"], independent: true, origin: "independent_paper", ...extra }) as BiologicalModelRankingRow;

  it("counts tools by parent, sources over every cited source, and origins per row", () => {
    const stats = boardStats({ rows: [
      row("a-small", { parent_id: "a" }),
      row("a-large", { parent_id: "a", source_ids: ["s1", "s2"] }),
      row("b", { independent: false, origin: "author_reported", source_ids: ["s3"] }),
      row("c", { independent: false, origin: "unreported" }),
      row("d", { independent: false, origin: null, source_ids: [] }),
    ] });
    expect(stats).toEqual({ rows: 5, tools: 4, sources: 3, independent: 2, origin_unreported: 2 });
    expect(boardStatsText(stats)).toBe("4 tools in 5 rows, from 3 sources. 2 of 5 results (40%) come from an independent study; the release does not say who ran 2 of them.");
  });

  it("does not present an unreported origin as a lack of independence", () => {
    const unreported = boardStats({ rows: [row("a", { independent: false, origin: "unreported" }), row("b", { independent: false, origin: "unreported" })] });
    expect(boardStatsText(unreported)).toBe("2 tools, from 1 source. 0 of 2 results (0%) come from an independent study; the release does not say who ran them.");
    const one = boardStats({ rows: [row("a", { independent: false, origin: null })] });
    expect(boardStatsText(one)).toBe("1 tool, from 1 source. 0 of 1 result (0%) come from an independent study; the release does not say who ran it.");
    expect(boardStatsText(boardStats({ rows: [] }))).toBe("0 tools, from 0 sources. 0 of 0 results come from an independent study.");
  });
});
