import { legacyKinds } from "../services/omics/src/entity-kinds";
import type { UseCaseDetail } from "../services/omics/src/use-cases";
import { buildCatalogue } from "./catalogue-build";
import { accumulateUseCaseDetail, buildUseCases } from "./use-cases-build";
import {
  omicsKinds,
  recordRouteKinds,
  type OmicsCatalogue,
  type OmicsKind,
  type OmicsRecord,
} from "./omics";
import { legacyAliasRecords } from "./entity-detail";

/** One fixed, published use case with a small, already-bounded evidence graph
 * (curated mappings, not an unbounded reverse-link traversal — see
 * workbench/pr-smoke-export-checkpoint.md for the measured size). BRCA1/BRCA2
 * germline interpretation was chosen because every PR branch review needs a
 * clinically meaningful page to actually look at, and because its graph is
 * small: 10 mappings, 10 evaluations, 48 results, 8 configurations, 10
 * protocols, 7 datasets, 6 sources at the time this was measured. */
export const SMOKE_USE_CASE_SLUG = "brca1-brca2-germline-interpretation";

/** How many of a kind's own records to render even when nothing else selects
 * them, so every entity kind has at least one real, non-empty page in a PR
 * smoke build regardless of what the fixed use case happens to touch. */
const PER_KIND_REPRESENTATIVES = 2;

export function isSmokeExport(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.OMICS_SMOKE_EXPORT === "true";
}

export interface SmokeSelection {
  /** Ids to render under each URL segment (kind), including alias ids for the
   * three legacy segments that serve records of a different native kind. */
  idsByKind: Record<OmicsKind, Set<string>>;
  /** Which use-case slugs get a generated detail page. */
  useCaseSlugs: Set<string>;
  /** Why each kind's ids were selected, for the manifest and for review. */
  reasons: {
    useCase: { slug: string; recordIds: Record<OmicsKind, string[]> } | null;
    perKindRepresentatives: Record<OmicsKind, string[]>;
    aliasShapeRepresentatives: { segment: OmicsKind; sourceKind: OmicsKind; id: string }[];
  };
}

function add(target: Record<OmicsKind, Set<string>>, kind: OmicsKind, id: string) {
  target[kind].add(id);
}

function emptyByKind(): Record<OmicsKind, Set<string>> {
  return Object.fromEntries(omicsKinds.map((kind) => [kind, new Set<string>()])) as Record<
    OmicsKind,
    Set<string>
  >;
}

/** The use case's own evidence graph: mappings, their protocol/task, every
 * evaluation and its configurations, every result row and the models,
 * benchmarks, datasets and sources that row cites, plus every source cited
 * directly by the use case or a mapping. This is exactly the bounded,
 * already-curated structure `fullUseCaseDetail` resolves — not a reverse-link
 * walk, which is the unbounded traversal the brief warned against. */
function addUseCaseGraph(
  catalogue: Pick<OmicsCatalogue, "records">,
  target: Record<OmicsKind, Set<string>>,
  detail: UseCaseDetail,
): Record<OmicsKind, string[]> {
  const byId = new Map(catalogue.records.map((r) => [r.id, r]));
  const touched: Record<string, Set<string>> = {};
  const record = (r: Pick<OmicsRecord, "id" | "kind">) => {
    add(target, r.kind, r.id);
    (touched[r.kind] ||= new Set()).add(r.id);
  };
  for (const citation of detail.use_case.citations) {
    const source = byId.get(citation.source_id);
    if (source) record(source);
  }
  for (const mapping of detail.mappings) {
    for (const citation of mapping.citations) {
      const source = byId.get(citation.source_id);
      if (source) record(source);
    }
    if (mapping.protocol) record(mapping.protocol);
    if (mapping.task) record(mapping.task);
    for (const source of mapping.sources) record(source);
    for (const evaluation of mapping.evaluations) {
      record(evaluation.evaluation);
      for (const configuration of evaluation.configurations) record(configuration);
      for (const row of evaluation.results) {
        record(row.result);
        for (const kind of [
          "models", "benchmarks", "methods", "configurations", "pipelines",
          "services", "tasks", "protocols", "evaluators", "datasets",
          "dataset_subsets", "sources",
        ] as const) {
          for (const linked of row[kind] || []) record(linked);
        }
      }
    }
  }
  // Bounded one hop, forward from the graph just built: the claim records
  // that review a `links:*` assertion *on* one of these records (the same
  // claims `verifiedAssociation` checks when rendering their pages). Not a
  // reverse walk over the whole catalogue — only claims whose own subject
  // link already points at a record this use case touched.
  const touchedIds = new Set(Object.values(touched).flatMap((ids) => [...ids]));
  for (const candidate of catalogue.records) {
    if (
      candidate.kind === "claim" &&
      candidate.links.some((link) => link.relation === "subject" && touchedIds.has(link.target_id))
    )
      record(candidate);
  }
  return Object.fromEntries(
    Object.entries(touched).map(([kind, ids]) => [kind, [...ids].sort()]),
  ) as Record<OmicsKind, string[]>;
}

/** Two of each kind's own records, chosen by sorting ids ascending — fixed by
 * the data, not by iteration order or `Math.random`, so the same release
 * always yields the same PR smoke export. */
