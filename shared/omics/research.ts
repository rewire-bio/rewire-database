import { z } from "zod";
import type { CatalogueSnapshot, CatalogueRecord } from "./catalogue-query.js";
import { assertNoPrivateFields } from "./private-fields.js";
import { validateResearchIntegrity } from "./research-integrity.js";

const identifier = z.string().regex(/^[a-z0-9][a-z0-9-]{0,254}$/);
const releaseId = z.string().regex(/^\d{4}-\d{2}-\d{2}-[a-f0-9]{12}$/);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
// Never normalize signed content: whitespace belongs to the frozen evidence.
const text = z.string().min(1).max(12000);
const internalId = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,199}$/);
export const researchCapabilities = ["replay", "analysis", "local_run", "validation"] as const;
export const researchRecipes = ["sdk:train-mean-v1", "sdk:sequence-composition-v1", "sdk:mfass-kmer-v2", "sdk:seeded-random-v1", "sdk:esm2-8m-v1"] as const;
const publicUri = z.string().url().superRefine((value, ctx) => {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password ||
    !url.hostname.includes(".") || /^(?:\d+\.){3}\d+$/.test(url.hostname) || url.hostname.startsWith("[") ||
    /\.(local|internal|localhost)$/.test(url.hostname) ||
    [...url.searchParams.keys()].some(key => /token|secret|credential|signature|password|api.key/i.test(key))) {
    ctx.addIssue({ code: "custom", message: "Research artifact URI must be public HTTPS without credentials." });
  }
});
export const researchArtifactSchema = z.object({
  id: internalId, role: text, sha256, format: text, uri: publicUri.nullable(),
  semantic_sha256: sha256.optional(),
}).strict();
export const researchManifestSchema = z.object({
  schema_version: z.literal("1.0"), id: identifier, title: text, question: text,
  catalogue_release_id: releaseId, dataset_id: identifier,
  evaluation_ids: z.array(identifier).min(1), protocol_id: identifier, sdk_protocol_id: internalId.optional(),
  runner_code_sha256: sha256.optional(),
  artifacts: z.array(researchArtifactSchema).min(1), table_artifact_id: internalId,
  semantics: z.object({
    target: z.enum(["binary", "continuous"]), outcome: text, unit: text,
    score_direction: z.literal("higher"), join_key: z.literal("id"),
    independent_unit: text.nullable(), subgroup_fields: z.array(text),
    exposed: z.boolean(), split: z.literal("test"),
  }).strict(),
  expected_metrics: z.record(text, z.record(text, z.number().finite().nullable())),
  metric_tolerance: z.number().finite().nonnegative().max(.01),
  verification: z.object({
    verified_at: z.string().datetime({ offset: true }),
    checks: z.array(z.object({ check: z.string().regex(/^[a-z0-9_]+$/), status: z.enum(["passed", "failed", "missing"]), detail: text }).strict()),
    limitations: z.array(text),
  }).strict(),
  local_recipes: z.array(z.enum(researchRecipes)),
}).strict();
export type ResearchManifest = z.infer<typeof researchManifestSchema>;
export type ResearchArtifact = z.infer<typeof researchArtifactSchema>;

