import fs from "node:fs";
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
  "data/omics/evidence-sources.jsonl",
  "data/omics/metadata-corrections.jsonl",
  "data/omics/evidence-concerns.jsonl",
  "data/omics/reviews/2026-09-16-profile-review.jsonl",
  "data/omics/reviews/2026-09-16-numerical-integrity.json",
];
export function currentCatalogueBase(base: RecordEntry[]): RecordEntry[] {
  const optional = (file: string) =>
    fs.existsSync(file) ? readJsonl(file) : [];
  return enrichMetadata(
    addEvidenceConcerns(
      [...base, ...evidenceSources()],
      optional("data/omics/evidence-concerns.jsonl"),
    ),
    optional("data/omics/metadata-corrections.jsonl"),
  );
}
