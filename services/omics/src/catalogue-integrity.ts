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
  return createHash("sha256")
    .update(
      JSON.stringify(
        canonical([...records].sort((a, b) => a.id.localeCompare(b.id))),
      ),
    )
    .digest("hex");
}
