import fs from "node:fs";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { buildBatch, slug, type BatchSpec } from "./extract/batch";
import { recordSchema, type RecordEntry } from "./schema";

export const coverageTableRoot = "data/omics/reviewed/model-coverage-tables-2026-09-23";
export const coverageTableInputs = fs.existsSync(coverageTableRoot) ? fs.readdirSync(coverageTableRoot).filter(file => /\.(json|jsonl|gz)$/.test(file)).sort().map(file => `${coverageTableRoot}/${file}`) : [];
type CoverageSpec = BatchSpec & {
  benchmarkRecord?: RecordEntry;
  modelLinks: Record<string, { relation: "family" | "uses_model"; target: string }[]>;
  datasetIds?: Record<string, string>;
  extraSourceIds?: string[];
  methodAdaptations?: Record<string, string>;
  origins?: Record<string, string>;
  resultAttributes?: Record<string, unknown>;
  evaluationAttributes?: Record<string, unknown>;
  groupMetrics?: boolean;
  adaptation: string;
  overlapNote: string;
  uncertainty?: Record<string, unknown>;
};
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

export function buildCoverageTables(): RecordEntry[] {
  const specs: CoverageSpec[] = JSON.parse(fs.readFileSync(`${coverageTableRoot}/specs.json`, "utf8"));
  return specs.flatMap(spec => {
    let records = buildBatch(spec);
    const datasetRemap = new Map(Object.entries(spec.datasetIds || {}).map(([name, id]) => [`${spec.key}-dataset-${slug(name)}`, id]));
    records = records.filter(record => !(record.kind === "dataset_subset" && datasetRemap.has(record.id)));
    for (const record of records) {
      record.links = record.links.map(link => ({ ...link, target_id: datasetRemap.get(link.target_id) || link.target_id }));
      for (const panel of (record.attributes.comparison_panels || []) as { dataset_id: string }[]) panel.dataset_id = datasetRemap.get(panel.dataset_id) || panel.dataset_id;
    }
    if (spec.benchmarkRecord) records.push(spec.benchmarkRecord);
    for (const record of [...records]) {
      if (record.kind !== "source") record.source_ids = [...new Set([...record.source_ids, ...(spec.extraSourceIds || [])])];
      for (const panel of (record.attributes.comparison_panels || []) as { source_ids: string[] }[]) panel.source_ids = [...new Set([...panel.source_ids, ...(spec.extraSourceIds || [])])];
      if (record.kind === "task") { record.kind = "protocol"; record.attributes.entity_level = "protocol"; }
      if (record.kind === "dataset_subset") record.description = `Dataset subset reported in ${spec.source.name}. Exact split manifest remains unextracted; source-table identity is retained.`;
      if (["configuration", "pipeline", "method"].includes(record.kind)) {
        for (const link of spec.modelLinks[record.name] || []) {
          record.links.push({ relation: link.relation, target_id: link.target });
          records.push({ id: `${record.id}-${link.target}-identity-claim`, kind: "claim", name: `${record.name}: ${link.relation.replaceAll("_", " ")} ${link.target}`, description: "The cited primary table and methods identify this evaluated configuration and its underlying model. No broader checkpoint equivalence is implied.", status: "source_checked", facets: record.facets, source_ids: [spec.source.id, ...(spec.extraSourceIds || [])], links: [{ relation: "subject", target_id: record.id }], attributes: { field: `links:${link.relation}:${link.target}`, target_id: link.target, source_locator: record.attributes.source_locator, review: { method: "automated_source_review", date: spec.date, note: "Source-backed evaluated identity only; no independent reproduction." } } });
        }
      }
      if (record.kind === "evaluation") {
        Object.assign(record.attributes, spec.evaluationAttributes || {});
        const methodId = record.links.find(link => link.relation === "model")!.target_id;
        const method = records.find(item => item.id === methodId)!;
        record.attributes.origin = spec.origins?.[method.name] || "author_reported";
        record.attributes.adaptation = spec.methodAdaptations?.[method.name] || spec.adaptation;
        record.attributes.evidence_overlap = spec.overlapNote;
        record.attributes.published_score_reproduction = false;
        record.attributes.suite_complete = false;
        if (spec.groupMetrics) record.attributes.evaluation_group_id = `${methodId}-${record.links.find(link => link.relation === "dataset")!.target_id}-evaluation-setup`;
      }
      if (record.kind === "result") {
        Object.assign(record.attributes, spec.resultAttributes || {});
        const cell = spec.cells.find(cell => `${spec.key}-result-${slug(cell.method)}-${slug(cell.task)}-${slug(spec.tasks.find(task => task.label === cell.task)!.metricKey)}` === record.id)!;
        if (spec.uncertainty?.[cell.locator]) record.attributes.uncertainty = spec.uncertainty[cell.locator];
        record.attributes.evidence_overlap = spec.overlapNote;
        const evaluation = records.find(item => item.id === record.links[0].target_id)!;
        if (evaluation.attributes.origin === "paper_compilation") record.description = "Score quoted from an earlier evaluation in the cited comparison. It is not additional independent evidence. Exact printed value source checked; not reproduced.";
        if (evaluation.attributes.origin === "independent_paper") record.description = "External evaluation reported by the cited paper. Exact printed value source checked; Rewire has not independently reproduced it.";
        if (evaluation.attributes.origin === "unreported") record.description = "Score reported in the cited comparison table. The original executor of this comparator has not been established. Source checked; not independent new evidence or reproduction.";
      }
    }
    return records.map(record => recordSchema.parse(record));
  });
}

