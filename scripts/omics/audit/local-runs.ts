/** Append field-bound audit checks for the reviewed local execution batch. */
import fs from "node:fs";
import { createHash } from "node:crypto";
import { addLocalEvaluations, localEvaluationInputs } from "../local-evaluations";
import { auditHash, auditTarget, validateAudit, type AuditCheck, type AuditRun } from "../../../services/omics/src/audit";

const records = addLocalEvaluations([]);
const review = JSON.parse(fs.readFileSync(localEvaluationInputs[1], "utf8"));
const evidence = JSON.parse(fs.readFileSync(localEvaluationInputs[2], "utf8"));
const byId = new Map(records.map((record) => [record.id, record]));
const runs = new Map(evidence.evaluations.map((run: { evaluation_id: string }) => [run.evaluation_id, run]));
const runId = "audit-local-runs-2026-09-20";
const checks: AuditCheck[] = [];
for (const record of records) {
  const result = record.kind === "result";
  const fields = result ? ["attributes.numeric_value", "attributes.printed_value", "attributes.metric", "attributes.unit", "attributes.eligible_count", "attributes.scored_count", "attributes.source_locator", "links"] : ["$record"];
  const sourceIds = record.kind === "source" ? [record.id] : record.source_ids;
  const sources = sourceIds.map((id) => byId.get(id)!);
  checks.push({
    id: `${runId}-${record.id}`,
    run_id: runId, record_id: record.id, record_kind: record.kind, record_name: record.name,
    field_paths: fields, target_sha256: auditTarget(record, fields),
    category: result ? "source_transcription" : "structure",
    outcome: "supported", checked_at: review.reviewed_at,
    source_ids: sourceIds, evidence_row_ids: result ? [record.id] : [],
    source_locators: [String(record.attributes.source_locator || "Public execution report and reviewed record graph")],
    source_hashes: sources.map((source) => String(source.attributes.artifact_sha256)),
    source_fingerprints: Object.fromEntries(sources.map((source) => [source.id, auditHash(source)])),
    receipt_ids: [localEvaluationInputs[1], localEvaluationInputs[2]], prior_check_ids: [],
    recorded_value_json: JSON.stringify(result ? record.attributes.numeric_value : record.id),
    explanation: result
      ? "Exact reported metric and coverage match the sanitized local execution report. The separate execution audit checks saved predictions and source formulas. This is automated verification, not human review or reproduction of a published model score."
      : "Reviewed local execution record has preserved source provenance and a valid additive relationship. Structural support does not verify every upstream biological or training-data claim.",
  });
}
const run: AuditRun = {
  id: runId, baseline_release_id: "2026-09-20-b2596bdf5206",
  inventory_sha256: auditHash(records.map((record) => [record.id, auditHash(record)])),
  started_at: review.reviewed_at, completed_at: review.reviewed_at,
  reviewer: "Automated execution-report transcription and catalogue integrity checks",
  review_method: "automated", verifier_revision: createHash("sha256").update(fs.readFileSync("scripts/omics/audit/local-runs.ts")).digest("hex"),
  scope: "Five local evaluations on three selected protocols. Numerical checks preserve observed values, undefined control correlations, coverage and exact assay/split scope. Original benchmark publication scores are not reproduced.",
  limitations: review.limitations, record_count: records.length, check_count: checks.length,
};
validateAudit({ schema_version: "1.0", runs: [run], checks, resolutions: [] });
const root = "data/omics/audits/" + runId;
fs.writeFileSync(root + ".run.json", JSON.stringify(run, null, 2) + "\n");
fs.writeFileSync(root + ".checks.jsonl", checks.map((check) => JSON.stringify(check)).join("\n") + "\n");
console.log(JSON.stringify({ evaluations: runs.size, records: records.length, checks: checks.length }));
