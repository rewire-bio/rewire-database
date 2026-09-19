import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  auditHash,
  auditTarget,
  type AuditCheck,
} from "../services/omics/src/audit";
import {
  assessHistoricalCatalogue,
  verifyHistoricalArchiveBytes,
  historicalSources,
  historicalStructureErrors,
  historicalVersionKey,
  reusableHistoricalChecks,
  type HistoricalCatalogue,
  type HistoricalRecord,
} from "../scripts/omics/audit/historical";
const source: HistoricalRecord = {
  id: "source-a",
  kind: "source",
  name: "Source",
  source_ids: [],
  links: [],
  attributes: {
    url: "https://example.org/paper",
    artifact_sha256: "a".repeat(64),
  },
};
const model: HistoricalRecord = {
  id: "model-a",
  kind: "old-method-subtype",
  name: "Method",
  source_ids: [source.id],
  links: [],
  attributes: {
    score: 0.3,
    profile: { facts: [{ source_ids: ["source-a"] }] },
  },
};
const cat = (
  id: string,
  records: HistoricalRecord[] = [source, model],
): HistoricalCatalogue => ({ release_id: id, records });
const check = (r: HistoricalRecord = model): AuditCheck => ({
  id: "check-current",
  run_id: "run-current",
  record_id: r.id,
  record_kind: r.kind,
  record_name: r.name,
  field_paths: ["attributes.score"],
  target_sha256: auditTarget(r, ["attributes.score"]),
  category: "source_transcription",
  outcome: "supported",
  checked_at: "2026-09-19",
  source_ids: [source.id],
  source_fingerprints: { [source.id]: auditHash(source) },
  evidence_row_ids: [],
  source_locators: ["Table1"],
  source_hashes: ["a".repeat(64)],
  receipt_ids: [],
  prior_check_ids: [],
  explanation: "Test source cell checked",
});

