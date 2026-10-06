import { notFound } from "next/navigation";
import type { createCatalogueQuery } from "../services/omics/src/catalogue-query";
import { buildUseCases } from "./use-cases-build";
import { recordRouteKinds, type OmicsCatalogue, type OmicsKind, type OmicsRecord } from "./omics";

type CatalogueQuery = ReturnType<typeof createCatalogueQuery>;
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
  catalogue: Pick<OmicsCatalogue, "records">,
  subject: string,
  relation: string,
  target: string,
): boolean {
  return catalogue.records.some(
    (item) =>
      item.kind === "claim" &&
      item.attributes.field === `links:${relation}:${target}` &&
      item.links.some(
        (link) => link.relation === "subject" && link.target_id === subject,
      ) &&
      ["source_checked", "reproduced"].includes(item.status) &&
      item.source_ids.length > 0 &&
      !!item.attributes.source_locator,
  );
}

/** Aliased records a legacy kind segment must keep serving: every record whose
 * current kind differs from `segment` but whose `legacy_kinds` still names it. */
export function legacyAliasRecords(
  catalogue: Pick<OmicsCatalogue, "records">,
  segment: OmicsKind,
): OmicsRecord[] {
  return catalogue.records.filter(
    (record) =>
      record.kind !== segment &&
      recordRouteKinds(record).includes(segment),
  );
}
