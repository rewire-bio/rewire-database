import { z } from "zod";
import type { CatalogueRecord } from "./catalogue-query.js";
import { isBenchmarkSubject } from "./entity-kinds.js";
const citation = {
  source_ids: z.array(z.string().min(1)).min(1),
  source_locator: z.string().min(1),
};
export const runGuideSchema = z
  .object({
    record_id: z.string().min(1),
    summary: z.string().min(1),
    status: z.literal("source_reviewed_not_executed"),
    prerequisites: z.array(z.string().min(1)).min(1),
    steps: z
      .array(
        z
          .object({
            title: z.string().min(1),
            shell: z.string().min(1),
            explanation: z.string().min(1),
            ...citation,
          })
          .strict(),
      )
      .min(1),
    outputs: z.array(z.string().min(1)),
    limitations: z.array(z.string().min(1)).min(1),
    source_ids: z.array(z.string().min(1)).min(1),
    review: z
      .object({
        method: z.literal("official_repository_review"),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .strict(),
  })
  .strict();
export const runDocumentationSchema = z
  .object({
    record_id: z.string().min(1),
    ...citation,
    status: z.enum([
      "official_documentation_linked",
      "source_reviewed_not_executed",
    ]),
    summary: z.string().min(1),
  })
  .strict();
export type RunGuide = z.infer<typeof runGuideSchema>;
export function validateRunGuide(
  record: CatalogueRecord,
  byId: Map<string, CatalogueRecord>,
) {
  const documentation = record.attributes.run_documentation;
  if (documentation !== undefined) {
    const parsed = runDocumentationSchema.parse(documentation);
    if (!isBenchmarkSubject(record.kind) || parsed.record_id !== record.id)
      throw new Error("Invalid run documentation owner");
    for (const id of parsed.source_ids) {
      const source = byId.get(id);
      if (
        source?.kind !== "source" ||
        !record.source_ids.includes(id) ||
        !/^[a-f0-9]{64}$/.test(String(source.attributes.artifact_sha256))
      )
        throw new Error(`Unpinned run documentation ${record.id} -> ${id}`);
    }
  }
  if (record.attributes.run_guide === undefined) return;
  if (!isBenchmarkSubject(record.kind))
    throw new Error(
      "Run instructions require a benchmark, task, protocol or evaluator",
    );
  const guide = runGuideSchema.parse(record.attributes.run_guide);
  if (guide.record_id !== record.id)
    throw new Error("Run guide belongs to another record");
  for (const id of [
    ...guide.source_ids,
    ...guide.steps.flatMap((s) => s.source_ids),
  ]) {
    const source = byId.get(id);
    if (
      source?.kind !== "source" ||
      !record.source_ids.includes(id) ||
      !/^[a-f0-9]{64}$/.test(String(source.attributes.artifact_sha256))
    )
      throw new Error(`Unpinned run-guide evidence ${record.id} -> ${id}`);
  }
}
