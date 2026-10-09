/** Records in the current shapes: single-meaning relations (relations.ts) and declared
 * attributes (attributes.ts). Readers apply this to every snapshot they load, so releases
 * written before October 2026 read the same as current ones. */
import { normalizeAttributes } from "./attributes.js";
import { normalizeRecords } from "./relations.js";

type Rec = { id: string; kind: string; links: { relation: string; target_id: string }[]; attributes: Record<string, unknown> };

export function currentRecords<T extends Rec>(records: T[]): T[] {
  return normalizeAttributes(normalizeRecords(records));
}
