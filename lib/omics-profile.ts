import { z } from "zod";
import type { OmicsRecord } from "./omics";

import {
  profileSchema,
  type OmicsProfile,
} from "../services/omics/src/profile-schema";
export {
  profileSchema,
  type OmicsProfile,
} from "../services/omics/src/profile-schema";

export function validateProfileSources(
  profile: OmicsProfile,
  records: Map<string, Pick<OmicsRecord, "kind">>,
) {
  const claims = [
    ...(profile.summary_source_ids
      ? [{ source_ids: profile.summary_source_ids }]
      : []),
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
    .object({ id: z.string().min(1), profile: z.unknown() })
    .strict();
  const byId = new Map(records.map((record) => [record.id, record]));
  const profiles = new Map<string, OmicsProfile>();
  for (const item of input) {
    const { id, profile: rawProfile } = schema.parse(item);
    const profile = profileSchema.parse(rawProfile);
    if (profiles.has(id)) throw new Error(`Duplicate profile ${id}`);
    if (!["model", "benchmark"].includes(byId.get(id)?.kind || ""))
      throw new Error(`Profile has no model or benchmark: ${id}`);
    validateProfileSources(profile, byId);
    profiles.set(id, profile);
  }
  return records.map((record) => {
    const profile = profiles.get(record.id);
    if (!profile) return record;
    const { missing_metadata, ...attributes } = record.attributes;
    return {
      ...record,
      attributes: {
        ...attributes,
        ...(missing_metadata !== undefined
          ? {
              historical_missing_metadata: missing_metadata,
              metadata_review_scope:
                "historical_missing_metadata preserves the original discovery state. Current descriptive evidence and missingness are recorded in profile.facts; numerical-result review is separate.",
            }
          : {}),
        profile,
      },
    };
  });
}