export const researchOperations = ["verify", "replay", "coverage", "paired", "subgroups", "bootstrap", "sensitivity", "local_recipe"] as const;
export const researchOperationSchema = z.object({
  id: internalId, kind: z.enum(researchOperations), methods: z.array(text).max(8),
  metric: text.nullable(), field: text.nullable(), recipe: z.enum(researchRecipes).nullable(), expected_observation: text,
}).strict().superRefine((operation, ctx) => {
  const issue = (field: string, message: string) => ctx.addIssue({ code: "custom", path: [field], message });
  if (["verify", "local_recipe"].includes(operation.kind) && operation.methods.length)
    issue("methods", "This operation requires an empty method selection");
  if (["paired", "bootstrap"].includes(operation.kind) && operation.methods.length < 2)
    issue("methods", "A paired operation requires at least two selected methods");
  if (!["paired", "bootstrap", "subgroups"].includes(operation.kind) && operation.metric !== null)
    issue("metric", "This operation does not accept a metric parameter");
  if (operation.kind === "bootstrap" && operation.metric === null)
    issue("metric", "Bootstrap requires a selected metric");
  if ((operation.kind === "subgroups") !== (operation.field !== null))
    issue("field", "Only subgroup operations require a field parameter");
  if ((operation.kind === "local_recipe") !== (operation.recipe !== null))
    issue("recipe", "Only local execution requires a recipe parameter");
});
export const researchPlanSchema = z.object({
  hypotheses: z.array(z.object({ id: internalId, explanation: text, tests: z.array(researchOperationSchema).min(1).max(4) }).strict()).min(1).max(3),
  multiple_testing: z.literal("descriptive_only"), stopping_rule: text, requested_tools: z.array(text).max(8),
}).strict();
export const researchQuestionDesignSchema = z.object({
  candidates: z.array(z.object({
    id: internalId, question: text, population: text, comparison: text, outcome: text,
    hypothesis: text, alternative_explanation: text, supporting_result: text, contradicting_result: text,
    confounders: z.array(text).max(100), why_interesting: text, missing_evidence: z.array(text).max(100),
    validation_needed: text, decisive_test: researchOperationSchema.nullable(), blocker: text.nullable(),
  }).strict()).min(1).max(3),
  selected_candidate_id: internalId.nullable(), selection_reason: text, novelty_status: z.literal("unverified"),
}).strict().superRefine((design, ctx) => {
  if (new Set(design.candidates.map(candidate => candidate.id)).size !== design.candidates.length)
    ctx.addIssue({ code: "custom", path: ["candidates"], message: "Question candidates require unique IDs" });
  design.candidates.forEach((candidate, index) => {
    if ((candidate.decisive_test === null) !== (candidate.blocker !== null))
      ctx.addIssue({ code: "custom", path: ["candidates", index], message: "A candidate needs either a decisive test or a blocker" });
    if (candidate.decisive_test && new Set(candidate.decisive_test.methods).size !== candidate.decisive_test.methods.length)
      ctx.addIssue({ code: "custom", path: ["candidates", index, "decisive_test", "methods"], message: "Question candidate methods must be unique" });
  });
  const selected = design.candidates.find(candidate => candidate.id === design.selected_candidate_id);
  if (design.selected_candidate_id === null ? design.candidates.some(candidate => candidate.decisive_test !== null) : !selected?.decisive_test)
    ctx.addIssue({ code: "custom", path: ["selected_candidate_id"], message: "Select a testable candidate, or record no selection only when all candidates are blocked" });
});
export type ResearchQuestionDesign = z.infer<typeof researchQuestionDesignSchema>;
export const researchSpecSchema = z.object({
  schema_version: z.literal("1.0"), id: internalId, manifest_id: identifier, manifest_sha256: sha256,
  catalogue_release_id: releaseId, question: text, created_at: z.string().datetime({ offset: true }), round: z.number().int().min(0).max(2),
  evidence: z.array(researchArtifactSchema).min(1), plan: researchPlanSchema, permitted_actions: z.array(z.enum(researchOperations)),
  exposure: z.object({ previously_exposed: z.boolean(), usage: z.literal("exploration"), independent_validation: z.literal(false) }).strict(),
  budget: z.object({
    campaign_seconds: z.number().positive().max(28800), experiment_seconds: z.number().positive().max(3600),
    codex_seconds: z.number().positive().max(900), codex_calls: z.number().int().min(0).max(24),
    memory_bytes: z.number().int().positive().max(8 * 1024 ** 3), workspace_bytes: z.number().int().positive().max(20 * 1024 ** 3),
    followup_rounds: z.number().int().min(0).max(2),
  }).strict(),
  // Optional so historical signed specifications retain their exact shape.
  question_design: researchQuestionDesignSchema.optional(),
  followup_test: researchOperationSchema.optional(),
}).strict().superRefine((spec, ctx) => {
  const signature = (operation: z.infer<typeof researchOperationSchema>) => JSON.stringify({
    kind: operation.kind, methods: operation.methods, metric: operation.metric, field: operation.field, recipe: operation.recipe,
  });
  const containsTest = (operation: z.infer<typeof researchOperationSchema>) =>
    spec.plan.hypotheses.some(hypothesis => hypothesis.tests.some(test => signature(test) === signature(operation)));
  if (spec.followup_test) {
    if (spec.round === 0)
      ctx.addIssue({ code: "custom", path: ["followup_test"], message: "A required follow-up test belongs to a later round only" });
    if (["verify", "replay"].includes(spec.followup_test.kind))
      ctx.addIssue({ code: "custom", path: ["followup_test", "kind"], message: "Follow-up tests must use the additional analysis registry" });
    if (new Set(spec.followup_test.methods).size !== spec.followup_test.methods.length)
      ctx.addIssue({ code: "custom", path: ["followup_test", "methods"], message: "Follow-up test methods must be unique" });
    if (!containsTest(spec.followup_test))
      ctx.addIssue({ code: "custom", path: ["plan"], message: "The frozen plan must contain the required follow-up test" });
  }
  const design = spec.question_design;
  if (!design) return;
  if (spec.round !== 0)
    ctx.addIssue({ code: "custom", path: ["question_design"], message: "Question design belongs to the initial specification only" });
  const selected = design.candidates.find(candidate => candidate.id === design.selected_candidate_id);
  if (!selected?.decisive_test) return;
  if (spec.question !== selected.question)
    ctx.addIssue({ code: "custom", path: ["question"], message: "The frozen question must match the selected candidate" });
  if (!containsTest(selected.decisive_test))
    ctx.addIssue({ code: "custom", path: ["plan"], message: "The frozen plan must contain the selected decisive test" });
});
export const researchReceiptSchema = z.object({
  operation_id: internalId, kind: z.enum(researchOperations), manifest_sha256: sha256,
  table_sha256: sha256, code_sha256: sha256, numerical: z.record(z.string(), z.unknown()), limitations: z.array(text),
}).strict();
export const researchAttemptSchema = z.object({
  id: internalId, plan_sha256: sha256, operation: researchOperationSchema,
  status: z.enum(["completed", "failed", "blocked", "interrupted"]),
  started_at: z.string().datetime({ offset: true }), finished_at: z.string().datetime({ offset: true }),
  receipt_sha256: sha256.nullable(), receipt: researchReceiptSchema.nullable(), error: text.nullable(),
}).strict();
export type ResearchSpec = z.infer<typeof researchSpecSchema>;

