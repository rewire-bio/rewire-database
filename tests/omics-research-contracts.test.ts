import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { researchInvestigationSchema, researchOperationSchema, researchSpecSchema, validateResearchManifest, type ResearchSpec } from "../services/omics/src/research";
import { researchHash, validateResearchIntegrity } from "../services/omics/src/research-integrity";

// These fixtures are generated and tested by the Python runner. Keep the copies
// identical when the shared interchange contract changes.
const fixtures = JSON.parse(fs.readFileSync("data/research/contract-fixtures.json", "utf8"));
describe("Python/TypeScript research contract parity", () => {
  it("enforces the same meaningful operation arguments as the per-kind worker signatures", () => {
    const base = { id: "operation", methods: [], metric: null, field: null, recipe: null, expected_observation: "A registered observation" };
    const valid = [
      { ...base, kind: "verify" }, { ...base, kind: "replay" }, { ...base, kind: "coverage" }, { ...base, kind: "sensitivity" },
      { ...base, kind: "paired", methods: ["first", "second"] },
      { ...base, kind: "bootstrap", methods: ["first", "second"], metric: "auroc" },
      { ...base, kind: "subgroups", field: "annotation" },
      { ...base, kind: "local_recipe", recipe: "sdk:train-mean-v1" },
    ];
    valid.forEach(operation => expect(researchOperationSchema.parse(operation)).toEqual(operation));
    for (const operation of [
      { ...base, kind: "verify", methods: ["first"] },
      { ...base, kind: "paired", methods: ["first"] },
      { ...base, kind: "bootstrap", methods: ["first", "second"] },
      { ...base, kind: "subgroups" },
      { ...base, kind: "local_recipe", recipe: "sdk:train-mean-v1", methods: ["first"] },
      { ...base, kind: "local_recipe" },
      { ...base, kind: "coverage", metric: "auroc" },
      { ...base, kind: "replay", field: "annotation" },
      { ...base, kind: "sensitivity", recipe: "sdk:train-mean-v1" },
    ]) expect(() => researchOperationSchema.parse(operation)).toThrow();
  });
  it("accepts the same frozen manifest, specification and bundle without normalizing signed content", () => {
    const manifest = validateResearchManifest(fixtures.valid.manifest);
    const spec = researchSpecSchema.parse(fixtures.valid.specification);
    const bundle = researchInvestigationSchema.parse(fixtures.valid.bundle);
    expect(manifest).toEqual(fixtures.valid.manifest);
    expect(spec).toEqual(fixtures.valid.specification);
    expect(bundle).toEqual(fixtures.valid.bundle);
    expect(validateResearchIntegrity(bundle, manifest)).toEqual(bundle);
    for (const name of ["manifest", "specification", "bundle"])
      expect(researchHash(fixtures.valid[name])).toBe(fixtures.expected_hashes[name]);
  });
  for (const fixture of fixtures.invalid) it(`rejects ${fixture.reason}`, () => {
    expect(() => {
      if (fixture.contract === "manifest") return validateResearchManifest(fixture.value);
      if (fixture.contract === "specification") return researchSpecSchema.parse(fixture.value);
      return validateResearchIntegrity(researchInvestigationSchema.parse(fixture.value), validateResearchManifest(fixtures.valid.manifest));
    }).toThrow();
  });
});

