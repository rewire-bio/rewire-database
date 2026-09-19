import { applyAcquisitionCorrections } from "../acquisition/records";
import type { RecordEntry } from "../schema";
import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";
import {
  auditHash,
  auditTarget,
  validateAudit,
  type AuditBundle,
  type AuditCheck,
  type AuditRun,
} from "../../../services/omics/src/audit";

/** Deliberately tolerates legacy entity kinds and extensible archived fields. */
export interface HistoricalRecord {
  id: string;
  kind: string;
  name: string;
  source_ids: string[];
  links: { relation: string; target_id: string }[];
  attributes: Record<string, unknown>;
  [key: string]: unknown;
}
export interface HistoricalCatalogue {
  release_id: string;
  records: HistoricalRecord[];
  [key: string]: unknown;
}
export interface VersionReference {
  record_id: string;
  record_sha256: string;
  source_fingerprints: Record<string, string>;
  check_ids: string[];
  representative_release_id: string;
  coverage:
    | "current_checks_reused"
    | "historical_checks_reused"
    | "new_historical_assessment";
}
export interface HistoricalInventory {
  release_id: string;
  inventory_sha256: string;
  record_count: number;
  counts: Record<VersionReference["coverage"], number>;
  versions: VersionReference[];
}
export interface HistoricalState {
  versions: Map<string, VersionReference>;
}
const DATE = "2026-09-19";

export function historicalSources(
  record: HistoricalRecord,
  records: Map<string, HistoricalRecord>,
): Record<string, string> {
  const ids = new Set<string>(record.kind === "source" ? [record.id] : []);
  const visit = (v: unknown): void => {
    if (Array.isArray(v)) {
      v.forEach(visit);
      return;
    }
    if (v && typeof v === "object")
      for (const [key, value] of Object.entries(v)) {
        if (
          (key === "source_ids" || key.endsWith("_source_ids")) &&
          Array.isArray(value)
        )
          value.forEach((id) => {
            if (typeof id === "string") ids.add(id);
          });
        else visit(value);
      }
  };
  visit(record);
  return Object.fromEntries(
    [...ids].sort().map((id) => [id, auditHash(records.get(id))]),
  );
}
export function historicalVersionKey(
  record: HistoricalRecord,
  sources: Record<string, string>,
): string {
  return auditHash([auditHash(record), sources]);
}
export function reusableHistoricalChecks(
  record: HistoricalRecord,
  records: Map<string, HistoricalRecord>,
  checks: AuditCheck[],
): AuditCheck[] {
  return checks.filter(
    (check) =>
      check.record_id === record.id &&
      check.target_sha256 === auditTarget(record, check.field_paths) &&
      check.source_ids.every(
        (id) =>
          records.get(id)?.kind === "source" &&
          check.source_fingerprints?.[id] === auditHash(records.get(id)),
      ),
  );
}
/** Existence/envelope checks only: never applies today's scientific entity taxonomy. */
export function historicalStructureErrors(
  record: HistoricalRecord,
  records: Map<string, HistoricalRecord>,
): string[] {
  const errors: string[] = [];
  if (
    !record.id ||
    typeof record.kind !== "string" ||
    !record.kind ||
    typeof record.name !== "string" ||
    !record.name
  )
    errors.push("missing legacy identity/name/kind");
  if (
    !record.attributes ||
    typeof record.attributes !== "object" ||
    Array.isArray(record.attributes)
  )
    errors.push("invalid legacy attributes object");
  if (!Array.isArray(record.source_ids))
    errors.push("invalid legacy source list");
  else
    for (const id of record.source_ids)
      if (records.get(id)?.kind !== "source")
        errors.push(`missing source ${id}`);
  for (const id of Object.keys(historicalSources(record, records)))
    if (records.get(id)?.kind !== "source")
      errors.push(`missing nested source ${id}`);
  if (!Array.isArray(record.links)) errors.push("invalid legacy relationships");
  else
    for (const link of record.links)
      if (typeof link.relation !== "string" || !records.has(link.target_id))
        errors.push(`missing relationship target ${link.target_id}`);
  return errors;
}

