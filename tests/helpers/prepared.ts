/**
 * In-memory stand-in for the prepared release reader, for tests that build
 * small synthetic catalogues. It answers through the live query engine and
 * computes the stored summaries the way the producer's builder does
 * (rewire-benchmark-data scripts/serving/sqlite.ts). The real file's answers
 * are checked against the live engine in the producer's parity suite.
 */
import { createCatalogueQuery, type CatalogueSnapshot } from "../../services/omics/src/catalogue-query";
import { createEvidenceIndex } from "../../services/omics/src/evidence-table";
import { getResearch } from "../../services/omics/src/research";
import { createUseCaseQuery, type UseCaseArtifact, type UseCaseDeclaration } from "../../services/omics/src/use-cases";
import { auditChecksPage, auditRecordsPage, auditRunsPage, type AuditTable } from "../../services/omics/src/audit-query";
import { benchmarkCoverage } from "../../scripts/omics/audit-benchmark-evidence";
import { buildBaselineAudit } from "../../lib/baseline-coverage";
import type { PreparedCatalogue } from "../../services/omics/src/prepared-catalogue";

export function preparedFromSnapshot(
  snapshot: CatalogueSnapshot,
  options: {
    useCases?: { artifact: UseCaseArtifact; declaration: UseCaseDeclaration };
    audit?: AuditTable;
    /** Research data served as-is, bypassing the engine's validation, to test route privacy. */
    research?: CatalogueSnapshot["research"];
  } = {},
): PreparedCatalogue {
  const live = createCatalogueQuery(snapshot);
  const records = snapshot.records;
  const visible = records.filter((record) => record.status !== "excluded").sort((a, b) => a.id.localeCompare(b.id));
  const keys = new Set<string>();
  for (const item of records)
    if (item.kind === "claim" && ["source_checked", "reproduced"].includes(item.status) &&
        item.source_ids.length > 0 && !!item.attributes.source_locator)
      for (const link of item.links) if (link.relation === "subject") keys.add(`${link.target_id}|${String(item.attributes.field)}`);
  let useCases: ReturnType<typeof createUseCaseQuery> | undefined;
  const audit = options.audit || { index: [], runs: [], resolutions: [] };
  const tally = (pick: (record: (typeof records)[number]) => string[]) => {
    const counts = new Map<string, number>();
    for (const record of records) for (const key of pick(record)) counts.set(key, (counts.get(key) || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));
  };
  const reader = {
    release_id: snapshot.release_id,
    meta: () => undefined,
    release: live.release,
    record: live.record,
    recordsOfKind: (kind: string) => visible.filter((record) => record.kind === kind),
    recordIds: () => visible.map(({ id, kind, status }) => ({ id, kind, status })),
    get: live.get,
    comparison: live.comparison,
    results: live.results,
    evidence: live.evidence,
    list: live.list,
    compare: live.compare,
    researchReadiness: live.researchReadiness,
    investigations: live.investigations,
    useCases: () => (useCases ??= createUseCaseQuery(snapshot, options.useCases?.artifact, options.useCases?.declaration, live)),
    homeSummary: () => {
      const coverage = benchmarkCoverage(records);
      return {
        records: records.length,
        external: records.filter((r) => r.kind === "result" && r.status === "source_checked").length,
        own: records.filter((r) => r.kind === "result" && r.status === "reproduced").length,
        kinds: tally((record) => [record.kind]),
        areas: tally((record) => record.facets.areas || []).slice(0, 10),
        coverage: coverage.map((entry) => ({ name: entry.name, evaluations: entry.evaluations })),
        covered: coverage.filter((entry) => entry.evaluations > 0).length,
        benchmarks: coverage.length,
      };
    },
    baselineAudit: <T,>() => buildBaselineAudit(snapshot as never) as T,
    evidenceSummary: () => {
      const rows = createEvidenceIndex(snapshot).all();
      const byScope: Record<string, number> = {};
      for (const row of rows) byScope[row.evidence_scope] = (byScope[row.evidence_scope] || 0) + 1;
      const facts = new Map<string, (typeof rows)[number]>();
      for (const row of rows) if (/\.profile\.facts\.\d+\.value$/.test(row.field_path)) facts.set(`${row.record_id}:${row.field_path}`, row);
      const factsByStatus: Record<string, number> = {};
      for (const row of facts.values()) factsByStatus[row.review_status] = (factsByStatus[row.review_status] || 0) + 1;
      return { rows: rows.length, by_scope: byScope, facts: facts.size, facts_by_status: factsByStatus };
    },
    verifiedAssociation: (subject: string, relation: string, target: string) => keys.has(`${subject}|links:${relation}:${target}`),
    research: () => getResearch({ research: options.research ?? snapshot.research }),
    auditRuns: (input: Parameters<typeof auditRunsPage>[1]) => auditRunsPage(audit, input),
    auditRecords: (input: Parameters<typeof auditRecordsPage>[1]) => auditRecordsPage(audit, input),
    auditChecks: (input: Parameters<typeof auditChecksPage>[1]) =>
      auditChecksPage(audit, input, [], live.record(input.record_id) ?? undefined, new Map()),
    close: () => undefined,
  };
  return reader as unknown as PreparedCatalogue;
}
