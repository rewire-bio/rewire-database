import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { afterEach, expect, it } from "vitest";
import { restoreReleaseBundles } from "../scripts/omics/archives";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })));
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "omics-archive-storage-"));
  roots.push(root);
  const input = path.join(root, "input"), output = path.join(root, "output");
  fs.mkdirSync(input);
  const ids = ["2026-09-28-111111111111", "2026-09-29-222222222222", "2026-09-30-333333333333"];
  for (const [index, id] of ids.entries()) {
    const files: Record<string, string> = {
      "catalogue.json": JSON.stringify({ release_id: id }),
      "records.jsonl": "identical immutable records\n",
      "records.csv": "identical immutable CSV\n",
    };
    const manifest = JSON.stringify({ release_id: id, coverage: {}, files: Object.fromEntries(
      Object.entries(files).map(([name, bytes]) => [name, createHash("sha256").update(bytes).digest("hex")]),
    ) });
    fs.writeFileSync(path.join(input, `${id}.json`), manifest);
    if (index === 2) {
      fs.writeFileSync(path.join(input, `${id}.bundle.json.gz`), gzipSync(JSON.stringify({ ...files, "manifest.json": manifest })));
    } else {
      fs.mkdirSync(path.join(input, id));
      for (const [name, bytes] of Object.entries(files))
        fs.writeFileSync(path.join(input, id, `${name}.gz`), gzipSync(bytes));
    }
  }
  return { root, input, output, ids };
}

it("shares identical split and legacy archive bytes without changing paths or existing files", () => {
  const { input, output, ids } = fixture();
  restoreReleaseBundles(input, output);
  const records = ids.map(id => path.join(output, id, "records.jsonl"));
  expect(new Set(records.map(file => fs.statSync(file).ino)).size).toBe(1);
  expect(fs.statSync(records[0]).nlink).toBe(3);
  for (const file of records) expect(fs.readFileSync(file, "utf8")).toBe("identical immutable records\n");
  expect(new Set(ids.map(id => fs.statSync(path.join(output, id, "catalogue.json")).ino)).size).toBe(3);
  fs.utimesSync(records[0], 1, 1);
  restoreReleaseBundles(input, output);
  for (const file of records) expect(fs.statSync(file).mtimeMs).toBe(1000);
});

it("still checks every compressed payload even when its declared digest was already verified", () => {
  const { input, output, ids } = fixture();
  fs.writeFileSync(path.join(input, ids[1], "records.jsonl.gz"), gzipSync("tampered duplicate"));
  expect(() => restoreReleaseBundles(input, output)).toThrow(/Archive checksum mismatch/);
  expect(fs.existsSync(path.join(output, ids[1], "records.jsonl"))).toBe(false);
  expect(fs.readFileSync(path.join(output, ids[0], "records.jsonl"), "utf8")).toBe("identical immutable records\n");
});

it("preserves a conflicting destination instead of replacing it with a shared file", () => {
  const { input, output, ids } = fixture();
  const target = path.join(output, ids[1], "records.jsonl");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, "existing conflict");
  expect(() => restoreReleaseBundles(input, output)).toThrow(/Immutable release conflict/);
  expect(fs.readFileSync(target, "utf8")).toBe("existing conflict");
});

it("rejects an existing symlink even when it points to matching bytes", () => {
  const { root, input, output, ids } = fixture();
  const external = path.join(root, "external.jsonl"), target = path.join(output, ids[0], "records.jsonl");
  fs.writeFileSync(external, "identical immutable records\n");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.symlinkSync(external, target);
  expect(() => restoreReleaseBundles(input, output)).toThrow(/Immutable release conflict/);
  expect(fs.readFileSync(external, "utf8")).toBe("identical immutable records\n");
});
