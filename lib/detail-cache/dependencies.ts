import { createCatalogueQuery, type CatalogueSnapshot, type CatalogueQuery } from "../../services/omics/src/catalogue-query";
import type { UseCaseQuery } from "../../services/omics/src/use-cases";
import { reproductionSchema } from "../../services/omics/src/run-recipe";
import { recordSearchMetadata } from "../catalogue-seo";
import { testedEntities } from "../omics-browse";

export type DetailCacheKind = "result" | "source";
export interface DetailDependencyOptions {
  /** Must be constructed from this snapshot. Reuse it across ids within a build. */
  query?: CatalogueQuery;
  /** Validated, resolved query for this snapshot; required when use cases are enabled. */
  useCaseQuery?: Pick<UseCaseQuery, "links">;
}

/** Explicit rendering inputs, detached from mutable query caches. No filesystem reads.
 * Canonical result/source only: aliases return null and must render normally.
 * Keep this trace aligned with both page metadata and the detail component tree.
 * The wrapper adds its renderer epoch and hashes the serialized manifest.
 */
export function buildDetailDependencies(
  snapshot: CatalogueSnapshot,
  kind: DetailCacheKind,
  id: string,
  options: DetailDependencyOptions = {},
) {
  const query = options.query ?? createCatalogueQuery(snapshot);
  const record = query.record(id);
  if (!record || record.kind !== kind || record.status === "excluded") return null;
  if (snapshot.coverage.use_cases && !options.useCaseQuery) {
    throw new Error("Detail cache requires a resolved use-case query when coverage.use_cases is enabled");
  }
  const detail = query.get({ id, include_comparisons: false });
  const results = kind === "result" ? query.results({ id, limit: 25 }) : null;
  const first = results?.items[0];
  const evaluated = first?.evaluation;
  const evidence = query.evidence({
    id, scope: kind === "result" ? "individual_claim" : "source_metadata", limit: 10,
  });
  const identity = record.attributes.source_identity as { subject_id?: unknown } | undefined;
  const identitySubject = typeof identity?.subject_id === "string"
    ? query.get({ id: identity.subject_id, include_comparisons: false })?.record ?? null : null;
  const families = first ? testedEntities(first).flatMap((model) => model.links
    .filter((link) => ["family", "variant_of", "alias_of"].includes(link.relation))
    .map((link) => {
      const verified = snapshot.records.some((claim) => claim.kind === "claim" &&
        claim.attributes.field === `links:${link.relation}:${link.target_id}` &&
        claim.links.some((subject) => subject.relation === "subject" && subject.target_id === model.id) &&
        ["source_checked", "reproduced"].includes(claim.status) && claim.source_ids.length > 0 &&
        !!claim.attributes.source_locator);
      return { model: model.id, ...link, verified,
        target: verified ? query.get({ id: link.target_id })?.record ?? null : null };
    })) : [];
  // Reproduction receives raw lookup results, unlike compact query row references.
  const reproduction = evaluated ? reproductionSchema.safeParse(evaluated.attributes.reproduction) : null;
  const reproductionContext = evaluated?.links.map((link) => ({
    ...link, target: query.record(link.target_id) ?? null,
  })) ?? [];
  const recipeOwner = reproduction?.success ? query.record(reproduction.data.recipe_owner_id) ?? null : null;
  const reproductionSources = reproduction?.success
    ? snapshot.records.filter((source) => reproduction.data.source_ids.includes(source.id)) : [];
  const useCaseLinks = options.useCaseQuery?.links({ id }) ?? null;
  const useCaseConfigurations = [...new Set(useCaseLinks?.items.flatMap((link) => link.configuration_ids) ?? [])]
    .map((configurationId) => ({ id: configurationId, record: query.record(configurationId) ?? null }));
  // Exact metadata captures every transitive lookup, including baseline names.
  const metadata = recordSearchMetadata(record, snapshot.records);
  return JSON.parse(JSON.stringify({
    schema: 1, kind, id, release_id: snapshot.release_id, released_at: snapshot.released_at,
    coverage: snapshot.coverage, detail, results, evidence, identitySubject, families,
    reproductionContext, recipeOwner, reproductionSources, metadata, useCaseLinks, useCaseConfigurations,
  })) as Record<string, unknown>;
}
