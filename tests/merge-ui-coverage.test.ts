import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { mergeUiCoverage } from "../scripts/merge-ui-coverage.mjs";

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length) fs.rmSync(dirs.pop()!, { recursive: true, force: true });
});

function shardFile(dir: string, name: string, hits: [number, number]) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, JSON.stringify({
    "/app/components/Sample.tsx": {
      path: "/app/components/Sample.tsx",
      statementMap: {
        "0": { start: { line: 1, column: 0 }, end: { line: 1, column: 10 } },
        "1": { start: { line: 2, column: 0 }, end: { line: 2, column: 10 } },
      },
      fnMap: {
        "0": { name: "a", decl: { start: { line: 1, column: 0 }, end: { line: 1, column: 1 } }, loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 10 } }, line: 1 },
      },
      branchMap: {},
      s: { "0": hits[0], "1": hits[1] },
      f: { "0": hits[0] + hits[1] },
      b: {},
    },
  }));
  return file;
}

describe("mergeUiCoverage", () => {
  it("combines coverage across shards and passes when thresholds are met", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "merge-cov-"));
    dirs.push(dir);
    const out = path.join(dir, "out");
    const a = shardFile(dir, "a.json", [1, 0]);
    const b = shardFile(dir, "b.json", [0, 1]);
    const { summary, failures } = mergeUiCoverage([a, b], { reportDir: out, quiet: true });
    expect(failures).toEqual([]);
    expect(summary.lines.pct).toBe(100);
    expect(fs.existsSync(path.join(out, "coverage-summary.json"))).toBe(true);
  });

  it("reports threshold failures when merged coverage is below 90%", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "merge-cov-fail-"));
    dirs.push(dir);
    const a = shardFile(dir, "a.json", [1, 0]);
    const b = shardFile(dir, "b.json", [0, 0]);
    const { summary, failures } = mergeUiCoverage([a, b], { reportDir: path.join(dir, "out"), quiet: true });
    expect(summary.lines.pct).toBe(50);
    expect(failures.some((msg: string) => msg.includes("lines coverage 50%"))).toBe(true);
  });
});