describe("historical scientific version coverage", () => {
  it("verifies catalogue bytes against the preserved release manifest", () => {
    const b = Buffer.from("archive bytes");
    const hash = createHash("sha256").update(b).digest("hex");
    expect(
      verifyHistoricalArchiveBytes(b, { files: { "catalogue.json": hash } }),
    ).toBe(hash);
    expect(() =>
      verifyHistoricalArchiveBytes(Buffer.from("changed"), {
        catalogue_sha256: hash,
      }),
    ).toThrow(/checksum/);
    expect(() => verifyHistoricalArchiveBytes(b, {})).toThrow(/checksum/);
  });
  it("accepts legacy entity kinds without applying current scientific classification", () => {
    expect(
      historicalStructureErrors(
        model,
        new Map([
          [source.id, source],
          [model.id, model],
        ]),
      ),
    ).toEqual([]);
    const result = assessHistoricalCatalogue(
      cat("archive-1"),
      cat("current"),
      [],
      { versions: new Map() },
      "v1",
    );
    expect(
      result.checks.find(
        (c) => c.record_id === model.id && c.category === "structure",
      )?.outcome,
    ).toBe("supported");
    expect(
      result.checks.find((c) => c.record_id === model.id)?.record_kind,
    ).toBe("old-method-subtype");
    expect(result.run.baseline_release_id).toBe("archive-1");
  });
  it("reuses an identical current record only with explicit applicable check links", () => {
    const result = assessHistoricalCatalogue(
      cat("archive-1"),
      cat("current"),
      [check()],
      { versions: new Map() },
      "v1",
    );
    const row = result.inventory.versions.find(
      (v) => v.record_id === model.id,
    )!;
    expect(row.coverage).toBe("current_checks_reused");
    expect(row.check_ids).toEqual(["check-current"]);
    expect(result.checks.filter((c) => c.record_id === model.id)).toEqual([]);
    expect(result.inventory.record_count).toBe(2);
  });
  it("does not inherit status when a source changes even if record fields do not", () => {
    const changed = {
      ...source,
      attributes: { ...source.attributes, artifact_sha256: "b".repeat(64) },
    };
    const result = assessHistoricalCatalogue(
      cat("archive-1", [changed, model]),
      cat("current"),
      [check()],
      { versions: new Map() },
      "v1",
    );
    const row = result.inventory.versions.find(
      (v) => v.record_id === model.id,
    )!;
    expect(row.coverage).toBe("new_historical_assessment");
    expect(row.check_ids).not.toContain("check-current");
    expect(
      result.checks.find(
        (c) => c.record_id === model.id && c.category === "metadata",
      )?.outcome,
    ).toBe("insufficient_evidence");
  });
  it("preserves applicable field checks on otherwise changed records without blanket approval", () => {
    const old = { ...model, name: "Earlier name" };
    const result = assessHistoricalCatalogue(
      cat("archive-1", [source, old]),
      cat("current"),
      [check()],
      { versions: new Map() },
      "v1",
    );
    const row = result.inventory.versions.find(
      (v) => v.record_id === model.id,
    )!;
    expect(row.coverage).toBe("new_historical_assessment");
    expect(row.check_ids).toContain("check-current");
    expect(result.checks.filter((c) => c.record_id === model.id)).toHaveLength(
      2,
    );
  });
  it("deduplicates identical archived versions and keeps their representative check IDs", () => {
    const state = { versions: new Map() };
    const current = cat("current", []);
    const first = assessHistoricalCatalogue(
      cat("archive-1"),
      current,
      [],
      state,
      "v1",
    );
    const second = assessHistoricalCatalogue(
      cat("archive-2"),
      current,
      [],
      state,
      "v1",
    );
    expect(second.checks).toHaveLength(0);
    expect(second.run.check_count).toBe(0);
    expect(second.inventory.counts.historical_checks_reused).toBe(2);
    expect(second.inventory.versions[0].check_ids).toEqual(
      first.inventory.versions[0].check_ids,
    );
    expect(second.inventory.versions[0].representative_release_id).toBe(
      "archive-1",
    );
  });
  it("binds nested profile sources and rejects missing-source reuse", () => {
    const extra = { ...source, id: "source-nested" };
    const nested = {
      ...model,
      source_ids: [],
      attributes: { profile: { summary_source_ids: [extra.id] } },
    };
    const map = new Map([
      [nested.id, nested],
      [extra.id, extra],
    ]);
    expect(historicalSources(nested, map)).toEqual({
      [extra.id]: auditHash(extra),
    });
    expect(
      historicalVersionKey(nested, historicalSources(nested, map)),
    ).not.toBe(
      historicalVersionKey(nested, historicalSources(nested, new Map())),
    );
    expect(
      reusableHistoricalChecks(model, new Map([[model.id, model]]), [check()]),
    ).toEqual([]);
  });
  it("records broken legacy references rather than quietly upgrading them", () => {
    const bad = {
      ...model,
      links: [{ relation: "old_relation", target_id: "missing" }],
    };
    const result = assessHistoricalCatalogue(
      cat("archive-1", [source, bad]),
      cat("current"),
      [],
      { versions: new Map() },
      "v1",
    );
    expect(
      result.checks.find(
        (c) => c.record_id === bad.id && c.category === "structure",
      )?.outcome,
    ).toBe("contradicted");
  });
  it("produces stable run/check identities and rejects ambiguous duplicate IDs", () => {
    const args = () =>
      assessHistoricalCatalogue(
        cat("archive-1"),
        cat("current"),
        [check()],
        { versions: new Map() },
        "v1",
      );
    expect(args()).toEqual(args());
    expect(() =>
      assessHistoricalCatalogue(
        cat("archive-1", [model, model]),
        cat("current"),
        [],
        { versions: new Map() },
        "v1",
      ),
    ).toThrow(/Duplicate/);
  });
});
