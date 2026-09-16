import { createHash } from "node:crypto";
import { z } from "zod";
import type { RecordEntry } from "./schema";

const association = z
  .object({
    id: z.string().min(1),
    links: z
      .array(
        z
          .object({
            relation: z.enum([
              "family",
              "variant_of",
              "alias_of",
              "uses_model",
              "part_of",
              "evaluates_task",
            ]),
            target_id: z.string().min(1),
            source_ids: z.array(z.string().min(1)).min(1),
            source_locator: z.string().min(1),
            review: z
              .object({
                method: z.literal("automated_source_review"),
                date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
                note: z.string().min(1),
              })
              .strict(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export function enrichAssociations(
  records: RecordEntry[],
  input: unknown[],
): RecordEntry[] {
  const byId = new Map(records.map((record) => [record.id, record]));
  const patches = new Map<string, RecordEntry["links"]>();
  const claims: RecordEntry[] = [];
  const seen = new Set<string>();
  for (const value of input) {
    const { id, links } = association.parse(value);
    const subject = byId.get(id);
    if (!subject) throw new Error(`Association subject missing: ${id}`);
    for (const link of links) {
      const target = byId.get(link.target_id);
      if (!target || target.id === id)
        throw new Error(`Invalid association target: ${link.target_id}`);
      const modelRelation = ["family", "variant_of", "uses_model"].includes(
        link.relation,
      );
      if (
        modelRelation &&
        (subject.kind !== "model" || target.kind !== "model")
      )
        throw new Error("Model relationship must connect models");
      if (
        ["part_of", "evaluates_task"].includes(link.relation) &&
        (subject.kind !== "benchmark" || target.kind !== "benchmark")
      )
        throw new Error("Benchmark relationship must connect benchmarks");
      if (link.relation === "alias_of" && subject.kind !== target.kind)
        throw new Error("Alias identity kind mismatch");
      for (const source of link.source_ids)
        if (byId.get(source)?.kind !== "source")
          throw new Error(`Unknown association source ${source}`);
      const field = `links:${link.relation}:${link.target_id}`;
      const key = `${id}:${field}`;
      if (seen.has(key)) throw new Error(`Duplicate association ${key}`);
      seen.add(key);
      const patched = patches.get(id) || [...subject.links];
      if (
        !patched.some(
          (existing) =>
            existing.relation === link.relation &&
            existing.target_id === link.target_id,
        )
      )
        patched.push({ relation: link.relation, target_id: link.target_id });
      patches.set(id, patched);
      claims.push({
        id: `profile-association-${createHash("sha256").update(key).digest("hex").slice(0, 20)}`,
        kind: "claim",
        name: `${subject.name}: ${link.relation.replace(/_/g, " ")} ${target.name}`,
        description: link.review.note,
        status: "source_checked",
        facets: subject.facets,
        source_ids: link.source_ids,
        links: [{ relation: "subject", target_id: id }],
        attributes: {
          field,
          target_id: link.target_id,
          source_locator: link.source_locator,
          review: link.review,
        },
      });
    }
  }
  return [
    ...records.map((record) =>
      patches.has(record.id)
        ? { ...record, links: patches.get(record.id)! }
        : record,
    ),
    ...claims,
  ];
}
