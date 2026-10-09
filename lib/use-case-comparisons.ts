import type { ResolvedMapping } from "@/shared/omics/use-cases";
import type { CatalogueRecord } from "@/shared/omics/catalogue-query";

/** How a judgement asks the page to show its protocol (optional; older releases have none). */
type Presentation = { group: string; title: string; stratum_label?: string; stratum_order?: number; headline_metric?: string };
const presentationOf = (m: ResolvedMapping) => (m as ResolvedMapping & { presentation?: Presentation }).presentation;

export type ComparisonCell = {
  /** Printed value of the headline metric, exactly as recorded, or null when none was recorded. */
  printed: string | null;
  numeric: number | null;
  best: boolean;
  /** Other metrics of the same evaluation, for strata tables ("R 0.873 · P 0.986"). */
  secondary: { label: string; printed: string }[];
};
export type ComparisonRow = {
  id: string;
  /** The tool as the source printed it (reported_name), else the configuration's name. */
  name: string;
  /** The model, method or pipeline this configuration belongs to, for grouping tools across studies. */
  parentId: string | null;
  methodTypes: string[];
  origin: string | null;
  cells: ComparisonCell[];
};
export type ComparisonColumn = { label: string; metric: string; qualifier: string | null; direction: "higher" | "lower" | "unknown" };
export type Comparison = {
  id: string;
  title: string;
  /** What the protocol measures, from the judgement. */
  endpoint: string;
  /** Direct when every judgement in the group is direct, else proxy. */
  relevance: "direct" | "proxy";
  layout: "strata" | "metrics";
  headline: { metric: string; label: string; direction: "higher" | "lower" | "unknown" };
  columns: ComparisonColumn[];
  rows: ComparisonRow[];
  origins: string[];
  limitations: string[];
  protocols: CatalogueRecord[];
  mappingIds: string[];
};

const METRIC_LABELS: Record<string, string> = {
  "f1-score": "F1", recall: "Recall", precision: "Precision", sensitivity: "Sensitivity", specificity: "Specificity",
  auroc: "AUROC", auprc: "AUPRC", accuracy: "Accuracy", "spearman-correlation": "Spearman", "pearson-correlation": "Pearson",
};
const SHORT: Record<string, string> = { recall: "R", precision: "P", "f1-score": "F1", sensitivity: "Se", specificity: "Sp" };
export const metricLabel = (metric: string) => METRIC_LABELS[metric] ?? metric.replace(/-/g, " ");
const ORIGIN_LABELS: Record<string, string> = {
  author_reported: "Author-reported", independent_paper: "Independent study", rewire_run: "Rewire run",
  paper_compilation: "Compiled from papers", unreported: "Origin not reported",
};
export const originLabel = (origin: string) => ORIGIN_LABELS[origin] ?? origin.replace(/_/g, " ");
const METHOD_LABELS: Record<string, string> = {
  conventional_pipeline: "conventional", supervised_machine_learning: "machine learning",
  foundation_model: "foundation model", specialist: "specialist model", baseline: "baseline",
};
export const methodTypeLabel = (type: string) => METHOD_LABELS[type] ?? type.replace(/_/g, " ");

const text = (value: unknown) => (typeof value === "string" ? value : "");
const numberOf = (value: unknown) => {
  const n = typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
};
const direction = (value: unknown): ComparisonColumn["direction"] =>
  value === "higher" || value === "lower" ? value : "unknown";

type Measured = { metric: string; qualifier: string | null; printed: string; numeric: number | null; direction: ComparisonColumn["direction"] };
function measurements(evaluation: ResolvedMapping["evaluations"][number]): Measured[] {
  return evaluation.results.map(({ result }) => ({
    metric: text(result.attributes.metric),
    qualifier: text(result.attributes.metric_qualifier) || null,
    printed: text(result.attributes.printed_value),
    numeric: numberOf(result.attributes.numeric_value),
    direction: direction(result.attributes.metric_direction),
  }));
}

