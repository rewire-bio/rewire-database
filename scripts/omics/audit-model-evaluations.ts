import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createCatalogueQuery, type CatalogueSnapshot } from "../../services/omics/src/catalogue-query";
import { isModelSubject } from "../../services/omics/src/entity-kinds";
import { auditCsv } from "./baseline-coverage";

/** Coverage comes from the same reviewed graph as website/API results, not names. */
export function modelEvaluationAudit(snapshot: CatalogueSnapshot) {
  const query = createCatalogueQuery(snapshot);
  const claims = snapshot.records.filter(record => record.kind === "claim" && ["source_checked", "reproduced"].includes(record.status) && record.source_ids.length && record.attributes.source_locator);
  const verified = (subject: string, relation: string, target: string) => claims.some(claim => claim.links.some(link => link.relation === "subject" && link.target_id === subject) && claim.attributes.field === `links:${relation}:${target}`);
  const rows = snapshot.records.filter(record => isModelSubject(record.kind)).map(record => {
    const first = query.results({ id: record.id, limit: 100 });
    const resultRows = [...first.items];
    let cursor = first.next_cursor;
    while (cursor) { const page = query.results({ id: record.id, cursor, limit: 100 }); resultRows.push(...page.items); cursor = page.next_cursor; }
    const aliases = record.links.filter(link => link.relation === "alias_of" && verified(record.id, link.relation, link.target_id)).map(link => link.target_id);
    const pipelines = snapshot.records.filter(item => item.links.some(link => link.relation === "uses_model" && link.target_id === record.id && verified(item.id, link.relation, record.id))).map(item => ({ id: item.id, kind: item.kind, results: query.results({ id: item.id, limit: 1 }).total }));
    const broaderFamilies = record.links.filter(link => ["family", "variant_of", "alias_of"].includes(link.relation) && verified(record.id, link.relation, link.target_id)).map(link => ({ id: link.target_id, results: query.results({ id: link.target_id, limit: 1 }).total })).filter(item => item.results > 0);
    return {
      record_id: record.id, name: record.name, kind: record.kind, record_status: record.status,
      coverage_status: first.total ? "linked_evaluations" : pipelines.some(item => item.results) ? "downstream_evaluations_only" : broaderFamilies.length ? "broader_family_only" : "no_linked_evaluations",
      evaluations: first.evaluation_count, metric_rows: first.total, verified_alias_targets: aliases,
      result_ids: resultRows.map(row => row.result.id),
      evidence_origins: [...new Set(resultRows.map(row => row.origin))].sort(),
      source_ids: [...new Set(resultRows.flatMap(row => row.sources.map(source => source.id)))].sort(),
      downstream: pipelines, broader_families: broaderFamilies,
    };
  });
  const counts = Object.fromEntries([...new Set(rows.map(row => row.kind))].map(kind => {
    const selected = rows.filter(row => row.kind === kind);
    return [kind, { records: selected.length, with_evaluations: selected.filter(row => row.metric_rows > 0).length, broader_family_only: selected.filter(row => row.coverage_status === "broader_family_only").length, downstream_only: selected.filter(row => row.coverage_status === "downstream_evaluations_only").length, without_evaluations: selected.filter(row => row.metric_rows === 0).length }];
  }));
  return { release_id: snapshot.release_id, method: "Automated graph coverage audit, not source verification or model execution", counts, rows };
}

if (process.argv[1]?.endsWith("audit-model-evaluations.ts")) {
  const source = process.argv[2] || "public/omics/catalogue.json";
  const output = process.argv[3] || "workbench/model-evaluation-coverage/audit";
  const raw = fs.readFileSync(source);
  const audit = modelEvaluationAudit(JSON.parse(raw.toString("utf8")));
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, "all-model-entities.csv"), auditCsv(audit.rows));
  fs.writeFileSync(path.join(output, "model-pages.csv"), auditCsv(audit.rows.filter(row => row.kind === "model")));
  fs.writeFileSync(path.join(output, "summary.json"), JSON.stringify({ ...audit, rows: undefined, catalogue_sha256: createHash("sha256").update(raw).digest("hex") }, null, 2) + "\n");
  console.log(JSON.stringify(audit.counts));
}
