import { z } from "zod";
import type { RecordEntry } from "./schema";
const concern = z
  .object({
    source_id: z.string().min(1),
    message: z.string().min(1),
    source_locator: z.string().min(1),
    artifact_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    reviewed_at: z.string().min(1),
    review_method: z.literal("automated_primary_source_review"),
  })
  .strict();
export function addEvidenceConcerns(
  records: RecordEntry[],
  input: unknown[],
): RecordEntry[] {
  const byId = new Map(records.map((record) => [record.id, record]));
  const concerns = new Map<string, z.infer<typeof concern>[]>();
  for (const raw of input) {
    const item = concern.parse(raw);
    const source = byId.get(item.source_id);
    if (
      source?.kind !== "source" ||
      source.attributes.artifact_sha256 !== item.artifact_sha256
    )
      throw new Error(
        `Evidence concern source/hash mismatch: ${item.source_id}`,
      );
    concerns.set(item.source_id, [
      ...(concerns.get(item.source_id) || []),
      item,
    ]);
  }
  return records.map((record) =>
    concerns.has(record.id)
      ? {
          ...record,
          attributes: {
            ...record.attributes,
            evidence_concerns: concerns.get(record.id),
          },
        }
      : record,
  );
}