function questionBundle() {
  const manifest = validateResearchManifest(structuredClone(fixtures.valid.manifest));
  const bundle = researchInvestigationSchema.parse(structuredClone(fixtures.valid.bundle));
  const spec = bundle.specs[0], previousHash = researchHash(spec);
  const decisive = { id: "candidate-coverage", kind: "coverage" as const, methods: [], metric: null, field: null, recipe: null,
    expected_observation: "Differential missing predictions would support a coverage explanation." };
  spec.question_design = {
    candidates: [{ id: "coverage-question", question: "Does differential prediction coverage explain the assay discrepancy?",
      population: "All variants in the pinned assay", comparison: "Scored and missing predictions for each method", outcome: "Prediction coverage",
      hypothesis: "The methods were evaluated on different observations.", alternative_explanation: "The discrepancy persists with complete coverage.",
      supporting_result: "Missing prediction counts differ between methods.", contradicting_result: "All methods score every variant.",
      confounders: ["Missingness may depend on variant type."], why_interesting: "It distinguishes a denominator issue from model performance.",
      missing_evidence: [], validation_needed: "Repeat the explanation on an unexposed assay with overlap checks.", decisive_test: decisive, blocker: null }],
    selected_candidate_id: "coverage-question", selection_reason: "  Coverage can be checked using the saved predictions.\n", novelty_status: "unverified",
  };
  spec.question = spec.question_design.candidates[0].question;
  spec.plan.hypotheses.push({ id: "selected-question", explanation: spec.question_design.candidates[0].hypothesis,
    tests: [{ ...decisive, id: "supervised-question-test" }] });
  if (!spec.permitted_actions.includes("coverage")) spec.permitted_actions.push("coverage");
  for (const attempt of bundle.attempts) if (attempt.plan_sha256 === previousHash) attempt.plan_sha256 = researchHash(spec);
  bundle.plan_sha256 = researchHash(bundle.specs);
  bundle.execution!.reasoning.push({ role: "hypothesizer", model: "fixture-model", cli_version: "fixture", usage: {} });
  bundle.execution!.codex_calls += 1;
  bundle.question_design_artifact = { design: structuredClone(spec.question_design), sha256: researchHash(spec.question_design) };
  return { manifest, bundle, spec };
}

