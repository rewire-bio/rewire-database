import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import { recordSchema, type RecordEntry } from "./schema";

export const useCaseCoverageRoot = "data/omics/use-case-coverage-20260930";
const lanes = ["clinical", "research", "experimental"] as const;
const receiptSchema = z.object({
  schema_version: z.literal("1.0"),
  method: z.literal("automated_source_review"),
  reviewer: z.string().min(1),
  reviewed_at: z.string().datetime(),
  scope: z.string().min(1),
  limitations: z.array(z.string().min(1)).min(1),
  errors: z.array(z.string()).length(0),
  files: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)),
}).strict();
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

export function useCaseCoverageInputFiles(root = useCaseCoverageRoot): string[] {
  return ["review.json", "before.json", "review-clinical.json", "review-research.json", "review-experimental.json", ...lanes.flatMap(lane =>
    ["records.jsonl", "coverage.json", "research.md", "sources.md", "claims.csv", "retrieval-log.md"]
      .map(file => `${lane}/${file}`),
  )].map(file => path.join(root, file));
}

/** Append reviewed evidence only. Never replace an existing scientific record. */
export function addUseCaseCoverage(records: RecordEntry[], root = useCaseCoverageRoot): RecordEntry[] {
  const receipt = receiptSchema.parse(JSON.parse(fs.readFileSync(path.join(root, "review.json"), "utf8")));
  const files = useCaseCoverageInputFiles(root).slice(1);
  const expected = files.map(file => path.relative(root, file)).sort();
  if (JSON.stringify(Object.keys(receipt.files).sort()) !== JSON.stringify(expected))
    throw Error("Use-case coverage review does not bind every expected input");
  for (const file of files) {
    if (digest(fs.readFileSync(file)) !== receipt.files[path.relative(root, file)])
      throw Error(`Use-case coverage input changed since review: ${file}`);
  }
  const additions = lanes.flatMap(lane => fs.readFileSync(path.join(root, lane, "records.jsonl"), "utf8")
    .split("\n").filter(Boolean).map(line => recordSchema.parse(JSON.parse(line))));
  const ids = new Set(records.map(record => record.id));
  for (const record of additions) {
    if (ids.has(record.id)) throw Error(`Use-case coverage cannot replace or duplicate record: ${record.id}`);
    ids.add(record.id);
    if (record.status === "reproduced" || record.attributes.origin === "rewire_run")
      throw Error(`Literature curation cannot claim a new execution: ${record.id}`);
  }
  return [...records, ...additions];
}
