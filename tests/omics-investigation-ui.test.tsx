import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createCatalogueQuery, type CatalogueSnapshot } from "../services/omics/src/catalogue-query";
import { deriveResearchReadiness, validateResearchData, type ResearchManifest, type ResearchInvestigation } from "../services/omics/src/research";
import { researchHash } from "../services/omics/src/research-integrity";
import { filterCatalogue, readCatalogueFilters } from "../lib/omics-browse";
import ResearchReadiness from "../components/catalogue/ResearchReadiness";
import Investigation, { InvestigationList } from "../components/catalogue/ResearchInvestigation";
import InvestigationsPage from "../app/investigations/page";
import InvestigationPage, { generateStaticParams, generateMetadata } from "../app/investigations/[id]/page";

const fixture = vi.hoisted(() => ({ snapshot: null as CatalogueSnapshot | null }));
vi.mock("../lib/catalogue-build", () => ({
  buildCatalogue: () => ({
    catalogue: fixture.snapshot!,
    // Route privacy is exercised even if an upstream caller forgot to reject
    // a staged report. The record graph itself contains no staged content.
    query: createCatalogueQuery({ ...fixture.snapshot!, research: undefined }),
  }),
}));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));

const release = "2026-09-23-aaaaaaaaaaaa";
const record = (id: string, kind: CatalogueSnapshot["records"][number]["kind"]) => ({
  id, kind, name: `Record ${id}`, description: "A source-checked record", status: "source_checked",
  facets: {}, source_ids: [], links: [], attributes: {},
});
const manifest: ResearchManifest = {
  schema_version: "1.0", id: "example-manifest", title: "Exact assay snapshot",
  question: "Does a metric discrepancy come from missing predictions?",
  catalogue_release_id: release, dataset_id: "assay", evaluation_ids: ["evaluation"], protocol_id: "protocol",
  artifacts: [{ id: "table", role: "prepared_table", sha256: "a".repeat(64), semantic_sha256: "b".repeat(64), format: "csv", uri: null }, { id: "report-receipt", role: "numerical_receipt", sha256: "d".repeat(64), format: "json", uri: "https://example.org/receipt.json" }],
  table_artifact_id: "table", semantics: { target: "continuous", outcome: "score", unit: "assay units", score_direction: "higher", join_key: "id", independent_unit: "gene", subgroup_fields: ["gene"], exposed: true, split: "test" },
  expected_metrics: { baseline: { spearman: 0.4 } }, metric_tolerance: 0.0001,
  verification: { verified_at: "2026-09-23T12:00:00Z", checks: ["artifact_hashes", "join_integrity", "score_semantics", "metric_replay", "annotations"].map((check) => ({ check, status: "passed" as const, detail: `${check} verified` })), limitations: ["Within-gene dependence has not been resolved."] },
  local_recipes: [],
};
const operation = (id: string, expected_observation: string): ResearchInvestigation["attempts"][number]["operation"] => ({
  id, kind: "replay", methods: ["baseline"], metric: null, field: null, recipe: null, expected_observation,
});
const attempts: ResearchInvestigation["attempts"] = [
  { id: "direction-attempt", plan_sha256: "c".repeat(64), operation: operation("score-direction", "Check score direction: the sign was inverted."), status: "completed", started_at: "2026-09-23T12:10:00Z", finished_at: "2026-09-23T12:11:00Z", receipt_sha256: "e".repeat(64), receipt: { operation_id: "score-direction", kind: "replay", manifest_sha256: "f".repeat(64), table_sha256: "a".repeat(64), code_sha256: "a".repeat(64), numerical: { hypothesis_outcome: "rejected", observation: "Original direction reproduces the score." }, limitations: [] }, error: null },
  { id: "batch-attempt", plan_sha256: "c".repeat(64), operation: operation("batch-annotation", "Inspect assay annotation: the assay differs by batch."), status: "failed", started_at: "2026-09-23T12:11:00Z", finished_at: "2026-09-23T12:12:00Z", receipt_sha256: null, receipt: null, error: "Batch annotation is unavailable." },
  { id: "coverage-attempt", plan_sha256: "c".repeat(64), operation: operation("coverage", "Reconcile coverage: coverage explains the difference."), status: "completed", started_at: "2026-09-23T12:12:00Z", finished_at: "2026-09-23T12:13:00Z", receipt_sha256: "e".repeat(64), receipt: { operation_id: "coverage", kind: "replay", manifest_sha256: "f".repeat(64), table_sha256: "a".repeat(64), code_sha256: "a".repeat(64), numerical: { hypothesis_outcome: "supported", observation: "The shift disappears on the shared population." }, limitations: [] }, error: null },
];
const report: ResearchInvestigation = {
  schema_version: "1.0", id: "coverage-investigation", manifest_id: manifest.id,
  catalogue_release_id: release, title: "Prediction coverage discrepancy", question: manifest.question,
  status: "completed", claim_level: "exploratory", outcome: "Coverage differences explain the metric shift.",
  created_at: "2026-09-23T12:10:00Z", plan_sha256: "c".repeat(64),
  attempts,
  findings: ["The discrepancy is methodological."], limitations: ["Independent biological validation has not been performed."],
  review: { status: "reviewed", method: "human", reviewed_at: "2026-09-23T13:00:00Z", reviewer_label: "Test reviewer" },
  artifacts: manifest.artifacts,
  specs: [{ schema_version: "1.0", id: "initial-spec", manifest_id: manifest.id, manifest_sha256: "f".repeat(64), catalogue_release_id: release, question: manifest.question, created_at: "2026-09-23T12:00:00Z", round: 0,
    evidence: manifest.artifacts, plan: { hypotheses: attempts.map((attempt, i) => ({ id: `hypothesis-${i}`, explanation: attempt.operation.expected_observation, tests: [attempt.operation] })), multiple_testing: "descriptive_only", stopping_rule: "Stop after the registered tests.", requested_tools: [] },
    permitted_actions: ["replay"], exposure: { previously_exposed: true, usage: "exploration", independent_validation: false },
    budget: { campaign_seconds: 28800, experiment_seconds: 3600, codex_seconds: 900, codex_calls: 24, memory_bytes: 8 * 1024 ** 3, workspace_bytes: 20 * 1024 ** 3, followup_rounds: 2 },
  }],
};
// Keep the rendering fixture valid under the same integrity checks as a public
// snapshot. Numerical values are synthetic; their plan/receipt lineage is real.
for (const spec of report.specs) spec.manifest_sha256 = researchHash(manifest);
for (const attempt of report.attempts) {
  attempt.plan_sha256 = researchHash(report.specs[0]);
  if (attempt.receipt) {
    attempt.receipt.manifest_sha256 = researchHash(manifest);
    attempt.receipt.numerical.metrics = { baseline: { spearman: 0.4 } };
    attempt.receipt.numerical.checks = [{ method: "baseline", metric: "spearman", expected: 0.4, actual: 0.4, status: "passed", tolerance: manifest.metric_tolerance, metric_available: true }];
    attempt.receipt_sha256 = researchHash(attempt.receipt);
  }
}
report.plan_sha256 = researchHash(report.specs);
function snapshot(investigations: ResearchInvestigation[] = []): CatalogueSnapshot {
  const value: CatalogueSnapshot = {
    schema_version: "1.1", release_id: release, released_at: "2026-09-23T12:00:00Z", coverage: {},
    records: [record("assay", "dataset"), record("unresolved-assay", "dataset"), record("protocol", "protocol"), {
      ...record("evaluation", "evaluation"), links: [{ relation: "dataset", target_id: "assay" }, { relation: "protocol", target_id: "protocol" }],
    }], research: { schema_version: "1.0", manifests: [structuredClone(manifest)], investigations },
  };
  fixture.snapshot = value;
  return value;
}