function addPerKindRepresentatives(
  catalogue: Pick<OmicsCatalogue, "records">,
  target: Record<OmicsKind, Set<string>>,
): Record<OmicsKind, string[]> {
  const chosen: Record<string, string[]> = {};
  for (const kind of omicsKinds) {
    const ids = catalogue.records
      .filter((record) => record.kind === kind)
      .map((record) => record.id)
      .sort()
      .slice(0, PER_KIND_REPRESENTATIVES);
    for (const id of ids) add(target, kind, id);
    chosen[kind] = ids;
  }
  return chosen as Record<OmicsKind, string[]>;
}

/** One record per distinct (legacy segment, aliased kind) pair actually
 * present in this release, chosen deterministically (lowest id), so every
 * alias route *shape* the split added (model<-configuration, model<-dataset,
 * benchmark<-task, dataset<-dataset_subset, ...) renders at least once. Both
 * the alias path and the record's own canonical path are included. */
function addAliasShapeRepresentatives(
  catalogue: Pick<OmicsCatalogue, "records">,
  target: Record<OmicsKind, Set<string>>,
): { segment: OmicsKind; sourceKind: OmicsKind; id: string }[] {
  const picked: { segment: OmicsKind; sourceKind: OmicsKind; id: string }[] = [];
  for (const segment of legacyKinds) {
    const aliases = legacyAliasRecords(catalogue, segment);
    const bySourceKind = new Map<OmicsKind, OmicsRecord[]>();
    for (const record of aliases) {
      const list = bySourceKind.get(record.kind) || [];
      list.push(record);
      bySourceKind.set(record.kind, list);
    }
    for (const [sourceKind, records] of bySourceKind) {
      const [first] = [...records].sort((a, b) => a.id.localeCompare(b.id));
      add(target, segment, first.id);
      add(target, sourceKind, first.id);
      picked.push({ segment, sourceKind, id: first.id });
    }
  }
  return picked;
}

let cached: { catalogue: OmicsCatalogue; value: SmokeSelection } | undefined;

export function computeSmokeSelection(
  catalogue: OmicsCatalogue,
  useCaseDetail: UseCaseDetail | null,
): SmokeSelection {
  const idsByKind = emptyByKind();
  const useCaseGraph = useCaseDetail ? addUseCaseGraph(catalogue, idsByKind, useCaseDetail) : null;
  const perKindRepresentatives = addPerKindRepresentatives(catalogue, idsByKind);
  const aliasShapeRepresentatives = addAliasShapeRepresentatives(catalogue, idsByKind);
  return {
    idsByKind,
    useCaseSlugs: new Set(useCaseDetail ? [useCaseDetail.use_case.slug] : []),
    reasons: {
      useCase: useCaseDetail
        ? { slug: useCaseDetail.use_case.slug, recordIds: useCaseGraph! }
        : null,
      perKindRepresentatives,
      aliasShapeRepresentatives,
    },
  };
}

/** Memoized per release, like `buildUseCases()`: every one of the 16 kind
 * pages and the use-case page call this once per build. Returns null outside
 * a smoke export, so callers can `?? ids` straight through unchanged. */
export function getSmokeSelection(): SmokeSelection | null {
  if (!isSmokeExport()) return null;
  const { catalogue } = buildCatalogue();
  if (!cached || cached.catalogue !== catalogue) {
    const useCases = buildUseCases();
    if (!useCases.entries.some((entry) => entry.slug === SMOKE_USE_CASE_SLUG))
      throw new Error(
        `OMICS_SMOKE_EXPORT is set but the fixed use case "${SMOKE_USE_CASE_SLUG}" is not published in this release. ` +
          "Update SMOKE_USE_CASE_SLUG in lib/smoke-selection.ts to a currently published slug rather than silently building without use-case coverage.",
      );
    const detail = accumulateUseCaseDetail(useCases.query, SMOKE_USE_CASE_SLUG);
    if (!detail) throw new Error(`Use case "${SMOKE_USE_CASE_SLUG}" is listed but failed to resolve`);
    cached = { catalogue, value: computeSmokeSelection(catalogue, detail) };
  }
  return cached.value;
}

/** Drop-in filter for a kind page's `generateStaticParams`: returns `ids`
 * unchanged outside a smoke export, otherwise keeps only the selected ones. */
export function filterIdsForSmoke(kind: OmicsKind, ids: string[]): string[] {
  const selection = getSmokeSelection();
  if (!selection) return ids;
  const allowed = selection.idsByKind[kind];
  return ids.filter((id) => allowed.has(id));
}

/** Drop-in filter for the use-case page's `generateStaticParams`. */
export function filterSlugsForSmoke(slugs: string[]): string[] {
  const selection = getSmokeSelection();
  if (!selection) return slugs;
  return slugs.filter((slug) => selection.useCaseSlugs.has(slug));
}

/** Every real canonical and alias `/database/<kind>/<id>/` path, plus every
 * real `/use-cases/<slug>/` path, computed from the complete pinned catalogue
 * — independent of a smoke export's selection. Used by the export checkers to
 * tell a link to a real-but-unselected page (legitimately omitted from a
 * smoke sample) apart from a link to an id that is not in the catalogue at
 * all (a genuine bug, in every mode). */
export function knownCataloguePaths(
  records: Pick<OmicsRecord, "id" | "kind" | "attributes">[],
  useCaseSlugs: Iterable<string>,
): Set<string> {
  const paths = new Set<string>();
  for (const record of records)
    for (const kind of recordRouteKinds(record)) paths.add(`/database/${kind}/${record.id}/`);
  paths.add("/use-cases/");
  for (const slug of useCaseSlugs) paths.add(`/use-cases/${slug}/`);
  return paths;
}
