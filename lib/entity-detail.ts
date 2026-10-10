import { notFound } from "next/navigation";
import type { PreparedCatalogue } from "../shared/omics/prepared-catalogue";
import { buildUseCases } from "./use-cases-build";
import { recordRouteKinds, type OmicsKind, type OmicsRecord } from "./omics";
import { resultMatrix } from "./result-matrix";

type CatalogueQuery = PreparedCatalogue;
export type RecordDetail = NonNullable<ReturnType<CatalogueQuery["get"]>>;

/** 404 guard shared by every kind page: looks up the record and rejects a URL
 * segment that does not match one of its canonical or alias kinds. */
export function getDetailOr404(
  query: CatalogueQuery,
  kind: OmicsKind,
  id: string,
): RecordDetail {
  const detail = query.get({ id, include_comparisons: false });
  if (!detail || !recordRouteKinds(detail.record).some((k) => k === kind))
    notFound();
  return detail;
}

/** Use-case backlinks and the configurations they cite are identical plumbing
 * for every kind; only whether a page chooses to render them differs. A parent
 * record also shows the use cases its linked configurations inform. */
export function loadUseCaseContext(
  query: CatalogueQuery,
  record: Pick<OmicsRecord, "id">,
  related: Pick<OmicsRecord, "id">[] = [],
) {
  const useCases = buildUseCases().query;
  const own = useCases.links({ id: record.id });
  const seen = new Set(own.items.map((link) => link.mapping_id));
  const useCaseLinks = {
    ...own,
    items: [
      ...own.items,
      ...related.flatMap((item) =>
        useCases.links({ id: item.id }).items.filter((link) => !seen.has(link.mapping_id) && !!seen.add(link.mapping_id)),
      ),
    ],
  };
  const useCaseConfigurations = Object.fromEntries(
    [...new Set(useCaseLinks.items.flatMap((link) => link.configuration_ids))]
      .flatMap((id) => {
        const configuration = query.record(id);
        return configuration ? [[id, configuration]] : [];
      }),
  );
  return { useCaseLinks, useCaseConfigurations };
}

/** A sourced claim of the form `links:<relation>:<target>` on `subject`,
 * reviewed enough to show as a verified relationship rather than a raw link. */
export function verifiedAssociation(
  query: Pick<CatalogueQuery, "verifiedAssociation">,
  subject: string,
  relation: string,
  target: string,
): boolean {
  return query.verifiedAssociation(subject, relation, target);
}

/** The record with the records its search metadata names: link targets and sources. */
export function relatedRecords(query: Pick<CatalogueQuery, "record">, record: OmicsRecord): OmicsRecord[] {
  const ids = new Set([...record.links.map((link) => link.target_id), ...record.source_ids]);
  return [
    record,
    ...[...ids].sort().flatMap((id) => {
      const found = query.record(id);
      return found ? [found as OmicsRecord] : [];
    }),
  ];
}

/** Relations whose records carry results for a parent that holds none of its
 * own: a model's or method's configurations and versions, the protocols and
 * tasks of a benchmark, and the implementation a baseline names. The results
 * stay on those records; the parent page lists them with their counts. */
const childRelations = ["configuration_of", "variant_of", "family", "alias_of", "uses_model", "part_of", "evaluates_task"];
const parentRelations = ["implemented_by"];
/** Counting a record's results reads its rows, so a parent lists at most this many. */
export const LINKED_RESULTS_LIMIT = 40;

export function linkedResultRecords(
  query: Pick<CatalogueQuery, "results">,
  detail: Pick<RecordDetail, "direct" | "reverse">,
) {
  const candidates = [
    ...detail.reverse.filter((item) => childRelations.includes(item.relation)),
    ...detail.direct.filter((item) => parentRelations.includes(item.relation)),
  ];
  const seen = new Set<string>();
  const unique = candidates.filter((item) => !seen.has(item.record.id) && !!seen.add(item.record.id));
  const items = unique.slice(0, LINKED_RESULTS_LIMIT).flatMap((item) => {
    const page = query.results({ id: item.record.id, limit: 1 });
    return page.total
      ? [{ record: item.record, relation: item.relation, results: page.total, evaluations: page.evaluation_count }]
      : [];
  });
  return { items, unchecked: Math.max(0, unique.length - LINKED_RESULTS_LIMIT) };
}

/** Pivot pages read at most this many result rows (one page of the query). */
export const MATRIX_ROWS_LIMIT = 100;

/** One row per configuration and one column per metric when every result fits one read. */
export function loadResultMatrix(query: Pick<CatalogueQuery, "results">, id: string, total: number) {
  if (total < 2 || total > MATRIX_ROWS_LIMIT) return null;
  return resultMatrix(query.results({ id, limit: MATRIX_ROWS_LIMIT }).items);
}

/** Descriptions that only say where a configuration was run, not what it does
 * (rewire-benchmark-data#88), for example "Kraken2 as run in Portik et al. 2022." */
export function provenanceOnly(description: string): boolean {
  return /\bas (?:run|evaluated|reported|used|benchmarked|configured) (?:in|by)\b/i.test(description) ||
    /\bquoted in\b|\bnot a new execution\b|identified in the cited primary source|candidate catalogue entry|identity as reported in this source/i.test(description);
}
