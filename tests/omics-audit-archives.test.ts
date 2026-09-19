import { it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { restoreReleaseBundles } from "../scripts/omics/archives";
it("restores pinned audit exports and rejects unlisted files and tampering", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rewire-audit-archive-"));
  try {
    const id = "2026-09-19-0123456789ab";
    const input = path.join(root, "input"),
      output = path.join(root, "out"),
      dir = path.join(input, id);
    fs.mkdirSync(dir, { recursive: true });
    const names = [
      "catalogue.json",
      "records.jsonl",
      "records.csv",
      "audit-index.json",
      "audit-runs.json",
      "audit-resolutions.json",
      "audit-checks.jsonl",
      "audit-checks.csv",
      "audit-checks-000000.json",
    ];
    const files = Object.fromEntries(
      names.map((n) => [n, createHash("sha256").update(n).digest("hex")]),
    );
    fs.writeFileSync(
      path.join(input, id + ".json"),
      JSON.stringify({
        release_id: id,
        coverage: { audit_history: { checks: 1 } },
        files,
      }),
    );
    for (const name of names)
      fs.writeFileSync(path.join(dir, name + ".gz"), gzipSync(name));
    restoreReleaseBundles(input, output);
    restoreReleaseBundles(input, output);
    for (const name of names)
      expect(fs.readFileSync(path.join(output, id, name), "utf8")).toBe(name);
    fs.writeFileSync(path.join(dir, "unknown.json.gz"), gzipSync("no"));
    expect(() => restoreReleaseBundles(input, output)).toThrow(
      /Unexpected archived files/,
    );
    fs.unlinkSync(path.join(dir, "unknown.json.gz"));
    fs.writeFileSync(
      path.join(dir, "audit-checks-000000.json.gz"),
      gzipSync("changed"),
    );
    expect(() => restoreReleaseBundles(input, output)).toThrow(
      /checksum mismatch/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

it("keeps the first publication identity of archived resolutions and rejects altered hashes", async () => {
  const { publishedResolutionBindings } =
    await import("../scripts/omics/audit/release");
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "rewire-resolution-bindings-"),
  );
  try {
    const id = "2026-09-19-0123456789ab";
    fs.mkdirSync(path.join(root, id));
    const bytes = Buffer.from(
      JSON.stringify([{ id: "resolution-one", published_release_id: id }]),
    );
    fs.writeFileSync(
      path.join(root, id, "audit-resolutions.json.gz"),
      gzipSync(bytes),
    );
    fs.writeFileSync(
      path.join(root, id + ".json"),
      JSON.stringify({
        files: {
          "audit-resolutions.json": createHash("sha256")
            .update(bytes)
            .digest("hex"),
        },
      }),
    );
    expect(publishedResolutionBindings(root).get("resolution-one")).toBe(id);
    fs.writeFileSync(
      path.join(root, id, "audit-resolutions.json.gz"),
      gzipSync("[]"),
    );
    expect(() => publishedResolutionBindings(root)).toThrow(/hash mismatch/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
