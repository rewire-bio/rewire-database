import { catalogueText } from "./catalogue-text";
import { acronymCase, metricLabel } from "./metric-labels";
import { datasetEntities, testedEntities } from "./omics-browse";
import type { ResultRecordPage } from "./record-pages";
import type { CatalogueRecord } from "../shared/omics/catalogue-query";

/** A metric's display name with its recorded qualifier, e.g. "F1 (SNV only)". */
export function metricName(metric: string, qualifier?: string | null): string {
  return metricLabel(metric) + (qualifier?.trim() ? ` (${acronymCase(qualifier.trim())})` : "");
}

const text = (value: unknown) => (typeof value === "string" ? value : "");

/** A result's heading from what it measures: metric, tested model or method, and dataset.
 * Falls back to the recorded name when the context is not linked. */
export function resultTitle(
  result: Pick<CatalogueRecord, "name" | "attributes">,
  tested: Pick<CatalogueRecord, "name">[],
  datasets: Pick<CatalogueRecord, "name">[],
): string {
  const metric = text(result.attributes.metric);
  if (!metric || !tested.length) return catalogueText(result.name);
  const names = (records: Pick<CatalogueRecord, "name">[]) => records.map((record) => catalogueText(record.name)).join(", ");
  const label = metricName(metric, text(result.attributes.metric_qualifier) || null);
  return `${label} of ${names(tested)}${datasets.length ? ` on ${names(datasets)}` : ""}`;
}

/** An evaluation's `protocol` attribute is either a protocol record's ID or a
 * written procedure. An ID resolves to its record for a link; an unresolved ID
 * is not shown, since it tells a reader nothing. */
export function procedureReference<T extends Pick<CatalogueRecord, "id" | "kind" | "name">>(
  value: unknown,
  resolve: (id: string) => T | undefined,
): { record: T } | { text: string } | null {
  const procedure = text(value).trim();
  if (!procedure) return null;
  const record = resolve(procedure);
  if (record) return { record };
  return /^[a-z0-9]+(?:[-_.][a-z0-9]+)+$/i.test(procedure) && !/\s/.test(procedure) ? null : { text: procedure };
}

/** The heading and breadcrumb of a result page, from its first result row. */
export function resultPageTitle(page: Pick<ResultRecordPage, "detail" | "first">): string {
  const row = page.first;
  return resultTitle(page.detail.record, row ? testedEntities(row) : [], row ? datasetEntities(row) : []);
}
