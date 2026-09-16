import { z } from "zod";
import { extensionsSchema } from "./extensions";
export const kinds = [
  "model",
  "benchmark",
  "dataset",
  "baseline",
  "evaluation",
  "result",
  "source",
  "claim",
] as const;
export const statuses = [
  "discovered",
  "needs_review",
  "source_checked",
  "reproduced",
  "disputed",
  "superseded",
  "excluded",
] as const;
export const recordSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    kind: z.enum(kinds),
    name: z.string().min(1),
    description: z.string(),
    status: z.enum(statuses),
    facets: z.record(z.string(), z.array(z.string())),
    source_ids: z.array(z.string()),
    links: z.array(
      z.object({ relation: z.string().min(1), target_id: z.string().min(1) }),
    ),
    attributes: z.record(z.string(), z.unknown()),
  })
  .strict();
export type RecordEntry = z.infer<typeof recordSchema>;
const forbidden = new Set([
  "email",
  "email_address",
  "contact_email",
  "token",
  "token_hash",
  "private_correspondence",
  "owner_uid",
  "id_token",
  "session_token",
  "access_token",
  "private_notes",
  "password",
  "verification_token",
]);
function privacy(value: unknown, location: string) {
  if (Array.isArray(value))
    return value.forEach((v, i) => privacy(v, `${location}[${i}]`));
  if (value && typeof value === "object")
    for (const [key, v] of Object.entries(value)) {
      if (forbidden.has(key.toLowerCase()))
        throw new Error(`Private field ${location}.${key}`);
      privacy(v, `${location}.${key}`);
    }
}
export function validateRecords(input: unknown[]): RecordEntry[] {
  const records = input.map((x) => recordSchema.parse(x));
  const byId = new Map(records.map((r) => [r.id, r]));
  if (byId.size !== records.length) throw new Error("Duplicate record ID");
  for (const r of records) {
    privacy(r, r.id);
    for (const id of r.source_ids) {
      if (byId.get(id)?.kind !== "source")
        throw new Error(`Missing source ${id} for ${r.id}`);
    }
    for (const l of r.links)
      if (!byId.has(l.target_id))
        throw new Error(`Dangling ${r.id} -> ${l.target_id}`);
    const a = r.attributes;
    if (a.extensions !== undefined) extensionsSchema.parse(a.extensions);
    if (r.kind === "source") {
      const u = new URL(String(a.url));
      if (!["https:", "http:"].includes(u.protocol))
        throw new Error(`Invalid source URL ${r.id}`);
      if (!a.retrieved_at) throw new Error(`Undated source ${r.id}`);
      if (
        !a.version &&
        !(a.missing_metadata as Record<string, unknown> | undefined)?.version
      )
        throw new Error(`Unversioned source ${r.id}`);
    }
    if (r.kind === "result") {
      const ev = r.links.filter((l) => l.relation === "evaluation");
      if (ev.length !== 1 || byId.get(ev[0].target_id)?.kind !== "evaluation")
        throw new Error(`Invalid result evaluation ${r.id}`);
      if (
        typeof a.printed_value !== "string" ||
        !a.printed_value.trim() ||
        !a.metric ||
        !a.unit
      )
        throw new Error(`Incomplete result ${r.id}`);
      if (
        a.numeric_value !== null &&
        (typeof a.numeric_value !== "string" ||
          !a.numeric_value.trim() ||
          !Number.isFinite(Number(a.numeric_value)))
      )
        throw new Error(`Invalid numeric value ${r.id}`);
      if (
        ["source_checked", "reproduced"].includes(r.status) &&
        (!r.source_ids.length || !a.source_locator || !a.review)
      )
        throw new Error(`Missing result evidence ${r.id}`);
      if (
        r.status === "reproduced" &&
        byId.get(ev[0].target_id)?.attributes.origin !== "rewire_run"
      )
        throw new Error(`External result mislabelled reproduced ${r.id}`);
    }
    if (r.kind === "evaluation")
      for (const relation of ["model", "benchmark", "dataset"]) {
        const links = r.links.filter((l) => l.relation === relation);
        if (
          links.length !== 1 ||
          byId.get(links[0].target_id)?.kind !== relation
        )
          throw new Error(`Invalid evaluation ${relation} ${r.id}`);
      }
    if (r.kind === "claim" && !r.links.some((l) => l.relation === "subject"))
      throw new Error(`Claim has no subject ${r.id}`);
  }
  return records;
}
export function publicRecords(records: RecordEntry[]): RecordEntry[] {
  const blocked = new Set(
    records
      .filter(
        (r) =>
          r.status === "excluded" ||
          r.status === "disputed" ||
          (r.kind === "result" &&
            !["source_checked", "reproduced", "superseded"].includes(r.status)),
      )
      .map((r) => r.id),
  );
  let changed = true;
  while (changed) {
    changed = false;
    for (const r of records)
      if (
        !blocked.has(r.id) &&
        (r.source_ids.some((id) => blocked.has(id)) ||
          r.links.some((l) => blocked.has(l.target_id)))
      ) {
        blocked.add(r.id);
        changed = true;
      }
  }
  return records.filter((r) => !blocked.has(r.id));
}
