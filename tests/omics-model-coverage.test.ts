import { validateSnapshot, recordSchema as apiRecordSchema } from "../services/omics/src/validation";
import fs from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { addCoverageTables, buildCoverageTables, coverageTableRoot } from "../scripts/omics/model-coverage-tables";
import { addModelEvaluationLinks } from "../scripts/omics/model-evaluation-links";
import { validateRecords, type RecordEntry } from "../scripts/omics/schema";
import { createCatalogueQuery } from "../services/omics/src/catalogue-query";
import { modelEvaluationAudit } from "../scripts/omics/audit-model-evaluations";

const previous = JSON.parse(gunzipSync(fs.readFileSync("data/omics/releases/2026-09-23-6c5e8b6b153f/catalogue.json.gz")).toString());
const records = addModelEvaluationLinks(addCoverageTables(previous.records));
const snapshot = { ...previous, records };
const query = createCatalogueQuery(snapshot);
const added = buildCoverageTables();
const addedResults = added.filter(record => record.kind === "result");

describe("source-reviewed model evaluation coverage", () => {
  it("validates the complete graph and deterministic, sealed extraction", () => {
    expect(validateRecords(records)).toHaveLength(records.length);
    expect(validateSnapshot(snapshot).records).toHaveLength(records.length);
    expect(added.map(record => JSON.stringify(record)).join("\n") + "\n").toBe(fs.readFileSync(`${coverageTableRoot}/records.jsonl`, "utf8"));
    expect(addedResults).toHaveLength(1620);
    for (const record of addedResults) {
      expect(record.status).toBe("source_checked");
      expect(record.attributes.source_locator).toBeTruthy();
      expect(record.source_ids.length).toBeGreaterThan(0);
    }
  });
  it("preserves every previous result, except explicit nonnumerical experiment-overlap annotations", () => {
    const byId = new Map(records.map(record => [record.id, record]));
    for (const old of previous.records.filter((record: RecordEntry) => record.kind === "result")) {
      const current = byId.get(old.id)!;
      const originalAttributes = { ...current.attributes };
      if (current.attributes.evidence_experiment_set_id === "mrnabench-2025-linear-probing-default-splits") {
        delete originalAttributes.evidence_experiment_set_id;
        delete originalAttributes.evidence_overlap;
      }
      expect({ ...current, attributes: originalAttributes }).toEqual(old);
    }
  });
  it("covers all 59 original models with results, reviewed downstream evaluations, or the explicit checkpoint gap", () => {
    const models = modelEvaluationAudit(snapshot).rows.filter(row => row.kind === "model");
    expect(models).toHaveLength(59);
    expect(models.filter(row => row.metric_rows)).toHaveLength(52);
    expect(models.filter(row => row.coverage_status === "downstream_evaluations_only")).toHaveLength(6);
    expect(models.filter(row => !row.metric_rows && !row.downstream.some(item => item.results)).map(row => row.record_id)).toEqual(["catalog-model-proteinmpnn"]);
    expect(query.results({ id: "catalog-model-proteinmpnn" }).total).toBe(0);
    expect(query.results({ id: "discovery-model-proteinmpnn" }).total).toBeGreaterThan(0);
  });
  it("never relabels probe pipelines as bare model evaluations", () => {
    for (const id of ["catalog-model-mrna-fm", "catalog-model-metagene-1", "catalog-model-mimic", "catalog-model-scfoundation", "discovery-model-glycangt"]) {
      expect(query.results({ id }).total).toBe(0);
      expect(records.some(record => record.kind === "pipeline" && record.links.some(link => link.relation === "uses_model" && link.target_id === id))).toBe(true);
    }
    expect(records.filter(record => record.kind === "pipeline" && record.links.some(link => link.relation === "family"))).toHaveLength(0);
  });
  it("preserves quoted evidence and quarantines conflicting localization cells", () => {
    const mRNA = addedResults.filter(record => record.id.startsWith("mrnabench-variants-2025-"));
    expect(mRNA).toHaveLength(400);
    expect(mRNA.some(record => /loc-lr|loc-sr/i.test(record.id))).toBe(false);
    expect(mRNA.every(record => record.attributes.evidence_experiment_set_id === "mrnabench-2025-linear-probing-default-splits")).toBe(true);
    const mimic = added.filter(record => record.kind === "evaluation" && record.id.startsWith("mimic-2026-mrnabench-"));
    expect(mimic.filter(record => record.attributes.origin === "paper_compilation")).toHaveLength(77);
    expect(mimic.filter(record => record.attributes.origin === "author_reported")).toHaveLength(7);
  });
  it("retains explicit unknown evaluation origins while rejecting missing or invented origins", () => {
    const unknown = added.find(record => record.kind === "evaluation" && record.attributes.origin === "unreported")!;
    expect(unknown).toBeTruthy();
    expect(apiRecordSchema.safeParse(unknown).success).toBe(true);
    for (const origin of [undefined, "verified_somehow"]) {
      expect(apiRecordSchema.safeParse({ ...unknown, attributes: { ...unknown.attributes, origin } }).success).toBe(false);
    }
  });
  it("fails repeated ingestion instead of duplicating scientific evidence", () => {
    expect(() => addCoverageTables(records)).toThrow(/overwrite|duplicate/);
    expect(() => addModelEvaluationLinks(records)).toThrow(/additive/);
  });
});
