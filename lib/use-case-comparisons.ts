import type { ResolvedMapping } from "@/shared/omics/use-cases";
import type { CatalogueRecord } from "@/shared/omics/catalogue-query";
import { recordHref } from "@/lib/omics";
import { acronymCase, metricLabel } from "@/lib/metric-labels";
import { columnDecimals, formatReading, readValue, type Reading } from "@/lib/use-case-values";

/** How a judgement asks the page to show its protocol (optional; older releases have none). */
type Presentation = { group: string; title: string; stratum_label?: string; stratum_order?: number; headline_metric?: string };
const presentationOf = (m: ResolvedMapping) => (m as ResolvedMapping & { presentation?: Presentation }).presentation;

/** A value as the page shows it, with the printed value (and any source note) in `title` when they differ. */
export type ShownValue = { text: string; title?: string; missing: boolean };
export type ComparisonCell = {
  /** Printed value of the headline metric, exactly as recorded, or null when none was recorded. */
  printed: string | null;
  numeric: number | null;
  best: boolean;
  /** The value formatted for its column (see use-case-values). */
  shown: ShownValue;
  /** What the value applies to, when the evaluation reports the headline metric more than once ("sample A"). */
  qualifier: string | null;
  /** Other metrics of the same evaluation, for strata tables ("R 0.873", "Count (sample A) 12"). */
  secondary: (ShownValue & { label: string })[];
};
export type ComparisonRow = {
  id: string;
  /** The tool as the source printed it (reported_name), else the configuration's name. */
  name: string;
  /** What tells this row apart from others with the same name in its table (from the configuration's name). */
  detail: string | null;
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
  /** What the protocol measures, from the judgement; empty when the columns have different endpoints. */
  endpoint: string;
  /** Each column's own endpoint, when the columns come from judgements with different endpoints. */
  columnEndpoints: { label: string; endpoint: string }[];
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
  /** One-line explanations of the abbreviations and uncertainty notation used in the table. */
  legend: string[];
};

const SHORT: Record<string, string> = { recall: "R", precision: "P", "f1-score": "F1", sensitivity: "Se", specificity: "Sp" };
const SHORT_MEANING: Record<string, string> = { R: "recall", P: "precision", Se: "sensitivity", Sp: "specificity" };
/** Metrics that mean nothing without their qualifier ("count of what?"). */
const GENERIC = new Set(["count", "proportion"]);
const UNCERTAINTY: Record<string, string> = {
  standard_deviation: "± is a standard deviation.",
  standard_error: "The value after ± or in brackets is a standard error.",
  confidence_interval: "Ranges in brackets are confidence intervals.",
  credible_interval: "Ranges in brackets are credible intervals.",
  unresolved_spread: "The source does not say whether ± is a standard deviation, a standard error or a range.",
};
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

type Measured = {
  metric: string; qualifier: string | null; printed: string; numeric: number | null; direction: ComparisonColumn["direction"];
  unit: string | null; uncertainty: string | null; anomaly: string | null; undefinedReason: string | null;
};
function measurements(evaluation: ResolvedMapping["evaluations"][number]): Measured[] {
  return evaluation.results.map(({ result }) => {
    const a = result.attributes;
    return {
      metric: text(a.metric),
      qualifier: text(a.metric_qualifier) || null,
      printed: text(a.printed_value),
      numeric: numberOf(a.numeric_value),
      direction: direction(a.metric_direction),
      unit: text(a.unit) || null,
      uncertainty: text((a.uncertainty as { type?: unknown } | undefined)?.type) || null,
      anomaly: text(a.source_anomaly) || null,
      undefinedReason: text(a.undefined_reason) || null,
    };
  });
}

/** Metrics printed as a percentage anywhere on the page; their fractions are shown as percentages too. */
// Metrics that differ only in a threshold ("sensitivity at 95% / 98% specificity") share one scale.
const scaleKey = (metric: string) => metric.replace(/-at-\d+(?:-\d+)?-percent-/, "-at-n-percent-");
function percentMetrics(mappings: ResolvedMapping[]) {
  const metrics = new Set<string>();
  for (const m of mappings) for (const e of m.evaluations) for (const r of measurements(e))
    if (r.unit === "percent" && r.numeric !== null) metrics.add(scaleKey(r.metric));
  return metrics;
}

type Draft = ComparisonCell & { reading: Reading | null };
const NOT_REPORTED: ShownValue = { text: "Not reported", missing: true };
const emptyCell = (): Draft => ({ printed: null, numeric: null, best: false, shown: NOT_REPORTED, qualifier: null, secondary: [], reading: null });