// Numerical execution is validated again by the offline importer. This shape
// retains failed attempts; a completed run is never itself a reviewed finding.
export const researchInvestigationSchema = z.object({
  schema_version: z.literal("1.0"), id: identifier, catalogue_release_id: releaseId,
  manifest_id: identifier, title: text, question: text,
  status: z.enum(["completed", "blocked", "failed", "stopped"]),
  claim_level: z.enum(["exploratory", "independently_supported"]), outcome: text,
  created_at: z.string().datetime({ offset: true }), plan_sha256: sha256,
  attempts: z.array(researchAttemptSchema),
  findings: z.array(text), limitations: z.array(text),
  review: z.object({
    status: z.enum(["pending", "reviewed", "rejected"]),
    method: z.enum(["ai_assisted", "human"]),
    reviewed_at: z.string().datetime({ offset: true }).optional(), reviewer_label: text.optional(),
  }).strict(),
  artifacts: z.array(researchArtifactSchema),
  specs: z.array(researchSpecSchema),
  question_design_artifact: z.object({ design: researchQuestionDesignSchema, sha256 }).strict().optional(),
  execution: z.object({ campaign_id: internalId, code_sha256: sha256, codex_calls: z.number().int().nonnegative(),
    reasoning: z.array(z.object({ role: z.enum(["hypothesizer", "planner", "critic"]), model: text, cli_version: text, usage: z.record(z.string(), z.unknown()) }).strict()),
  }).strict().optional(),
}).strict();
export type ResearchInvestigation = z.infer<typeof researchInvestigationSchema>;
const capabilityAssessmentSchema = z.object({ ready: z.boolean(), blockers: z.array(text), evidence: z.array(text), verified_at: z.string().datetime({ offset: true }).nullable() }).strict();
export const researchReadinessSchema = z.object({
  record_id: identifier, kind: z.enum(["dataset", "dataset_subset", "evaluation"]), name: text, release_id: releaseId,
  manifest_ids: z.array(identifier), evidence_source_ids: z.array(identifier), verified_at: z.string().datetime({ offset: true }).nullable(),
  capabilities: z.object({ replay: capabilityAssessmentSchema, analysis: capabilityAssessmentSchema, local_run: capabilityAssessmentSchema, validation: capabilityAssessmentSchema }).strict(),
  limitations: z.array(text), artifact_availability: z.enum(["public_references", "local_resolver_required", "unrecorded"]),
}).strict();
export const researchDataSchema = z.object({
  schema_version: z.literal("1.0"), manifests: z.array(researchManifestSchema),
  investigations: z.array(researchInvestigationSchema),
  readiness: z.array(researchReadinessSchema).optional(),
}).strict();
export type ResearchData = z.infer<typeof researchDataSchema>;