export function addCoverageTables(input: RecordEntry[]): RecordEntry[] {
  const text = fs.readFileSync(`${coverageTableRoot}/records.jsonl`, "utf8");
  const receipt = JSON.parse(fs.readFileSync(`${coverageTableRoot}/review.json`, "utf8"));
  if (receipt.status !== "reviewed" || receipt.review_method !== "automated" || receipt.errors?.length !== 0 || receipt.records_sha256 !== sha(text)) throw Error("Coverage table receipt mismatch");
  const reviewedFiles = coverageTableInputs.filter(file => !file.endsWith("/review.json") && !file.endsWith("/records.jsonl")).map(file => file.slice(coverageTableRoot.length + 1));
  if (reviewedFiles.some(file => !receipt.inputs?.[file])) throw Error("Unreviewed coverage input");
  for (const [file, hash] of Object.entries(receipt.inputs as Record<string, string>))
    if (sha(fs.readFileSync(`${coverageTableRoot}/${file}`)) !== hash) throw Error("Coverage table reviewed input changed");
  for (const [file, hash] of Object.entries(receipt.source_artifacts as Record<string, string>))
    if (sha(gunzipSync(fs.readFileSync(`${coverageTableRoot}/${file}`))) !== hash) throw Error("Coverage table primary artifact mismatch");
  const records = buildCoverageTables();
  if (records.map(record => JSON.stringify(record)).join("\n") + "\n" !== text) throw Error("Coverage table records differ from reviewed extraction");
  const existing = new Set(input.map(record => record.id));
  if (records.some(record => existing.has(record.id)) || new Set(records.map(record => record.id)).size !== records.length) throw Error("Coverage tables cannot overwrite or duplicate records");
  const lineage = JSON.parse(fs.readFileSync(`${coverageTableRoot}/mrnabench-existing-lineage.json`, "utf8")) as { result_id: string }[];
  const resultIds = new Set(lineage.map(row => row.result_id));
  if (resultIds.size !== lineage.length || input.filter(record => record.kind === "result" && resultIds.has(record.id)).length !== resultIds.size) throw Error("Missing or duplicate experiment lineage target");
  if (existing.has("coverage-mrnabench-shared-experiment-set")) throw Error("Cannot replace experiment lineage claim");
  const evaluationIds = new Set(input.filter(record => resultIds.has(record.id)).flatMap(record => record.links.filter(link => link.relation === "evaluation").map(link => link.target_id)));
  const overlap = "Tables 5/6 provide variant-level details of the same probing experiment set summarized by Table 2. These tables are not independent repetitions; no exact selected variant is inferred.";
  const annotated = input.map(record => resultIds.has(record.id) || evaluationIds.has(record.id) ? { ...record, attributes: { ...record.attributes, evidence_experiment_set_id: "mrnabench-2025-linear-probing-default-splits", evidence_overlap: overlap } } : record);
  const subjects = annotated.filter(record => resultIds.has(record.id) || evaluationIds.has(record.id));
  const claim: RecordEntry = { id: "coverage-mrnabench-shared-experiment-set", kind: "claim", name: "mRNABench family summaries and variant tables share experiments", description: overlap, status: "source_checked", facets: { areas: ["rna-transcriptomics"] }, source_ids: ["expansion-p3-mrnabench-2025"], links: subjects.map(record => ({ relation: "subject", target_id: record.id })), attributes: { field: "evidence_experiment_set_id", source_locator: "Appendix D (APP4): Table 2 displays the best overall model per family; Tables 5/6 list each variant", review: { method: "automated_source_review", date: "2026-09-23", note: "Experiment-set overlap only; no exact configuration equivalence inferred from matching scores." } } };
  return [...annotated, ...records, claim];
}
