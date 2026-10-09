import {
  applicableChecks,
  auditPage,
  type AuditCheck,
  type AuditIndexRow,
  type AuditResolution,
  type AuditRun,
} from "./audit.js";

/** The release's audit history: one index row per audited record, runs and resolutions. */
export interface AuditTable {
  index: AuditIndexRow[];
  runs: AuditRun[];
  resolutions: AuditResolution[];
}
export interface AuditRecordsInput {
  release_id: string;
  run_id?: string;
  kind?: string;
  outcome?: string;
  category?: string;
  q?: string;
  date_from?: string;
  date_to?: string;
  cursor?: string;
  limit?: number;
}
export interface AuditChecksInput {
  release_id: string;
  record_id: string;
  run_id?: string;
  outcome?: string;
  category?: string;
  cursor?: string;
  limit?: number;
}

export function auditRunsPage(table: AuditTable, input: { release_id: string; cursor?: string; limit?: number }) {
  return {
    release_id: input.release_id,
    ...auditPage(table.runs, input, { release: input.release_id, table: "runs" }),
  };
}

export function auditRecordsPage(table: AuditTable, input: AuditRecordsInput) {
  const { cursor, limit, ...scope } = input;
  const items = table.index.filter(
    (r) =>
      r.checks_filter.some(
        (f) =>
          (!input.run_id || f.run_id === input.run_id) &&
          (!input.outcome || f.outcome === input.outcome) &&
          (!input.category || f.category === input.category) &&
          (!input.date_from || f.checked_at.slice(0, 10) >= input.date_from) &&
          (!input.date_to || f.checked_at.slice(0, 10) <= input.date_to),
      ) &&
      (!input.kind || r.record_kind === input.kind) &&
      (!input.q || `${r.record_name} ${r.record_id}`.toLowerCase().includes(input.q.toLowerCase())),
  );
  const page = auditPage(items, input, scope);
  return { release_id: input.release_id, ...page, items: page.items.map(({ chunk_ids, ...row }) => row) };
}

/** One record's checks, marked by whether they still apply to the current record and sources. */
export function auditChecksPage(
  table: AuditTable,
  input: AuditChecksInput,
  checks: AuditCheck[],
  record: { kind?: string } | undefined,
  sources: Map<string, unknown>,
) {
  const { cursor, limit, ...scope } = input;
  const applicable = new Set(
    applicableChecks(checks, record as never, table.resolutions, sources).map((c) => c.id),
  );
  return {
    release_id: input.release_id,
    ...auditPage(
      checks
        .map((c) => ({ ...c, applies_to_current_record: applicable.has(c.id) }))
        .filter(
          (c) =>
            (!input.run_id || c.run_id === input.run_id) &&
            (!input.outcome || c.outcome === input.outcome) &&
            (!input.category || c.category === input.category),
        ),
      input,
      scope,
    ),
    record_url: record?.kind ? `/database/${record.kind}/${input.record_id}/` : null,
    source_urls: Object.fromEntries(
      [...sources].map(([id, source]) => [id, source ? `/database/source/${id}/` : null]),
    ),
    resolutions: table.resolutions.filter((r: AuditResolution) =>
      r.check_ids.some((id) => checks.some((c) => c.id === id)),
    ),
  };
}
