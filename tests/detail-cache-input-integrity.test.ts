import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { captureDetailInputs, assertDetailInputsUnchanged, detailDependencyKey } from "../scripts/detail-cache/input-integrity";
import { computeRendererEpoch } from "../scripts/detail-cache/renderer-epoch.mjs";

let root: string;
function write(relative: string, value: string) {
  const file = path.join(root, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value); return file;
}
const catalogueFile = "public/omics/catalogue.json";
const release = "public/omics/releases/2026-10-06-aaaaaaaaaaaa";
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "detail-input-integrity-"));
  write(catalogueFile, JSON.stringify({ release_id: "2026-10-06-aaaaaaaaaaaa", coverage: { use_cases: {} }, records: [] }));
  write(`${release}/manifest.json`, '{"coverage":{}}'); write(`${release}/use-cases.json`, '{"mappings":[]}');
  write("app/layout.tsx", "initial renderer");
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe("detail cache input provenance", () => {
  it("accepts unchanged bytes across initial and fallback build checks", () => {
    const inputs = captureDetailInputs(root); const epoch = computeRendererEpoch(root);
    expect(Object.keys(inputs)).toHaveLength(3);
    assertDetailInputsUnchanged(root, inputs, epoch); assertDetailInputsUnchanged(root, inputs, epoch);
  });
  it.each([catalogueFile, `${release}/manifest.json`, `${release}/use-cases.json`])("rejects changed bytes even with restored mtime: %s", (relative) => {
    const inputs = captureDetailInputs(root); const epoch = computeRendererEpoch(root);
    const file = path.join(root, relative); const stat = fs.statSync(file);
    fs.appendFileSync(file, " "); fs.utimesSync(file, stat.atime, stat.mtime);
    expect(() => assertDetailInputsUnchanged(root, inputs, epoch)).toThrow(/input changed during build/);
  });
  it("rejects missing inputs", () => {
    const inputs = captureDetailInputs(root); const epoch = computeRendererEpoch(root);
    fs.unlinkSync(path.join(root, `${release}/use-cases.json`));
    expect(() => assertDetailInputsUnchanged(root, inputs, epoch)).toThrow(/input disappeared/);
  });
  it("rejects renderer edits between initial and fallback checks", () => {
    const inputs = captureDetailInputs(root); const epoch = computeRendererEpoch(root);
    assertDetailInputsUnchanged(root, inputs, epoch);
    write("app/layout.tsx", "edited during fallback build");
    expect(() => assertDetailInputsUnchanged(root, inputs, epoch)).toThrow(/Renderer inputs changed/);
  });
  it("requires no use-case files when coverage is disabled", () => {
    write(catalogueFile, JSON.stringify({ release_id: "release", coverage: {}, records: [] }));
    fs.rmSync(path.join(root, "public/omics/releases"), { recursive: true });
    expect(Object.keys(captureDetailInputs(root))).toEqual([catalogueFile]);
  });
  it("rejects release paths outside the release directory", () => {
    write(catalogueFile, JSON.stringify({ release_id: "../escape", coverage: { use_cases: {} } }));
    expect(() => captureDetailInputs(root)).toThrow(/Invalid release id/);
  });
});

describe("ordered dependency cache keys", () => {
  it("invalidates reordered displayed attribute fields", () => {
    const first = { detail: { record: { attributes: { alpha: 1, beta: 2 } } } };
    const second = { detail: { record: { attributes: { beta: 2, alpha: 1 } } } };
    expect(detailDependencyKey("epoch", first)).not.toBe(detailDependencyKey("epoch", second));
    expect(detailDependencyKey("epoch", first)).toBe(detailDependencyKey("epoch", JSON.parse(JSON.stringify(first))));
    expect(detailDependencyKey("epoch", first)).not.toBe(detailDependencyKey("changed-epoch", first));
  });
});
