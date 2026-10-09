import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import type { ResearchInvestigation, ResearchManifest, ResearchQuestionDesign, ResearchSpec } from "./research.js";

/** RFC 8785 ordering and ECMAScript number serialization for finite JSON data. */
export function canonicalResearchJson(value: unknown): string {
  function serialize(item: unknown, depth: number): string {
    if (depth > 64) throw new Error("Research JSON is too deeply nested");
    if (item === null || typeof item === "boolean") return JSON.stringify(item);
    if (typeof item === "number") {
      if (!Number.isFinite(item)) throw new Error("Nonfinite research number");
      return JSON.stringify(item);
    }
    if (typeof item === "string") {
      // RFC 8785 excludes unpaired UTF-16 surrogates.
      for (let i = 0; i < item.length; i++) {
        const code = item.charCodeAt(i);
        if (code >= 0xd800 && code <= 0xdbff) {
          const next = item.charCodeAt(++i);
          if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error("Invalid research Unicode");
        } else if (code >= 0xdc00 && code <= 0xdfff) throw new Error("Invalid research Unicode");
      }
      return JSON.stringify(item);
    }
    if (Array.isArray(item)) return `[${item.map(child => serialize(child, depth + 1)).join(",")}]`;
    if (item && typeof item === "object") return `{${Object.keys(item).sort().map(key => `${serialize(key, depth + 1)}:${serialize((item as Record<string, unknown>)[key], depth + 1)}`).join(",")}}`;
    throw new Error("Research evidence must be finite JSON");
  }
  return serialize(value, 0);
}
export const researchHash = (value: unknown) => bytesToHex(sha256(utf8ToBytes(canonicalResearchJson(value))));
function exact(a: unknown, b: unknown): boolean { return canonicalResearchJson(a) === canonicalResearchJson(b); }

type ResearchOperation = ResearchSpec["plan"]["hypotheses"][number]["tests"][number];
function validateOperationEvidence(operation: ResearchOperation, manifest: ResearchManifest, permittedActions?: ResearchSpec["permitted_actions"]): void {
  if (permittedActions && !permittedActions.includes(operation.kind)) throw new Error("Frozen plan requests an unregistered action");
  if (operation.methods.some(method => !Object.hasOwn(manifest.expected_metrics, method)) ||
    new Set(operation.methods).size !== operation.methods.length)
    throw new Error("Frozen operation requests unknown or duplicate methods");
  const methods = operation.methods.length ? operation.methods : Object.keys(manifest.expected_metrics);
  if (operation.metric && methods.some(method => !Object.hasOwn(manifest.expected_metrics[method], operation.metric!)))
    throw new Error("Frozen operation metric is not declared for its methods");
  if (operation.kind === "subgroups" && (!operation.field || !manifest.semantics.subgroup_fields.includes(operation.field)))
    throw new Error("Frozen operation subgroup is not declared");
  if (operation.kind === "local_recipe" && (!operation.recipe || !manifest.local_recipes.includes(operation.recipe)))
    throw new Error("Frozen operation recipe is not declared");
  if (operation.recipe && operation.kind !== "local_recipe" || operation.field && operation.kind !== "subgroups")
    throw new Error("Frozen operation has incompatible parameters");
}

function validateQuestionEvidence(design: ResearchQuestionDesign, manifest: ResearchManifest, permittedActions?: ResearchSpec["permitted_actions"]): void {
  for (const candidate of design.candidates) {
    const operation = candidate.decisive_test;
    if (!operation) continue;
    if (["verify", "replay"].includes(operation.kind) || operation.recipe === "sdk:train-mean-v1")
      throw new Error("Question candidates require an additional test beyond the supervised core checks");
    if (operation.kind === "bootstrap" && !manifest.semantics.independent_unit)
      throw new Error("Question candidate bootstrap requires a documented independence unit");
    if (operation.metric && Object.values(manifest.expected_metrics).some(metrics => !Object.hasOwn(metrics, operation.metric!)))
      throw new Error("Question candidate metric is not shared by the initial planner registry");
    validateOperationEvidence(operation, manifest, permittedActions);
  }
}

