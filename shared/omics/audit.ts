import { createHash } from "node:crypto";
import { z } from "zod";
import { assertNoPrivateFields, privateFieldNames } from "./private-fields.js";
export const auditOutcomes = [
  "supported",
  "contradicted",
  "insufficient_evidence",
  "inaccessible",
  "not_applicable",
] as const;
export const auditCategories = [
  "structure",
  "source_access",
  "source_transcription",
  "scientific_context",
  "metadata",
  "historical_receipt",
] as const;
const id = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const auditRunSchema = z
  .object({
    id,
    baseline_release_id: id,
    inventory_sha256: hash,
    started_at: z.string(),
    completed_at: z.string(),
    reviewer: z.string().min(1),
    review_method: z.enum([
      "automated",
      "ai_assisted",
      "human",
      "historical_import",
    ]),
    verifier_revision: z.string().min(1),
    scope: z.string().min(1),
    limitations: z.array(z.string()),
    record_count: z.number().int().nonnegative(),
    check_count: z.number().int().nonnegative(),
  })
  .strict();
export const auditCheckSchema = z
  .object({
    id,
    run_id: id,
    record_id: id,
    record_kind: z.string(),
    record_name: z.string(),
    field_paths: z.array(z.string()).min(1),
    target_sha256: hash,
    category: z.enum(auditCategories),
    outcome: z.enum(auditOutcomes),
    checked_at: z.string(),
    source_ids: z.array(id),
    evidence_row_ids: z.array(z.string()),
    source_locators: z.array(z.string()),
    source_hashes: z.array(hash),
    receipt_ids: z.array(z.string()),
    explanation: z.string().min(1),
    prior_check_ids: z.array(id),
    recorded_value_json: z.string().optional(),
    observed_value_json: z.string().nullable().optional(),
    source_fingerprints: z.record(z.string(), hash).optional(),
  })
  .strict();
export const auditResolutionSchema = z
  .object({
    id,
    check_ids: z.array(id).min(1),
    followup_check_ids: z.array(id).min(1),
    published_release_id: id,
    resolved_at: z.string(),
    explanation: z.string().min(1),
  })
  .strict();
export type AuditRun = z.infer<typeof auditRunSchema>;
export type AuditCheck = z.infer<typeof auditCheckSchema>;
export type AuditResolution = z.infer<typeof auditResolutionSchema>;
export type AuditBundle = {
  schema_version: "1.0";
  runs: AuditRun[];
  checks: AuditCheck[];
  resolutions: AuditResolution[];
};
export function canonicalAudit(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalAudit).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalAudit(v)}`)
      .join(",")}}`;
  return JSON.stringify(value ?? null);
}
export const auditHash = (value: unknown) =>
  createHash("sha256").update(canonicalAudit(value)).digest("hex");