export function assessHistoricalCatalogue(
  archive: HistoricalCatalogue,
  current: HistoricalCatalogue,
  currentChecks: AuditCheck[],
  state: HistoricalState,
  revision: string,
): { run: AuditRun; checks: AuditCheck[]; inventory: HistoricalInventory } {
  const records = new Map(archive.records.map((r) => [r.id, r]));
  const currentRecords = new Map(current.records.map((r) => [r.id, r]));
  if (records.size !== archive.records.length)
    throw Error(`Duplicate record identity in archive ${archive.release_id}`);
  const currentChecksById = new Map<string, AuditCheck[]>();
  for (const c of currentChecks) {
    const list = currentChecksById.get(c.record_id) || [];
    list.push(c);
    currentChecksById.set(c.record_id, list);
  }
  const tuples = archive.records
    .map((r) => [r.id, historicalVersionKey(r, historicalSources(r, records))])
    .sort(([a], [b]) => a.localeCompare(b));
  const runId = `audit-historical-${archive.release_id}-${auditHash([tuples, revision, currentChecks.map((c) => c.id).sort()]).slice(0, 12)}`;
  const checks: AuditCheck[] = [];
  const versions: VersionReference[] = [];
  const counts: HistoricalInventory["counts"] = {
    current_checks_reused: 0,
    historical_checks_reused: 0,
    new_historical_assessment: 0,
  };
  for (const record of [...archive.records].sort((a, b) =>
    a.id.localeCompare(b.id),
  )) {
    const fingerprints = historicalSources(record, records);
    const key = historicalVersionKey(record, fingerprints);
    const recordHash = auditHash(record);
    const existing = currentRecords.get(record.id);
    const matchingChecks = reusableHistoricalChecks(
      record,
      records,
      currentChecksById.get(record.id) || [],
    );
    const identicalCurrent =
      existing &&
      key ===
        historicalVersionKey(
          existing,
          historicalSources(existing, currentRecords),
        );
    let ref: VersionReference;
    if (identicalCurrent && matchingChecks.length) {
      ref = {
        record_id: record.id,
        record_sha256: recordHash,
        source_fingerprints: fingerprints,
        check_ids: matchingChecks.map((c) => c.id).sort(),
        representative_release_id: current.release_id,
        coverage: "current_checks_reused",
      };
    } else if (state.versions.has(key)) {
      ref = {
        ...state.versions.get(key)!,
        coverage: "historical_checks_reused",
      };
    } else {
      const errors = historicalStructureErrors(record, records);
      const make = (
        category: AuditCheck["category"],
        outcome: AuditCheck["outcome"],
        explanation: string,
      ): AuditCheck => {
        const c: AuditCheck = {
          id: "",
          run_id: runId,
          record_id: record.id,
          record_kind: record.kind,
          record_name: record.name,
          field_paths: ["$record"],
          target_sha256: auditTarget(record, ["$record"]),
          category,
          outcome,
          checked_at: DATE,
          source_ids: Object.keys(fingerprints),
          source_fingerprints: fingerprints,
          evidence_row_ids: [],
          source_locators: [
            `Archived catalogue ${archive.release_id}; record ${record.id}`,
          ],
          source_hashes: Object.keys(fingerprints)
            .map((id) => records.get(id)?.attributes.artifact_sha256)
            .filter(
              (h): h is string =>
                typeof h === "string" && /^[a-f0-9]{64}$/.test(h),
            ),
          receipt_ids: [`${runId}.inventory.jsonl.gz#${record.id}`],
          explanation,
          prior_check_ids: [],
        };
        c.id = `check-${auditHash({ ...c, id: undefined }).slice(0, 32)}`;
        return c;
      };
      const own = [
        make(
          "structure",
          errors.length ? "contradicted" : "supported",
          errors.length
            ? `Archived legacy envelope/reference findings: ${errors.join("; ")}. No current-schema reclassification was applied.`
            : "Legacy record identity, envelope and referenced endpoints exist within this exact archived release. Unknown legacy entity kinds are retained; this does not verify scientific metadata or source claims.",
        ),
        make(
          "metadata",
          "insufficient_evidence",
          "This distinct archived scientific version was inventoried with its exact record hash and source dependencies. Current or historical checks are reused only through the explicit inventory check IDs when their field target and source fingerprints match. Uncovered historical claims require source-specific review; preserved earlier status is not fresh verification.",
        ),
      ];
      checks.push(...own);
      ref = {
        record_id: record.id,
        record_sha256: recordHash,
        source_fingerprints: fingerprints,
        check_ids: [
          ...own.map((c) => c.id),
          ...matchingChecks.map((c) => c.id),
        ].sort(),
        representative_release_id: archive.release_id,
        coverage: "new_historical_assessment",
      };
    }
    versions.push(ref);
    counts[ref.coverage]++;
    state.versions.set(key, ref);
  }
  const inventoryHash = auditHash(tuples);
  const run: AuditRun = {
    id: runId,
    baseline_release_id: archive.release_id,
    inventory_sha256: inventoryHash,
    started_at: DATE,
    completed_at: DATE,
    reviewer: "Automated archived-version inventory and scoped check reuse",
    review_method: "automated",
    verifier_revision: revision,
    scope: `Every one of ${archive.records.length} records in archived release ${archive.release_id} assessed or explicitly linked to checks of identical record/source versions. New version assessments: ${counts.new_historical_assessment}; current reused: ${counts.current_checks_reused}; historical reused: ${counts.historical_checks_reused}. Inventory retains all original IDs and kinds.`,
    limitations: [
      "Structural support does not verify scientific claims",
      "New distinct historical metadata remains insufficient evidence unless a source-specific applicable check is explicitly linked",
      "Legacy record types are not coerced into current entity types",
      "Record_count and check_count count newly emitted checks only; complete archive coverage and explicit reuse links are in the version inventory",
      "Reusing a check preserves its original outcome; it does not upgrade status or create independent evidence",
    ],
    record_count: new Set(checks.map((c) => c.record_id)).size,
    check_count: checks.length,
  };
  return {
    run,
    checks,
    inventory: {
      release_id: archive.release_id,
      inventory_sha256: inventoryHash,
      record_count: archive.records.length,
      counts,
      versions,
    },
  };
}