function validateSpec(spec: ResearchSpec, manifest: ResearchManifest): void {
  if (spec.manifest_id !== manifest.id || spec.catalogue_release_id !== manifest.catalogue_release_id || spec.manifest_sha256 !== researchHash(manifest))
    throw new Error("Frozen specification differs from pinned evidence");
  if (spec.exposure.previously_exposed !== manifest.semantics.exposed)
    throw new Error("Frozen specification misstates prior evidence exposure");
  const artifacts = new Map(manifest.artifacts.map(artifact => [artifact.id, artifact]));
  if (new Set(spec.evidence.map(artifact => artifact.id)).size !== spec.evidence.length ||
    !spec.evidence.some(artifact => artifact.id === manifest.table_artifact_id) ||
    spec.evidence.some(artifact => !artifacts.has(artifact.id) || !exact(artifact, artifacts.get(artifact.id))))
    throw new Error("Frozen specification has conflicting or missing artifacts");
  const operations = spec.plan.hypotheses.flatMap(hypothesis => hypothesis.tests);
  if (operations.length > 8 || new Set(operations.map(operation => operation.id)).size !== operations.length)
    throw new Error("Frozen plan requires at most eight unique operations");
  for (const operation of operations) validateOperationEvidence(operation, manifest, spec.permitted_actions);
  if (spec.question_design) validateQuestionEvidence(spec.question_design, manifest, spec.permitted_actions);
  if (spec.followup_test) {
    if (spec.followup_test.kind === "bootstrap" && !manifest.semantics.independent_unit)
      throw new Error("Follow-up bootstrap requires a documented independence unit");
    if (spec.followup_test.metric && Object.values(manifest.expected_metrics).some(metrics => !Object.hasOwn(metrics, spec.followup_test!.metric!)))
      throw new Error("Follow-up metric is not shared by the planner registry");
    validateOperationEvidence(spec.followup_test, manifest, spec.permitted_actions);
  }
}

/** Validate integrity and identity. This deliberately does not confer human
 * review, biological support or permission to publish. */
