import { describe, expect, it } from "vitest";
import {
  applicableChecks,
  auditIndex,
  auditTarget,
  auditHash,
  validateAudit,
  type AuditBundle,
  type AuditCheck,
} from "../services/omics/src/audit";
import { auditFiles } from "../scripts/omics/audit/release";
const record = {
  id: "record-one",
  attributes: { score: "0.8", licence: "MIT" },
};
function check(
  id: string,
  paths = ["attributes.score"],
  outcome: AuditCheck["outcome"] = "contradicted",
): AuditCheck {
  return {
    id,
    run_id: "run-one",
    record_id: record.id,
    record_kind: "result",
    record_name: "A result",
    field_paths: paths,
    target_sha256: auditTarget(record, paths),
    category: "source_transcription",
    outcome,
    checked_at: "2026-09-19",
    source_ids: ["source-one"],
    evidence_row_ids: [],
    source_locators: ["Table 1"],
    source_hashes: ["a".repeat(64)],
    receipt_ids: [],
    explanation: "A bounded check",
    prior_check_ids: [],
  };
}
function bundle(checks: AuditCheck[]): AuditBundle {
  return {
    schema_version: "1.0",
    runs: [
      {
        id: "run-one",
        baseline_release_id: "release-one",
        inventory_sha256: "a".repeat(64),
        started_at: "2026-09-19",
        completed_at: "2026-09-19",
        reviewer: "test",
        review_method: "automated",
        verifier_revision: "test",
        scope: "test",
        limitations: [],
        record_count: new Set(checks.map((c) => c.record_id)).size,
        check_count: checks.length,
      },
    ],
    checks,
    resolutions: [],
  };
}
describe("audit correction and publication integrity", () => {
  it("invalidates verification when the source changes without changing its ID", () => {
    const source = { id: "source-one", attributes: { sha256: "a".repeat(64) } };
    const c = {
      ...check("check-one", undefined, "supported"),
      source_fingerprints: { "source-one": auditHash(source) },
    };
    expect(
      applicableChecks([c], record, [], new Map([[source.id, source]])),
    ).toHaveLength(1);
    expect(
      applicableChecks(
        [c],
        record,
        [],
        new Map([
          [source.id, { ...source, attributes: { sha256: "b".repeat(64) } }],
        ]),
      ),
    ).toHaveLength(0);
    expect(applicableChecks([c], record, [], new Map())).toHaveLength(0);
  });
  it("does not apply another record's identical field value", () => {
    const c = check("check-one");
    expect(
      applicableChecks([c], { ...record, id: "different-record" }),
    ).toHaveLength(0);
  });
  it("rejects unrecognized audit schema versions", () => {
    expect(() =>
      validateAudit({
        ...bundle([check("check-one")]),
        schema_version: "2.0",
      } as unknown as AuditBundle),
    ).toThrow();
  });
  it("rejects cycles even when historical dates have equal precision", () => {
    const a = check("check-one"),
      b = check("check-two");
    a.prior_check_ids = [b.id];
    b.prior_check_ids = [a.id];
    expect(() => validateAudit(bundle([a, b]))).toThrow();
  });
  it("cannot resolve a score contradiction using an unrelated licence check", () => {
    const a = check("check-one"),
      b = check("check-two", ["attributes.licence"], "supported");
    const resolution = {
      id: "resolution-one",
      check_ids: [a.id],
      followup_check_ids: [b.id],
      published_release_id: "release-two",
      resolved_at: "2026-09-19",
      explanation: "Different field",
    };
    expect(applicableChecks([a, b], record, [resolution])).toContainEqual(a);
    expect(() =>
      validateAudit({ ...bundle([a, b]), resolutions: [resolution] }),
    ).toThrow();
  });
  it("cannot resolve one record with another record's check", () => {
    const a = check("check-one"),
      b = {
        ...check("check-two", undefined, "supported"),
        record_id: "record-two",
      };
    expect(() =>
      validateAudit({
        ...bundle([a, b]),
        resolutions: [
          {
            id: "resolution-one",
            check_ids: [a.id],
            followup_check_ids: [b.id],
            published_release_id: "release-two",
            resolved_at: "2026-09-19",
            explanation: "Different record",
          },
        ],
      }),
    ).toThrow();
  });
  it("rejects private fields before release export", () => {
    const b = bundle([check("check-one")]);
    (b.checks[0] as unknown as Record<string, unknown>).private_notes =
      "secret";
    expect(() => validateAudit(b)).toThrow();
    expect(() => auditFiles(b)).toThrow();
  });
  it("rejects private observations hidden inside JSON strings or field paths", () => {
    for (const field of [
      "recorded_value_json",
      "observed_value_json",
    ] as const) {
      const b = bundle([
        {
          ...check("check-one"),
          [field]: JSON.stringify({
            nested: { private_notes: "PRIVATE_SENTINEL" },
          }),
        },
      ]);
      expect(() => validateAudit(b)).toThrow(/Private/);
    }
    expect(() =>
      validateAudit(
        bundle([
          { ...check("check-one"), field_paths: ["attributes.owner_uid"] },
        ]),
      ),
    ).toThrow(/Private/);
    expect(() =>
      validateAudit(
        bundle([{ ...check("check-one"), observed_value_json: "not JSON" }]),
      ),
    ).toThrow(/valid JSON/);
  });
  it("keeps numerical source status separate from source-access evidence", () => {
    const c = {
      ...check("check-one"),
      category: "source_access" as const,
      outcome: "supported" as const,
    };
    const exported = auditFiles(bundle([c]));
    const json = JSON.parse(exported.files["audit-checks-000000.json"]);
    expect(json[0].category).toBe("source_access");
    expect(exported.coverage.scope).toMatch(/not new source verification/);
  });
  it("escapes spreadsheet formulas and quotes without changing JSON values", () => {
    const c = {
      ...check("check-one"),
      record_name: '=HYPERLINK("https://example.org")',
      explanation: 'Contains "quotes"\nand newlines',
    };
    const exported = auditFiles(bundle([c]));
    expect(exported.files["audit-checks.csv"]).toContain(
      '"\'=HYPERLINK(""https://example.org"")"',
    );
    expect(
      JSON.parse(exported.files["audit-checks-000000.json"])[0].record_name,
    ).toBe(c.record_name);
  });
  it("produces bounded check chunks and a complete index across chunk boundaries", () => {
    const checks = Array.from({ length: 50 }, (_, i) => ({
      ...check(`check-${i}`),
      record_id: `record-${i}`,
      explanation: "x".repeat(16000),
    }));
    const out = auditFiles(bundle(checks));
    const chunks = Object.entries(out.files).filter(([k]) =>
      /^audit-checks-\d+\.json$/.test(k),
    );
    expect(chunks.length).toBeGreaterThan(1);
    for (const [, v] of chunks)
      expect(Buffer.byteLength(v)).toBeLessThanOrEqual(550001);
    const index = JSON.parse(out.files["audit-index.json"]);
    expect(index).toHaveLength(50);
    for (const r of index) expect(r.chunk_ids).toHaveLength(1);
  });
});

it("audit index chooses deterministic current display identity across source/check order", () => {
  const historical = { ...check("check-a"), run_id: "audit-historical-2026-09-17", record_kind: "model", record_name: "Historical name" };
  const current = { ...check("check-z"), run_id: "audit-2026-09-19", record_kind: "configuration", record_name: "Current name" };
  const second = { ...current, id: "check-zz", record_name: "Secondary name" };
  const ordered = [historical, current, second];
  const expected = auditIndex(ordered);
  expect(expected[0].record_name).toBe("Current name");
  expect(expected[0].record_kind).toBe("configuration");
  for (const variant of [[second, historical, current], [current, second, historical], [...ordered].reverse()])
    expect(auditIndex(variant)).toEqual(expected);
  expect(ordered).toEqual([historical, current, second]);
  const newer = { ...historical, id: "check-newer", checked_at: "2026-09-20", record_name: "Latest name", record_kind: "pipeline" };
  const updated = auditIndex([newer, ...ordered]);
  expect(updated).toEqual(auditIndex([...ordered, newer]));
  expect(updated[0].record_name).toBe("Latest name");
  expect(updated[0].record_kind).toBe("pipeline");
  expect(updated[0].check_count).toBe(4);
});
