import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createEvidenceIndex,
  evidenceCsvLines,
  evidenceJsonlLines,
} from "../services/omics/src/evidence-table";
import {
  chunksSha256,
  fileSha256,
  writeImmutableChunks,
} from "../scripts/omics/stream-files";
import { buildRelease } from "../scripts/omics/release";
import type { RecordEntry } from "../scripts/omics/schema";
const record: RecordEntry = {
  id: "stream-fixture",
  kind: "model",
  name: 'UTF-8 α, "quote"\nline',
  description: "=formula",
  status: "discovered",
  facets: {},
  source_ids: [],
  links: [],
  attributes: { entity_level: "checkpoint", test_value: "é" },
};
describe("bounded evidence exports", () => {
  it("streams identical manifest and export bytes to the legacy in-memory generator", () => {
    const legacy = buildRelease([record], "2099-01-01T00:00:00Z", {
      evidence_table_version: "1.0",
    });
    const dir = path.join("public/omics/releases", legacy.snapshot.release_id);
    if (fs.existsSync(dir))
      throw Error("Test refuses to alter existing release");
    try {
      const streamed = buildRelease(
        [record],
        "2099-01-01T00:00:00Z",
        { evidence_table_version: "1.0" },
        true,
      );
      expect(JSON.stringify(streamed.manifest)).toBe(
        JSON.stringify(legacy.manifest),
      );
      expect(streamed.files["evidence.jsonl"]).toBeUndefined();
      for (const name of ["evidence.jsonl", "evidence.csv"]) {
        expect(fs.readFileSync(path.join(dir, name), "utf8")).toBe(
          legacy.files[name],
        );
        expect(fileSha256(path.join(dir, name))).toBe(
          legacy.manifest.files[name],
        );
      }
      const index = createEvidenceIndex(legacy.snapshot, { cache: false });
      expect([...index.iterate()]).toEqual(
        createEvidenceIndex(legacy.snapshot).all(),
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
  it("preserves empty-stream conventions", () => {
    expect([...evidenceCsvLines([])].join("")).toBe("");
    expect([...evidenceJsonlLines([])].join("")).toBe("\n");
  });
  it("rejects drift and cleans partial files after an interrupted producer", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "rewire-stream-"));
    try {
      const file = path.join(root, "immutable.txt");
      expect(writeImmutableChunks(file, ["α", "\n", "é"])).toBe(
        chunksSha256(["α\né"]),
      );
      expect(writeImmutableChunks(file, ["α\né"])).toBe(fileSha256(file));
      expect(() => writeImmutableChunks(file, ["changed"])).toThrow(
        /immutable/,
      );
      expect(fs.readFileSync(file, "utf8")).toBe("α\né");
      function* broken() {
        yield "partial";
        throw Error("interrupted");
      }
      expect(() =>
        writeImmutableChunks(path.join(root, "incomplete"), broken()),
      ).toThrow("interrupted");
      expect(fs.readdirSync(root)).toEqual(["immutable.txt"]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
