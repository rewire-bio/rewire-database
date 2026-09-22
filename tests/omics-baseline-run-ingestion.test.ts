import fs from "node:fs";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { addBaselineEvaluations, applyLocalEvaluations, baselineEvaluationInputs } from "../scripts/omics/local-evaluations";
import { validateRecords, type RecordEntry } from "../scripts/omics/schema";
import { createCatalogueQuery } from "../services/omics/src/catalogue-query";

const archive = JSON.parse(gunzipSync(fs.readFileSync("data/omics/releases/2026-09-20-370b30415b09/catalogue.json.gz")).toString());
const added = addBaselineEvaluations([]);
const integrated = validateRecords(addBaselineEvaluations(archive.records));
const query = createCatalogueQuery({ ...archive, records: integrated });
const text = fs.readFileSync(baselineEvaluationInputs[0], "utf8");
const evidence = JSON.parse(fs.readFileSync(baselineEvaluationInputs[2], "utf8"));
const receipt = JSON.parse(fs.readFileSync(baselineEvaluationInputs[1], "utf8"));

describe("remaining five audited local runs", () => {
  it("adds five evaluations and fourteen metrics without changing earlier records", () => {
    expect(added.filter(r => r.kind === "evaluation")).toHaveLength(5);
    expect(added.filter(r => r.kind === "result")).toHaveLength(14);
    expect(integrated.slice(0, archive.records.length)).toEqual(archive.records);
    expect(() => addBaselineEvaluations(integrated)).toThrow(/cannot replace/);
  });
  it("exposes every new metric through its exact configuration, protocol and dataset", () => {
    for (const result of added.filter(r => r.kind === "result")) {
      const evaluation = added.find(r => r.id === result.links[0].target_id)!;
      for (const link of evaluation.links) {
        expect(query.results({ id: link.target_id, origin: "rewire_run", limit: 100 }).items.some(row => row.result.id === result.id)).toBe(true);
      }
    }
  });
  it("links only the two frozen ESM checkpoints to their model family", () => {
    const configurations = added.filter(r => r.kind === "configuration");
    expect(configurations.filter(r => r.links.some(l => l.relation === "family")).map(r => r.id).sort())
      .toEqual(["rewire-local-20260921-configuration-esm2-35m", "rewire-local-20260921-configuration-esm2-8m"]);
    const family = query.results({ id: "discovery-model-esm-2", origin: "rewire_run", limit: 100 }).items;
    for (const configuration of configurations) {
      const results = added.filter(r => r.kind === "evaluation" && r.links.some(l => l.target_id === configuration.id)).map(r => r.id);
      expect(family.some(row => results.includes(row.evaluation!.id))).toBe(configuration.id.includes("-esm2-"));
    }
  });
  it("keeps random ProteinGym inputs separate from the ESM-specific procedure", () => {
    const run = added.find(r => r.id === "rewire-local-20260921-evaluation-proteingym-random")!;
    expect(run.attributes.original_sdk_scope).toBe("subset");
    expect(run.attributes.original_sdk_completion).toBe("partial");
    expect(run.attributes.suite_complete).toBe(false);
    expect(run.links).toContainEqual({ relation: "protocol", target_id: "rewire-protocol-proteingym-amfr-random-v13" });
    const dataset = added.find(r => r.id === "rewire-dataset-proteingym-amfr-random-v13")!;
    expect(dataset.links).toContainEqual({ relation: "same_data_as", target_id: "rewire-dataset-proteingym-amfr-v13" });
    const previous = archive.records.find((r: RecordEntry) => r.id === "rewire-local-20260920-evaluation-proteingym-esm2");
    expect((run.attributes.provenance as Record<string, unknown>).assay_sha256).toEqual(previous.attributes.provenance.assay_sha256);
    expect(query.results({ id: "discovery-benchmark-proteingym", origin: "rewire_run", limit: 100 }).items.some(row => row.evaluation?.id === run.id)).toBe(true);
  });
  it("does not turn weak performance or fixed ties into stronger claims", () => {
    expect(added.find(r => r.id === "rewire-local-20260921-result-esm2-8m-spearman")?.attributes.numeric_value).toBe("-0.1463506755340845");
    expect(added.find(r => r.id === "rewire-local-20260921-result-esm2-35m-spearman")?.attributes.numeric_value).toBe("-0.2217595033467806");
    const prior = added.find(r => r.id === "rewire-local-20260921-evaluation-mfass-prior")!;
    expect(JSON.stringify(prior.attributes.limitations)).toContain("tie break");
    for (const result of added.filter(r => r.kind === "result")) expect(result.attributes.uncertainty).toBe(null);
    for (const run of added.filter(r => r.kind === "evaluation")) expect(run.attributes.published_score_reproduction).toBe(false);
  });
  it("rejects unbound or changed newer audit receipts", () => {
    for (const mutate of [
      (run: any) => { run.execution_audit.prepared_sha256 = "0".repeat(64); },
      (run: any) => { run.execution_audit.code_hash_end = "different"; },
      (run: any) => { run.audit_run = "another-run"; },
    ]) {
      const changed = structuredClone(evidence);
      mutate(changed.evaluations.find((run: { audit_run?: string }) => run.audit_run));
      const raw = JSON.stringify(changed);
      expect(() => applyLocalEvaluations([], text, raw, { ...receipt, evidence_sha256: createHash("sha256").update(raw).digest("hex") })).toThrow(/audit/i);
    }
  });
});
