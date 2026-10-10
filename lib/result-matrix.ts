import type { ResultRow } from "../shared/omics/catalogue-query";
import { numericScore } from "../components/catalogue/comparison-utils";
import { datasetEntities, evaluationEntities, testedEntities } from "./omics-browse";
import { metricName } from "./result-labels";
import type { OmicsRecord } from "./omics";

type Reference = Pick<OmicsRecord, "id" | "kind" | "name">;
type Direction = "higher" | "lower" | "unknown";
export interface MatrixCell {
  result: Reference;
  printed: string;
  unit: string;
  numeric: number | null;
  best: boolean;
}
export interface ResultMatrix {
  columns: { key: string; label: string; direction: Direction }[];
  rows: { key: string; tested: Reference[]; evaluation: Reference | null; context: Reference[]; cells: (MatrixCell | null)[] }[];
  /** Protocol and dataset records shared by every row, shown once above the table. */
  shared: Reference[];
}

const reference = ({ id, kind, name }: OmicsRecord): Reference => ({ id, kind, name });
const text = (value: unknown) => (typeof value === "string" ? value : value == null ? "" : String(value));
const ids = (records: Reference[]) => records.map((record) => record.id).sort().join(",");

/** One row per evaluated configuration and one column per metric, from a
 * record's complete result rows. Returns null when two results would share a
 * cell (for example repeated aggregations), so the caller keeps the flat table
 * rather than hiding a printed value. */
export function resultMatrix(rows: ResultRow[]): ResultMatrix | null {
  if (rows.length < 2) return null;
  const columns = new Map<string, { key: string; label: string; direction: Direction; count: number }>();
  const byRow = new Map<string, { key: string; tested: Reference[]; evaluation: Reference | null; context: Reference[]; cells: Map<string, MatrixCell> }>();
  for (const row of rows) {
    const { attributes } = row.result;
    const metric = text(attributes.metric);
    const qualifier = text(attributes.metric_qualifier);
    const column = `${metric}|${qualifier}`;
    const direction: Direction = attributes.metric_direction === "higher" || attributes.metric_direction === "lower" ? attributes.metric_direction : "unknown";
    const existing = columns.get(column);
    if (existing) existing.count++;
    else columns.set(column, { key: column, label: metricName(metric, qualifier || null), direction, count: 1 });
    const tested = testedEntities(row).map(reference);
    const context = [...evaluationEntities(row), ...datasetEntities(row)].map(reference);
    const key = row.evaluation?.id || `${ids(tested)}|${ids(context)}`;
    const entry = byRow.get(key) || { key, tested, evaluation: row.evaluation ? reference(row.evaluation) : null, context, cells: new Map() };
    if (entry.cells.has(column)) return null;
    const printed = text(attributes.printed_value);
    entry.cells.set(column, {
      result: reference(row.result),
      printed: printed + (attributes.unit === "percent" && printed && !printed.includes("%") ? "%" : ""),
      unit: text(attributes.unit),
      numeric: numericScore(attributes.numeric_value),
      best: false,
    });
    byRow.set(key, entry);
  }
  // Metrics with a recorded direction lead, so a score rather than a count orders the rows.
  const ordered = [...columns.values()].sort(
    (a, b) => Number(b.direction !== "unknown") - Number(a.direction !== "unknown") || b.count - a.count || a.label.localeCompare(b.label),
  );
  const shared = ordered.length && byRow.size
    ? [...byRow.values()][0].context.filter((item) => [...byRow.values()].every((row) => row.context.some((other) => other.id === item.id)))
    : [];
  const sharedIds = new Set(shared.map((item) => item.id));
  const lead = ordered[0];
  const value = (cell: MatrixCell | null) => cell?.numeric ?? null;
  const matrix = [...byRow.values()].map((row) => ({
    key: row.key,
    tested: row.tested,
    evaluation: row.evaluation,
    context: row.context.filter((item) => !sharedIds.has(item.id)),
    cells: ordered.map((column) => row.cells.get(column.key) || null),
  }));
  // Mark the best value in each column within this table only, when the metric's direction is recorded.
  ordered.forEach((column, index) => {
    if (column.direction === "unknown") return;
    const scored = matrix.flatMap((row) => {
      const score = value(row.cells[index]);
      return score === null ? [] : [score];
    });
    if (scored.length < 2) return;
    const best = column.direction === "higher" ? Math.max(...scored) : Math.min(...scored);
    for (const row of matrix) if (row.cells[index] && value(row.cells[index]) === best) row.cells[index]!.best = true;
  });
  // Lead with the commonest metric, best first when its direction is recorded;
  // rows without it keep their order at the end.
  if (lead.direction !== "unknown") matrix.sort((a, b) => {
    const av = value(a.cells[0]), bv = value(b.cells[0]);
    if (av === null) return bv === null ? 0 : 1;
    if (bv === null) return -1;
    return lead.direction === "lower" ? av - bv : bv - av;
  });
  return { columns: ordered.map(({ key, label, direction }) => ({ key, label, direction })), rows: matrix, shared };
}
