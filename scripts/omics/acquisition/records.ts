import fs from "node:fs";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { recordSchema, type RecordEntry } from "../schema";
const root = "data/omics/acquisition/2026-09-19";
export const acquisitionFiles = [
  `${root}/reviewed-records.jsonl`,
  `${root}/integration-receipt.json`,
  `${root}/integration-decisions.jsonl`,
];
export function addAcquiredEvidence(records: RecordEntry[]): RecordEntry[] {
  if (!fs.existsSync(acquisitionFiles[0])) return records;
  const bytes = fs.readFileSync(acquisitionFiles[0]);
  const receipt = JSON.parse(fs.readFileSync(acquisitionFiles[1], "utf8"));
  if (
    createHash("sha256").update(bytes).digest("hex") !== receipt.records_sha256
  )
    throw Error("Acquisition records do not match review receipt");
  for (const input of receipt.candidate_inputs) {
    const raw = fs.readFileSync(`${root}/${input.lane}/candidates.jsonl`);
    if (createHash("sha256").update(raw).digest("hex") !== input.sha256)
      throw Error("Acquisition candidate changed after integration review");
  }
  const ids = new Set(records.map((r) => r.id));
  const additions = bytes
    .toString()
    .trim()
    .split("\n")
    .map((l) => recordSchema.parse(JSON.parse(l)));
  for (const r of additions)
    if (ids.has(r.id)) throw Error(`Acquisition cannot overwrite ${r.id}`);
  return [...records, ...additions];
}
export const profileCorrectionFile = `${root}/scib-profile-correction.json`;
export const mfassPrecisionCorrectionFile = "data/omics/audits/mfass-ap-correction.json";
export const mfassUpstreamSourceId = "rewire-mfass-v2-baseline-upstream-source";

export interface CorrectionChange {
  field_path: string;
  old_value: unknown;
  new_value: unknown;
  source_ids: string[];
  artifact_sha256: string[];
  source_locator: string;
  outcome: "contradicted" | "insufficient_evidence";
  category: "source_transcription" | "scientific_context";
  review_method: string;
  review_date: string;
}
export interface MfassCorrectionDescriptor {
  record_id: string;
  correction_file: string;
  finding: string;
  review_method: string;
  review_date: string;
  source_record: RecordEntry;
  changes: CorrectionChange[];
}
/** Source-specific precision alignment, never a rewrite of the legacy import artifact. */
export function getMfassPrecisionCorrection(): MfassCorrectionDescriptor | null {
  if (!fs.existsSync(mfassPrecisionCorrectionFile)) return null;
  const input = JSON.parse(fs.readFileSync(mfassPrecisionCorrectionFile, "utf8"));
  const source = recordSchema.parse({
    id: mfassUpstreamSourceId,
    kind: "source",
    name: "MFASS v2 corrected k-mer baseline: pinned upstream result JSON",
    description: "Exact runner output at the reviewed MFASS v2 revision. This artifact is distinct from the legacy website import referenced by rewire-mfass-v2-source; a precision-only current-record correction does not change that historical source or rerun the experiment.",
    status: "source_checked",
    facets: {},
    source_ids: [],
    links: [],
    attributes: {
      url: input.source_url,
      artifact_url: input.source_url,
      version: input.source_revision,
      retrieved_at: input.reviewed_at,
      artifact_sha256: input.artifact_sha256,
      hash_scope: "Exact upstream JSON bytes, SHA-256 independently checked against the pinned revision",
      source_locator: input.source_locator,
      legacy_import_source_id: input.source_id,
      review: { method: input.review_method, reviewed_at: input.reviewed_at, notes: input.interpretation },
    },
  });
  const shared = {
    source_ids: [source.id],
    artifact_sha256: [input.artifact_sha256],
    source_locator: input.source_locator,
    review_method: input.review_method,
    review_date: input.reviewed_at,
  };
  const changes: CorrectionChange[] = Object.keys(input.old).map(field_path => ({
    ...shared, field_path, old_value: input.old[field_path], new_value: input.new[field_path],
    category: "source_transcription", outcome: "contradicted",
  }));
  changes.push({
    ...shared, field_path: "source_ids", old_value: [input.source_id], new_value: [source.id],
    category: "scientific_context", outcome: "insufficient_evidence",
  }, {
    ...shared, field_path: "attributes.source_locator",
    old_value: "benchmarks/mfass/results/baseline-kmer-position-v2.json :: average_precision",
    new_value: input.source_locator, category: "source_transcription", outcome: "insufficient_evidence",
  });
  return { record_id: input.record_id, correction_file: mfassPrecisionCorrectionFile,
    finding: input.interpretation, review_method: input.review_method,
    review_date: input.reviewed_at, source_record: source, changes };
}

/** Apply only exact reviewed old/new values, preserving caller records and archived inputs. */
function applyChanges(record: RecordEntry, changes: {field_path:string;old_value:unknown;new_value:unknown}[]): RecordEntry {
  const updated = structuredClone(record);
  for (const patch of changes) {
    const parts = patch.field_path.split(".");
    const key = parts.pop()!;
    let object: any = updated;
    for (const part of parts) {
      if (object === null || typeof object !== "object" || !(part in object))
        throw Error(`Correction baseline changed: ${patch.field_path}`);
      object = object[part];
    }
    if (isDeepStrictEqual(object[key], patch.new_value)) continue;
    if (!isDeepStrictEqual(object[key], patch.old_value))
      throw Error(`Correction baseline changed: ${patch.field_path}`);
    object[key] = structuredClone(patch.new_value);
  }
  return updated;
}

export function applyAcquisitionCorrections(records: RecordEntry[]): RecordEntry[] {
  let updated = records;
  if (fs.existsSync(profileCorrectionFile)) {
    const correction = JSON.parse(fs.readFileSync(profileCorrectionFile, "utf8"));
    updated = updated.map(r => r.id === correction.record_id ? applyChanges(r, correction.changes) : r);
  }
  const mfass = getMfassPrecisionCorrection();
  if (!mfass || !updated.some(r => r.id === mfass.record_id)) return updated;
  const existingSource = updated.find(r => r.id === mfass.source_record.id);
  if (existingSource && !isDeepStrictEqual(existingSource, mfass.source_record))
    throw Error("MFASS upstream source identity conflicts with the reviewed artifact");
  updated = updated.map(r => r.id === mfass.record_id ? applyChanges(r, mfass.changes) : r);
  if (!existingSource) updated = [...updated, mfass.source_record];
  return updated;
}