/** The metric a comparison leads with: the judgement's choice, else the commonest one. */
function headlineMetric(mappings: ResolvedMapping[]): string {
  const chosen = mappings.map((m) => presentationOf(m)?.headline_metric).find(Boolean);
  if (chosen) return chosen;
  const counts = new Map<string, number>();
  for (const m of mappings) for (const e of m.evaluations) for (const r of measurements(e)) counts.set(r.metric, (counts.get(r.metric) || 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? "";
}

/** Mark the best numeric value in each column, comparing only within that column. */
function markBest(rows: ComparisonRow[], columns: ComparisonColumn[]) {
  columns.forEach((column, i) => {
    if (column.direction === "unknown") return;
    const values = rows.map((row) => row.cells[i]?.numeric).filter((v): v is number => v !== null && v !== undefined);
    if (values.length < 2) return;
    const best = column.direction === "higher" ? Math.max(...values) : Math.min(...values);
    for (const row of rows) if (row.cells[i] && row.cells[i].numeric === best) row.cells[i].best = true;
  });
}

function rowBase(configuration: CatalogueRecord, evaluation: CatalogueRecord): Omit<ComparisonRow, "cells"> {
  const parent = configuration.links.find((l) => ["configuration_of", "family", "variant_of"].includes(l.relation));
  return {
    id: configuration.id,
    name: text(configuration.attributes.reported_name) || configuration.name,
    parentId: parent?.target_id ?? null,
    methodTypes: configuration.facets?.method_types ?? [],
    origin: text(evaluation.attributes.origin) || null,
  };
}

/** One comparison per presentation group (or per protocol), from the active judgements only.
 * Values are never compared across groups: each group has its own truth set and scoring. */
export function buildComparisons(mappings: ResolvedMapping[]): Comparison[] {
  const live = mappings.filter((m) => m.lifecycle === "active" && m.evaluations.length);
  const groups = new Map<string, ResolvedMapping[]>();
  for (const m of live) {
    const key = presentationOf(m)?.group ?? m.id;
    groups.set(key, [...(groups.get(key) || []), m]);
  }
  const comparisons: Comparison[] = [];
  for (const [id, members] of groups) {
    const ordered = [...members].sort((a, b) =>
      (presentationOf(a)?.stratum_order ?? 0) - (presentationOf(b)?.stratum_order ?? 0) || a.id.localeCompare(b.id));
    const presentation = presentationOf(ordered[0]);
    const title = presentation?.title ?? ordered[0].protocol?.name ?? ordered[0].endpoint ?? id;
    const headline = headlineMetric(ordered);
    const strata = ordered.length > 1 || ordered.some((m) => presentationOf(m)?.stratum_label);
    const rows = new Map<string, ComparisonRow>();
    let columns: ComparisonColumn[];
    let headlineDirection: ComparisonColumn["direction"] = "unknown";
    if (strata) {
      columns = ordered.map((m) => ({
        label: presentationOf(m)?.stratum_label ?? m.protocol?.name ?? m.id, metric: headline, qualifier: null, direction: "unknown",
      }));
      ordered.forEach((m, i) => {
        for (const e of m.evaluations) for (const configuration of e.configurations) {
          const measured = measurements(e);
          const lead = measured.find((r) => r.metric === headline);
          if (lead && lead.direction !== "unknown") { columns[i].direction = lead.direction; headlineDirection = lead.direction; }
          const row = rows.get(configuration.id) ?? { ...rowBase(configuration, e.evaluation), cells: columns.map(() => ({ printed: null, numeric: null, best: false, secondary: [] })) };
          row.cells[i] = {
            printed: lead?.printed ?? null, numeric: lead?.numeric ?? null, best: false,
            secondary: measured.filter((r) => r.metric !== headline).map((r) => ({ label: SHORT[r.metric] ?? metricLabel(r.metric), printed: r.printed })),
          };
          rows.set(configuration.id, row);
        }
      });
    } else {
      const m = ordered[0];
      const keys = new Map<string, ComparisonColumn>();
      for (const e of m.evaluations) for (const r of measurements(e)) {
        const key = `${r.metric}|${r.qualifier ?? ""}`;
        if (!keys.has(key)) keys.set(key, { label: metricLabel(r.metric) + (r.qualifier ? ` (${r.qualifier})` : ""), metric: r.metric, qualifier: r.qualifier, direction: r.direction });
      }
      columns = [...keys.values()].sort((a, b) => Number(b.metric === headline) - Number(a.metric === headline) || a.label.localeCompare(b.label));
      headlineDirection = columns[0]?.direction ?? "unknown";
      for (const e of m.evaluations) for (const configuration of e.configurations) {
        const measured = measurements(e);
        const row = rows.get(configuration.id) ?? { ...rowBase(configuration, e.evaluation), cells: columns.map(() => ({ printed: null, numeric: null, best: false, secondary: [] })) };
        columns.forEach((column, i) => {
          const r = measured.find((x) => x.metric === column.metric && x.qualifier === column.qualifier);
          if (r) row.cells[i] = { printed: r.printed, numeric: r.numeric, best: false, secondary: [] };
        });
        rows.set(configuration.id, row);
      }
    }
    const list = [...rows.values()];
    // Sort by the headline column (strata: the first stratum), best first; rows without a value last.
    const sign = headlineDirection === "lower" ? 1 : -1;
    list.sort((a, b) => {
      const x = a.cells[0]?.numeric, y = b.cells[0]?.numeric;
      if (x === null || x === undefined) return y === null || y === undefined ? a.name.localeCompare(b.name) : 1;
      if (y === null || y === undefined) return -1;
      return sign * (x - y) || a.name.localeCompare(b.name);
    });
    markBest(list, columns);
    comparisons.push({
      id, title, layout: strata ? "strata" : "metrics",
      endpoint: ordered[0].endpoint ?? "",
      relevance: ordered.every((m) => m.relevance === "direct") ? "direct" : "proxy",
      headline: { metric: headline, label: metricLabel(headline), direction: headlineDirection },
      columns, rows: list,
      origins: [...new Set(list.map((r) => r.origin).filter((o): o is string => !!o))],
      limitations: [...new Set(ordered.flatMap((m) => m.limitations))],
      protocols: ordered.map((m) => m.protocol).filter((p): p is CatalogueRecord => !!p),
      mappingIds: ordered.map((m) => m.id),
    });
  }
  return comparisons;
}

/** Judgements recorded but not shown as evidence, with the reason. */
export function heldJudgements(mappings: ResolvedMapping[]) {
  return mappings
    .filter((m) => m.lifecycle !== "active" && !["withdrawn", "superseded"].includes(m.lifecycle))
    .map((m) => ({ id: m.id, title: presentationOf(m)?.title ?? m.protocol?.name ?? m.id, lifecycle: m.lifecycle, reason: m.reason, endpoint: m.endpoint ?? "" }));
}

/** Every tool in the shown comparisons, once, with its method types. */
export function toolsCompared(comparisons: Comparison[]) {
  const tools = new Map<string, { id: string; name: string; methodTypes: string[] }>();
  for (const c of comparisons) for (const r of c.rows) {
    const key = r.parentId ?? r.id;
    if (!tools.has(key)) tools.set(key, { id: key, name: r.name, methodTypes: r.methodTypes });
  }
  return [...tools.values()].sort((a, b) => a.name.localeCompare(b.name));
}
