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
import { decodeRecords, unpackEvidence, type PackedEvidence } from "./serving-codec.js";
import { sourceRecordsPage, sourceResultsPage, type SourceRecordsInput, type SourceResultsInput } from "./source-records.js";
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

/** Serving contract of the prepared release file (tables and their meaning).
 * 3.x stores each record once and refers to it from details, result rows and
 * use cases (serving-codec.ts), and stores use cases as rows. 3.1 adds the
 * source_records table; on older files source pages read as having no records.
 * The reader also opens 2.x files, so a website can switch between releases of
 * either form. */
export const PREPARED_CONTRACT_VERSION = "3.1";
const READABLE_CONTRACT_MAJORS = ["2", "3"];

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
  const major = contract?.split(".")[0];
  if (!major || !READABLE_CONTRACT_MAJORS.includes(major))
    throw new Error(`Unsupported prepared release contract ${contract}`);
  const referenced = major !== "2";
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
  const useCases = lazy(() => (referenced ? useCaseRows() : useCaseQueryFrom(blob<UseCaseState>("use_cases"))));
  const evidenceSources = lazy(() => blob<Parameters<typeof unpackEvidence>[3]>("evidence_sources"));
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

  const unzip = (gz: Uint8Array) => JSON.parse(gunzipSync(gz).toString("utf8")) as unknown;
  const recordColumn = referenced ? "gz" : "json";
  const parseRecord = (row: { json?: string; gz?: Uint8Array }) =>
    (referenced ? unzip(row.gz!) : JSON.parse(row.json!)) as CatalogueRecord;
  const recordStatement = db.prepare(`SELECT ${recordColumn} FROM records WHERE id = ?`);
  const record = (id: string): CatalogueRecord | null => {
    const row = recordStatement.get(id) as { json?: string; gz?: Uint8Array } | undefined;
    return row ? parseRecord(row) : null;
  };
  /** A value as stored: record references resolved for 3.x files. `lookup`
   * lets one request share records it reads more than once. */
  const stored = <T>(gz: Uint8Array, lookup: (id: string) => CatalogueRecord | null = record): T =>
    referenced ? decodeRecords<T>(unzip(gz), lookup) : (unzip(gz) as T);
  const sharedLookup = () => {
    const seen = new Map<string, CatalogueRecord | null>();
    return (id: string) => {
      if (!seen.has(id)) seen.set(id, record(id));
      return seen.get(id)!;
    };
  };
  const detailStatement = db.prepare("SELECT gz FROM details WHERE id = ?");
  const detail = (id: string) => {
    const row = detailStatement.get(id) as { gz: Uint8Array } | undefined;
    return row ? stored<NonNullable<ReturnType<CatalogueQuery["get"]>>>(row.gz) : null;
  };
  const rowStatement = db.prepare("SELECT gz FROM result_rows WHERE result_id = ?");
  const resultRow = (id: string, lookup?: (id: string) => CatalogueRecord | null): ResultRow | undefined => {
    const row = rowStatement.get(id) as { gz: Uint8Array } | undefined;
    return row ? stored<ResultRow>(row.gz, lookup) : undefined;
  };
  /** Use cases from 3.x rows: each answer reads only the entries it needs. */
  const useCaseRows = () => {
    const entryStatement = db.prepare("SELECT gz FROM use_case_entries WHERE section = ? AND key = ?");
    const base = blob<Pick<UseCaseState, "release_id" | "input_sha256" | "entries" | "backlinks">>("use_case_base");
    // Index pages read the same use case's evaluations a page at a time, so the
    // last few decoded entries are kept.
    const recent = new Map<string, [string, unknown][]>();
    const entry = <T>(section: "mappings" | "results" | "sources", key: string): [string, T][] => {
      const id = `${section}\u0000${key}`;
      let found = recent.get(id);
      if (found) recent.delete(id);
      else {
        const row = entryStatement.get(section, key) as { gz: Uint8Array } | undefined;
        found = row ? [[key, stored<T>(row.gz, sharedLookup())]] : [];
      }
      recent.set(id, found);
      if (recent.size > 8) recent.delete(recent.keys().next().value!);
      return found as [string, T][];
    };
    const over = (state: Partial<UseCaseState>) =>
      useCaseQueryFrom({ ...base, mappings: [], backlinks: [], results: [], sources: [], ...state });
    const all = over({ backlinks: base.backlinks });
    type Query = ReturnType<typeof useCaseQueryFrom>;
    return {
      list: (input?: Parameters<Query["list"]>[0]) => all.list(input),
      links: (input: Parameters<Query["links"]>[0]) => all.links(input),
      get(input: Parameters<Query["get"]>[0]) {
        const found = base.entries.find((u) => u.slug === input.slug);
        if (!found) return null;
        return over({ mappings: entry("mappings", found.id), sources: entry("sources", found.id) }).get(input);
      },
      evaluationResults: (input: Parameters<Query["evaluationResults"]>[0]) =>
        over({ results: entry("results", `${input.mapping_id}|${input.evaluation_id}`) }).evaluationResults(input),
    } satisfies Pick<Query, "list" | "links" | "get" | "evaluationResults">;
  };
  const indexStatement = db.prepare("SELECT result_id FROM result_index WHERE record_id = ? ORDER BY pos");
  // Source pages (3.1). Older files have no table, so every source has no records.
  const hasSourceRecords = !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'source_records'").get();
  const sourceCountsStatement = hasSourceRecords
    ? db.prepare("SELECT kind, count FROM source_records WHERE source_id = ? ORDER BY pos")
    : null;
  const sourceIdsStatement = hasSourceRecords
    ? db.prepare("SELECT gz FROM source_records WHERE source_id = ? AND kind = ?")
    : null;
  const sourceCounts = (id: string): Record<string, number> =>
    Object.fromEntries(
      ((sourceCountsStatement?.all(id) || []) as { kind: string; count: number }[]).map((row) => [row.kind, Number(row.count)]),
    );
  const sourceIds = (id: string, kind: string): string[] => {
    const row = sourceIdsStatement?.get(id, kind) as { gz: Uint8Array } | undefined;
    return row ? (unzip(row.gz) as string[]) : [];
  };
  const evidenceStatement = db.prepare("SELECT gz FROM evidence WHERE record_id = ?");

  return {
    release_id,
    meta: (key: string) => text(key),
    release: () => release(),
    record,
    /** All records of one kind, ordered by ID (index pages and sitemaps). */
    recordsOfKind: (kind: string): CatalogueRecord[] =>
      (db.prepare(`SELECT ${recordColumn} FROM records WHERE kind = ? ORDER BY id`).all(kind) as { json?: string; gz?: Uint8Array }[]).map(parseRecord),
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
      const lookup = sharedLookup();
      return resultPage(release_id, ids.map((id) => resultRow(id, lookup)!), input);
    },
    evidence(input: EvidenceInput) {
      const row = evidenceStatement.get(input.id) as { gz: Uint8Array } | undefined;
      const rows = !row
        ? []
        : referenced
          ? unpackEvidence(unzip(row.gz) as PackedEvidence, record(input.id)!, release_id, evidenceSources())
          : (unzip(row.gz) as EvidenceRow[]);
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
      const lookup = sharedLookup();
      return compareResults(release_id, ids, (id) => resultRow(id, lookup), inactive());
    },
    /** What the catalogue took from one source: counts by kind and a page of
     * record IDs per kind, or of `kind` alone. Reads only that source's rows. */
    sourceRecords: (input: SourceRecordsInput) =>
      sourceRecordsPage(release_id, sourceCounts(input.id), (kind) => sourceIds(input.id, kind), input),
    /** One page of a source's results as table rows (value, metric, qualifier,
     * tested entity, benchmark, dataset). Reads only the rows on the page and
     * the records they name. */
    sourceResults(input: SourceResultsInput) {
      const lookup = sharedLookup();
      return sourceResultsPage(release_id, sourceIds(input.id, "result"), (id) => resultRow(id, lookup), input);
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
