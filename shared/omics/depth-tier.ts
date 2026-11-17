/** Depth tiers (#260). The depth tier sets how deeply a record is collected and refreshed:
 *   1: DNA and RNA genomic models, methods and use cases, and the benchmarks those use cases rely on
 *   2: protein models, methods, benchmarks and use cases
 *   3: everything else
 * Records carry no modality or lane field, so the rule reads `facets.areas`. The rule and its edge cases are in docs/tiers.md.
 * The stored `attributes.depth_tier` is what agents read; this module derives it for the backfill and
 * for the check that lists records whose stored tier differs from the rule. */

export type Tier = 1 | 2 | 3;
export const tierKinds = ["model", "method", "benchmark", "use_case"] as const;

/** Areas (data/vocab/area.ttl) that make a record genomic (lanes genomics and rna). */
export const genomicAreas = ["dna-genomes", "rna-transcriptomes"] as const;
/** Areas that make a record protein (lanes protein-fitness and structure-design). */
export const proteinAreas = ["proteins-complexes", "protein-function", "protein-structure"] as const;

type TierRecord = {
  id: string;
  kind: string;
  facets?: { areas?: string[] };
};

/** The tier the record's own areas give, or undefined when it has no areas. A record with
 * genomic and protein areas takes the lower tier number. */
export function areaTier(record: TierRecord): Tier | undefined {
  const areas = record.facets?.areas ?? [];
  if (areas.length === 0) return undefined;
  if (areas.some((a) => (genomicAreas as readonly string[]).includes(a))) return 1;
  if (areas.some((a) => (proteinAreas as readonly string[]).includes(a))) return 2;
  return 3;
}

/**
 * The tier the rule gives a record. A benchmark also takes the best (lowest) tier of the use
 * cases that judge one of its protocols or tasks relevant (`linkedUseCaseTiers`), so a genomic
 * use case's benchmarks are tier 1 whatever their own areas. `fallback` covers records
 * with no areas, which the rule cannot place; it is set by hand and recorded in the review.
 */
export function deriveTier(record: TierRecord, linkedUseCaseTiers: Tier[] = [], fallback?: Tier): Tier | undefined {
  const own = areaTier(record) ?? fallback;
  if (record.kind !== "benchmark" || linkedUseCaseTiers.length === 0) return own;
  const linked = Math.min(...linkedUseCaseTiers) as Tier;
  return own === undefined ? linked : (Math.min(own, linked) as Tier);
}
