import { gunzipSync } from "node:zlib";
import {
  compareResults,
  evidencePage,
  investigationsPage,
  listPage,
  readinessPage,
  resultPage,
  type CatalogueRecord,
  type CatalogueQuery,
  type EvidenceInput,
  type EvidenceRow,
  type InvestigationsInput,
  type ListEntry,
  type ListInput,
  type ReadinessInput,
  type ResultRow,
  type ResultsInput,
} from "./catalogue-query.js";
import { useCaseQueryFrom, type UseCaseState } from "./use-cases.js";
import type { ResearchData, ResearchReadiness } from "./research.js";
import type { AuditCheck } from "./audit.js";
import {
  auditChecksPage,
  auditRecordsPage,
  auditRunsPage,
  type AuditChecksInput,
  type AuditRecordsInput,
  type AuditTable,
} from "./audit-query.js";
// Loaded at runtime so bundlers never try to resolve the built-in.
const { DatabaseSync } = process.getBuiltinModule("node:sqlite");

/** Serving contract of the prepared release file (tables and their meaning). */
export const PREPARED_CONTRACT_VERSION = "2.0";

/**
 * Read-only access to one prepared release (a SQLite file built by the producer).
 * Every method returns exactly what the live query engine returns for the same
 * release, using the same shared filter and pagination functions; nothing
 * catalogue-wide is rebuilt. Request-specific work is limited to one record's
 * rows, the list entries and the small research and use-case tables.
 */
