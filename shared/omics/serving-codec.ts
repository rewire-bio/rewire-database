import { recordReference, type CatalogueRecord, type EvidenceRow } from "./catalogue-query.js";

/* Encoding of the prepared release file (serving contract 3). Values written
 * by the producer refer to stored records instead of embedding them, and
 * evidence rows keep only the fields that cannot be derived. Decoding returns
 * exactly the JSON the live query engine returns; the producer checks that
 * round trip for every value it writes. */

/** Marker objects: a whole stored record, or its recordReference form. */
type Ref = { $r: string } | { $ref: string };

/** Replaces every embedded object that serialises exactly as a stored record
 * (or as that record's reference form) with a marker naming its ID. */
export function createRecordEncoder(records: readonly CatalogueRecord[]) {
  const byId = new Map(records.map((record) => [record.id, record]));
  const full = new Map<string, string>();
  const reference = new Map<string, string>();
  const json = (cache: Map<string, string>, id: string, make: () => unknown) => {
    let value = cache.get(id);
    if (value === undefined) cache.set(id, (value = JSON.stringify(make())));
    return value;
  };
  const encode = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(encode);
    if (!value || typeof value !== "object") return value;
    const object = value as Record<string, unknown>;
    if ("$r" in object || "$ref" in object) throw new Error("Prepared value already uses a record marker key");
    const id = object.id;
    const record = typeof id === "string" && typeof object.kind === "string" ? byId.get(id) : undefined;
    if (record) {
      const text = JSON.stringify(object);
      if (text === json(full, record.id, () => record)) return { $r: record.id } satisfies Ref;
      if (text === json(reference, record.id, () => recordReference(record))) return { $ref: record.id } satisfies Ref;
    }
    return Object.fromEntries(Object.entries(object).map(([key, item]) => [key, encode(item)]));
  };
  return encode;
}

/** Inverse of createRecordEncoder. Records repeated within one value are
 * decoded once and shared. */
export function decodeRecords<T>(value: unknown, record: (id: string) => CatalogueRecord | null): T {
  const fullCache = new Map<string, CatalogueRecord>();
  const referenceCache = new Map<string, CatalogueRecord>();
  const load = (id: string) => {
    let found = fullCache.get(id);
    if (!found) {
      const loaded = record(id);
      if (!loaded) throw new Error(`Prepared release lacks record ${id}`);
      fullCache.set(id, (found = loaded));
    }
    return found;
  };
  const decode = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(decode);
    if (!item || typeof item !== "object") return item;
    const object = item as Record<string, unknown>;
    const keys = Object.keys(object);
    if (keys.length === 1 && keys[0] === "$r") return load(object.$r as string);
    if (keys.length === 1 && keys[0] === "$ref") {
      const id = object.$ref as string;
      let found = referenceCache.get(id);
      if (!found) referenceCache.set(id, (found = recordReference(load(id))));
      return found;
    }
    return Object.fromEntries(keys.map((key) => [key, decode(object[key])]));
  };
  return decode(value) as T;
}

/** Evidence fields read from the source record, the same for every row of a source. */
export const EVIDENCE_SOURCE_FIELDS = [
  "source_title", "source_url", "source_doi", "source_version", "artifact_url", "artifact_sha256",
  "hash_scope", "artifact_format", "artifact_member", "source_concerns", "retrieved_at",
] as const;
/** Evidence fields derived from the record, the release or other stored fields. */
const DERIVED = new Set(["row_id", "release_id", "record_id", "record_kind", "record_name", "record_status", "value", ...EVIDENCE_SOURCE_FIELDS]);

type SourceFields = Record<(typeof EVIDENCE_SOURCE_FIELDS)[number], string>;
/** One record's evidence: the column order of the rows and each row's stored fields. */
export interface PackedEvidence { columns: string[]; stored: string[]; rows: string[][] }

const text = (value: unknown) =>
  typeof value === "string" ? value : value === undefined || value === null ? "" : JSON.stringify(value);
const rowId = (row: Pick<EvidenceRow, "record_id" | "field_path" | "claim_id" | "source_id">) =>
  [row.record_id, row.field_path, row.claim_id, row.source_id].map(encodeURIComponent).join(":");

export function packEvidence(rows: readonly EvidenceRow[], sources: Map<string, SourceFields>): PackedEvidence {
  const columns = Object.keys(rows[0] || {});
  const stored = columns.filter((column) => !DERIVED.has(column));
  for (const row of rows) {
    const known = sources.get(row.source_id);
    const fields = Object.fromEntries(EVIDENCE_SOURCE_FIELDS.map((field) => [field, row[field]])) as SourceFields;
    if (!known) sources.set(row.source_id, fields);
    else if (JSON.stringify(known) !== JSON.stringify(fields))
      throw new Error(`Evidence source fields differ between rows of ${row.source_id || "(no source)"}`);
  }
  return { columns, stored, rows: rows.map((row) => stored.map((column) => (row as unknown as Record<string, string>)[column])) };
}

export function unpackEvidence(
  packed: PackedEvidence,
  record: CatalogueRecord,
  release_id: string,
  sources: Record<string, SourceFields>,
): EvidenceRow[] {
  return packed.rows.map((values) => {
    const row: Record<string, string> = Object.fromEntries(packed.stored.map((column, index) => [column, values[index]]));
    const source = sources[row.source_id];
    if (!source) throw new Error(`Prepared release lacks evidence source ${row.source_id}`);
    const derived: Record<string, string> = {
      release_id,
      record_id: record.id,
      record_kind: record.kind,
      record_name: record.name,
      record_status: record.status,
      value: text(JSON.parse(row.value_json)),
      ...source,
    };
    derived.row_id = rowId({ ...row, record_id: record.id } as EvidenceRow);
    return Object.fromEntries(packed.columns.map((column) => [column, column in row ? row[column] : derived[column]])) as unknown as EvidenceRow;
  });
}

/** The list fields listPage reads from an entry's record; the rest is read per page. */
export function slimListRecord(record: CatalogueRecord) {
  return {
    id: record.id,
    kind: record.kind,
    status: record.status,
    facets: record.facets,
    attributes: "origin" in record.attributes ? { origin: record.attributes.origin } : {},
  };
}
