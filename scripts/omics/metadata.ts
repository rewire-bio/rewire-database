import { z } from "zod";
import { createHash } from "node:crypto";
import type { RecordEntry } from "./schema";
const correction = z
  .object({
    id: z.string().min(1),
    fields: z.record(
      z.string(),
      z
        .object({
          value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
          status: z.literal("source_checked"),
          source_ids: z.array(z.string().min(1)).min(1),
          source_locator: z.string().trim().min(1),
        })
        .strict(),
    ),
    review: z
      .object({
        method: z.literal("automated_source_review"),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        note: z.string().min(1),
      })
      .strict(),
  })
  .strict();
/** Only descriptive entity metadata. Numerical and evaluation records are immutable here. */
export function enrichMetadata(
  records: RecordEntry[],
  input: unknown[],
): RecordEntry[] {
  const byId = new Map(records.map((record) => [record.id, record]));
  const changes = new Map<string, RecordEntry>();
  const claims: RecordEntry[] = [];
  const allowed = new Set([
    "entity_level",
    "access",
    "version",
    "code_licence",
    "weights_licence",
  ]);
  for (const raw of input) {
    const patch = correction.parse(raw);
    const subject = byId.get(patch.id);
    if (
      !subject ||
      !["model", "benchmark", "dataset", "baseline"].includes(subject.kind)
    )
      throw new Error("Invalid metadata correction subject");
    if (changes.has(patch.id)) throw new Error("Duplicate metadata correction");
    const attributes = { ...subject.attributes };
    for (const [field, evidence] of Object.entries(patch.fields)) {
      if (!allowed.has(field))
        throw new Error(`Unsupported metadata correction field: ${field}`);
      for (const id of evidence.source_ids)
        if (byId.get(id)?.kind !== "source")
          throw new Error(`Missing correction source ${id}`);
      attributes[field] = evidence.value;
      const key = `${subject.id}:${field}:${JSON.stringify(evidence.value)}`;
      claims.push({
        id: `metadata-correction-${createHash("sha256").update(key).digest("hex").slice(0, 20)}`,
        kind: "claim",
        name: `${subject.name}: ${field.replace(/_/g, " ")}`,
        description: patch.review.note,
        status: "source_checked",
        facets: subject.facets,
        source_ids: evidence.source_ids,
        links: [{ relation: "subject", target_id: subject.id }],
        attributes: {
          field: `attributes.${field}`,
          previous_value: subject.attributes[field] ?? null,
          value: evidence.value,
          source_locator: evidence.source_locator,
          review: patch.review,
        },
      });
    }
    changes.set(subject.id, { ...subject, attributes });
  }
  return [
    ...records.map((record) => changes.get(record.id) || record),
    ...claims,
  ];
}
