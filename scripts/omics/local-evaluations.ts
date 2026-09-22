import fs from "node:fs";
import { createHash } from "node:crypto";
import { z } from "zod";
import { recordSchema, type RecordEntry } from "./schema";

const root = "data/omics/reviewed/local-runs-2026-09-20";
export const localEvaluationInputs = [
  `${root}/records.jsonl`,
  `${root}/review.json`,
  `${root}/evidence.json`,
];
export const baselineEvaluationInputs = [
  "data/omics/reviewed/baseline-runs-2026-09-22/records.jsonl",
  "data/omics/reviewed/baseline-runs-2026-09-22/review.json",
  "data/omics/reviewed/baseline-runs-2026-09-22/evidence.json",
];
const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const receiptSchema = z.object({
  schema_version: z.literal("1.0"),
  status: z.literal("reviewed"),
  review_method: z.literal("automated"),
  reviewed_at: z.string().min(1),
  records_sha256: hash,
  evidence_sha256: hash,
  source_revision: z.string().regex(/^[a-f0-9]{40}$/),
  evaluation_ids: z.array(z.string()).min(1),
  errors: z.array(z.string()).length(0),
  limitations: z.array(z.string()).min(1),
}).strict();

/** Only additive, reviewed local executions enter the catalogue. The evidence
 * snapshot is bound to the receipt and every numerical row is checked against
 * its exact recorded metric; source checks are not published-score reproduction. */
