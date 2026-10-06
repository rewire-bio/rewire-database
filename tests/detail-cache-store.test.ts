import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readEntry, restoreEntry, saveEntry, staticAssetHash } from "../scripts/detail-cache/store.mjs";

let root: string;
const receipt = { key: "key", epoch: "epoch", assets: "assets", dependencies: { id: "result" } };
function write(relative: string, content: string) {
  const file = path.join(root, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); return file;
}
function saved() {
  write("rendered/index.html", "<html>Result</html>"); write("rendered/index.txt", "RSC payload");
  const directory = path.join(root, "cache"); saveEntry(directory, path.join(root, "rendered"), receipt); return directory;
}
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), "detail-cache-store-")); });
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe("detail cache payload store", () => {
  it("round trips both HTML and RSC with a verified receipt", () => {
    const entry = readEntry(saved(), receipt.key, receipt.epoch)!;
    expect(entry.receipt).toMatchObject(receipt);
    const output = path.join(root, "restored"); restoreEntry(entry, output);
    for (const name of ["index.html", "index.txt"]) expect(fs.readFileSync(path.join(output, name))).toEqual(fs.readFileSync(path.join(root, "rendered", name)));
  });
  it.each(["index.html", "index.txt"])("treats corrupted %s as a miss", (name) => {
    const directory = saved(); fs.appendFileSync(path.join(directory, name), "corrupted");
    expect(readEntry(directory, receipt.key, receipt.epoch)).toBeNull();
  });
  it.each(["index.html", "index.txt", "entry.json"])("treats missing %s as a miss", (name) => {
    const directory = saved(); fs.unlinkSync(path.join(directory, name));
    expect(readEntry(directory, receipt.key, receipt.epoch)).toBeNull();
  });
  it("treats invalid JSON as a miss", () => {
    const directory = saved(); fs.writeFileSync(path.join(directory, "entry.json"), "{");
    expect(readEntry(directory, receipt.key, receipt.epoch)).toBeNull();
  });
  it("rejects keys, renderer epochs and schemas from other entries", () => {
    const directory = saved();
    expect(readEntry(directory, "other-key", receipt.epoch)).toBeNull();
    expect(readEntry(directory, receipt.key, "other-epoch")).toBeNull();
    const file = path.join(directory, "entry.json"); const value = JSON.parse(fs.readFileSync(file, "utf8")); value.schema = 1; fs.writeFileSync(file, JSON.stringify(value));
    expect(readEntry(directory, receipt.key, receipt.epoch)).toBeNull();
  });
  it.each([null, { ...receipt, schema: 2 }])("treats a structurally corrupt receipt as a miss: %j", (value) => {
    const directory = saved(); fs.writeFileSync(path.join(directory, "entry.json"), JSON.stringify(value));
    expect(readEntry(directory, receipt.key, receipt.epoch)).toBeNull();
  });
  it.each(["index.html", "index.txt"])("refuses to overwrite an existing %s", (name) => {
    const entry = readEntry(saved(), receipt.key, receipt.epoch)!;
    const existing = write(`restored/${name}`, "Fresh Next output");
    expect(() => restoreEntry(entry, path.join(root, "restored"))).toThrow();
    expect(fs.readFileSync(existing, "utf8")).toBe("Fresh Next output");
  });
});

describe("static asset compatibility", () => {
  it("changes for asset bytes, paths, additions and removals", () => {
    const file = write("_next/static/chunks/a.js", "original");
    const before = staticAssetHash(root); expect(staticAssetHash(root)).toBe(before);
    fs.writeFileSync(file, "edited"); expect(staticAssetHash(root)).not.toBe(before);
    fs.writeFileSync(file, "original"); expect(staticAssetHash(root)).toBe(before);
    const renamed = path.join(path.dirname(file), "b.js"); fs.renameSync(file, renamed); expect(staticAssetHash(root)).not.toBe(before);
    fs.renameSync(renamed, file);
    const css = write("_next/static/css/styles.css", "body{}"); expect(staticAssetHash(root)).not.toBe(before);
    fs.unlinkSync(css); expect(staticAssetHash(root)).toBe(before);
  });
  it("hashes the static tree independently of route payloads", () => {
    write("_next/static/a.js", "chunk"); const before = staticAssetHash(root);
    write("database/result/id/index.html", "changed route"); expect(staticAssetHash(root)).toBe(before);
  });
});

describe("scoped static asset compatibility", () => {
  const result = "_next/static/chunks/app/database/result/[id]/page-result.js";
  const source = "_next/static/chunks/app/database/source/[id]/page-source.js";
  const unrelated = "_next/static/chunks/app/database/baseline/[id]/page-baseline.js";
  const payloads = [
    '<script src="/_next/static/chunks/app/database/result/%5Bid%5D/page-result.js"></script>',
    Buffer.from('3:I[693,["8342","static/chunks/app/database/source/%5Bid%5D/page-source.js"],"default"]'),
  ];
  function assets() {
    write(result, "result"); write(source, "source"); write(unrelated, "unrelated");
    write("_next/static/chunks/app/layout-layout.js", "layout");
  }
  it("ignores only unreferenced leaf page chunks while retaining HTML and RSC references", () => {
    assets(); const before = staticAssetHash(root, payloads); const full = staticAssetHash(root);
    write(unrelated, "changed unrelated chunk");
    expect(staticAssetHash(root, payloads)).toBe(before); expect(staticAssetHash(root)).not.toBe(full);
    fs.renameSync(path.join(root, unrelated), path.join(root, unrelated.replace("page-baseline", "page-renamed")));
    expect(staticAssetHash(root, payloads)).toBe(before);
    expect(staticAssetHash(root, [...payloads].reverse())).toBe(before);
    write(source, "changed RSC dependency"); expect(staticAssetHash(root, payloads)).not.toBe(before);
    write(source, "source"); write(result, "changed HTML dependency"); expect(staticAssetHash(root, payloads)).not.toBe(before);
  });
  it.each([
    "chunks/app/layout-layout.js", "chunks/shared.js", "chunks/webpack-runtime.js", "css/styles.css", "media/font.woff2",
    "build/_buildManifest.js", "build/_ssgManifest.js",
  ])("retains shared asset %s even without a direct payload reference", (relative) => {
    assets(); const file = `_next/static/${relative}`; write(file, "original");
    const before = staticAssetHash(root, payloads); write(file, "changed");
    expect(staticAssetHash(root, payloads)).not.toBe(before);
  });
  it.each([result, source])("rejects missing referenced page assets: %s", (file) => {
    assets(); fs.unlinkSync(path.join(root, file));
    expect(() => staticAssetHash(root, payloads)).toThrow(/Referenced static asset is missing/);
  });
  it("rejects missing referenced shared assets", () => {
    assets(); expect(() => staticAssetHash(root, ['<link href="/_next/static/css/missing.css">'])).toThrow(/Referenced static asset is missing/);
  });
  it.each(["%zz.js", "%2e%2e/outside.js", "chunks/%2fabsolute.js", "chunks/%00bad.js", "chunks/%5cbad.js", ""])("rejects invalid static references: %s", (relative) => {
    assets(); expect(() => staticAssetHash(root, [`<script src="/_next/static/${relative}"></script>`])).toThrow(/Invalid static asset reference/);
  });
});
