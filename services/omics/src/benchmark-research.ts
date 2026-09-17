import { z } from "zod";
import type { CatalogueRecord } from "./catalogue-query.js";
export const benchmarkResearchSchema = z
  .object({
    review_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    status: z.string().min(1),
    primary_sources: z.array(z.string().min(1)).min(1),
    inspected_locators: z.array(z.string().min(1)).min(1),
    searched_queries: z.array(z.string().min(1)).min(1),
    gaps: z.array(z.string().min(1)),
    claim_scope: z.string().min(1),
  })
  .strict();
export type BenchmarkResearchData = z.infer<typeof benchmarkResearchSchema>;
export function validateBenchmarkResearch(
  record: CatalogueRecord,
  byId: Map<string, CatalogueRecord>,
) {
  if (record.attributes.benchmark_research === undefined) return;
  if (record.kind !== "benchmark")
    throw new Error("Literature audit must belong to a benchmark");
  const audit = benchmarkResearchSchema.parse(
    record.attributes.benchmark_research,
  );
  for (const id of audit.primary_sources)
    if (byId.get(id)?.kind !== "source" || !record.source_ids.includes(id))
      throw new Error(`Unlinked benchmark paper: ${record.id} -> ${id}`);
}