export function openPreparedCatalogue(file: string) {
  const db = new DatabaseSync(file, { readOnly: true });
  const text = (key: string) =>
    (db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | undefined)?.value;
  const blob = <T>(key: string): T => {
    const row = db.prepare("SELECT value FROM blobs WHERE key = ?").get(key) as { value: Uint8Array } | undefined;
    if (!row) throw new Error(`Prepared release lacks ${key}`);
    return JSON.parse(gunzipSync(row.value).toString("utf8")) as T;
  };
  const contract = text("serving_contract_version");
  if (contract?.split(".")[0] !== PREPARED_CONTRACT_VERSION.split(".")[0])
    throw new Error(`Unsupported prepared release contract ${contract}`);
  const release_id = text("release_id")!;
  const lazy = <T>(load: () => T) => {
    let value: T | undefined;
    return () => (value ??= load());
  };
  const release = lazy(() => JSON.parse(text("release_json")!) as ReturnType<CatalogueQuery["release"]>);
  const readiness = lazy(() => blob<ResearchReadiness[]>("readiness"));
  const research = lazy(() => blob<ResearchData>("research"));
  const inactive = lazy(() => new Set(blob<string[]>("inactive_assessment_dataset_ids")));
  const entries = lazy(() => blob<ListEntry[]>("list_entries"));
  const useCases = lazy(() => useCaseQueryFrom(blob<UseCaseState>("use_cases")));
  const audit = lazy(() => blob<AuditTable>("audit"));
  const homeSummary = lazy(() => blob<{
      records: number; external: number; own: number;
      kinds: { label: string; value: number }[]; areas: { label: string; value: number }[];
      coverage: { name: string; evaluations: number }[]; covered: number; benchmarks: number;
    }>("home_summary"));
  const baselineAudit = lazy(() => blob<unknown>("baseline_audit"));
  const evidenceSummary = lazy(() => blob<{
    rows: number; by_scope: Record<string, number>; facts: number; facts_by_status: Record<string, number>;
  }>("evidence_summary"));
  const associations = lazy(() => new Set(blob<string[]>("association_keys")));
  const auditStatement = db.prepare("SELECT gz FROM audit_checks WHERE record_id = ?");

  const recordStatement = db.prepare("SELECT json FROM records WHERE id = ?");
  const record = (id: string): CatalogueRecord | null => {
    const row = recordStatement.get(id) as { json: string } | undefined;
    return row ? (JSON.parse(row.json) as CatalogueRecord) : null;
  };
  const detailStatement = db.prepare("SELECT gz FROM details WHERE id = ?");
  const detail = (id: string) => {
    const row = detailStatement.get(id) as { gz: Uint8Array } | undefined;
    return row
      ? (JSON.parse(gunzipSync(row.gz).toString("utf8")) as NonNullable<ReturnType<CatalogueQuery["get"]>>)
      : null;
  };
  const rowStatement = db.prepare("SELECT gz FROM result_rows WHERE result_id = ?");
  const resultRow = (id: string): ResultRow | undefined => {
    const row = rowStatement.get(id) as { gz: Uint8Array } | undefined;
    return row ? (JSON.parse(gunzipSync(row.gz).toString("utf8")) as ResultRow) : undefined;
  };
  const indexStatement = db.prepare("SELECT result_id FROM result_index WHERE record_id = ? ORDER BY pos");
  const evidenceStatement = db.prepare("SELECT gz FROM evidence WHERE record_id = ?");

  return {
    release_id,
    meta: (key: string) => text(key),
    release: () => release(),
    record,
    /** All records of one kind, ordered by ID (index pages and sitemaps). */
    recordsOfKind: (kind: string): CatalogueRecord[] =>
      (db.prepare("SELECT json FROM records WHERE kind = ? ORDER BY id").all(kind) as { json: string }[]).map(
        (row) => JSON.parse(row.json) as CatalogueRecord,
      ),
    /** Every record ID and kind, ordered by ID. */
    recordIds: () => db.prepare("SELECT id, kind, status FROM records ORDER BY id").all() as {
      id: string;
      kind: CatalogueRecord["kind"];
      status: string;
    }[],
    get({ id, include_comparisons = true }: { id: string; include_comparisons?: boolean }) {
      const found = detail(id);
      if (!found || include_comparisons) return found;
      return { ...found, published_comparisons: found.published_comparisons.slice(0, 1) };
    },
    comparison({ id, panel_id }: { id: string; panel_id: string }) {
      const panel = detail(id)?.published_comparisons.find((item) => item.id === panel_id);
      return { release_id, panel: panel || null };
    },
    results(input: ResultsInput) {
      const ids = (indexStatement.all(input.id) as { result_id: string }[]).map((row) => row.result_id);
      return resultPage(release_id, ids.map((id) => resultRow(id)!), input);
    },
    evidence(input: EvidenceInput) {
      const row = evidenceStatement.get(input.id) as { gz: Uint8Array } | undefined;
      const rows = row ? (JSON.parse(gunzipSync(row.gz).toString("utf8")) as EvidenceRow[]) : [];
      return evidencePage(release_id, rows, input);
    },
    list(input: ListInput = {}) {
      return listPage(
        release_id,
        entries(),
        input,
        (ids) => readiness().filter((item) => ids.has(item.record_id)),
        (items) => items.map((item) => record(item.record.id)!),
      );
    },
    compare({ ids }: { ids: string[] }) {
      return compareResults(release_id, ids, resultRow, inactive());
    },
    researchReadiness: (input: ReadinessInput = {}) => readinessPage(release_id, readiness(), input),
    investigations: (input: InvestigationsInput = {}) => investigationsPage(release_id, research(), input),
    useCases: () => useCases(),
    /** Homepage counts and benchmark coverage (raw labels). */
    homeSummary: () => homeSummary(),
    /** The baseline coverage audit (lib/baseline-coverage.ts) for this release. */
    baselineAudit: <T = unknown>() => baselineAudit() as T,
    /** Counts the evidence guide shows. */
    evidenceSummary: () => evidenceSummary(),
    /** Whether a reviewed claim backs `subject`'s link `relation` to `target` (the rollup gate). */
    verifiedAssociation: (subject: string, relation: string, target: string) =>
      associations().has(`${subject}|links:${relation}:${target}`),
    research: () => research(),
    auditRuns: (input: { release_id: string; cursor?: string; limit?: number }) => auditRunsPage(audit(), input),
    auditRecords: (input: AuditRecordsInput) => auditRecordsPage(audit(), input),
    auditChecks(input: AuditChecksInput) {
      const row = auditStatement.get(input.record_id) as { gz: Uint8Array } | undefined;
      const checks = row ? (JSON.parse(gunzipSync(row.gz).toString("utf8")) as AuditCheck[]) : [];
      const sources = new Map<string, unknown>();
      for (const id of [...new Set(checks.flatMap((check) => check.source_ids))]) sources.set(id, record(id) ?? undefined);
      return auditChecksPage(audit(), input, checks, record(input.record_id) ?? undefined, sources);
    },
    close: () => db.close(),
  };
}
export type PreparedCatalogue = ReturnType<typeof openPreparedCatalogue>;
