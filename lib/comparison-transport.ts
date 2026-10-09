import type {
  CatalogueRecord,
  ResultRow,
} from "../shared/omics/catalogue-query";
import type { ResolvedComparison } from "../shared/omics/published-comparisons";

const recordArrays = [
  "models",
  "benchmarks",
  "methods",
  "configurations",
  "pipelines",
  "services",
  "tasks",
  "protocols",
  "evaluators",
  "datasets",
  "dataset_subsets",
  "sources",
] as const satisfies readonly (keyof ResultRow)[];
type RecordArrayKey = (typeof recordArrays)[number];
export type PackedComparisonRow = Omit<
  ResultRow,
  RecordArrayKey | "result" | "evaluation"
> &
  Record<RecordArrayKey, number[]> & {
    result: number;
    evaluation: number | null;
  };
export type PackedComparison = Omit<
  ResolvedComparison,
  "rows" | "sources" | "protocol" | "dataset"
> & {
  rows: PackedComparisonRow[];
  sources: number[];
  protocol: number;
  dataset: number;
};

/** Internal React-prop transport, not the public catalogue/API schema.
 * Record indexes identify complete JSON values, never scientific identities.
 * All metadata and array ordering survive; no attributes are removed.
 */
export interface PackedComparisons {
  format: "rewire-comparisons/1";
  records: CatalogueRecord[];
  panels: PackedComparison[];
}

export function packComparisons(
  panels: readonly ResolvedComparison[],
): PackedComparisons {
  const records: CatalogueRecord[] = [];
  const values = new Map<string, number>();
  const identities = new WeakMap<CatalogueRecord, number>();
  const intern = (record: CatalogueRecord): number => {
    const identity = identities.get(record);
    if (identity !== undefined) return identity;
    // Catalogue values come from JSON releases. Complete serialization retains
    // differently shaped references sharing an ID, as well as property order.
    const value = JSON.stringify(record);
    let index = values.get(value);
    if (index === undefined) {
      index = records.length;
      values.set(value, index);
      records.push(record);
    }
    identities.set(record, index);
    return index;
  };
  return {
    format: "rewire-comparisons/1",
    records,
    panels: panels.map((panel) => ({
      ...panel,
      rows: panel.rows.map((row) => {
        const packed = {
          ...row,
          result: intern(row.result),
          evaluation: row.evaluation === null ? null : intern(row.evaluation),
        } as unknown as PackedComparisonRow;
        for (const key of recordArrays) packed[key] = row[key].map(intern);
        return packed;
      }),
      sources: panel.sources.map(intern),
      protocol: intern(panel.protocol),
      dataset: intern(panel.dataset),
    })),
  };
}

export function unpackComparisons(
  packed: PackedComparisons,
): ResolvedComparison[] {
  if (packed.format !== "rewire-comparisons/1")
    throw new Error("Unsupported comparison transport format");
  const resolve = (index: number): CatalogueRecord => {
    if (
      !Number.isSafeInteger(index) ||
      index < 0 ||
      index >= packed.records.length
    )
      throw new Error(`Invalid comparison record index: ${String(index)}`);
    const record = packed.records[index];
    if (!record || typeof record !== "object")
      throw new Error(`Missing comparison record: ${index}`);
    return record;
  };
  return packed.panels.map((panel) => ({
    ...panel,
    rows: panel.rows.map((row) => {
      const restored = {
        ...row,
        result: resolve(row.result),
        evaluation: row.evaluation === null ? null : resolve(row.evaluation),
      } as unknown as ResultRow;
      for (const key of recordArrays) restored[key] = row[key].map(resolve);
      return restored;
    }),
    sources: panel.sources.map(resolve),
    protocol: resolve(panel.protocol),
    dataset: resolve(panel.dataset),
  }));
}
