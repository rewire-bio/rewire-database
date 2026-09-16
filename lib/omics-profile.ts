import { z } from "zod";
import type { OmicsRecord } from "./omics";

const evidence = {
  source_ids: z.array(z.string().min(1)).min(1),
  source_locator: z.string().trim().min(1),
};
const assertion = z.object({ text: z.string().min(1), ...evidence }).strict();
export const profileSchema = z
  .object({
    summary: z.string().min(1),
    sections: z.array(
      z
        .object({
          title: z.string().min(1),
          body: z.string().min(1),
          ...evidence,
        })
        .strict(),
    ),
    facts: z.array(
      z
        .object({
          label: z.string().min(1),
          value: z.string().min(1),
          ...evidence,
        })
        .strict(),
    ),
    strengths: z.array(assertion),
    limitations: z.array(assertion),
    diagram: z
      .object({
        title: z.string().min(1),
        steps: z.array(z.string().min(1)).min(2).max(8),
        caption: z.string().min(1),
        ...evidence,
      })
      .strict()
      .optional(),
    coverage: z.enum(["reviewed", "limited"]),
    gaps: z.array(z.string().min(1)),
    review: z
      .object({
        method: z.literal("automated_source_review"),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        note: z.string().min(1),
      })
      .strict(),
  })
  .strict()
  .superRefine((profile, ctx) => {
    if (profile.coverage === "limited" && !profile.gaps.length)
      ctx.addIssue({
        code: "custom",
        message: "Limited profiles must document evidence gaps.",
      });
    if (profile.coverage === "reviewed" && !profile.sections.length)
      ctx.addIssue({
        code: "custom",
        message: "Reviewed profiles need sourced explanation.",
      });
  });
export type OmicsProfile = z.infer<typeof profileSchema>;

export function validateProfileSources(
  profile: OmicsProfile,
  records: Map<string, Pick<OmicsRecord, "kind">>,
) {
  const claims = [
    ...profile.sections,
    ...profile.facts,
    ...profile.strengths,
    ...profile.limitations,
    ...(profile.diagram ? [profile.diagram] : []),
  ];
  for (const claim of claims)
    for (const id of claim.source_ids) {
      if (records.get(id)?.kind !== "source")
        throw new Error(`Profile cites missing source ${id}`);
    }
}

/** Enrich by exact ID only. Editorial grouping never creates identity links. */
export function enrichProfiles<T extends OmicsRecord>(
  records: T[],
  input: unknown[],
): T[] {
  const schema = z
    .object({ id: z.string().min(1), profile: profileSchema })
    .strict();
  const byId = new Map(records.map((record) => [record.id, record]));
  const profiles = new Map<string, OmicsProfile>();
  for (const item of input) {
    const { id, profile } = schema.parse(item);
    if (profiles.has(id)) throw new Error(`Duplicate profile ${id}`);
    if (!["model", "benchmark"].includes(byId.get(id)?.kind || ""))
      throw new Error(`Profile has no model or benchmark: ${id}`);
    validateProfileSources(profile, byId);
    profiles.set(id, profile);
  }
  return records.map((record) =>
    profiles.has(record.id)
      ? {
          ...record,
          attributes: {
            ...record.attributes,
            profile: profiles.get(record.id),
          },
        }
      : record,
  );
}
