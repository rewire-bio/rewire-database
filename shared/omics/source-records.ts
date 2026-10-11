import { paginate, type CatalogueRecord, type ResultRow } from "./catalogue-query.js";
import { entityKinds } from "./entity-kinds.js";

/* Source pages list what the catalogue took from each source: every record
 * that cites it, by kind. The live engine and the prepared release file share
 * these functions, so the index and its pages cannot drift. */

/** Record IDs citing one source, by kind, each list in display order. */
export type SourceRecordLists = Map<string, string[]>;

export interface SourceRecordsInput {
  id: string;
  /** One kind's page; without it, the first page of every kind. */
  kind?: string;
  cursor?: string;
  limit?: number;
}
export interface SourceResultsInput {
  id: string;
  cursor?: string;
  limit?: number;
}
type Named = { id: string; kind: string; name: string };
/** One row of a source page's results table: the figure and what it describes. */
export interface SourceResultItem {
  id: string;
  status: string;
  metric: string;
  qualifier: string | null;
  printed_value: string;
  unit: string | null;
  metric_direction: string | null;
  origin: string;
  /** Computed by Rewire from printed values (attributes.derivation), not printed in the source. */
  derived: boolean;
  evaluation: Named | null;
  /** Models, methods, configurations, pipelines or services tested. */
  tested: Named[];
  benchmarks: Named[];
  datasets: Named[];
}

const collator = new Intl.Collator("en", { numeric: true });
const byName = (a: CatalogueRecord, b: CatalogueRecord) => collator.compare(a.name, b.name) || a.id.localeCompare(b.id);
const text = (value: unknown) => (typeof value === "string" ? value : null);

/**
 * Every record citing each source. A record cites a source when the source's
 * ID appears in its source_ids, its links or anywhere in its attributes (profile
 * facts, claim citation locators, review sources, pins, derivation inputs). A
 * result also cites the sources its result row shows, which include its
 * evaluation's. Results are ordered by evaluation, then metric; other kinds by
 * name. Sources with no citing records are absent.
 */
export function sourceRecordIndex(
  records: readonly CatalogueRecord[],
  rows: readonly ResultRow[],
): Map<string, SourceRecordLists> {
  const sourceIds = new Set(records.filter((record) => record.kind === "source").map((record) => record.id));
  const citing = new Map<string, CatalogueRecord[]>();
  const add = (sourceId: string, record: CatalogueRecord, seen: Set<string>) => {
    if (sourceId === record.id || seen.has(sourceId)) return;
    seen.add(sourceId);
    const list = citing.get(sourceId) || [];
    list.push(record);
    citing.set(sourceId, list);
  };
  const walk = (value: unknown, visit: (id: string) => void): void => {
    if (typeof value === "string") {
      if (sourceIds.has(value)) visit(value);
    } else if (Array.isArray(value)) for (const item of value) walk(item, visit);
    else if (value && typeof value === "object") for (const item of Object.values(value)) walk(item, visit);
  };
  const rowSources = new Map(rows.map((row) => [row.result.id, row.sources]));
  for (const record of records) {
    const seen = new Set<string>();
    const visit = (id: string) => add(id, record, seen);
    walk(record.source_ids, visit);
    for (const link of record.links) walk(link.target_id, visit);
    walk(record.attributes, visit);
    for (const source of rowSources.get(record.id) || []) visit(source.id);
  }
  const evaluationOf = new Map(rows.map((row) => [row.result.id, row.evaluation]));
  const resultOrder = (a: CatalogueRecord, b: CatalogueRecord) => {
    const ea = evaluationOf.get(a.id), eb = evaluationOf.get(b.id);
    return (
      collator.compare(ea?.name || "", eb?.name || "") ||
      (ea?.id || "").localeCompare(eb?.id || "") ||
      collator.compare(String(a.attributes.metric ?? ""), String(b.attributes.metric ?? "")) ||
      collator.compare(String(a.attributes.metric_qualifier ?? ""), String(b.attributes.metric_qualifier ?? "")) ||
      a.id.localeCompare(b.id)
    );
  };
  // Kinds in vocabulary order; any kind outside it goes last.
  const rank = (kind: string) => {
    const position = (entityKinds as readonly string[]).indexOf(kind);
    return position < 0 ? entityKinds.length : position;
  };
  const index = new Map<string, SourceRecordLists>();
  for (const sourceId of [...citing.keys()].sort()) {
    const kinds = [...new Set(citing.get(sourceId)!.map((record) => record.kind))]
      .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
    index.set(sourceId, new Map(kinds.map((kind) => [
      kind,
      citing.get(sourceId)!.filter((record) => record.kind === kind)
        .sort(kind === "result" ? resultOrder : byName).map((record) => record.id),
    ])));
  }
  return index;
}

/** Counts by kind and one page of record IDs per kind (or of the one kind asked for). */
export function sourceRecordsPage(
  release_id: string,
  counts: Record<string, number>,
  ids: (kind: string) => string[],
  input: SourceRecordsInput,
) {
  const kinds = input.kind ? (counts[input.kind] ? [input.kind] : []) : Object.keys(counts);
  return {
    release_id,
    source_id: input.id,
    counts,
    total: Object.values(counts).reduce((sum, count) => sum + count, 0),
    pages: Object.fromEntries(
      kinds.map((kind) => [
        kind,
        paginate(release_id, ids(kind), input.kind ? input : { limit: input.limit }, `source-records|${input.id}|${kind}`, (id) => id),
      ]),
    ),
  };
}

/** One page of a source's results, each reduced to what its table row shows. */
export function sourceResultsPage(
  release_id: string,
  ids: string[],
  row: (id: string) => ResultRow | undefined,
  input: SourceResultsInput,
) {
  const page = paginate(release_id, ids, input, `source-results|${input.id}`, (id) => id);
  return { ...page, source_id: input.id, items: page.items.map((id) => sourceResultItem(row(id)!)) };
}

const named = (record: CatalogueRecord): Named => ({ id: record.id, kind: record.kind, name: record.name });

export function sourceResultItem(row: ResultRow): SourceResultItem {
  const { result } = row;
  return {
    id: result.id,
    status: result.status,
    metric: String(result.attributes.metric ?? ""),
    qualifier: text(result.attributes.metric_qualifier),
    printed_value: String(result.attributes.printed_value ?? ""),
    unit: text(result.attributes.unit),
    metric_direction: text(result.attributes.metric_direction),
    origin: row.origin,
    derived: !!result.attributes.derivation,
    evaluation: row.evaluation ? named(row.evaluation) : null,
    tested: row.models.map(named),
    benchmarks: row.benchmarks.map(named),
    datasets: row.datasets.map(named),
  };
}