describe("frozen research question design", () => {
  it("preserves the complete design and new reasoning role under existing plan hashes", () => {
    const { manifest, bundle, spec } = questionBundle();
    expect(researchInvestigationSchema.parse(bundle)).toEqual(bundle);
    expect(validateResearchIntegrity(bundle, manifest)).toEqual(bundle);
    expect(spec.question_design!.selection_reason).toBe("  Coverage can be checked using the saved predictions.\n");
    expect(bundle.question).toBe(manifest.question);
    expect(spec.question).not.toBe(bundle.question);
    spec.question_design!.candidates[0].supporting_result = "A changed post-hoc expectation.";
    expect(() => validateResearchIntegrity(bundle, manifest)).toThrow(/plan hash mismatch/);
  });

  it("rejects contradictory, missing or untestable selections and plans that omit the selected test", () => {
    const edits: ((spec: ResearchSpec) => void)[] = [
      spec => { spec.question_design!.candidates.push(structuredClone(spec.question_design!.candidates[0])); },
      spec => { spec.question_design!.candidates[0].decisive_test = null; },
      spec => { spec.question_design!.candidates[0].blocker = "No operation exists."; },
      spec => { spec.question_design!.selected_candidate_id = "unknown"; },
      spec => { spec.question_design!.selected_candidate_id = null; },
      spec => { const candidate = spec.question_design!.candidates[0]; candidate.decisive_test = null; candidate.blocker = "New data is needed."; },
      spec => { spec.round = 1; },
      spec => { spec.question = "A different question."; },
      spec => { spec.plan.hypotheses.pop(); },
      spec => { spec.plan.hypotheses.at(-1)!.tests[0].kind = "sensitivity"; },
    ];
    for (const edit of edits) {
      const { spec } = questionBundle(); edit(spec);
      expect(() => researchSpecSchema.parse(spec)).toThrow();
    }
  });

  it("checks available operations for unselected candidates as well as the selected one", () => {
    for (const decisive of [
      { kind: "coverage", methods: ["unavailable-model"], metric: null, field: null, recipe: null },
      { kind: "coverage", methods: ["baseline", "baseline"], metric: null, field: null, recipe: null },
      { kind: "subgroups", methods: [], metric: null, field: "unavailable-annotation", recipe: null },
      { kind: "verify", methods: [], metric: null, field: null, recipe: null },
      { kind: "local_recipe", methods: [], metric: null, field: null, recipe: "sdk:train-mean-v1" },
    ] as const) {
      const { manifest, bundle, spec } = questionBundle();
      const other = structuredClone(spec.question_design!.candidates[0]); other.id = "unselected-question";
      other.decisive_test = { ...other.decisive_test!, ...decisive, methods: [...decisive.methods] };
      spec.question_design!.candidates.push(other);
      bundle.plan_sha256 = researchHash(bundle.specs);
      expect(() => validateResearchIntegrity(researchInvestigationSchema.parse(bundle), manifest)).toThrow();
    }
  });

  it("retains all blocked candidates without numerical attempts, including stopped or failed exports", () => {
    const { bundle: designed } = questionBundle();
    const manifest = validateResearchManifest(fixtures.valid.manifest);
    const bundle = researchInvestigationSchema.parse(structuredClone(fixtures.valid.bundle));
    bundle.specs[0].question_design = structuredClone(designed.specs[0].question_design);
    const design = bundle.specs[0].question_design!;
    design.candidates[0].decisive_test = null;
    design.candidates[0].blocker = "The required cellular context is not recorded.";
    design.selected_candidate_id = null;
    design.selection_reason = "All candidate tests require missing evidence.";
    bundle.attempts = [];
    bundle.plan_sha256 = researchHash(bundle.specs);
    for (const status of ["blocked", "failed", "stopped"] as const) {
      bundle.status = status;
      expect(validateResearchIntegrity(researchInvestigationSchema.parse(bundle), manifest)).toEqual(bundle);
    }
    bundle.status = "completed";
    expect(() => validateResearchIntegrity(bundle, manifest)).toThrow();
    bundle.status = "blocked";
    bundle.attempts = structuredClone(fixtures.valid.bundle.attempts);
    expect(() => validateResearchIntegrity(bundle, manifest)).toThrow(/cannot complete or execute/);
  });

  it("retains hashed candidate provenance when planning fails or the budget stops before any plan is frozen", () => {
    const { manifest, bundle } = questionBundle();
    const artifact = structuredClone(bundle.question_design_artifact);
    bundle.specs = [];
    bundle.attempts = [];
    bundle.plan_sha256 = researchHash([]);
    for (const status of ["failed", "stopped"] as const) {
      bundle.status = status;
      const parsed = researchInvestigationSchema.parse(bundle);
      expect(validateResearchIntegrity(parsed, manifest).question_design_artifact).toEqual(artifact);
    }
    bundle.question_design_artifact!.sha256 = "0".repeat(64);
    expect(() => validateResearchIntegrity(bundle, manifest)).toThrow(/Question design artifact checksum/);
    bundle.question_design_artifact = artifact;
    bundle.question_design_artifact!.design.candidates[0].supporting_result = "Changed after hypothesis selection.";
    expect(() => validateResearchIntegrity(bundle, manifest)).toThrow(/Question design artifact checksum/);
  });

  it("rejects disagreement between the hashed artifact and the frozen design", () => {
    const { manifest, bundle } = questionBundle();
    const artifact = bundle.question_design_artifact!;
    artifact.design.selection_reason = "A different selection rationale.";
    artifact.sha256 = researchHash(artifact.design);
    expect(() => validateResearchIntegrity(researchInvestigationSchema.parse(bundle), manifest)).toThrow(/differs from its artifact/);
  });

  it("validates artifact-only candidates against the manifest and enforces blocked selections without specs", () => {
    const { manifest, bundle } = questionBundle();
    bundle.specs = [];
    bundle.attempts = [];
    bundle.plan_sha256 = researchHash([]);
    bundle.status = "blocked";
    const artifact = bundle.question_design_artifact!, candidate = artifact.design.candidates[0];
    candidate.decisive_test!.methods = ["unavailable-model"];
    artifact.sha256 = researchHash(artifact.design);
    expect(() => validateResearchIntegrity(researchInvestigationSchema.parse(bundle), manifest)).toThrow(/unknown or duplicate methods/);
    candidate.decisive_test = null;
    candidate.blocker = "The discriminating experiment requires unavailable cellular measurements.";
    artifact.design.selected_candidate_id = null;
    artifact.sha256 = researchHash(artifact.design);
    expect(validateResearchIntegrity(researchInvestigationSchema.parse(bundle), manifest)).toEqual(bundle);
    bundle.attempts = structuredClone(fixtures.valid.bundle.attempts);
    expect(() => validateResearchIntegrity(bundle, manifest)).toThrow(/cannot complete or execute/);
    bundle.attempts = [];
    bundle.status = "completed";
    expect(() => validateResearchIntegrity(bundle, manifest)).toThrow();
  });
});

