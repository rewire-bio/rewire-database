import { validateRunRecipes } from "../../shared/omics/run-recipe";
import { validateRunGuide } from "../../shared/omics/run-guide";
import { assertNoPrivateFields } from "../../shared/omics/private-fields";
import { z } from "zod";
import { extensionsSchema } from "./extensions";
import { profileSchema, validateProfileSources } from "../../lib/omics-profile";
import { createCatalogueQuery } from "../../shared/omics/catalogue-query";
import { validateBenchmarkResearch } from "../../shared/omics/benchmark-research";
import {
  entityKinds,
  validateDatasetReuseLink,
  modelSubjectKinds,
  benchmarkSubjectKinds,
  datasetSubjectKinds,
} from "../../shared/omics/entity-kinds";

// Releases before 2026-10-09 named an evaluation's roles model/benchmark/dataset (or by target
// kind); later releases use system/assessment/data and give baselines, subsets and
// configurations their own relations. Accept both until every pinned release uses the new ones.
const roleNames = {
  system: ["system", "model", ...modelSubjectKinds],
  assessment: ["assessment", "benchmark", ...benchmarkSubjectKinds],
  data: ["data", ...datasetSubjectKinds],
} as const;
const roleKinds: Record<keyof typeof roleNames, readonly string[]> = {
  system: modelSubjectKinds,
  assessment: benchmarkSubjectKinds,
  data: datasetSubjectKinds,
};
const catalogueRelations = [
  ...new Set([
    ...Object.values(roleNames).flat(),
    "evaluation", "baseline", "family", "parent", "supersedes", "original_evaluation", "subject",
    "source", "applicable_to", "uses_model", "variant_of", "alias_of", "part_of", "evaluates_task",
    "same_data_as", "implemented_by", "measured_in", "uses_data", "used_in", "configuration_of",
  ]),
];
/** A link named after a kind must point at that kind; a role name at a kind within its role. */
function relationAcceptsKind(relation: string, kind: string): boolean {
  if (["model", "system"].includes(relation)) return roleKinds.system.includes(kind);
  if (["benchmark", "assessment"].includes(relation)) return roleKinds.assessment.includes(kind);
  if (["dataset", "data"].includes(relation)) return roleKinds.data.includes(kind);
  return relation === kind;
}
export const kinds = entityKinds;
export const statuses = [
  "discovered",
  "needs_review",
  "source_checked",
  "reproduced",
  "disputed",
  "superseded",
  "excluded",
] as const;
export const recordSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    kind: z.enum(kinds),
    name: z.string().min(1),
    description: z.string(),
    status: z.enum(statuses),
    facets: z.record(z.string(), z.array(z.string())),
    source_ids: z.array(z.string()),
    links: z.array(
      z.object({
        relation: z.string().refine(
          value => (catalogueRelations as readonly string[]).includes(value),
          "Unknown catalogue relationship",
        ),
        target_id: z.string().min(1),
      }),
    ),
    attributes: z.record(z.string(), z.unknown()),
  })
  .strict();
