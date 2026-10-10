import { catalogueText } from "./catalogue-text";
import type { CatalogueRecord } from "../shared/omics/catalogue-query";

// Local stand-in for lib/metric-labels.ts (QA fixer A, issue #145). Replace
// this mapping with an import from that module once it is on main.
const METRIC_LABELS: Record<string, string> = {
  "f1-score": "F1", "f1-max": "F1 max", "macro-f1": "Macro F1", "weighted-f1": "Weighted F1", "f-beta-score": "F-beta score",
  auroc: "AUROC", auprc: "AUPRC", "auprc-ratio": "AUPRC ratio", ndcg: "NDCG", lddt: "lDDT", "tm-score": "TM-score",
  "gdt-ts": "GDT-TS", dockq: "DockQ", rmsd: "RMSD", "root-mean-squared-error": "RMSE", "mean-absolute-error": "MAE",
  "matthews-correlation-coefficient": "MCC", "spearman-correlation": "Spearman correlation",
  "pearson-correlation": "Pearson correlation", "coefficient-of-determination": "R²", "cohens-d": "Cohen's d",
  "negative-predictive-value": "Negative predictive value", "positive-predictive-value": "Positive predictive value",
};
/** Codes that keep their capitals wherever they appear in a metric or qualifier. */
const ACRONYMS = /\b(auroc|auprc|auc|ndcg|capri|bp4|pp3|vus|mcc|rmsd|rmse|mae|snv|cnv|sv|ppv|npv|roc|dna|rna|wgs|wes|ari|nmi|asw|pcr|casp|vcc)\b/gi;

/** A reader-facing metric name: a known label, else the slug in words with acronyms capitalised. */
export function metricLabel(metric: string, qualifier?: string | null): string {
  const base = METRIC_LABELS[metric] ?? sentence(metric.replace(/-/g, " ").replace(ACRONYMS, (code) => code.toUpperCase()));
  const extra = qualifier?.trim() ? ` (${qualifier.trim().replace(ACRONYMS, (code) => code.toUpperCase())})` : "";
  return base + extra;
}

function sentence(text: string): string {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
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
  const label = metricLabel(metric, text(result.attributes.metric_qualifier) || null);
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
