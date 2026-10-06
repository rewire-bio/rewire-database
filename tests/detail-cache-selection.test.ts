import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { filterCachedDetailIds } from "../lib/detail-cache/selection";

let root: string;
let file: string;
const ids = ["first", "second", "third"];
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "detail-cache-selection-")); file = path.join(root, "skip.json");
  fs.writeFileSync(file, JSON.stringify({ epoch: "epoch", ids: { result: ["second"], source: ["first"] } }));
  vi.stubEnv("DETAIL_CACHE", "1"); vi.stubEnv("DETAIL_CACHE_EPOCH", "epoch"); vi.stubEnv("DETAIL_CACHE_SKIP_FILE", file);
});
afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

describe("flag-gated detail cache selection", () => {
  it("filters only the requested kind and preserves remaining order", () => {
    expect(filterCachedDetailIds("result", ids)).toEqual(["first", "third"]);
    expect(filterCachedDetailIds("source", ids)).toEqual(["second", "third"]);
    expect(filterCachedDetailIds("model", ids)).toEqual(ids);
    expect(ids).toEqual(["first", "second", "third"]);
  });
  it.each(["", "0", "true"])("renders all ids without the exact enabled flag (%j)", (flag) => {
    vi.stubEnv("DETAIL_CACHE", flag); fs.unlinkSync(file);
    expect(filterCachedDetailIds("result", ids)).toEqual(ids);
  });
  it("renders all ids when no skip file was supplied", () => {
    vi.stubEnv("DETAIL_CACHE_SKIP_FILE", ""); expect(filterCachedDetailIds("result", ids)).toEqual(ids);
  });
  it("fails closed on mismatched renderer epoch", () => {
    vi.stubEnv("DETAIL_CACHE_EPOCH", "other"); expect(() => filterCachedDetailIds("result", ids)).toThrow(/different renderer epoch/);
  });
  it("rejects missing or malformed supplied skip files", () => {
    fs.writeFileSync(file, "{"); expect(() => filterCachedDetailIds("result", ids)).toThrow();
    fs.unlinkSync(file); expect(() => filterCachedDetailIds("result", ids)).toThrow();
  });
});
