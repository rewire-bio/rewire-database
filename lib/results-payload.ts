import type { CatalogueRecord, ResultRow } from "../shared/omics/catalogue-query";

type Page = { items: ResultRow[] };

/** A linked record with only the fields the results table renders. */
function slim(record: CatalogueRecord, keep: string[], sources = false): CatalogueRecord {
  return {
    id: record.id,
    kind: record.kind,
    name: record.name,
    description: "",
    status: record.status,
    facets: {},
    source_ids: sources ? record.source_ids : [],
    links: [],
    attributes: Object.fromEntries(keep.flatMap((key) => (key in record.attributes ? [[key, record.attributes[key]]] : []))),
  };
}

const entityKeys = ["source_label", "legacy_kinds"];
const lists = ["models", "benchmarks", "methods", "configurations", "pipelines", "services", "tasks", "protocols", "evaluators", "datasets", "dataset_subsets"] as const;

/** The first results page as the Results client component needs it. Server
 * pages serialise this into the HTML, so linked records drop their
 * descriptions, facets and unused attributes; the result record is kept whole.
 * Later pages come from the API unchanged. */
export function resultsPayload<T extends Page>(page: T): T {
  return {
    ...page,
    items: page.items.map((row) => ({
      ...row,
      result: { ...row.result, description: "", facets: {}, links: [] },
      evaluation: row.evaluation && slim(row.evaluation, ["protocol", "origin"]),
      sources: row.sources.map((source) => slim(source, ["url", "evidence_concerns"])),
      ...Object.fromEntries(lists.map((key) => [key, (row[key] || []).map((record) => slim(record, entityKeys))])),
    })),
  };
}
