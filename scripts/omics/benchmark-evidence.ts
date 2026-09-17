import fs from "node:fs";
import { createHash } from "node:crypto";
import type { RecordEntry } from "./schema";

const reviewPath = "data/omics/reviews/benchmark-evidence-2026/review.json";
export const benchmarkEvidenceFiles = [
  ...new Set([
    "data/omics/reviewed/benchmark-evidence-2026.jsonl",
    "data/omics/reviewed/benchmark-evidence-overlays-2026.jsonl",
    "data/omics/reviews/benchmark-evidence-2026/review.json",
    "data/omics/reviews/benchmark-evidence-2026/occurrences.json",
    "data/omics/reviews/benchmark-evidence-2026/search-audit.jsonl",
    ...(fs.existsSync(reviewPath)
      ? Object.keys(JSON.parse(fs.readFileSync(reviewPath, "utf8")).files)
      : []),
  ]),
];

/** Curated enrichment is additive. Old releases reconstruct from their original
 * inputs; historical scalar values and IDs cannot change through this loader. */
export function addBenchmarkEvidence(base: RecordEntry[]): RecordEntry[] {
  const [recordsFile, overlaysFile, reviewFile] = benchmarkEvidenceFiles;
  if (!fs.existsSync(recordsFile)) return base;
  const review = JSON.parse(fs.readFileSync(reviewFile, "utf8"));
  for (const file of Object.keys(review.files || {})) {
    const digest = createHash("sha256")
      .update(fs.readFileSync(file))
      .digest("hex");
    if (review.files?.[file] !== digest)
      throw new Error(`Unreviewed benchmark evidence input: ${file}`);
  }
  if (!Array.isArray(review.errors) || review.errors.length)
    throw new Error("Benchmark evidence review has unresolved errors");
  const independent = JSON.parse(
    fs.readFileSync(
      "data/omics/reviews/benchmark-evidence-2026/integration-review.json",
      "utf8",
    ),
  );
  if (
    independent.review_status !== "approved" ||
    independent.mapping_errors.length ||
    independent.source_hash_reuse_mismatches.length
  )
    throw new Error("Independent benchmark integration review is incomplete");
  for (const [published, reviewed] of [
    [recordsFile, "records.jsonl"],
    [overlaysFile, "overlays.jsonl"],
  ]) {
    if (
      review.files[published] !==
      independent.snapshot_sha256[
        `workbench/benchmark-evidence-expansion/integrated/${reviewed}`
      ]
    )
      throw new Error("Benchmark output differs from its independent review");
  }
  const read = (file: string) =>
    fs
      .readFileSync(file, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  const records = [...base, ...read(recordsFile)] as RecordEntry[];
  const byId = new Map(records.map((record) => [record.id, record]));
  if (byId.size !== records.length)
    throw new Error("Benchmark evidence duplicates an existing ID");
  for (const overlay of read(overlaysFile)) {
    const record = byId.get(overlay.record_id);
    if (!record)
      throw new Error(`Missing evidence subject: ${overlay.record_id}`);
    const keys = Object.keys(overlay.attributes);
    const allowed =
      record.kind === "benchmark"
        ? ["comparison_panels", "benchmark_research"]
        : record.kind === "evaluation"
          ? [
              "origin",
              "protocol",
              "version",
              "comparison",
              "source_locator",
              "missing_metadata",
            ]
          : record.kind === "result"
            ? ["metric_direction"]
            : [];
    if (keys.some((key) => !allowed.includes(key)))
      throw new Error(
        `Evidence overlay would overwrite protected fields on ${record.id}`,
      );
    if (
      record.kind === "result" &&
      keys.includes("metric_direction") &&
      record.attributes.metric_direction !== "unknown"
    )
      throw new Error(
        "Only an unknown historical metric direction may be filled",
      );
    if (
      overlay.replace_links &&
      !["benchmark", "evaluation"].includes(record.kind)
    )
      throw new Error("Unexpected scientific relationship rewrite");
    byId.set(record.id, {
      ...record,
      source_ids: [...new Set([...record.source_ids, ...overlay.source_ids])],
      links: overlay.replace_links || record.links,
      attributes: { ...record.attributes, ...overlay.attributes },
    });
  }
  return [...byId.values()];
}
