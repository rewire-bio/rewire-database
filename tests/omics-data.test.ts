import { describe, it, expect } from "vitest";
import fs from "node:fs";
import crypto from "node:crypto";
import {
  validateRecords,
  publicRecords,
  type RecordEntry,
} from "../scripts/omics/schema";
import { buildRelease } from "../scripts/omics/release";
import { parseCsv } from "../lib/benchmark-literature";
import { extensionsSchema } from "../scripts/omics/extensions";
const records: RecordEntry[] = fs
  .readFileSync("data/omics/migrated.jsonl", "utf8")
  .trim()
  .split("\n")
  .map((x) => JSON.parse(x));
const all = [
  ...records,
  ...fs
    .readFileSync("data/omics/discovery.jsonl", "utf8")
    .trim()
    .split("\n")
    .map((x) => JSON.parse(x)),
];
const clone = () => structuredClone(records);
describe("omics publication integrity", () => {
  it("retains every original result ID and exact historical CSV field", () => {
    const rows = parseCsv(
      fs.readFileSync("data/benchmark-literature/results.csv", "utf8"),
    );
    const header = rows.shift()!;
    for (const cells of rows) {
      const original = Object.fromEntries(header.map((k, i) => [k, cells[i]]));
      const record = records.find((r) => r.id === original.id);
      expect(record?.attributes.legacy_row).toEqual(original);
      expect(record?.attributes.numeric_value).toBe(original.value);
    }
    expect(rows).toHaveLength(149);
  });
  it("validates biological coordinates, identity fractions and measured units", () => {
    expect(() =>
      extensionsSchema.parse({ genomics: { start: 12, end: 10 } }),
    ).toThrow();
    expect(() =>
      extensionsSchema.parse({
        genomics: { window_length: 21, variant_offset: 21 },
      }),
    ).toThrow();
    expect(() =>
      extensionsSchema.parse({ protein: { sequence_identity_threshold: 90 } }),
    ).toThrow();
    expect(() =>
      extensionsSchema.parse({ cellular: { dose: { value: 5 } } }),
    ).toThrow();
    expect(() =>
      extensionsSchema.parse({
        genomics: { assembly: null, window_length: 21, variant_offset: 10 },
        cellular: { dose: { value: 5, unit: "nM" } },
      }),
    ).not.toThrow();
  });
  it("requires references to resolve to the correct entity types", () => {
    expect(validateRecords(all)).toHaveLength(all.length);
    const broken = clone();
    broken.find((r) => r.kind === "result")!.links = [
      {
        relation: "evaluation",
        target_id: records.find((r) => r.kind === "source")!.id,
      },
    ];
    expect(() => validateRecords(broken)).toThrow("Invalid result evaluation");
  });
  it("does not turn missing model versions into invented checkpoints", () => {
    for (const r of records.filter(
      (r) =>
        r.kind === "model" &&
        r.id.startsWith("reported-model-") &&
        r.attributes.version === null,
    )) {
      expect(r.attributes.entity_level).toBe("method");
      expect(r.attributes.missing_metadata).toHaveProperty("version");
    }
  });
  it("quarantines unreviewed or excluded numeric claims and dependent claims", () => {
    const visible = publicRecords(all);
    expect(
      visible
        .filter((r) => r.kind === "result")
        .every((r) =>
          ["source_checked", "reproduced", "superseded"].includes(r.status),
        ),
    ).toBe(true);
    expect(
      visible.some((r) =>
        r.source_ids.includes("kidney-cell-segmentation-2025"),
      ),
    ).toBe(false);
    expect(visible.some((r) => r.id === "kidney-cell-segmentation-2025")).toBe(
      false,
    );
    expect(() => validateRecords(visible)).not.toThrow();
  });
  it("cannot label a paper result as a rewire reproduction", () => {
    const broken = clone();
    broken.find((r) => r.kind === "result" && r.id.startsWith("lit-"))!.status =
      "reproduced";
    expect(() => validateRecords(broken)).toThrow(
      "External result mislabelled reproduced",
    );
  });
  it("rejects private contributor fields nested in public metadata", () => {
    const broken = clone();
    broken[0].attributes.extra = { email: "private@example.org" };
    expect(() => validateRecords(broken)).toThrow("Private field");
  });
  it("makes identical releases independent of input ordering and hashes exact exports", () => {
    const a = buildRelease(all, "2026-09-16T10:00:00Z");
    const b = buildRelease([...all].reverse(), "2026-09-16T10:00:00Z");
    expect(a).toEqual(b);
    for (const [file, bytes] of Object.entries(a.files)) {
      expect(a.manifest.files[file]).toBe(
        crypto.createHash("sha256").update(bytes).digest("hex"),
      );
    }
    const changed = structuredClone(all);
    changed[0].description += " Correction.";
    expect(
      buildRelease(changed, "2026-09-16T10:00:00Z").snapshot.release_id,
    ).not.toBe(a.snapshot.release_id);
  });
  it("preserves own-run correction history and keeps proposed baselines separate from scores", () => {
    expect(records.find((r) => r.id === "rewire-mfass-v1")?.status).toBe(
      "superseded",
    );
    expect(
      records.find((r) => r.id === "rewire-mfass-v2")?.links,
    ).toContainEqual({ relation: "supersedes", target_id: "rewire-mfass-v1" });
    for (const b of all.filter(
      (r) => r.kind === "baseline" && r.attributes.applicability === "proposed",
    ))
      expect(b.attributes).not.toHaveProperty("numeric_value");
  });
  it("documents an explicit scope decision for all original papers and all nine research lanes", () => {
    const scope = fs
      .readFileSync("data/omics/scope-audit.jsonl", "utf8")
      .trim()
      .split("\n")
      .map((x) => JSON.parse(x));
    expect(scope).toHaveLength(100);
    expect(
      scope.every(
        (x) => x.reason && ["included", "excluded"].includes(x.decision),
      ),
    ).toBe(true);
    const ledger = fs
      .readFileSync("data/omics/search-ledger.jsonl", "utf8")
      .trim()
      .split("\n")
      .map((x) => JSON.parse(x));
    expect(ledger.length).toBeGreaterThanOrEqual(9);
  });
});