/** This is a public contract, not a local artifact resolver or execution plan. */
export function assertPublicResearch(value: unknown): void {
  assertNoPrivateFields(value);
  function inspect(child: unknown): void {
    if (typeof child === "string" && /(?:file:\/\/|\/(?:Users|home|private|tmp|var\/folders)\/|[A-Z]:\\)/.test(child))
      throw new Error("Local research paths cannot enter public evidence.");
    if (child && typeof child === "object") {
      for (const [key, nested] of Object.entries(child)) {
        if (/^(?:local_path|resolver|stdout|stderr|raw_events|environment|env)$/i.test(key))
          throw new Error("Private execution details cannot enter public evidence.");
        inspect(nested);
      }
    }
  }
  inspect(value);
}
function unique(values: string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`Duplicate research ${label}`);
}
export function validateResearchManifest(input: unknown, snapshot?: CatalogueSnapshot): ResearchManifest {
  assertPublicResearch(input);
  const manifest = researchManifestSchema.parse(input);
  if (manifest.sdk_protocol_id === "mfass-v1" || manifest.protocol_id === "rewire-mfass-v1")
    throw new Error("Archived MFASS v1 evidence cannot seed new investigations");
  unique(manifest.artifacts.map(item => item.id), "artifact ID");
  unique(manifest.evaluation_ids, "evaluation ID");
  unique(manifest.verification.checks.map(check => check.check), "verification check");
  unique(manifest.local_recipes, "local recipe");
  if (manifest.local_recipes.some(recipe => !(researchRecipes as readonly string[]).includes(recipe)))
    throw new Error("Research manifest requests an unregistered local recipe");
  if (!manifest.artifacts.some(artifact => artifact.id === manifest.table_artifact_id))
    throw new Error("Research table artifact is not declared");
  if (!Object.keys(manifest.expected_metrics).length ||
    Object.values(manifest.expected_metrics).some(metrics => !Object.keys(metrics).length))
    throw new Error("Research manifest requires expected metric definitions");
  if (manifest.semantics.join_key === manifest.semantics.outcome)
    throw new Error("Research outcome cannot be the join identifier");
  if (snapshot) {
    const records = new Map(snapshot.records.map(record => [record.id, record]));
    if (!["dataset", "dataset_subset"].includes(records.get(manifest.dataset_id)?.kind || ""))
      throw new Error("Research dataset reference is unavailable");
    const protocol = records.get(manifest.protocol_id);
    if (!["protocol", "benchmark", "task", "evaluator"].includes(protocol?.kind || ""))
      throw new Error("Research protocol reference is unavailable");
    if (manifest.sdk_protocol_id && protocol?.attributes.protocol_id && protocol.attributes.protocol_id !== manifest.sdk_protocol_id)
      throw new Error("Research SDK protocol differs from the catalogue protocol");
    for (const id of manifest.evaluation_ids) {
      const evaluation = records.get(id);
      if (evaluation?.kind !== "evaluation" || !evaluation.links.some(link =>
        ["dataset", "dataset_subset"].includes(link.relation) && link.target_id === manifest.dataset_id))
        throw new Error("Research evaluation does not reference the exact dataset");
      const comparison = evaluation.attributes.comparison as Record<string, unknown> | undefined;
      if (comparison?.protocol_id !== manifest.protocol_id && !evaluation.links.some(link =>
        ["protocol", "benchmark", "task", "evaluator"].includes(link.relation) &&
        link.target_id === manifest.protocol_id))
        throw new Error("Research evaluation protocol differs from manifest");
    }
  }
  return manifest;
}
export function isReviewedInvestigation(report: ResearchInvestigation): boolean {
  return report.review.status === "reviewed" && report.review.method === "human" &&
    !!report.review.reviewed_at && !!report.review.reviewer_label;
}
export function validateResearchData(input: unknown, snapshot?: CatalogueSnapshot): ResearchData {
  assertPublicResearch(input);
  const data = researchDataSchema.parse(input);
  unique(data.manifests.map(item => item.id), "manifest ID");
  unique(data.investigations.map(item => item.id), "investigation ID");
  data.manifests.forEach(manifest => validateResearchManifest(manifest, snapshot));
  const manifests = new Map(data.manifests.map(manifest => [manifest.id, manifest]));
  for (const report of data.investigations) {
    if (!isReviewedInvestigation(report)) throw new Error("Unreviewed investigation cannot enter public research data");
    const manifest = manifests.get(report.manifest_id);
    if (!manifest || manifest.catalogue_release_id !== report.catalogue_release_id)
      throw new Error("Investigation evidence does not match its pinned manifest");
    validateResearchIntegrity(report, manifest);
  }
  if (data.readiness) {
    if (!snapshot) throw new Error("Frozen research readiness requires its catalogue snapshot");
    unique(data.readiness.map(item => item.record_id), "readiness record");
    const records = new Map(snapshot.records.map(record => [record.id, record]));
    const v1Evidence = new Map(data.manifests.map(manifest => [manifest.id, assessManifest(manifest)]));
    if (snapshot && data.readiness.length !== snapshot.records.filter(record => ["dataset", "dataset_subset", "evaluation"].includes(record.kind) && record.status !== "excluded").length)
      throw new Error("Frozen research readiness does not cover the complete release");
    for (const item of data.readiness) {
      unique(item.manifest_ids, "readiness manifest reference");
      unique(item.evidence_source_ids, "readiness source reference");
      if (snapshot && (item.release_id !== snapshot.release_id || records?.get(item.record_id)?.kind !== item.kind || records?.get(item.record_id)?.name !== item.name))
        throw new Error("Frozen research readiness has a stale release or record identity");
      if (item.manifest_ids.some(id => !manifests.has(id)) || item.evidence_source_ids.some(id => records && records.get(id)?.kind !== "source"))
        throw new Error("Frozen research readiness references unavailable evidence");
      const applicable = data.manifests.filter(manifest => manifest.dataset_id === item.record_id || manifest.evaluation_ids.includes(item.record_id)).map(manifest => manifest.id).sort();
      if (JSON.stringify([...item.manifest_ids].sort()) !== JSON.stringify(applicable))
        throw new Error("Frozen research readiness has mismatched manifest identity");
      for (const name of researchCapabilities) {
        const capability = item.capabilities[name];
        if (capability.ready && (capability.blockers.length || !capability.evidence.length || !item.manifest_ids.length || !capability.verified_at) || !capability.ready && !capability.blockers.length)
          throw new Error("Frozen research readiness contradicts its evidence or blockers");
        // Validate immutable v1 eligibility without replacing frozen prose or
        // overriding a deliberately more conservative assessment. New policy
        // requires a new research schema version, not changing these v1 rules.
        if (capability.ready && !item.manifest_ids.some(id => {
          const manifest = manifests.get(id)!;
          const evidence = v1Evidence.get(id)![name];
          return evidence.ready && evidence.verified_at === capability.verified_at &&
            [manifest.dataset_id, manifest.protocol_id, ...manifest.evaluation_ids].every(recordId => {
              const record = records.get(recordId);
              return record && !["superseded", "disputed", "excluded"].includes(record.status);
            });
        })) throw new Error(`Frozen ${name} readiness contradicts its verified v1 evidence`);
      }
    }
  }
  return data;
}
export function getResearch(snapshot: Pick<CatalogueSnapshot, "research">): ResearchData {
  const data = snapshot.research || { schema_version: "1.0" as const, manifests: [], investigations: [] };
  return { ...data, investigations: data.investigations.filter(isReviewedInvestigation) };
}
export type ResearchCapability = typeof researchCapabilities[number];
export interface CapabilityAssessment {
  ready: boolean; blockers: string[]; evidence: string[]; verified_at: string | null;
}
export interface ResearchReadiness {
  record_id: string; kind: "dataset" | "dataset_subset" | "evaluation"; name: string; release_id: string;
  manifest_ids: string[]; evidence_source_ids: string[]; verified_at: string | null;
  capabilities: Record<ResearchCapability, CapabilityAssessment>; limitations: string[];
  artifact_availability: "public_references" | "local_resolver_required" | "unrecorded";
}
const requiredChecks: Record<ResearchCapability, string[]> = {
  replay: ["artifact_hashes", "join_integrity", "score_semantics", "metric_replay"],
  analysis: ["artifact_hashes", "join_integrity", "score_semantics", "metric_replay", "annotations", "dependence"],
  local_run: ["artifact_hashes", "join_integrity", "score_semantics", "recipe_pinned", "resource_estimate"],
  validation: ["artifact_hashes", "join_integrity", "score_semantics", "independent_validation", "overlap_checked"],
};
function assessManifest(manifest: ResearchManifest): Record<ResearchCapability, CapabilityAssessment> {
  const checks = new Map(manifest.verification.checks.map(check => [check.check, check]));
  return Object.fromEntries(researchCapabilities.map(capability => {
    const blockers: string[] = [], evidence: string[] = [];
    for (const name of requiredChecks[capability]) {
      const check = checks.get(name);
      if (check?.status === "passed") evidence.push(`${manifest.id}: ${name}: ${check.detail}`);
      else blockers.push(`${name.replace(/_/g, " ")}: ${check?.detail || "verification is missing"}`);
    }
    if (capability === "analysis" && !manifest.semantics.subgroup_fields.length)
      blockers.push("No relevant subgroup annotations are declared.");
    if (capability === "local_run" && !manifest.local_recipes.length)
      blockers.push("No pinned local execution recipe is declared.");
    if (capability === "local_run" && !manifest.runner_code_sha256)
      blockers.push("The imported runner implementation has no pinned code digest.");
    if (capability === "local_run") {
      for (const role of ["prepared", "recipe_code", "environment"])
        if (manifest.artifacts.filter(artifact => artifact.role === role).length !== 1)
          blockers.push(`Local execution requires exactly one pinned ${role.replace(/_/g, " ")} artifact.`);
      if (manifest.local_recipes.includes("sdk:esm2-8m-v1") && manifest.artifacts.filter(artifact => artifact.role === "checkpoint").length !== 1)
        blockers.push("The ESM recipe requires exactly one pinned checkpoint artifact.");
    }
    if (capability === "validation" && manifest.semantics.exposed)
      blockers.push("Data has already been exposed during hypothesis selection; it is not untouched validation.");
    return [capability, { ready: blockers.length === 0, blockers, evidence, verified_at: manifest.verification.verified_at }];
  })) as Record<ResearchCapability, CapabilityAssessment>;
}