/** What each qualifier adds over the others: first the "; "-separated segments they do not share,
 * then the words between their shared opening and closing words ("25 genes" from "candidate gene
 * set of 25 genes including the causative gene"). A lone differing word keeps one neighbour, so a
 * number keeps its noun ("25 genes") and an identifier its label ("sample SRR11012403"). */
function distinguishing(qualifiers: string[]) {
  const parts = qualifiers.map((q) => q.split(/;\s*/));
  const segments = parts.map((p, i) => p.filter((segment) => !parts.every((other) => other.includes(segment))).join("; ") || qualifiers[i]);
  if (new Set(segments).size < 2) return segments;
  const words = segments.map((s) => s.split(" "));
  const shortest = Math.min(...words.map((w) => w.length));
  let head = 0, tail = 0;
  while (head < shortest && words.every((w) => w[head] === words[0][head])) head++;
  while (tail < shortest - head && words.every((w) => w[w.length - 1 - tail] === words[0][words[0].length - 1 - tail])) tail++;
  if (!head && !tail) return segments;
  return words.map((w, i) => {
    let start = head, end = w.length - tail;
    if (end - start < 1) return segments[i];
    if (end - start === 1) {
      if (/^\d/.test(w[start]) && end < w.length) end++;
      else if (start > 0) start--;
    }
    // "(reads >0)" is shown inside the label's own brackets, so drop its outer pair.
    return w.slice(start, end).join(" ").replace(/^\(([^()]*)\)$/, "$1");
  });
}

/** The other metrics of one evaluation, each labelled with what tells it apart and with its unit. */
function secondaryValues(measured: Measured[], percent: Set<string>): Draft["secondary"] {
  const repeated = (metric: string) => measured.filter((r) => r.metric === metric).length > 1;
  const byMetric = new Map<string, string[]>();
  for (const r of measured) if (r.qualifier && repeated(r.metric)) byMetric.set(r.metric, [...(byMetric.get(r.metric) || []), r.qualifier]);
  const own = new Map([...byMetric].map(([metric, qualifiers]) => [metric, distinguishing(qualifiers)]));
  return measured.map((r) => {
    const name = SHORT[r.metric] ?? metricLabel(r.metric);
    const qualifier = repeated(r.metric) && r.qualifier ? own.get(r.metric)!.shift()! : GENERIC.has(r.metric) ? r.qualifier : null;
    const shown = formatReading(readValue(r, percent.has(scaleKey(r.metric))));
    const title = [r.qualifier && r.qualifier !== qualifier ? r.qualifier : "", shown.title].filter(Boolean).join(". ") || undefined;
    return { label: qualifier ? `${name} (${acronymCase(qualifier)})` : name, text: shown.text, missing: shown.missing, ...(title ? { title } : {}) };
  });
}

/** The abbreviations and uncertainty notation a table uses, explained once below it. */
function legendFor(rows: ComparisonRow[], measured: Measured[]) {
  const used = new Set(rows.flatMap((r) => r.cells.flatMap((c) => c.secondary.map((s) => s.label.split(" (")[0]))));
  const short = Object.entries(SHORT_MEANING).filter(([abbr]) => used.has(abbr)).map(([abbr, meaning]) => `${abbr} ${meaning}`);
  const lines = short.length ? [`${short.join(", ")}.`] : [];
  // Only uncertainty the table prints next to a value needs explaining.
  const printedSpread = (r: Measured) => /±|\(\s*[-−+]?\d/.test(r.printed);
  const types = new Set(measured.filter(printedSpread).map((r) => r.uncertainty).filter((t): t is string => !!t));
  for (const type of types) if (UNCERTAINTY[type]) lines.push(UNCERTAINTY[type]);
  if (measured.some((r) => !r.uncertainty && r.printed.includes("±"))) lines.push(UNCERTAINTY.unresolved_spread);
  return [...new Set(lines)];
}

const CITATION = /\s*\((?:[^()]*\bet al\b[^()]*|[^()]*\b(?:19|20)\d{2}[a-z]?)\)$/;
/** For rows that share a printed name, what their configuration names add (database, threshold, backbone). */
function distinguishRows(rows: ComparisonRow[], configurationNames: Map<string, string>) {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.name, (counts.get(r.name) || 0) + 1);
  for (const r of rows) {
    if ((counts.get(r.name) || 0) < 2) continue;
    let detail = (configurationNames.get(r.id) ?? "").replace(CITATION, "");
    if (detail.startsWith(r.name)) detail = detail.slice(r.name.length).replace(/^[\s,;:]+/, "");
    r.detail = detail && detail !== r.name ? detail : null;
  }
}

