import { z } from "zod";
import type { CatalogueRecord } from "./catalogue-query.js";

/** Facts a page states as values, one entry per released checkpoint of a model (`checkpoints`) or
 * per task or track of a benchmark (`benchmark_tasks`). Each entry cites the record's own sources. */
const text = z.string().min(1).nullable();
const count = z.number().int().nonnegative().nullable();
// A release may be known only to the month or the year.
const released = z
  .string()
  .regex(/^\d{4}(-\d{2}(-\d{2})?)?$/)
  .nullable();
const evidence = {
  source_ids: z.array(z.string().min(1)).min(1),
  source_locator: z.string().trim().min(1),
};
export const checkpointSchema = z
  .object({
    checkpoint: z.string().min(1),
    parameters: count,
    context_length: count,
    context_unit: text,
    code_licence: text,
    weights_licence: text,
    code_url: text,
    weights_url: text,
    gated: z.boolean().nullable(),
    released,
    ...evidence,
  })
  .strict();
export const benchmarkTaskSchema = z
  .object({
    task: z.string().min(1),
    dataset: text,
    size: count,
    size_unit: text,
    split: text,
    primary_metric: text,
    metric_direction: z.enum(["higher", "lower"]).nullable(),
    results_url: text,
    code_url: text,
    data_url: text,
    data_licence: text,
    code_licence: text,
    released,
    ...evidence,
  })
  .strict();
export const checkpointsSchema = z.array(checkpointSchema).min(1);
export const benchmarkTasksSchema = z.array(benchmarkTaskSchema).min(1);
export type Checkpoint = z.infer<typeof checkpointSchema>;
export type BenchmarkTask = z.infer<typeof benchmarkTaskSchema>;

const owners = { checkpoints: "model", benchmark_tasks: "benchmark" } as const;
const schemas = { checkpoints: checkpointsSchema, benchmark_tasks: benchmarkTasksSchema };

export function validateStructuredFacts(
  record: CatalogueRecord,
  byId: Map<string, CatalogueRecord>,
) {
  for (const key of ["checkpoints", "benchmark_tasks"] as const) {
    const value = record.attributes[key];
    if (value === undefined) continue;
    if (record.kind !== owners[key])
      throw new Error(`Only ${owners[key]} records carry ${key}: ${record.id}`);
    for (const entry of schemas[key].parse(value))
      for (const id of entry.source_ids) {
        const source = byId.get(id);
        if (
          source?.kind !== "source" ||
          !record.source_ids.includes(id) ||
          !/^[a-f0-9]{64}$/.test(String(source.attributes.artifact_sha256))
        )
          throw new Error(`Unpinned ${key} evidence ${record.id} -> ${id}`);
      }
  }
}
