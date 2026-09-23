import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";

it("audits immutable inputs, classifies empty conditions and rejects broken references", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rewire-display-audit-"));
  try {
    const record = {
      id: "example",
      kind: "protocol",
      name: "BEELINE Figure 2 · LI · {}",
      description: "Input conditions: {}.",
      attributes: {},
      links: [],
      source_ids: [],
    };
    const input = gzipSync(
      JSON.stringify({ release_id: "test", records: [record] }),
    );
    fs.writeFileSync(path.join(root, "catalogue.json.gz"), input);
    fs.writeFileSync(
      path.join(root, "evidence.jsonl.gz"),
      gzipSync(
        JSON.stringify({
          row_id: "row",
          record_id: "example",
          source_id: "",
          claim_id: "",
          source_url: "",
          artifact_url: "",
          extraction_artifact_url: "",
          field_path: "attributes.profile.gaps",
          value_json: '["Not reported"]',
        }) + "\n",
      ),
    );
    const run = (output: string) =>
      spawnSync(
        process.execPath,
        [
          "scripts/omics/audit-display-data.mjs",
          "--release-dir",
          root,
          "--output",
          path.join(root, output),
        ],
        { encoding: "utf8" },
      );
    expect(run("first").status).toBe(0);
    const summary = JSON.parse(
      fs.readFileSync(path.join(root, "first/summary.json"), "utf8"),
    );
    expect(summary.integrity_errors).toBe(0);
    expect(summary.records_with_presentation_cases).toBe(1);
    expect(summary.evidence_value_types.array).toBe(1);
    expect(fs.readFileSync(path.join(root, "catalogue.json.gz"))).toEqual(
      input,
    );
    expect(run("first").status).not.toBe(0);
    fs.writeFileSync(
      path.join(root, "catalogue.json.gz"),
      gzipSync(
        JSON.stringify({
          release_id: "test",
          records: [{ ...record, source_ids: ["missing-source"] }],
        }),
      ),
    );
    expect(run("broken").status).toBe(1);
    expect(
      JSON.parse(
        fs.readFileSync(path.join(root, "broken/findings.json"), "utf8"),
      ).integrity_issues[0].reason,
    ).toBe("dangling_source_id");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
