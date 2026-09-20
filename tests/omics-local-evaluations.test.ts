import fs from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { applyLocalEvaluations, localEvaluationInputs } from "../scripts/omics/local-evaluations";
import { validateRecords, type RecordEntry } from "../scripts/omics/schema";
import { createCatalogueQuery } from "../services/omics/src/catalogue-query";
import { applicableChecks } from "../services/omics/src/audit";
import { loadAudits } from "../scripts/omics/audit/release";

const text = fs.readFileSync(localEvaluationInputs[0], "utf8");
const evidenceText = fs.readFileSync(localEvaluationInputs[2], "utf8");
const review = JSON.parse(fs.readFileSync(localEvaluationInputs[1], "utf8"));
const added = applyLocalEvaluations([], text, evidenceText, review);
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const mutate = (edit: (records: RecordEntry[]) => void) => {
  const records = structuredClone(added);
  edit(records);
  const next = records.map((record) => JSON.stringify(record)).join("\n") + "\n";
  return () => applyLocalEvaluations([], next, evidenceText, { ...review, records_sha256: sha(next) });
};

describe("reviewed local benchmark executions", () => {
  it("binds records and execution evidence to an error-free automated review", () => {
    expect(() => applyLocalEvaluations([], text + "\n", evidenceText, review)).toThrow(/changed since review/);
    expect(() => applyLocalEvaluations([], text, evidenceText + "\n", review)).toThrow(/changed since review/);
    expect(() => applyLocalEvaluations([], text, evidenceText, { ...review, errors: ["unresolved"] })).toThrow();
    expect(() => applyLocalEvaluations([added[0]], text, evidenceText, review)).toThrow(/replace existing/);
  });
  it("rejects changed metrics, coverage, scope and reproduction claims", () => {
    expect(mutate((records) => {
      records.find((record) => record.kind === "result" && record.attributes.numeric_value !== null)!.attributes.numeric_value = "-999";
    })).toThrow(/differs from execution/);
    expect(mutate((records) => {
      records.find((record) => record.kind === "evaluation")!.attributes.scored_count = 1;
    })).toThrow(/Incomplete local execution/);
    expect(mutate((records) => {
      records.find((record) => record.kind === "evaluation")!.attributes.execution_scope = "full_benchmark_suite";
    })).toThrow(/Incomplete local execution/);
    for (const field of ["published_score_reproduction", "suite_complete"]) {
      expect(mutate((records) => {
        records.find((record) => record.kind === "evaluation")!.attributes[field] = true;
      })).toThrow(/Incomplete local execution/);
    }
    const evidence = JSON.parse(evidenceText);
    evidence.evaluations[0].report.independently_reproduced = true;
    const changedEvidence = JSON.stringify(evidence);
    expect(() => applyLocalEvaluations([], text, changedEvidence, { ...review, evidence_sha256: sha(changedEvidence) }))
      .toThrow(/cannot claim published-score reproduction/);
    expect(mutate((records) => { records[0].status = "reproduced"; })).toThrow(/source_checked/);
  });
  it("checks displayed precision, original coverage and report-source binding", () => {
    expect(mutate((records) => {
      records.find((record) => record.kind === "result")!.attributes.printed_value = "999";
    })).toThrow(/displayed value/);
    const evidence = JSON.parse(evidenceText);
    evidence.evaluations[0].report.coverage.denominator += 1;
    let next = JSON.stringify(evidence);
    expect(() => applyLocalEvaluations([], text, next, { ...review, evidence_sha256: sha(next) }))
      .toThrow(/coverage differs from execution report/);
    evidence.evaluations[0].report.coverage.denominator -= 1;
    evidence.evaluations[0].report_sha256 = "0".repeat(64);
    next = JSON.stringify(evidence);
    expect(() => applyLocalEvaluations([], text, next, { ...review, evidence_sha256: sha(next) }))
      .toThrow(/report source hash mismatch/);
  });
  it("publishes five complete selected evaluations, keeping undefined control correlations unavailable", () => {
    const evaluations = added.filter((record) => record.kind === "evaluation");
    expect(evaluations).toHaveLength(5);
    expect(evaluations.map((r) => r.attributes.scored_count).sort((a, b) => Number(a) - Number(b)))
      .toEqual([184, 184, 2972, 15003, 15003]);
    for (const evaluation of evaluations) {
      expect(evaluation.attributes.origin).toBe("rewire_run");
      expect(evaluation.attributes.published_score_reproduction).toBe(false);
    }
    const unavailable = added.filter((record) => record.kind === "result" && record.attributes.numeric_value === null);
    expect(unavailable.length).toBeGreaterThan(0);
    for (const record of unavailable) {
      expect(record.attributes.printed_value).toBe("undefined");
      expect(record.attributes.undefined_reason).toBeTruthy();
    }
  });
  it("keeps source evidence and compatible graph links reachable on exact configuration and benchmark pages", () => {
    const catalogue = JSON.parse(fs.readFileSync("public/omics/catalogue.json", "utf8"));
    const existing = catalogue.records.filter((record: RecordEntry) => !added.some((next) => next.id === record.id));
    const records = validateRecords([...existing, ...added]);
    const query = createCatalogueQuery({ ...catalogue, records });
    for (const result of added.filter((record) => record.kind === "result")) {
      const evaluation = records.find((record) => record.id === result.links[0].target_id)!;
      for (const link of evaluation.links.filter((link) => ["configuration", "protocol", "dataset_subset"].includes(link.relation))) {
        expect(query.results({ id: link.target_id, limit: 100 }).items.some((row) => row.result.id === result.id)).toBe(true);
      }
      const protocol = records.find((record) => record.id === evaluation.links.find((link) => link.relation === "protocol")!.target_id)!;
      const benchmark = protocol.links.find((link) => link.relation === "part_of")!.target_id;
      expect(query.results({ id: benchmark, origin: "rewire_run", limit: 100 }).items.some((row) => row.result.id === result.id)).toBe(true);
    }
  });
  it("attaches applicable automated audit checks to each numerical result without implying human review", () => {
    const bundle = loadAudits();
    const sources = new Map(added.filter((record) => record.kind === "source").map((record) => [record.id, record]));
    for (const record of added.filter((record) => record.kind === "result")) {
      const checks = applicableChecks(bundle.checks, record, bundle.resolutions, sources);
      expect(checks.some((check) => check.category === "source_transcription" && check.outcome === "supported")).toBe(true);
    }
    expect(bundle.runs.find((run) => run.id === "audit-local-runs-2026-09-20")?.review_method).toBe("automated");
  });
});