function followupBundle() {
  const { manifest, bundle } = questionBundle();
  const spec = structuredClone(bundle.specs[0]);
  delete spec.question_design;
  spec.id = "followup-spec";
  spec.round = 1;
  spec.created_at = "2026-09-23T01:00:00Z";
  spec.question = "Does missing prediction coverage vary by region?";
  spec.followup_test = { id: "critic-required-test", kind: "subgroups", methods: ["baseline", "candidate"], metric: "auroc",
    field: "region", recipe: null, expected_observation: "The subgroup comparison will distinguish region-dependent missingness." };
  const operation = { ...spec.followup_test, id: "supervised-followup-test",
    expected_observation: "Coverage and AUROC are reported for each declared region." };
  spec.plan = { hypotheses: [{ id: "required-followup", explanation: "Prediction missingness may depend on region.", tests: [operation] }],
    multiple_testing: "descriptive_only", stopping_rule: "Stop after the required region comparison.", requested_tools: [] };
  spec.permitted_actions = ["subgroups"];
  const receipt = { operation_id: operation.id, kind: operation.kind, manifest_sha256: researchHash(manifest),
    table_sha256: manifest.artifacts.find(artifact => artifact.id === manifest.table_artifact_id)!.sha256,
    code_sha256: bundle.execution!.code_sha256, numerical: { fixture: "Synthetic follow-up receipt" }, limitations: ["Synthetic evidence only"] };
  bundle.specs.push(spec);
  bundle.plan_sha256 = researchHash(bundle.specs);
  bundle.attempts.push({ id: "followup-attempt", plan_sha256: researchHash(spec), operation, status: "completed",
    started_at: "2026-09-23T01:00:01Z", finished_at: "2026-09-23T01:00:02Z", receipt_sha256: researchHash(receipt), receipt, error: null });
  return { manifest, bundle, spec };
}

