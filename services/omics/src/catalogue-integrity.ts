import { createHash } from "node:crypto";
/** Firestore may reorder map fields, so hash a canonical representation of records. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}
export function recordsDigest(records: { id: string }[]): string {
  // Preserve the exact canonical JSON array bytes while processing one record
  // at a time. Cloning/stringifying the whole release creates a large peak.
  const hash = createHash("sha256").update("[");
  const ordered = [...records].sort((a, b) => a.id.localeCompare(b.id));
  ordered.forEach((record, index) => {
    if (index) hash.update(",");
    hash.update(JSON.stringify(canonical(record)));
  });
  return hash.update("]").digest("hex");
}