export type RecordEntry = z.infer<typeof recordSchema>;
export function validateRecords(input: unknown[]): RecordEntry[] {
  const records = input.map((x) => recordSchema.parse(x));
  const byId = new Map(records.map((r) => [r.id, r]));
  if (byId.size !== records.length) throw new Error("Duplicate record ID");
  for (const r of records) {
    assertNoPrivateFields(
      r,
      "Private field cannot enter a public catalogue release.",
    );
    for (const id of r.source_ids) {
      if (byId.get(id)?.kind !== "source")
        throw new Error(`Missing source ${id} for ${r.id}`);
    }
    for (const l of r.links) {
      if (!byId.has(l.target_id))
        throw new Error(`Dangling ${r.id} -> ${l.target_id}`);
      validateDatasetReuseLink(r, l, byId.get(l.target_id)!);
      if (
        !(r.kind === "result" && l.relation === "evaluation") &&
        (entityKinds as readonly string[]).includes(l.relation) &&
        !relationAcceptsKind(l.relation, byId.get(l.target_id)!.kind)
      )
        throw new Error(`Wrong entity kind ${r.id} -> ${l.target_id}`);
    }
    const a = r.attributes;
    validateBenchmarkResearch(r, byId);
    validateRunGuide(r, byId);
    validateRunRecipes(r, byId);
    if (a.profile !== undefined)
      validateProfileSources(profileSchema.parse(a.profile), byId);
    if (a.extensions !== undefined) extensionsSchema.parse(a.extensions);
    if (r.kind === "source") {
      const u = new URL(String(a.url));
      if (!["https:", "http:"].includes(u.protocol))
        throw new Error(`Invalid source URL ${r.id}`);
      if (!a.retrieved_at) throw new Error(`Undated source ${r.id}`);
      if (
        !a.version &&
        !(a.missing_metadata as Record<string, unknown> | undefined)?.version
      )
        throw new Error(`Unversioned source ${r.id}`);
    }
    if (r.kind === "result") {
      const ev = r.links.filter((l) => l.relation === "evaluation");
      if (ev.length !== 1 || byId.get(ev[0].target_id)?.kind !== "evaluation")
        throw new Error(`Invalid result evaluation ${r.id}`);
      if (
        typeof a.printed_value !== "string" ||
        !a.printed_value.trim() ||
        !a.metric ||
        !a.unit
      )
        throw new Error(`Incomplete result ${r.id}`);
      if (
        a.numeric_value !== null &&
        (typeof a.numeric_value !== "string" ||
          !a.numeric_value.trim() ||
          !Number.isFinite(Number(a.numeric_value)))
      )
        throw new Error(`Invalid numeric value ${r.id}`);
      if (
        ["source_checked", "reproduced"].includes(r.status) &&
        (!r.source_ids.length || !a.source_locator || !a.review)
      )
        throw new Error(`Missing result evidence ${r.id}`);
      if (
        r.status === "reproduced" &&
        byId.get(ev[0].target_id)?.attributes.origin !== "rewire_run"
      )
        throw new Error(`External result mislabelled reproduced ${r.id}`);
    }
    if (r.kind === "evaluation")
      for (const role of ["system", "assessment", "data"] as const) {
        const names: readonly string[] = roleNames[role];
        const links = r.links.filter((l) => names.includes(l.relation));
        if (
          links.length !== 1 ||
          !roleKinds[role].includes(byId.get(links[0].target_id)?.kind || "")
        )
          throw new Error(`Invalid evaluation ${role} ${r.id}`);
      }
    if (r.kind === "claim" && !r.links.some((l) => l.relation === "subject"))
      throw new Error(`Claim has no subject ${r.id}`);
  }
  // Resolve every curated panel against the same graph used by the API. This
  // rejects stale IDs, mixed protocols and unreviewed results before release.
  if (records.some((record) => record.attributes.comparison_panels)) {
    const query = createCatalogueQuery({
      schema_version: "1.0",
      release_id: "validation",
      released_at: "",
      coverage: {},
      records,
    });
    for (const record of records.filter(
      (record) => record.attributes.comparison_panels,
    ))
      query.get({ id: record.id });
  }
  return records;
}
export function publicRecords(records: RecordEntry[]): RecordEntry[] {
  const blocked = new Set(
    records
      .filter(
        (r) =>
          r.status === "excluded" ||
          r.status === "disputed" ||
          (r.kind === "result" &&
            !["source_checked", "reproduced", "superseded"].includes(r.status)),
      )
      .map((r) => r.id),
  );
  let changed = true;
  while (changed) {
    changed = false;
    for (const r of records)
      if (
        !blocked.has(r.id) &&
        (r.source_ids.some((id) => blocked.has(id)) ||
          r.links.some((l) => blocked.has(l.target_id)))
      ) {
        blocked.add(r.id);
        changed = true;
      }
  }
  return records.filter((r) => !blocked.has(r.id));
}