export function auditTarget(record: unknown, paths: string[]): string {
  const read = (p: string): unknown =>
    p === "$record"
      ? record
      : p
          .split(".")
          .reduce<unknown>(
            (v, k) =>
              v && typeof v === "object"
                ? (v as Record<string, unknown>)[k]
                : undefined,
            record,
          );
  return auditHash([...paths].sort().map((p) => [p, read(p)]));
}
export function validateAudit(input: AuditBundle): AuditBundle {
  if (input.schema_version !== "1.0")
    throw Error("Unsupported audit schema version");
  assertNoPrivateFields(input);
  const runs = input.runs.map((r) => auditRunSchema.parse(r));
  const checks = input.checks.map((r) => auditCheckSchema.parse(r));
  for (const check of checks) {
    if (
      check.field_paths.some((p) =>
        p
          .split(".")
          .some((k) =>
            (privateFieldNames as readonly string[]).includes(k.toLowerCase()),
          ),
      )
    )
      throw Error("Private field paths cannot enter a public audit");
    for (const value of [
      check.recorded_value_json,
      check.observed_value_json,
    ]) {
      if (value == null) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(value);
      } catch {
        throw Error("Audit observations must contain valid JSON");
      }
      assertNoPrivateFields(parsed);
    }
  }
  const resolutions = input.resolutions.map((r) =>
    auditResolutionSchema.parse(r),
  );
  const unique = (items: { id: string }[]) => {
    if (new Set(items.map((r) => r.id)).size !== items.length)
      throw Error("Duplicate audit identity");
  };
  unique(runs);
  unique(checks);
  unique(resolutions);
  const runMap = new Map(runs.map((r) => [r.id, r]));
  const checkMap = new Map(checks.map((r) => [r.id, r]));
  for (const c of checks) {
    if (!runMap.has(c.run_id)) throw Error("Unknown audit run");
    for (const prior of c.prior_check_ids)
      if (
        !checkMap.has(prior) ||
        prior === c.id ||
        checkMap.get(prior)!.checked_at > c.checked_at
      )
        throw Error("Invalid prior audit check");
  }
  const visiting = new Set<string>(),
    visited = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) throw Error("Cyclic audit history");
    if (visited.has(id)) return;
    visiting.add(id);
    for (const prior of checkMap.get(id)!.prior_check_ids) visit(prior);
    visiting.delete(id);
    visited.add(id);
  };
  for (const c of checks) visit(c.id);
  for (const r of runs) {
    const scoped = checks.filter((c) => c.run_id === r.id);
    if (
      scoped.length !== r.check_count ||
      new Set(scoped.map((c) => c.record_id)).size !== r.record_count
    )
      throw Error("Audit inventory counts differ");
  }
  for (const r of resolutions)
    for (const id of [...r.check_ids, ...r.followup_check_ids])
      if (!checkMap.has(id)) throw Error("Unknown resolution check");
  for (const r of resolutions)
    for (const oldId of r.check_ids) {
      const old = checkMap.get(oldId)!;
      if (
        !r.followup_check_ids.some((id) => {
          const next = checkMap.get(id)!;
          return (
            next.record_id === old.record_id &&
            next.category === old.category &&
            next.outcome === "supported" &&
            canonicalAudit([...next.field_paths].sort()) ===
              canonicalAudit([...old.field_paths].sort()) &&
            next.prior_check_ids.includes(oldId)
          );
        })
      )
        throw Error(
          "Resolution requires supported follow-up for the same record and fields",
        );
    }
  return { schema_version: "1.0", runs, checks, resolutions };
}
export function applicableChecks(
  checks: AuditCheck[],
  record: unknown,
  resolutions: AuditResolution[] = [],
  sources?: Map<string, unknown>,
) {
  const applicable = checks.filter(
    (c) =>
      c.record_id === (record as { id?: string })?.id &&
      c.target_sha256 === auditTarget(record, c.field_paths) &&
      (!sources ||
        c.source_ids.every(
          (id) => c.source_fingerprints?.[id] === auditHash(sources.get(id)),
        )),
  );
  // Passing a subsequent check alone never resolves an earlier contradiction.
  const resolved = new Set(
    resolutions.flatMap((r) =>
      r.check_ids.filter((oldId) => {
        const old = checks.find((c) => c.id === oldId);
        return (
          old &&
          r.followup_check_ids.some((id) =>
            applicable.some(
              (c) =>
                c.id === id &&
                c.outcome === "supported" &&
                c.record_id === old.record_id &&
                c.category === old.category &&
                canonicalAudit([...c.field_paths].sort()) ===
                  canonicalAudit([...old.field_paths].sort()) &&
                c.prior_check_ids.includes(oldId),
            ),
          )
        );
      }),
    ),
  );
  return applicable.filter((c) => !resolved.has(c.id));
}
export interface AuditIndexRow {
  record_id: string;
  record_kind: string;
  record_name: string;
  run_ids: string[];
  outcomes: string[];
  categories: string[];
  checks_filter: {
    run_id: string;
    category: string;
    outcome: string;
    checked_at: string;
  }[];
  check_count: number;
  latest_check_at: string;
  chunk_ids: string[];
}
export function auditIndex(checks: AuditCheck[]): AuditIndexRow[] {
  const rows = new Map<string, AuditIndexRow>();
  // A record's display identity can change across audited releases. Prefer the
  // latest check, with stable run/check tie breakers, rather than whichever
  // input chunk happened to be loaded first. Do not mutate caller ordering.
  const ordered = [...checks].sort((a, b) =>
    b.checked_at.localeCompare(a.checked_at) ||
    a.run_id.localeCompare(b.run_id) ||
    a.id.localeCompare(b.id),
  );
  for (const c of ordered) {
    const r = rows.get(c.record_id) || {
      record_id: c.record_id,
      record_kind: c.record_kind,
      record_name: c.record_name,
      run_ids: [],
      outcomes: [],
      categories: [],
      checks_filter: [],
      check_count: 0,
      latest_check_at: "",
      chunk_ids: [],
    };
    for (const [key, value] of [
      ["run_ids", c.run_id],
      ["outcomes", c.outcome],
      ["categories", c.category],
    ] as const)
      if (!r[key].includes(value)) r[key].push(value);
    if (
      !r.checks_filter.some(
        (f) =>
          f.run_id === c.run_id &&
          f.category === c.category &&
          f.outcome === c.outcome &&
          f.checked_at === c.checked_at,
      )
    )
      r.checks_filter.push({
        run_id: c.run_id,
        category: c.category,
        outcome: c.outcome,
        checked_at: c.checked_at,
      });
    r.check_count++;
    if (c.checked_at > r.latest_check_at) r.latest_check_at = c.checked_at;
    rows.set(c.record_id, r);
  }
  return [...rows.values()]
    .map((r) => ({
      ...r,
      run_ids: r.run_ids.sort(),
      outcomes: r.outcomes.sort(),
      categories: r.categories.sort(),
      checks_filter: r.checks_filter.sort((a, b) =>
        canonicalAudit(a).localeCompare(canonicalAudit(b)),
      ),
    }))
    .sort((a, b) => a.record_id.localeCompare(b.record_id));
}
export function auditPage<T>(
  rows: T[],
  input: { cursor?: string; limit?: number },
  scope: unknown,
) {
  const signature = auditHash(scope);
  let start = 0;
  if (input.cursor) {
    const cursor = JSON.parse(
      Buffer.from(input.cursor, "base64url").toString(),
    );
    if (
      cursor.scope !== signature ||
      !Number.isInteger(cursor.start) ||
      cursor.start < 0
    )
      throw Error("Audit cursor does not match this query");
    start = cursor.start;
  }
  const limit = Math.min(100, Math.max(1, input.limit || 25));
  return {
    items: rows.slice(start, start + limit),
    total: rows.length,
    next_cursor:
      start + limit < rows.length
        ? Buffer.from(
            JSON.stringify({ scope: signature, start: start + limit }),
          ).toString("base64url")
        : null,
  };
}