export function applyLocalEvaluations(
  input: RecordEntry[], recordsText: string, evidenceText: string, review: unknown,
): RecordEntry[] {
  const receipt = receiptSchema.parse(review);
  if (sha256(recordsText) !== receipt.records_sha256 ||
      sha256(evidenceText) !== receipt.evidence_sha256)
    throw new Error("Local evaluation inputs changed since review");
  const added = recordsText.trim().split("\n").filter(Boolean)
    .map((line) => recordSchema.parse(JSON.parse(line)));
  const existing = new Set(input.map((record) => record.id));
  const byId = new Map(added.map((record) => [record.id, record]));
  if (byId.size !== added.length || added.some((record) => existing.has(record.id)))
    throw new Error("Local evaluations cannot replace existing records");
  const evidence = JSON.parse(evidenceText) as {
    evaluations: { evaluation_id: string; metrics: Record<string, number | null>;
      expected_count: number; scored_count: number; missing_count: number;
      metric_path: string; report: Record<string, unknown>; report_sha256: string; report_source_id: string;
      audit_sha256: string; audit_source_id: string;
      audit_run?: string | null;
      execution_audit: { checks?: Record<string, boolean> | { status: string }[]; [key: string]: unknown } }[];
  };
  const evaluations = added.filter((record) => record.kind === "evaluation");
  if (new Set(receipt.evaluation_ids).size !== receipt.evaluation_ids.length ||
      JSON.stringify(evaluations.map((r) => r.id).sort()) !==
      JSON.stringify([...receipt.evaluation_ids].sort()) ||
      evidence.evaluations.length !== evaluations.length)
    throw new Error("Local evaluation inventory mismatch");
  const verified = new Map(evidence.evaluations.map((run) => [run.evaluation_id, run]));
  if (verified.size !== evaluations.length)
    throw new Error("Duplicate local execution evidence");
  for (const run of verified.values()) {
    if (run.report.independently_reproduced !== false)
      throw new Error("Local execution cannot claim published-score reproduction");
    const coverage = run.report.coverage as Record<string, unknown> | undefined;
    if (!coverage || run.expected_count !== coverage.denominator ||
        run.scored_count !== coverage.scored || run.missing_count !== coverage.unscored)
      throw new Error("Local coverage differs from execution report");
    if (byId.get(run.report_source_id)?.attributes.artifact_sha256 !== run.report_sha256)
      throw new Error("Local execution report source hash mismatch");
    const reportedMetrics = run.metric_path.split(".").reduce<unknown>((value, key) =>
      value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined, run.report);
    if (!reportedMetrics || typeof reportedMetrics !== "object" ||
        Object.entries(run.metrics).some(([key, value]) =>
          (reportedMetrics as Record<string, unknown>)[key] !== value))
      throw new Error("Local metric is not present in the execution report");
    const checks = run.execution_audit.checks;
    if (checks !== undefined) {
      if (Array.isArray(checks) ? !checks.length || checks.some((check) => check.status !== "passed") :
          !Object.keys(checks).length || Object.values(checks).some((passed) => passed !== true))
        throw new Error("Local execution has unresolved audit checks");
    } else {
      // Newer receipts retain their original shape. Check exact run bindings,
      // never synthesize a successful checks array or infer it from a title.
      const audit = run.execution_audit;
      const selected = run.audit_run
        ? (audit.runs as Record<string, unknown>[] | undefined)?.filter((item) => item.run === run.audit_run)
        : [audit];
      if (!selected || selected.length !== 1) throw new Error("Ambiguous local audit run");
      const checked = selected[0];
      if (checked.prediction_digest_verification !== "passed" || checked.prepared_and_code_binding !== "passed" ||
          checked.predictions_sha256 !== run.report.predictions_sha256 ||
          audit.prepared_sha256 !== run.report.prepared_sha256 ||
          audit.code_hash_start !== audit.code_hash_end || !audit.code_hash_start)
        throw new Error("Local execution audit identity mismatch");
      const audited = run.audit_run ? checked : (checked.rounded_metrics || checked.metrics) as Record<string, unknown>;
      if (!audited || Object.entries(run.metrics).some(([key, value]) => audited[key] !== value) ||
          (run.audit_run && checked.independent_metric_recomputation !== "passed"))
        throw new Error("Local execution audit metrics mismatch");
    }
    const metricRows = added.filter((record) => record.kind === "result" &&
      record.links.some((link) => link.relation === "evaluation" && link.target_id === run.evaluation_id));
    const metricKeys = metricRows.map((record) => String(record.attributes.metric_key)).sort();
    if (JSON.stringify(metricKeys) !== JSON.stringify(Object.keys(run.metrics).sort()))
      throw new Error("Local execution metric inventory mismatch");
    if (byId.get(run.audit_source_id)?.attributes.artifact_sha256 !== run.audit_sha256)
      throw new Error("Local execution audit source hash mismatch");
  }
  for (const record of added) {
    if (record.kind === "source" && (record.attributes.version !== receipt.source_revision ||
        !String(record.attributes.artifact_url).includes(`/${receipt.source_revision}/`)))
      throw new Error("Local execution source is not pinned to the reviewed revision");
    if (record.status !== "source_checked")
      throw new Error("Local execution records require source_checked review");
    if (record.kind === "evaluation") {
      const run = verified.get(record.id);
      const a = record.attributes;
      if (!run || a.published_score_reproduction !== false || a.suite_complete !== false ||
          a.origin !== "rewire_run" || a.execution_scope !== "complete_selected_evaluation" ||
          !Number.isInteger(run.expected_count) || run.expected_count <= 0 ||
          run.scored_count !== run.expected_count || run.missing_count !== 0 ||
          a.eligible_count !== run.expected_count || a.scored_count !== run.scored_count ||
          a.missing_count !== run.missing_count)
        throw new Error(`Incomplete local execution ${record.id}`);
    }
    if (record.kind === "result") {
      const evaluationId = record.links.find((link) => link.relation === "evaluation")?.target_id;
      const run = verified.get(evaluationId || "");
      const key = String(record.attributes.metric_key);
      if (!run || !Object.hasOwn(run.metrics, key))
        throw new Error(`Missing local metric evidence ${record.id}`);
      const observed = run.metrics[key];
      const numeric = record.attributes.numeric_value;
      if (observed === null ? numeric !== null :
          typeof numeric !== "string" || !Number.isFinite(observed) || Number(numeric) !== observed)
        throw new Error(`Local metric differs from execution ${record.id}`);
      const printed = observed === null ? "undefined" : run.metric_path.startsWith("protocol_results.per_assay.")
        ? observed.toFixed(3) : String(observed);
      if (record.attributes.printed_value !== printed)
        throw new Error(`Local displayed value differs from execution ${record.id}`);
      if (record.attributes.scored_count !== run.scored_count ||
          record.attributes.eligible_count !== run.expected_count)
        throw new Error(`Local metric coverage differs ${record.id}`);
    }
  }
  return [...input, ...added];
}
export function addLocalEvaluations(input: RecordEntry[]): RecordEntry[] {
  return applyLocalEvaluations(input,
    fs.readFileSync(localEvaluationInputs[0], "utf8"),
    fs.readFileSync(localEvaluationInputs[2], "utf8"),
    JSON.parse(fs.readFileSync(localEvaluationInputs[1], "utf8")));
}

export function addBaselineEvaluations(input: RecordEntry[]): RecordEntry[] {
  return applyLocalEvaluations(input,
    fs.readFileSync(baselineEvaluationInputs[0], "utf8"),
    fs.readFileSync(baselineEvaluationInputs[2], "utf8"),
    JSON.parse(fs.readFileSync(baselineEvaluationInputs[1], "utf8")));
}