/** The metric a comparison leads with: the judgement's choice, else the commonest one. */
function headlineMetric(mappings: ResolvedMapping[]): string {
  const chosen = mappings.map((m) => presentationOf(m)?.headline_metric).find(Boolean);
  if (chosen) return chosen;
  const counts = new Map<string, number>();
  for (const m of mappings) for (const e of m.evaluations) for (const r of measurements(e)) counts.set(r.metric, (counts.get(r.metric) || 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? "";
}

const valueOf = (cell: ComparisonCell | undefined) => (cell as Draft | undefined)?.reading?.value ?? null;

/** Mark the best numeric value in each column, comparing only within that column, on the display scale. */
function markBest(rows: ComparisonRow[], columns: ComparisonColumn[]) {
  columns.forEach((column, i) => {
    if (column.direction === "unknown") return;
    const values = rows.map((row) => valueOf(row.cells[i])).filter((v): v is number => v !== null);
    if (values.length < 2) return;
    const best = column.direction === "higher" ? Math.max(...values) : Math.min(...values);
    for (const row of rows) if (valueOf(row.cells[i]) === best) row.cells[i].best = true;
  });
}

/** Format each column to one number of decimals, then drop the working readings. */
function finishCells(rows: ComparisonRow[], columns: ComparisonColumn[]) {
  columns.forEach((_, i) => {
    const cells = rows.map((row) => row.cells[i] as Draft);
    const decimals = columnDecimals(cells.map((c) => c.reading));
    for (const cell of cells) {
      if (cell.reading) cell.shown = formatReading(cell.reading, decimals);
      delete (cell as Partial<Draft>).reading;
    }
  });
}

function rowBase(configuration: CatalogueRecord, evaluation: CatalogueRecord): Omit<ComparisonRow, "cells"> {
  const parent = configuration.links.find((l) => ["configuration_of", "family", "variant_of"].includes(l.relation));
  return {
    id: configuration.id,
    name: text(configuration.attributes.reported_name) || configuration.name,
    detail: null,
    parentId: parent?.target_id ?? null,
    methodTypes: configuration.facets?.method_types ?? [],
    origin: text(evaluation.attributes.origin) || null,
  };
}

/** One comparison per presentation group (or per protocol), from the active judgements only.
 * Values are never compared across groups: each group has its own truth set and scoring. */
export function buildComparisons(mappings: ResolvedMapping[]): Comparison[] {
  const live = mappings.filter((m) => m.lifecycle === "active" && m.evaluations.length);
  const percent = percentMetrics(live);
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
    const configurationNames = new Map<string, string>();
    const shownMeasures: Measured[] = [];
    let columns: ComparisonColumn[];
    let headlineDirection: ComparisonColumn["direction"] = "unknown";
    if (strata) {
      columns = ordered.map((m) => ({
        label: presentationOf(m)?.stratum_label ?? m.protocol?.name ?? m.id, metric: headline, qualifier: null, direction: "unknown",
      }));
      ordered.forEach((m, i) => {
        for (const e of m.evaluations) for (const configuration of e.configurations) {
          const measured = measurements(e);
          shownMeasures.push(...measured);
          configurationNames.set(configuration.id, configuration.name);
          const leads = measured.filter((r) => r.metric === headline);
          const lead = leads[0];
          if (lead && lead.direction !== "unknown") { columns[i].direction = lead.direction; headlineDirection = lead.direction; }
          const row = rows.get(configuration.id) ?? { ...rowBase(configuration, e.evaluation), cells: columns.map(emptyCell) };
          const cell: Draft = {
            ...emptyCell(), printed: lead?.printed ?? null, numeric: lead?.numeric ?? null,
            reading: lead ? readValue(lead, percent.has(scaleKey(lead.metric))) : null,
            qualifier: leads.length > 1 && lead.qualifier ? acronymCase(distinguishing(leads.map((r) => r.qualifier ?? ""))[0]) : null,
            secondary: secondaryValues(measured.filter((r) => r !== lead), percent),
          };
          row.cells[i] = cell;
          rows.set(configuration.id, row);
        }
      });
    } else {
      const m = ordered[0];
      const keys = new Map<string, ComparisonColumn>();
      for (const e of m.evaluations) for (const r of measurements(e)) {
        const key = `${r.metric}|${r.qualifier ?? ""}`;
        if (!keys.has(key)) keys.set(key, { label: metricLabel(r.metric) + (r.qualifier ? ` (${acronymCase(r.qualifier)})` : ""), metric: r.metric, qualifier: r.qualifier, direction: r.direction });
      }
      columns = [...keys.values()].sort((a, b) => Number(b.metric === headline) - Number(a.metric === headline) || a.label.localeCompare(b.label));
      headlineDirection = columns[0]?.direction ?? "unknown";
      for (const e of m.evaluations) for (const configuration of e.configurations) {
        const measured = measurements(e);
        shownMeasures.push(...measured);
        configurationNames.set(configuration.id, configuration.name);
        const row = rows.get(configuration.id) ?? { ...rowBase(configuration, e.evaluation), cells: columns.map(emptyCell) };
        columns.forEach((column, i) => {
          const r = measured.find((x) => x.metric === column.metric && x.qualifier === column.qualifier);
          if (r) row.cells[i] = { ...emptyCell(), printed: r.printed, numeric: r.numeric, reading: readValue(r, percent.has(scaleKey(r.metric))) } as Draft;
        });
        rows.set(configuration.id, row);
      }
    }
    const list = [...rows.values()];
    // Sort by the headline column (strata: the first stratum), best first; rows without a value last.
    const sign = headlineDirection === "lower" ? 1 : -1;
    list.sort((a, b) => {
      const x = valueOf(a.cells[0]), y = valueOf(b.cells[0]);
      if (x === null) return y === null ? a.name.localeCompare(b.name) : 1;
      if (y === null) return -1;
      return sign * (x - y) || a.name.localeCompare(b.name);
    });
    markBest(list, columns);
    finishCells(list, columns);
    distinguishRows(list, configurationNames);
    // Strata come from separate judgements; one stratum's endpoint must not caption the whole table.
    const endpoints = ordered.map((m) => m.endpoint ?? "");
    const shared = endpoints.every((e) => e === endpoints[0]);
    comparisons.push({
      id, title, layout: strata ? "strata" : "metrics",
      endpoint: shared ? endpoints[0] : "",
      columnEndpoints: shared ? [] : columns.map((column, i) => ({ label: column.label, endpoint: endpoints[i] })).filter((c) => c.endpoint),
      relevance: ordered.every((m) => m.relevance === "direct") ? "direct" : "proxy",
      headline: { metric: headline, label: metricLabel(headline), direction: headlineDirection },
      columns, rows: list,
      origins: [...new Set(list.map((r) => r.origin).filter((o): o is string => !!o))],
      limitations: [...new Set(ordered.flatMap((m) => m.limitations))],
      protocols: ordered.map((m) => m.protocol).filter((p): p is CatalogueRecord => !!p),
      mappingIds: ordered.map((m) => m.id),
      legend: legendFor(list, shownMeasures),
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

export type ComparedTool = { id: string; name: string; href: string; methodTypes: string[]; configurations: number };

/** Every tool in the rendered rows, once: the model or method a row's configuration belongs to
 * (named and linked from `lookup`), else the configuration itself. */
export function toolsCompared(comparisons: Comparison[], lookup: (id: string) => CatalogueRecord | null = () => null): ComparedTool[] {
  const tools = new Map<string, { tool: ComparedTool; types: Set<string>; configurations: Set<string>; parent: CatalogueRecord | null }>();
  for (const c of comparisons) for (const r of c.rows) {
    const key = r.parentId ?? r.id;
    let entry = tools.get(key);
    if (!entry) {
      const parent = r.parentId ? lookup(r.parentId) : null;
      const href = parent ? recordHref(parent) : `/database/configuration/${encodeURIComponent(r.id)}/`;
      entry = { tool: { id: key, name: parent?.name ?? r.name, href, methodTypes: [], configurations: 0 }, types: new Set(), configurations: new Set(), parent };
      tools.set(key, entry);
    }
    r.methodTypes.forEach((t) => entry!.types.add(t));
    entry.configurations.add(r.id);
  }
  return [...tools.values()].map(({ tool, types, configurations, parent }) => ({
    ...tool, methodTypes: types.size ? [...types] : parent?.facets?.method_types ?? [], configurations: configurations.size,
  })).sort((a, b) => a.name.localeCompare(b.name));
}
