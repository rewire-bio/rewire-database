import { z } from "zod";
import type { OmicsRecord } from "./omics";

// Same shapes as shared/omics/structured-facts.ts in rewire-benchmark-data. The pinned release
// does not ship that file yet, so the page parses with this copy.
const text = z.string().min(1).nullable();
const count = z.number().int().nonnegative().nullable();
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

/** A model's released checkpoints, or null when the record has none or any entry is malformed. */
export function recordCheckpoints(record: Pick<OmicsRecord, "kind" | "attributes">): Checkpoint[] | null {
  if (record.kind !== "model") return null;
  const parsed = checkpointsSchema.safeParse(record.attributes?.checkpoints);
  return parsed.success ? parsed.data : null;
}

/** A benchmark's tasks, or null when the record has none or any entry is malformed. */
export function recordBenchmarkTasks(record: Pick<OmicsRecord, "kind" | "attributes">): BenchmarkTask[] | null {
  if (record.kind !== "benchmark") return null;
  const parsed = benchmarkTasksSchema.safeParse(record.attributes?.benchmark_tasks);
  return parsed.success ? parsed.data : null;
}

const scales: [number, string][] = [
  [1e12, "T"],
  [1e9, "B"],
  [1e6, "M"],
  [1e3, "K"],
];

/** A parameter count in short form: 8M, 650M, 2.5B. Counts under 1,000 are printed in full. */
export function formatParameters(value: number): string {
  for (const [index, [size, suffix]] of scales.entries()) {
    const scaled = value / size;
    if (scaled < 1) continue;
    const digits = scaled < 10 ? 1 : 0;
    const rounded = Number(scaled.toFixed(digits));
    // 999,950,000 rounds to 1000M; print it as 1B instead.
    if (rounded >= 1000 && index > 0) {
      const [larger, largerSuffix] = scales[index - 1];
      return `${Number((value / larger).toFixed(1))}${largerSuffix}`;
    }
    return `${rounded}${suffix}`;
  }
  return value.toLocaleString("en-GB");
}
