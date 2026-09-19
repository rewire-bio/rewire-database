import fs from "node:fs";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { RecordEntry } from "./schema";

export const evaluationGroupInputFiles = [
  "data/omics/evaluation-groups.json",
  "data/omics/reviews/2026-09-19-evaluation-groups.json",
];
const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [
          key,
          canonical((value as Record<string, unknown>)[key]),
        ]),
    );
  return value;
}
export function evaluationRecordDigest(record: RecordEntry) {
  return sha256(JSON.stringify(canonical(record)));
}
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const groupSchema = z
  .object({
    id: z
      .string()
      .regex(/^evaluation-group-[a-z0-9-]+$/)
      .max(255),
    name: z.string().min(1),
    model_id: z.string().min(1),
    dataset_id: z.string().min(1),
    source_id: z.string().min(1),
    artifact_sha256: digest,
    source_locator: z.string().min(1),
    rationale: z.string().min(1),
    members: z
      .array(
        z
          .object({
            evaluation_id: z.string().min(1),
            record_sha256: digest,
          })
          .strict(),
      )
      .min(2),
  })
  .strict();
const mapSchema = z
  .object({
    schema_version: z.literal("1.0"),
    scope: z.string().min(1),
    groups: z.array(groupSchema),
  })
  .strict();

/** Apply only enumerated, source-reviewed identities. Never infer identity by
 * model name, metric spelling or dataset alone, and never change released IDs. */
export function applyEvaluationGroups(
  records: RecordEntry[],
  input: unknown,
): RecordEntry[] {
  const mapping = mapSchema.parse(input);
  const byId = new Map(records.map((record) => [record.id, record]));
  const assignments = new Map<string, z.infer<typeof groupSchema>>();
  const groupIds = new Set<string>();
  for (const group of mapping.groups) {
    if (groupIds.has(group.id) || byId.has(group.id))
      throw new Error(`Duplicate evaluation group ${group.id}`);
    groupIds.add(group.id);
    const source = byId.get(group.source_id);
    if (
      source?.kind !== "source" ||
      source.attributes.artifact_sha256 !== group.artifact_sha256
    )
      throw new Error(
        `Evaluation grouping source/hash mismatch: ${group.source_id}`,
      );
    for (const member of group.members) {
      const record = byId.get(member.evaluation_id);
      if (assignments.has(member.evaluation_id))
        throw new Error(
          `Repeated evaluation group member ${member.evaluation_id}`,
        );
      if (
        record?.kind !== "evaluation" ||
        evaluationRecordDigest(record) !== member.record_sha256
      )
        throw new Error(
          `Evaluation grouping record changed: ${member.evaluation_id}`,
        );
      if (
        !record.source_ids.includes(group.source_id) ||
        !record.links.some(
          (link) =>
            ["model", "configuration", "method"].includes(link.relation) &&
            link.target_id === group.model_id,
        ) ||
        !record.links.some(
          (link) =>
            ["dataset", "dataset_subset"].includes(link.relation) &&
            link.target_id === group.dataset_id,
        )
      )
        throw new Error(
          `Evaluation grouping identity mismatch: ${member.evaluation_id}`,
        );
      assignments.set(member.evaluation_id, group);
    }
  }
  return records.map((record) =>
    assignments.has(record.id)
      ? {
          ...record,
          attributes: {
            ...record.attributes,
            evaluation_group_id: assignments.get(record.id)!.id,
            evaluation_group_name: assignments.get(record.id)!.name,
            evaluation_group_note:
              "Counts source-reported evaluation scopes, not individual runs or assays.",
          },
        }
      : record,
  );
}

/** Apply before entity migration: member hashes bind the exact reviewed
 * evaluation records. The map and raw batches must still match their receipt. */
export function addEvaluationGroups(records: RecordEntry[]) {
  const bytes = fs.readFileSync(evaluationGroupInputFiles[0]);
  const receipt = JSON.parse(
    fs.readFileSync(evaluationGroupInputFiles[1], "utf8"),
  );
  if (
    receipt.mapping_sha256 !== sha256(bytes) ||
    receipt.review_method !== "automated_primary_source_review" ||
    !Array.isArray(receipt.errors) ||
    receipt.errors.length
  )
    throw new Error(
      "Evaluation grouping lacks a matching successful review receipt",
    );
  for (const [file, expected] of Object.entries(
    receipt.inputs as Record<string, string>,
  ))
    if (sha256(fs.readFileSync(file)) !== expected)
      throw new Error(`Evaluation grouping input changed: ${file}`);
  return applyEvaluationGroups(records, JSON.parse(bytes.toString("utf8")));
}