export function validateResearchIntegrity(report: ResearchInvestigation, manifest: ResearchManifest): ResearchInvestigation {
  canonicalResearchJson(report);
  if (report.claim_level !== "exploratory")
    throw new Error("Independent support requires a validation evidence contract; v1 investigations are exploratory");
  if (report.status === "completed" && !report.attempts.some(attempt => attempt.status === "completed"))
    throw new Error("Completed investigation has no completed numerical attempt");
  if (report.catalogue_release_id !== manifest.catalogue_release_id || report.manifest_id !== manifest.id)
    throw new Error("Investigation must pin the exact source catalogue release");
  const questionArtifact = report.question_design_artifact;
  if (questionArtifact) {
    if (questionArtifact.sha256 !== researchHash(questionArtifact.design))
      throw new Error("Question design artifact checksum mismatch");
    validateQuestionEvidence(questionArtifact.design, manifest);
    if (questionArtifact.design.selected_candidate_id === null && (report.status === "completed" || report.attempts.length))
      throw new Error("An investigation without a testable question cannot complete or execute numerical attempts");
  }
  if (report.plan_sha256 !== researchHash(report.specs)) throw new Error("Investigation frozen plan hash mismatch");
  const specs = new Map<string, ResearchSpec>();
  for (const spec of report.specs) {
    validateSpec(spec, manifest);
    if (spec.question_design && questionArtifact && !exact(spec.question_design, questionArtifact.design))
      throw new Error("Frozen question design differs from its artifact");
    if (spec.question_design?.selected_candidate_id === null && (report.status === "completed" || report.attempts.length))
      throw new Error("An investigation without a testable question cannot complete or execute numerical attempts");
    const digest = researchHash(spec);
    if (specs.has(digest)) throw new Error("Duplicate frozen specification");
    specs.set(digest, spec);
  }
  const artifacts = new Map(manifest.artifacts.map(artifact => [artifact.id, artifact]));
  if (new Set(report.artifacts.map(artifact => artifact.id)).size !== report.artifacts.length ||
    report.artifacts.some(artifact => !artifacts.has(artifact.id) || !exact(artifact, artifacts.get(artifact.id))))
    throw new Error("Investigation artifact references differ from pinned evidence");
  const attempts = new Set<string>();
  for (const attempt of report.attempts) {
    const spec = specs.get(attempt.plan_sha256);
    if (!spec || attempts.has(attempt.id)) throw new Error("Attempt is duplicate or has no frozen specification");
    attempts.add(attempt.id);
    if (!spec.plan.hypotheses.some(hypothesis => hypothesis.tests.some(operation => exact(operation, attempt.operation))))
      throw new Error("Attempt was not registered in its frozen specification");
    if (Date.parse(attempt.started_at) < Date.parse(spec.created_at) || Date.parse(attempt.finished_at) < Date.parse(attempt.started_at))
      throw new Error("Attempt timestamps precede its frozen plan");
    if ((attempt.receipt === null) !== (attempt.receipt_sha256 === null) || attempt.status === "completed" && !attempt.receipt)
      throw new Error("Completed attempts require numerical receipts and hashes");
    if (!attempt.receipt) continue;
    const receipt = attempt.receipt;
    if (researchHash(receipt) !== attempt.receipt_sha256) throw new Error("Numerical receipt checksum mismatch");
    if (receipt.operation_id !== attempt.operation.id || receipt.kind !== attempt.operation.kind ||
      receipt.manifest_sha256 !== researchHash(manifest) || receipt.table_sha256 !== artifacts.get(manifest.table_artifact_id)?.sha256 ||
      report.execution && receipt.code_sha256 !== report.execution.code_sha256)
      throw new Error("Numerical receipt lineage differs from the registered evidence");
    if (attempt.status === "completed" && attempt.operation.kind === "bootstrap" && !manifest.semantics.independent_unit)
      throw new Error("Inferential receipt lacks a documented independence unit");
    if (attempt.status === "completed" && attempt.operation.kind === "local_recipe" &&
      (!manifest.runner_code_sha256 || receipt.code_sha256 !== manifest.runner_code_sha256))
      throw new Error("Local recipe receipt differs from the pinned runner implementation");
    if (attempt.operation.kind === "replay") {
      const checks = receipt.numerical.checks;
      if (!Array.isArray(checks) || !checks.length) throw new Error("Metric replay receipt has no numerical checks");
      const methods = attempt.operation.methods.length ? attempt.operation.methods : Object.keys(manifest.expected_metrics);
      const expectedChecks = new Set(methods.flatMap(method => Object.keys(manifest.expected_metrics[method]).map(metric => `${method}\0${metric}`)));
      const actualChecks = new Set<string>();
      for (const check of checks) {
        if (!check || typeof check !== "object" || !Object.hasOwn(manifest.expected_metrics, check.method) ||
          !Object.hasOwn(manifest.expected_metrics[check.method], check.metric) ||
          check.expected !== manifest.expected_metrics[check.method][check.metric] || check.tolerance !== manifest.metric_tolerance ||
          !["passed", "failed"].includes(check.status) || typeof check.metric_available !== "boolean" ||
          !(check.actual === null || typeof check.actual === "number" && Number.isFinite(check.actual)))
          throw new Error("Metric replay check differs from the pinned metric definition");
        const key = `${check.method}\0${check.metric}`;
        if (!expectedChecks.has(key) || actualChecks.has(key)) throw new Error("Metric replay receipt contains an unexpected or duplicate check");
        actualChecks.add(key);
        const metrics = receipt.numerical.metrics as Record<string, Record<string, unknown>> | undefined;
        if (check.metric_available && metrics?.[check.method]?.[check.metric] !== check.actual)
          throw new Error("Metric replay check differs from its numerical result");
        const pass = check.metric_available && (check.actual === null && check.expected === null ||
          check.actual !== null && check.expected !== null && Math.abs(check.actual - check.expected) <= check.tolerance);
        if ((check.status === "passed") !== pass) throw new Error("Metric replay receipt misstates verification outcome");
      }
      if (actualChecks.size !== expectedChecks.size) throw new Error("Metric replay receipt omits expected metric checks");
    }
  }
  return report;
}
