import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assertNotSmokeExport } from "../scripts/assert-not-smoke-export.mjs";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "assert-not-smoke-"));
  roots.push(root);
  fs.mkdirSync(path.join(root, "out/omics"), { recursive: true });
  return root;
}

describe("assertNotSmokeExport (production publication guard)", () => {
  it("allows a full export with no smoke manifest", () => {
    const root = fixture();
    expect(() => assertNotSmokeExport(root)).not.toThrow();
  });

  it("allows a web (current-only) export, which also has no smoke manifest", () => {
    const root = fixture();
    fs.writeFileSync(path.join(root, "out/omics/manifest.json"), JSON.stringify({ release_id: "2026-10-06-aaaaaaaaaaaa" }));
    expect(() => assertNotSmokeExport(root)).not.toThrow();
  });

  it("refuses to publish once out/omics/smoke-manifest.json exists", () => {
    const root = fixture();
    fs.writeFileSync(
      path.join(root, "out/omics/smoke-manifest.json"),
      JSON.stringify({ smoke: true, total_routes: 142 }),
    );
    expect(() => assertNotSmokeExport(root)).toThrow(/smoke build/);
    expect(() => assertNotSmokeExport(root)).toThrow(/142/);
  });

  it("refuses even if the rest of out/ looks like a complete, full build", () => {
    const root = fixture();
    fs.mkdirSync(path.join(root, "out/database/result/some-id"), { recursive: true });
    fs.writeFileSync(path.join(root, "out/database/result/some-id/index.html"), "<html></html>");
    fs.writeFileSync(
      path.join(root, "out/omics/smoke-manifest.json"),
      JSON.stringify({ smoke: true, total_routes: 1 }),
    );
    expect(() => assertNotSmokeExport(root)).toThrow();
  });
});