describe("required follow-up test", () => {
  it("preserves the critic's requested test in a later frozen plan with numerical lineage", () => {
    const { manifest, bundle, spec } = followupBundle();
    expect(researchInvestigationSchema.parse(bundle)).toEqual(bundle);
    expect(validateResearchIntegrity(bundle, manifest)).toEqual(bundle);
    expect(spec.followup_test!.id).not.toBe(spec.plan.hypotheses[0].tests[0].id);
    expect(spec.followup_test!.expected_observation).not.toBe(spec.plan.hypotheses[0].tests[0].expected_observation);
    expect(spec.question).not.toBe(bundle.specs[0].question);
    spec.followup_test!.expected_observation = "A changed post-hoc follow-up expectation.";
    expect(() => validateResearchIntegrity(bundle, manifest)).toThrow(/plan hash mismatch/);
  });

  it("rejects initial-round declarations, omitted tests, changed method order and duplicate methods", () => {
    const edits: ((spec: ResearchSpec) => void)[] = [
      spec => { spec.round = 0; },
      spec => { spec.plan.hypotheses[0].tests[0] = { id: "unrelated-test", kind: "coverage", methods: [], metric: null,
        field: null, recipe: null, expected_observation: "An unrelated coverage check." }; },
      spec => { spec.plan.hypotheses[0].tests[0].methods = [...spec.followup_test!.methods].reverse(); },
      spec => { spec.followup_test!.methods = ["baseline", "baseline"]; spec.plan.hypotheses[0].tests[0].methods = ["baseline", "baseline"]; },
      spec => { spec.followup_test = { id: "repeated-core-check", kind: "replay", methods: [], metric: null, field: null,
        recipe: null, expected_observation: "A core replay is not an additional follow-up diagnostic." };
        spec.plan.hypotheses[0].tests = [structuredClone(spec.followup_test)]; },
    ];
    for (const edit of edits) {
      const { spec } = followupBundle(); edit(spec);
      expect(() => researchSpecSchema.parse(spec)).toThrow();
    }
  });

  it("binds the required test's methods, metric, field, recipe and permitted actions to the manifest", () => {
    const edits: ((spec: ResearchSpec) => void)[] = [
      spec => { spec.followup_test!.methods = ["unavailable-model"]; },
      spec => { spec.followup_test!.metric = "unavailable-metric"; },
      spec => { spec.followup_test!.field = "unavailable-annotation"; },
      spec => { spec.followup_test = { id: "unavailable-recipe", kind: "local_recipe", methods: [], metric: null,
        field: null, recipe: "sdk:sequence-composition-v1", expected_observation: "A recipe not authorized by this manifest." };
        spec.permitted_actions = ["local_recipe"]; },
      spec => { spec.permitted_actions = ["coverage"]; },
    ];
    for (const edit of edits) {
      const { manifest, bundle, spec } = followupBundle(); edit(spec);
      spec.plan.hypotheses[0].tests = [structuredClone(spec.followup_test!)];
      bundle.plan_sha256 = researchHash(bundle.specs);
      expect(() => validateResearchIntegrity(researchInvestigationSchema.parse(bundle), manifest)).toThrow();
    }
  });

  it("uses the follow-up registry's shared metrics and bootstrap independence requirement", () => {
    for (const mode of ["metric", "independence"]) {
      const { manifest, bundle, spec } = followupBundle();
      if (mode === "metric") {
        delete manifest.expected_metrics.candidate.auroc;
        spec.followup_test!.methods = ["baseline"];
      } else {
        manifest.semantics.independent_unit = null;
        spec.followup_test!.kind = "bootstrap";
        spec.followup_test!.field = null;
        spec.permitted_actions = ["bootstrap"];
      }
      spec.plan.hypotheses[0].tests = [structuredClone(spec.followup_test!)];
      for (const frozen of bundle.specs) frozen.manifest_sha256 = researchHash(manifest);
      bundle.plan_sha256 = researchHash(bundle.specs);
      expect(() => validateResearchIntegrity(researchInvestigationSchema.parse(bundle), manifest))
        .toThrow(mode === "metric" ? /Follow-up metric is not shared/ : /Follow-up bootstrap requires/);
    }
  });

  it("allows a manifest-authorized training-mean recipe in a later round", () => {
    const { manifest, bundle, spec } = followupBundle();
    manifest.local_recipes = ["sdk:train-mean-v1"];
    spec.followup_test = { id: "followup-training-mean", kind: "local_recipe", methods: [], metric: null, field: null,
      recipe: "sdk:train-mean-v1", expected_observation: "Compare against the registered training-mean control." };
    spec.plan.hypotheses[0].tests = [structuredClone(spec.followup_test)];
    spec.permitted_actions = ["local_recipe"];
    spec.manifest_sha256 = researchHash(manifest);
    bundle.specs = [spec];
    bundle.plan_sha256 = researchHash(bundle.specs);
    bundle.attempts = [];
    bundle.status = "stopped";
    expect(validateResearchIntegrity(researchInvestigationSchema.parse(bundle), manifest)).toEqual(bundle);
  });
});
