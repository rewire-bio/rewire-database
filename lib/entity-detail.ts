import { notFound } from "next/navigation";
import type { PreparedCatalogue } from "../shared/omics/prepared-catalogue";
import { buildUseCases } from "./use-cases-build";
import { recordRouteKinds, type OmicsKind, type OmicsRecord } from "./omics";

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
 * for every kind; only whether a page chooses to render them differs. */
export function loadUseCaseContext(
  query: CatalogueQuery,
  record: Pick<OmicsRecord, "id">,
) {
  const useCaseLinks = buildUseCases().query.links({ id: record.id });
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
