import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { addUseCaseCoverage, useCaseCoverageInputFiles } from "../scripts/omics/use-case-coverage";
import type { RecordEntry } from "../scripts/omics/schema";
import { validateRecords, publicRecords } from "../scripts/omics/schema";
import { validateSnapshot } from "../services/omics/src/validation";
import { loadUseCases } from "../scripts/omics/use-cases";
import { buildUseCaseArtifact } from "../services/omics/src/use-cases";

const roots: string[] = [];
const record = (id: string): RecordEntry => ({
  id, kind: "method", name: id, description: "Source-reported method",
  status: "source_checked", facets: {}, source_ids: [], links: [], attributes: {},
});

describe("reviewed 17-use-case evidence integration", () => {
  it("preserves the old catalogue and mappings, validates every new record, and resolves the audited cases", () => {
    const baseline = JSON.parse(gunzipSync(fs.readFileSync("data/omics/releases/2026-09-28-c7b5ac6d34f2/catalogue.json.gz")).toString());
    const previousCases = JSON.parse(gunzipSync(fs.readFileSync("data/omics/releases/2026-09-28-c7b5ac6d34f2/use-cases.json.gz")).toString());
    const records = addUseCaseCoverage(baseline.records);
    validateRecords(records);
    const snapshot = { ...baseline, release_id: "2026-09-30-000000000000", released_at: "2026-09-30T21:00:00Z", records };
    validateSnapshot(snapshot);
    expect(records.slice(0, baseline.records.length)).toEqual(baseline.records);
    const disputedCell = "ucc-docking-cluspro-bm5-2020-result-total-top10-easy-acceptable-or-better-targets";
    expect(records.find(record => record.id === disputedCell)?.attributes.printed_value).toBe("87");
    expect(publicRecords(records).some(record => record.id === disputedCell)).toBe(false);
    const inputs = loadUseCases()!.inputs;
    const artifact = buildUseCaseArtifact(snapshot, inputs);
    expect(artifact.use_cases).toHaveLength(17);
    expect(artifact.mappings.every(mapping => mapping.lifecycle === "active")).toBe(true);
    for (const oldMapping of previousCases.mappings)
      expect(artifact.mappings.find(mapping => mapping.id === oldMapping.id)).toEqual(oldMapping);
    const audits = ["clinical", "research", "experimental"].flatMap(lane =>
      JSON.parse(fs.readFileSync(`data/omics/use-case-coverage-20260930/${lane}/coverage.json`, "utf8")));
    expect(audits).toHaveLength(17);
    expect(new Set(audits.map(audit => audit.use_case_id)).size).toBe(17);
    expect(audits.map(audit => audit.issue).sort((a, b) => a - b)).toEqual(Array.from({ length: 17 }, (_, i) => 334 + i));
    for (const audit of audits) {
      expect((audit.remaining_gaps || audit.gaps).length).toBeGreaterThan(0);
      expect(inputs.use_cases.some(entry => entry.id === audit.use_case_id)).toBe(true);
    }
  });
});
function fixture(additions: RecordEntry[] = [record("new-method")]) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "use-case-coverage-"));
  roots.push(root);
  const files: Record<string, string> = {};
  for (const file of useCaseCoverageInputFiles(root).slice(1)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const content = file.endsWith("clinical/records.jsonl") ? additions.map(r => JSON.stringify(r)).join("\n") : "";
    fs.writeFileSync(file, content);
    files[path.relative(root, file)] = createHash("sha256").update(content).digest("hex");
  }
  fs.writeFileSync(path.join(root, "review.json"), JSON.stringify({
    schema_version: "1.0", method: "automated_source_review", reviewer: "test",
    reviewed_at: "2026-09-30T20:00:00Z", scope: "Test receipt",
    limitations: ["Not human review"], errors: [], files,
  }));
  return root;
}
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })));

describe("use-case literature intake", () => {
  it("preserves existing records and appends the reviewed batch", () => {
    const existing = record("existing-method");
    const result = addUseCaseCoverage([existing], fixture());
    expect(result).toEqual([existing, record("new-method")]);
    expect(result[0]).toBe(existing);
  });
  it("rejects changed measurements after review", () => {
    const root = fixture();
    fs.appendFileSync(path.join(root, "clinical/records.jsonl"), "\n{}");
    expect(() => addUseCaseCoverage([], root)).toThrow("changed since review");
  });
  it("rejects duplicate scientific identities", () => {
    expect(() => addUseCaseCoverage([record("new-method")], fixture())).toThrow("cannot replace or duplicate");
    expect(() => addUseCaseCoverage([], fixture([record("same"), record("same")]))).toThrow("cannot replace or duplicate");
  });
  it("rejects a literature extraction labelled as a new reproduction", () => {
    const invalid = { ...record("invented-run"), status: "reproduced" as const };
    expect(() => addUseCaseCoverage([], fixture([invalid]))).toThrow("cannot claim a new execution");
  });
  it("rejects an incomplete review inventory", () => {
    const root = fixture();
    const file = path.join(root, "review.json");
    const receipt = JSON.parse(fs.readFileSync(file, "utf8"));
    delete receipt.files["clinical/records.jsonl"];
    fs.writeFileSync(file, JSON.stringify(receipt));
    expect(() => addUseCaseCoverage([], root)).toThrow("does not bind every expected input");
  });
});
