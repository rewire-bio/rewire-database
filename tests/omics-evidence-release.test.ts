import { privateFieldNames } from "../services/omics/src/private-fields";
import { parseCatalogue } from "../lib/omics";
import { validateRecords } from "../scripts/omics/schema";
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { buildRelease } from "../scripts/omics/release";
import { restoreReleaseBundles } from "../scripts/omics/archives";
import type { RecordEntry } from "../scripts/omics/schema";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});
const record: RecordEntry = {
  id: "test-model",
  kind: "model",
  name: "Archive test model",
  description: "Synthetic fixture; no scientific result.",
  status: "discovered",
  facets: {},
  source_ids: [],
  links: [],
  attributes: { entity_level: "checkpoint" },
};
function release(evidence: boolean) {
  return buildRelease([record], "2026-09-16T00:00:00Z", evidence ? { evidence_table_version: "1.0" } : {});
}
function bundle(output: ReturnType<typeof buildRelease>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "omics-evidence-release-"));
  roots.push(root);
  const input = path.join(root, "input");
  const destination = path.join(root, "output");
  fs.mkdirSync(input);
  const id = output.snapshot.release_id;
  const receipt = JSON.stringify(output.manifest, null, 2) + "\n";
  const files: Record<string, string> = { ...output.files, "manifest.json": receipt };
  fs.writeFileSync(path.join(input, `${id}.json`), receipt);
  const write = () => fs.writeFileSync(path.join(input, `${id}.bundle.json.gz`), gzipSync(JSON.stringify(files)));
  write();
  return { input, destination, id, files, write };
}

describe.each([false, true])("release evidence exports enabled: %s", (evidence) => {
  it("rejects private coverage before exporting, including nested arrays and mixed case", () => {
    for (const extra of [
      { private_notes: "PRIVATE_SENTINEL" },
      { nested: [{ OWNER_UID: "PRIVATE_SENTINEL" }] },
    ]) {
      expect(() => buildRelease([record], "2026-09-16T00:00:00Z", {
        ...extra,
        ...(evidence ? { evidence_table_version: "1.0" } : {}),
      })).toThrow(/Private/);
    }
  });

  it("restores the exact declared files and bytes, including idempotent restoration", () => {
    const output = release(evidence);
    const expected = ["catalogue.json", "records.csv", "records.jsonl", ...(evidence ? ["evidence.csv", "evidence.jsonl"] : [])].sort();
    expect(Object.keys(output.manifest.files).sort()).toEqual(expected);
    const archive = bundle(output);
    restoreReleaseBundles(archive.input, archive.destination);
    restoreReleaseBundles(archive.input, archive.destination);
    expect(fs.readdirSync(path.join(archive.destination, archive.id)).sort()).toEqual([...expected, "manifest.json"].sort());
    for (const [file, bytes] of Object.entries(archive.files)) {
      expect(fs.readFileSync(path.join(archive.destination, archive.id, file), "utf8")).toBe(bytes);
      if (file !== "manifest.json") expect(createHash("sha256").update(bytes).digest("hex")).toBe(output.manifest.files[file]);
    }
    if (evidence) {
      const rows = output.files["evidence.jsonl"].trim().split("\n").map(line => JSON.parse(line));
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every(row => row.release_id === archive.id && row.record_id === record.id)).toBe(true);
    }
  });

  it("rejects a tampered bundle before creating the destination", () => {
    const archive = bundle(release(evidence));
    const file = evidence ? "evidence.csv" : "records.csv";
    archive.files[file] += "tampered\n";
    archive.write();
    expect(() => restoreReleaseBundles(archive.input, archive.destination)).toThrow(/Archive checksum mismatch/);
    expect(fs.existsSync(archive.destination)).toBe(false);
  });

  it("rejects changed existing archive bytes without overwriting them", () => {
    const archive = bundle(release(evidence));
    restoreReleaseBundles(archive.input, archive.destination);
    const file = path.join(archive.destination, archive.id, evidence ? "evidence.jsonl" : "records.jsonl");
    fs.writeFileSync(file, "existing conflicting bytes");
    expect(() => restoreReleaseBundles(archive.input, archive.destination)).toThrow(/Immutable release conflict/);
    expect(fs.readFileSync(file, "utf8")).toBe("existing conflicting bytes");
  });
});

it("rejects an evidence release missing either required evidence file", () => {
  for (const file of ["evidence.csv", "evidence.jsonl"]) {
    const archive = bundle(release(true));
    delete archive.files[file];
    archive.write();
    expect(() => restoreReleaseBundles(archive.input, archive.destination)).toThrow(/Unexpected archived files/);
    expect(fs.existsSync(archive.destination)).toBe(false);
  }
});

it("does not silently add evidence exports to a legacy archive", () => {
  const archive = bundle(release(false));
  archive.files["evidence.csv"] = "unreceipted evidence";
  archive.write();
  expect(() => restoreReleaseBundles(archive.input, archive.destination)).toThrow(/Unexpected archived files/);
  expect(fs.existsSync(archive.destination)).toBe(false);
});

it("static boundaries reject every private field without requiring frontend dependencies in service tests", () => {
  for (const key of privateFieldNames) for (const spelling of [key, key.toUpperCase()]) {
    const records = [{id: "privacy-fixture", kind: "model", name: "Fixture", status: "discovered", description: "", facets: {}, source_ids: [], links: [], attributes: {nested: [{[spelling]: "PRIVATE_SENTINEL"}]}}];
    const snapshot = {schema_version: "1.0", release_id: "fixture", records, coverage: {}};
    for (const invoke of [() => validateRecords(records), () => parseCatalogue(snapshot)]) {
      expect(invoke).toThrow(/Private/);
      try { invoke(); } catch (error) { expect(String(error)).not.toContain("PRIVATE_SENTINEL"); }
    }
  }
});