export function verifyHistoricalArchiveBytes(
  bytes: Buffer,
  manifest: { catalogue_sha256?: string; files?: Record<string, string> },
): string {
  const digest = createHash("sha256").update(bytes).digest("hex");
  const expected =
    manifest.files?.["catalogue.json"] || manifest.catalogue_sha256;
  if (!expected || digest !== expected)
    throw Error("Archived catalogue checksum absent or mismatched");
  return digest;
}

export function writeHistoricalAudits(root = process.cwd()): void {
  const dir = path.join(root, "data/omics/audits");
  const published = path.join(root, "public/omics/releases");
  const current = JSON.parse(
    fs.readFileSync(path.join(root, "public/omics/catalogue.json"), "utf8"),
  ) as HistoricalCatalogue;
  const acquired = path.join(
    root,
    "data/omics/acquisition/2026-09-19/reviewed-records.jsonl",
  );
  if (fs.existsSync(acquired))
    current.records = [
      ...new Map(
        [
          ...current.records,
          ...fs
            .readFileSync(acquired, "utf8")
            .trim()
            .split("\n")
            .filter(Boolean)
            .map((l) => JSON.parse(l)),
        ].map((r: HistoricalRecord) => [r.id, r]),
      ).values(),
    ];
  current.records = applyAcquisitionCorrections(
    current.records as RecordEntry[],
  );
  const currentRuns: AuditRun[] = [];
  const currentChecks: AuditCheck[] = [];
  for (const file of fs.readdirSync(dir).sort()) {
    if (file.startsWith("audit-historical-")) continue;
    if (file.endsWith(".run.json"))
      currentRuns.push(
        JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")),
      );
    if (file.endsWith(".checks.jsonl.gz"))
      currentChecks.push(
        ...gunzipSync(fs.readFileSync(path.join(dir, file)))
          .toString()
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((l) => JSON.parse(l)),
      );
  }
  if (!currentRuns.length || !currentChecks.length)
    throw Error(
      "Run the current catalogue audit generator before historical audit generation",
    );
  const revision = auditHash(
    fs.readFileSync(fileURLToPath(import.meta.url), "utf8"),
  );
  const bundle: AuditBundle = {
    schema_version: "1.0",
    runs: [...currentRuns],
    checks: [...currentChecks],
    resolutions: [],
  };
  const state: HistoricalState = { versions: new Map() };
  const output: { file: string; bytes: Buffer }[] = [];
  const summary = [];
  for (const release of fs.readdirSync(published).sort()) {
    const file = path.join(published, release, "catalogue.json");
    if (!fs.existsSync(file)) continue;
    const bytes = fs.readFileSync(file);
    const manifest = JSON.parse(
      fs.readFileSync(path.join(published, release, "manifest.json"), "utf8"),
    );
    const catalogueHash = verifyHistoricalArchiveBytes(bytes, manifest);
    const archive = JSON.parse(bytes.toString()) as HistoricalCatalogue;
    if (archive.release_id !== release)
      throw Error(`Archive directory/release mismatch: ${release}`);
    const result = assessHistoricalCatalogue(
      archive,
      current,
      currentChecks,
      state,
      revision,
    );
    bundle.runs.push(result.run);
    bundle.checks.push(...result.checks);
    const meta = {
      schema_version: "1.0",
      run_id: result.run.id,
      release_id: release,
      catalogue_bytes_sha256: catalogueHash,
      record_count: result.inventory.record_count,
      inventory_sha256: result.inventory.inventory_sha256,
      coverage_counts: result.inventory.counts,
    };
    output.push(
      {
        file: `${result.run.id}.run.json`,
        bytes: Buffer.from(JSON.stringify(result.run, null, 2) + "\n"),
      },
      {
        file: `${result.run.id}.checks.jsonl.gz`,
        bytes: gzipSync(
          result.checks.map((c) => JSON.stringify(c)).join("\n") + "\n",
          { level: 9 },
        ),
      },
      {
        file: `${result.run.id}.inventory.jsonl.gz`,
        bytes: gzipSync(
          [
            JSON.stringify(meta),
            ...result.inventory.versions.map((v) => JSON.stringify(v)),
          ].join("\n") + "\n",
          { level: 9 },
        ),
      },
    );
    summary.push(meta);
  }
  validateAudit(bundle);
  const allChecks = new Map(bundle.checks.map((c) => [c.id, c]));
  // Check every explicit version-map link actually resolves. Target/source validation happened before reuse.
  for (const item of output.filter((o) =>
    o.file.endsWith(".inventory.jsonl.gz"),
  )) {
    const rows = gunzipSync(item.bytes)
      .toString()
      .trim()
      .split("\n")
      .slice(1)
      .map((l) => JSON.parse(l) as VersionReference);
    for (const row of rows)
      for (const id of row.check_ids)
        if (!allChecks.has(id))
          throw Error(`Unresolved historical check link ${id}`);
  }
  // Validate all immutable destinations before writing any, so a mismatched rerun cannot partly mutate history.
  for (const item of output) {
    const dest = path.join(dir, item.file);
    if (fs.existsSync(dest) && !fs.readFileSync(dest).equals(item.bytes))
      throw Error(`Historical audit overwrite rejected: ${dest}`);
  }
  for (const item of output) {
    const dest = path.join(dir, item.file);
    if (!fs.existsSync(dest)) fs.writeFileSync(dest, item.bytes);
  }
  console.log(
    JSON.stringify(
      {
        archives: summary.length,
        new_checks: bundle.checks.length - currentChecks.length,
        versions: state.versions.size,
        releases: summary,
      },
      null,
      2,
    ),
  );
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  writeHistoricalAudits();
