import fs from "node:fs";
import { createHash } from "node:crypto";
import { enrichMetadata } from "./metadata";
import { addEvidenceConcerns } from "./evidence-concerns";
import { type RecordEntry, recordSchema } from "./schema";
export function readJsonl<T = unknown>(file: string): T[] {
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}
/** Additional reviewed sources do not alter the inputs of historical releases. */
export function evidenceSources(): RecordEntry[] {
  const file = "data/omics/evidence-sources.jsonl";
  if (!fs.existsSync(file)) return [];
  return readJsonl(file).map((value) => {
    const record = recordSchema.parse(value);
    if (record.kind !== "source")
      throw new Error("Evidence source input contains a non-source record");
    if (!/^[a-f0-9]{64}$/.test(String(record.attributes.artifact_sha256)))
      throw new Error(`Missing pinned evidence hash: ${record.id}`);
    return record;
  });
}

export const reviewInputFiles = [
  "data/omics/reviewed/alphagenome-2026.jsonl",
  "data/omics/reviews/2026-09-17-alphagenome-results.json",
  "data/omics/reviews/2026-09-17-alphagenome-independent-review.json",
  "data/omics/reviews/alphagenome-2026/tables.json",
  "data/omics/reviews/alphagenome-2026/protocol-map.json",
  "data/omics/reviews/alphagenome-2026/methods-source.json",
  "data/omics/reviews/alphagenome-2026/retrieval.json",
  "data/omics/evidence-sources.jsonl",
  "data/omics/metadata-corrections.jsonl",
  "data/omics/evidence-concerns.jsonl",
  "data/omics/reviews/2026-09-16-profile-review.jsonl",
  "data/omics/reviews/2026-09-16-numerical-integrity.json",
];
/** New numerical batches are additive: historical reconstruction uses only its
 * original inputs. Disputed rows stay in Git but publicRecords quarantines them. */
export function reviewedResults(): RecordEntry[] {
  const file = "data/omics/reviewed/alphagenome-2026.jsonl";
  const digest = createHash("sha256")
    .update(fs.readFileSync(file))
    .digest("hex");
  const receipt = JSON.parse(
    fs.readFileSync(
      "data/omics/reviews/2026-09-17-alphagenome-results.json",
      "utf8",
    ),
  );
  const review = JSON.parse(
    fs.readFileSync(
      "data/omics/reviews/2026-09-17-alphagenome-independent-review.json",
      "utf8",
    ),
  );
  if (
    receipt.records_sha256 !== digest ||
    review.input_sha256 !== digest ||
    !Array.isArray(review.errors) ||
    review.errors.length
  ) {
    throw new Error(
      "AlphaGenome batch lacks a matching, successful independent transcription review",
    );
  }
  return readJsonl(file).map((value) => recordSchema.parse(value));
}
export function currentCatalogueBase(base: RecordEntry[]): RecordEntry[] {
  const optional = (file: string) =>
    fs.existsSync(file) ? readJsonl(file) : [];
  return enrichMetadata(
    addEvidenceConcerns(
      [...base, ...evidenceSources(), ...reviewedResults()],
      optional("data/omics/evidence-concerns.jsonl"),
    ),
    optional("data/omics/metadata-corrections.jsonl"),
  );
}
