import fs from "node:fs";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { addMfassMatchedEvaluations, applyMfassMatchedEvaluations, mfassMatchedRoot, mfassProtocolId, mfassSourceRevision, mfassExclusionsRevision, mfassScoredIdsHash } from "../scripts/omics/mfass-matched-evaluations";
import { validateRecords, type RecordEntry } from "../scripts/omics/schema";
import { createCatalogueQuery } from "../services/omics/src/catalogue-query";
const files = ["report.json", "manifest-v1.json", "verification.json", "provenance.json", "exclusion-verification.json"] as const;
const texts = Object.fromEntries(files.map(file => [file, fs.readFileSync(`${mfassMatchedRoot}/${file}`, "utf8")])) as Record<typeof files[number], string>;
const review = JSON.parse(fs.readFileSync(`${mfassMatchedRoot}/review.json`, "utf8"));
const added = addMfassMatchedEvaluations([]);
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
function tamper(file: typeof files[number], edit: (value: any) => void) {
  const data = JSON.parse(texts[file]); edit(data);
  const changed = JSON.stringify(data);
  return () => applyMfassMatchedEvaluations([], { ...texts, [file]: changed }, { ...review, files: { ...review.files, [file]: sha(changed) } });
}

describe("MFASS frozen matched-annotation filtered study", () => {
  it("imports four distinct configurations and 16 exact source metrics, preserving original coverage", () => {
    const report = JSON.parse(texts["report.json"]);
    expect(added.filter(r => r.kind === "evaluation")).toHaveLength(4);
    expect(added.filter(r => r.kind === "result")).toHaveLength(16);
    expect(added.filter(r => r.kind === "configuration").map(r => r.attributes.condition)).toEqual(["S0", "S1", "P0", "P1"]);
    for (const record of added.filter(r => r.kind === "evaluation" || r.kind === "result")) {
      expect(record.attributes).toMatchObject({ eligible_count: 8324, scored_count: 8297, missing_count: 27, coverage: "8297/8324" });
      expect(record.status).toBe("source_checked");
      const condition = /-(s0|s1|p0|p1)(-|$)/.exec(record.id)![1].toUpperCase();
      if (record.kind === "result") {
        const expected = report.conditions[condition].metrics[String(record.attributes.metric_key)];
        expect(record.attributes.numeric_value).toBe(String(expected));
        expect(record.attributes.printed_value).toBe(String(expected));
      } else {
        expect(record.attributes).toMatchObject({ origin: "rewire_run", execution_scope: "partial_selected_evaluation", published_score_reproduction: false,
          suite_complete: false, scored_ids_sha256: mfassScoredIdsHash, exclusion_counts: { assembly_orientation: 23, canonical_transcript_span: 4 } });
      }
    }
  });
  it("pins source receipts and refuses changed source bytes, revisions, missing review, and replacement", () => {
    expect(() => applyMfassMatchedEvaluations([], { ...texts, "report.json": texts["report.json"] + " " }, review)).toThrow(/changed since review/);
    for (const change of [{ source_revision: "main" }, { review_method: "human" }, { errors: ["unresolved"] }])
      expect(() => applyMfassMatchedEvaluations([], texts, { ...review, ...change })).toThrow();
    expect(() => applyMfassMatchedEvaluations(added, texts, review)).toThrow(/replace existing/);
    for (const source of added.filter(r => r.kind === "source")) {
      expect(source.attributes.version).toBe(source.id.endsWith("exclusion-verification") ? mfassExclusionsRevision : mfassSourceRevision);
      expect(source.attributes.artifact_url).toContain(`/${source.attributes.version}/`);
      expect(source.attributes.artifact_sha256).toMatch(/^[a-f0-9]{64}$/);
    }
  });
  it("rejects altered coverage, failed checks, nonidentical IDs and unexplained exclusions even with a refreshed receipt", () => {
    expect(tamper("exclusion-verification.json", v => { v.conditions.S0.eligible = 8297; })).toThrow();
    expect(tamper("exclusion-verification.json", v => { v.conditions.P0.scored = 8296; })).toThrow();
    expect(tamper("exclusion-verification.json", v => { v.scored_ids_sha256 = "0".repeat(64); })).toThrow();
    expect(tamper("exclusion-verification.json", v => { v.exclusion_counts.assembly_orientation = 27; })).toThrow();
    expect(tamper("exclusion-verification.json", v => { v.checks.identical_ids_labels_groups = false; })).toThrow();
    expect(tamper("exclusion-verification.json", v => { v.conditions.P1.predictions_sha256 = "0".repeat(64); })).toThrow(/prediction identity/);
    expect(tamper("report.json", v => { v.conditions.S0.metrics.auroc = 0.999; })).toThrow(/artifact binding|metrics disagree/);
    expect(tamper("report.json", v => { v.denominator = 8297; })).toThrow();
  });
  it("exposes source-scoped panels and model results without mixing historical MFASS protocols", () => {
    const catalogue = JSON.parse(gunzipSync(fs.readFileSync("data/omics/releases/2026-09-20-b2596bdf5206/catalogue.json.gz")).toString());
    const records = validateRecords([...catalogue.records, ...added]);
    const query = createCatalogueQuery({ ...catalogue, records });
    const protocol = added.find(r => r.id === mfassProtocolId)!;
    expect((protocol.attributes.comparison_panels as any[])).toHaveLength(4);
    for (const panel of protocol.attributes.comparison_panels as any[]) {
      expect(panel.protocol_id).toBe(mfassProtocolId);
      expect(panel.result_ids).toHaveLength(4);
      expect(panel.result_ids.every((id: string) => id.startsWith("rewire-mfass-matched-v1-result-"))).toBe(true);
      expect(panel.context).toContain("8,297 of 8,324");
      expect(panel.caveats.join(" ")).toContain("23 assembly-orientation");
      expect(panel.caveats.join(" ")).toContain("not human review");
    }
    expect(query.results({ id: mfassProtocolId, limit: 100 }).items).toHaveLength(16);
    expect(query.results({ id: "catalog-task-mfass-splice", limit: 100 }).items.filter(row => row.result.id.startsWith("rewire-mfass-matched-v1-result-"))).toHaveLength(16);
    for (const model of ["spliceai", "pangolin"])
      expect(query.results({ id: `discovery-model-${model}`, limit: 100 }).items.filter(row => row.result.id.startsWith("rewire-mfass-matched-v1-result-"))).toHaveLength(8);
  });
});