describe("research readiness presentation", () => {
  it("separates reproducible metrics from unresolved dependence and prior exposure", () => {
    const data = snapshot();
    const assessment = deriveResearchReadiness(data).find((item) => item.record_id === "assay")!;
    const html = renderToStaticMarkup(<ResearchReadiness assessment={assessment} manifests={[manifest]} records={data.records} />);
    expect(html).toContain("Replay metrics");
    expect(html).toContain("Evidence complete");
    expect(html).toContain("Evidence incomplete");
    expect(html).toContain("dependence: verification is missing");
    expect(html).toContain("not untouched validation");
    expect(html).toContain("Within-gene dependence has not been resolved");
    expect(html).toContain("Availability on your computer is checked separately");
    expect(html).toContain("File SHA-256");
    expect(html).toContain("Semantic SHA-256");
    expect(html).toContain("No public download");
    expect(html).toContain("/database/protocol/protocol");
    expect(html).not.toContain("Run investigation");
  });
  it("does not treat source_checked as reproducibility or invent artifact downloads", () => {
    const assessment = deriveResearchReadiness(snapshot()).find((item) => item.record_id === "unresolved-assay")!;
    const html = renderToStaticMarkup(<ResearchReadiness assessment={assessment} manifests={[]} />);
    expect(html).not.toContain("Evidence complete</span>");
    expect(html).toContain("No verified artifact manifest is connected");
    expect(html).toContain("No verified artifact manifest is linked to this exact record");
  });
  it("parses shareable filters, ignores unsupported kinds and filters before pagination", () => {
    const data = snapshot();
    const filters = readCatalogueFilters("?kind=dataset&readiness=replay");
    const assessments = deriveResearchReadiness(data);
    expect(filters.readiness).toBe("replay");
    expect(filterCatalogue(data.records, filters, assessments).map((item) => item.id)).toEqual(["assay"]);
    expect(readCatalogueFilters("?kind=model&readiness=replay").readiness).toBe("");
    expect(readCatalogueFilters("?kind=dataset&readiness=invented").readiness).toBe("");
    const page = createCatalogueQuery(data).list({ kind: "dataset", readiness: "replay", limit: 1 });
    expect(page.total).toBe(1);
    expect(page.items[0].id).toBe("assay");
    expect(page.research_readiness.map((item) => item.record_id)).toEqual(["assay"]);
  });
});

