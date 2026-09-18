import type { CatalogueRecord, ResultRow } from "./catalogue-query.js";
import type { ResolvedComparison } from "./published-comparisons.js";

/** Fields that resolveComparisons holds constant inside one source table, and
 * whose divergence has to be disclosed once several tables are pooled. */
const comparisonFields = [
  "split",
  "subset",
  "population",
  "aggregation",
] as const;

export interface AggregateRow {
  row: ResultRow;
  panel: ResolvedComparison;
}
/** An opt-in pooled view over several source-scoped figures that report the
 * same metric. Pooling never relaxes the panel gate: every figure here already
 * passed resolveComparisons on its own, and `divergent` names each field that
 * the pooled rows do not hold constant. */
export interface AggregateComparison {
  id: string;
  metric: string;
  unit: string;
  direction: "higher" | "lower";
  rows: AggregateRow[];
  panels: ResolvedComparison[];
  protocols: CatalogueRecord[];
  datasets: CatalogueRecord[];
  sources: CatalogueRecord[];
  caveats: string[];
  divergent: string[];
}

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "metric"
  );
}
function comparisonValue(row: ResultRow, field: string): string {
  const comparison = row.evaluation?.attributes.comparison as
    | Record<string, unknown>
    | undefined;
  return JSON.stringify(comparison?.[field] ?? null);
}
function unique(records: CatalogueRecord[]): CatalogueRecord[] {
  return [...new Map(records.map((record) => [record.id, record])).values()];
}

export function resolveAggregates(
  panels: ResolvedComparison[],
): AggregateComparison[] {
  // Metric identity is the exact printed triple. `accuracy`, `Accuracy` and
  // `ACC` are different strings and are never merged.
  const groups = new Map<string, ResolvedComparison[]>();
  for (const panel of panels) {
    const key = JSON.stringify([panel.metric, panel.unit, panel.direction]);
    groups.set(key, [...(groups.get(key) || []), panel]);
  }
  const used = new Set<string>();
  const aggregates: AggregateComparison[] = [];
  for (const [key, members] of groups) {
    // A lone figure is already shown by itself; pooling it adds nothing.
    if (members.length < 2) continue;
    const seen = new Set<string>();
    const rows: AggregateRow[] = [];
    for (const panel of members)
      for (const row of panel.rows) {
        if (seen.has(row.result.id)) continue;
        seen.add(row.result.id);
        rows.push({ row, panel });
      }
    const tested = new Set(
      rows
        .filter(({ row }) => row.result.attributes.numeric_value !== null)
        .flatMap(({ row }) => row.models.map((model) => model.id)),
    );
    if (tested.size < 2) continue;
    const [metric, unit, direction] = JSON.parse(key) as [
      string,
      string,
      "higher" | "lower",
    ];
    const divergent: string[] = [];
    if (new Set(members.map((panel) => panel.protocol.id)).size > 1)
      divergent.push("evaluation protocol");
    if (new Set(members.map((panel) => panel.dataset.id)).size > 1)
      divergent.push("dataset");
    if (new Set(members.flatMap((panel) => panel.source_ids)).size > 1)
      divergent.push("source table");
    for (const field of comparisonFields)
      if (new Set(rows.map(({ row }) => comparisonValue(row, field))).size > 1)
        divergent.push(field);
    // Unavailable values keep their place in the table and are never ranked.
    const ranked = [...rows].sort((a, b) => {
      const left = a.row.result.attributes.numeric_value;
      const right = b.row.result.attributes.numeric_value;
      if (left === null && right === null) return 0;
      if (left === null) return 1;
      if (right === null) return -1;
      return direction === "higher"
        ? Number(right) - Number(left)
        : Number(left) - Number(right);
    });
    let id = `pooled-${slug(metric)}-${slug(unit)}-${direction}`;
    for (let suffix = 2; used.has(id); suffix++)
      id = `pooled-${slug(metric)}-${slug(unit)}-${direction}-${suffix}`;
    used.add(id);
    aggregates.push({
      id,
      metric,
      unit,
      direction,
      rows: ranked,
      panels: members,
      protocols: unique(members.map((panel) => panel.protocol)),
      datasets: unique(members.map((panel) => panel.dataset)),
      sources: unique(members.flatMap((panel) => panel.sources)),
      caveats: [...new Set(members.flatMap((panel) => panel.caveats))],
      divergent,
    });
  }
  return aggregates;
}