/** Assess exact evidence, never a record's editorial source_checked status.
 * A parent dataset does not inherit readiness from one of its subsets. */
export function deriveResearchReadiness(snapshot: CatalogueSnapshot, manifests?: ResearchManifest[]): ResearchReadiness[] {
  // A published release serves its frozen assessments, even if future code
  // changes the derivation rules. Explicit manifests request a fresh audit.
  if (manifests === undefined && snapshot.research?.readiness) return snapshot.research.readiness;
  manifests ||= getResearch(snapshot).manifests;
  const byId = new Map(snapshot.records.map(record => [record.id, record]));
  function sourceEvidence(record: CatalogueRecord): string[] {
    const sourceIds = new Set<string>(), seen = new Set<string>();
    function nested(value: unknown): void {
      if (!value || typeof value !== "object") return;
      for (const [key, child] of Object.entries(value)) {
        if (["source_ids", "summary_source_ids"].includes(key) && Array.isArray(child))
          child.forEach(id => { if (typeof id === "string" && byId.get(id)?.kind === "source") sourceIds.add(id); });
        else if (key === "source_id" && typeof child === "string" && byId.get(child)?.kind === "source") sourceIds.add(child);
        else nested(child);
      }
    }
    function visit(item: CatalogueRecord, depth: number): void {
      if (seen.has(item.id) || depth > 4) return;
      seen.add(item.id);
      item.source_ids.forEach(id => { if (byId.get(id)?.kind === "source") sourceIds.add(id); });
      nested(item.attributes);
      for (const link of item.links) {
        const target = byId.get(link.target_id);
        if (target && ["source", "dataset", "dataset_subset", "protocol", "benchmark", "evaluator", "task"].includes(target.kind)) {
          if (target.kind === "source") sourceIds.add(target.id);
          else visit(target, depth + 1);
        }
      }
    }
    visit(record, 0);
    return [...sourceIds].sort();
  }
  return snapshot.records.filter(record => ["dataset", "dataset_subset", "evaluation"].includes(record.kind) && record.status !== "excluded")
    .sort((a, b) => a.id.localeCompare(b.id)).map(record => {
      const applicable = manifests.filter(manifest => manifest.dataset_id === record.id || manifest.evaluation_ids.includes(record.id));
      const assessed = applicable.map(manifest => {
        const assessments = assessManifest(manifest);
        const inactiveEvidence = [manifest.dataset_id, manifest.protocol_id, ...manifest.evaluation_ids]
          .filter(id => !byId.has(id) || ["superseded", "disputed", "excluded"].includes(byId.get(id)!.status));
        if (inactiveEvidence.length) for (const capability of researchCapabilities) {
          assessments[capability].ready = false;
          assessments[capability].blockers.push(`Linked evidence is unavailable, disputed or superseded: ${inactiveEvidence.join(", ")}`);
        }
        return assessments;
      });
      const inactive = ["superseded", "disputed"].includes(record.status);
      const capabilities = Object.fromEntries(researchCapabilities.map(capability => {
        const candidates = assessed.map(item => item[capability]);
        const ready = candidates.find(item => item.ready);
        const selected = ready ? [ready] : candidates;
        return [capability, {
          ready: !!ready && !inactive,
          blockers: inactive ? ["The scientific record is disputed or superseded."] : ready ? [] : candidates.length ?
            [...new Set(candidates.flatMap(item => item.blockers))] : ["No verified artifact manifest is linked to this exact record.", ...requiredChecks[capability].map(check => `${check.replace(/_/g, " ")}: verification is missing`)],
          evidence: [...new Set(selected.flatMap(item => item.evidence))],
          verified_at: selected.map(item => item.verified_at).filter((date): date is string => !!date).sort().at(-1) || null,
        }];
      })) as ResearchReadiness["capabilities"];
      return {
        record_id: record.id, kind: record.kind as ResearchReadiness["kind"], name: record.name, release_id: snapshot.release_id,
        manifest_ids: applicable.map(manifest => manifest.id), evidence_source_ids: sourceEvidence(record),
        verified_at: applicable.map(manifest => manifest.verification.verified_at).sort().at(-1) || null,
        capabilities,
        limitations: [...new Set(applicable.flatMap(manifest => [
          ...manifest.verification.limitations,
          ...(!manifest.semantics.independent_unit ? ["The sample independence unit is unresolved; descriptive analysis does not establish confirmatory inference."] : []),
          ...(manifest.semantics.exposed ? ["Evidence is exploratory because this data has already been examined."] : []),
        ]))],
        artifact_availability: !applicable.length ? "unrecorded" as const : applicable.some(manifest => manifest.artifacts.some(artifact => !artifact.uri)) ? "local_resolver_required" as const : "public_references" as const,
      };
    });
}