describe("reviewed investigation routes", () => {
  it("shows selected and blocked candidate questions without implying verified novelty or validation", () => {
    const value = structuredClone(report), spec = value.specs[0];
    const decisive = { id: "question-decisive-test", kind: "subgroups" as const, methods: ["baseline"], metric: null,
      field: "gene", recipe: null, expected_observation: "Coverage differs between the recorded genes." };
    const candidate = {
      id: "gene-coverage", question: "Does prediction coverage vary by gene?", population: "The pinned assay variants",
      comparison: "Coverage across the recorded genes", outcome: "Scored prediction counts",
      hypothesis: "Missing predictions concentrate in particular genes.", alternative_explanation: "Coverage is uniform across genes.",
      supporting_result: "Some genes have more missing predictions.", contradicting_result: "Every gene has complete predictions.",
      confounders: ["Gene groups differ in variant composition."], why_interesting: "It identifies a possible source of the metric discrepancy.",
      missing_evidence: [], validation_needed: "Test the pattern in a separate unexposed assay.", decisive_test: decisive, blocker: null,
    };
    spec.question_design = {
      candidates: [candidate, { ...candidate, id: "cell-context", question: "Does cellular context explain the discrepancy?",
        decisive_test: null, blocker: "Cell type is not recorded.", missing_evidence: ["Matched cellular measurements"] }],
      selected_candidate_id: candidate.id, selection_reason: "Gene labels support an immediate discriminating test.", novelty_status: "unverified",
    };
    spec.question = candidate.question;
    spec.plan.hypotheses[0].tests.push(decisive);
    spec.permitted_actions.push("subgroups");
    for (const attempt of value.attempts) attempt.plan_sha256 = researchHash(spec);
    value.plan_sha256 = researchHash(value.specs);
    const data = snapshot([value]);
    expect(() => validateResearchData(data.research, data)).not.toThrow();
    const html = renderToStaticMarkup(<Investigation report={value} />);
    for (const text of ["Research question selection", "Selected question", candidate.question, candidate.alternative_explanation,
      candidate.supporting_result, candidate.contradicting_result, candidate.validation_needed, "Cell type is not recorded.",
      "Novelty has not been verified", "independent validation below is proposed work"])
      expect(html).toContain(text);
    expect(renderToStaticMarkup(<Investigation report={report} />)).not.toContain("Research question selection");
    value.question_design_artifact = { design: structuredClone(spec.question_design), sha256: researchHash(spec.question_design) };
    const bothHtml = renderToStaticMarkup(<Investigation report={value} />);
    expect(bothHtml.match(/id="question-design-title"/g)).toHaveLength(1);
    value.specs = [];
    value.attempts = [];
    value.plan_sha256 = researchHash([]);
    value.status = "stopped";
    const stopped = snapshot([value]);
    expect(() => validateResearchData(stopped.research, stopped)).not.toThrow();
    const stoppedHtml = renderToStaticMarkup(<Investigation report={value} />);
    expect(stoppedHtml).toContain(candidate.question);
    expect(stoppedHtml).toContain("No frozen specification is included");
    expect(stoppedHtml.match(/id="question-design-title"/g)).toHaveLength(1);
  });
  it("keeps all unsuccessful explanations and makes scientific limits explicit", () => {
    const html = renderToStaticMarkup(<Investigation report={report} />);
    for (const text of ["Exploratory investigation", "Plan SHA-256", "Check score direction", "rejected", "Inspect assay annotation", "failed", "Batch annotation is unavailable", "Reconcile coverage", "Limitations and remaining uncertainty", report.limitations[0]]) expect(html).toContain(text);
    expect(html).toContain("https://example.org/receipt.json");
    expect(html).not.toContain("Independently supported finding:");
  });
  it("excludes pending, rejected and automated-only reviews from public components and routes", () => {
    const pending = { ...report, id: "pending-investigation", title: "Private staged title", review: { status: "pending" as const, method: "ai_assisted" as const } };
    const rejected = { ...report, id: "rejected-investigation", title: "Rejected private title", review: { ...report.review, status: "rejected" as const } };
    const automated = { ...report, id: "automated-investigation", title: "Automatic private title", review: { ...report.review, method: "ai_assisted" as const } };
    snapshot([report, pending, rejected, automated]);
    const list = renderToStaticMarkup(<InvestigationList reports={[report, pending, rejected, automated]} />);
    expect(list).toContain(report.title);
    for (const hidden of [pending, rejected, automated]) {
      expect(list).not.toContain(hidden.title);
      expect(renderToStaticMarkup(<Investigation report={hidden} />)).toBe("");
      expect(() => InvestigationPage({ params: { id: hidden.id } })).toThrow("NOT_FOUND");
    }
    expect(generateStaticParams()).toEqual([{ id: report.id }]);
    const index = renderToStaticMarkup(<InvestigationsPage />);
    expect(index).not.toContain(pending.title);
    expect(generateMetadata({ params: { id: pending.id } }).robots).toEqual({ index: false, follow: false });
  });
  it("renders a real empty state and no accessible placeholder report", () => {
    snapshot();
    const html = renderToStaticMarkup(<InvestigationsPage />);
    expect(html).toContain("No reviewed investigations are available");
    expect(html).toContain("0 reviewed reports");
    expect(html).not.toContain(report.title);
    const [placeholder] = generateStaticParams();
    expect(() => InvestigationPage({ params: placeholder })).toThrow("NOT_FOUND");
  });
  it("links reviewed reports to exact dataset and protocol records", () => {
    const data = snapshot([report]);
    expect(() => validateResearchData(data.research, data)).not.toThrow();
    const html = renderToStaticMarkup(<InvestigationPage params={{ id: report.id }} />);
    expect(html).toContain("/database/dataset/assay");
    expect(html).toContain("/database/protocol/protocol");
    expect(html).toContain("/database/evaluation/evaluation");
    expect(generateMetadata({ params: { id: report.id } }).alternates?.canonical).toBe(`https://benchmarks.rewirebio.io/investigations/${report.id}/`);
  });
  it("blocks independent support labels until a validation-specific contract exists", () => {
    const unsupported = { ...report, claim_level: "independently_supported" as const };
    const data = snapshot([unsupported]);
    expect(() => createCatalogueQuery(data)).toThrow(/Independent support|validation evidence contract/);
    expect(renderToStaticMarkup(<Investigation report={unsupported} />)).toBe("");
    expect(renderToStaticMarkup(<InvestigationList reports={[unsupported]} />)).not.toContain(report.title);
  });
  it("uses human-readable outcome labels without changing reviewed narrative text", () => {
    for (const [outcome, label] of [["data_or_method_explanation", "Data or method explanation"], ["exploratory_biological_hypothesis", "Exploratory biological hypothesis"], ["inconclusive", "Inconclusive"], ["blocked", "Investigation blocked"], [report.outcome, report.outcome]]) {
      const value = { ...report, outcome };
      expect(renderToStaticMarkup(<Investigation report={value} />)).toContain(label);
      expect(renderToStaticMarkup(<InvestigationList reports={[value]} />)).toContain(label);
    }
    snapshot();
    expect(renderToStaticMarkup(<InvestigationsPage />)).toContain("All current reports are exploratory");
  });
});
