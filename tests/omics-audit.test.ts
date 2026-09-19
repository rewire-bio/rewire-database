import { describe, it, expect } from "vitest";
import {
  auditTarget,
  auditPage,
  auditIndex,
  applicableChecks,
  validateAudit,
  type AuditCheck,
  type AuditBundle,
} from "../services/omics/src/audit";
const record = {
  id: "model-a",
  attributes: { score: "0.3", note: "unchanged" },
};
const check: AuditCheck = {
  id: "check-1",
  run_id: "run-1",
  record_id: "model-a",
  record_kind: "model",
  record_name: "Model A",
  field_paths: ["attributes.score"],
  target_sha256: auditTarget(record, ["attributes.score"]),
  category: "source_transcription",
  outcome: "contradicted",
  checked_at: "2026-09-19",
  source_ids: [],
  evidence_row_ids: [],
  source_locators: [],
  source_hashes: [],
  receipt_ids: [],
  explanation: "Paper reports 0.4",
  prior_check_ids: [],
};
const bundle: AuditBundle = {
  schema_version: "1.0",
  runs: [
    {
      id: "run-1",
      baseline_release_id: "release-1",
      inventory_sha256: "a".repeat(64),
      started_at: "2026-09-19",
      completed_at: "2026-09-19",
      reviewer: "Automated test",
      review_method: "automated",
      verifier_revision: "test",
      scope: "unit",
      limitations: [],
      record_count: 1,
      check_count: 1,
    },
  ],
  checks: [check],
  resolutions: [],
};
describe("append-only linked audits", () => {
  it("validates identities and rejects dangling history", () => {
    expect(validateAudit(bundle).checks).toHaveLength(1);
    expect(() =>
      validateAudit({
        ...bundle,
        checks: [{ ...check, prior_check_ids: ["missing"] }],
      }),
    ).toThrow();
    expect(() =>
      validateAudit({ ...bundle, checks: [check, check] }),
    ).toThrow();
  });
  it("does not reuse status after target changes", () => {
    expect(applicableChecks([check], record)).toHaveLength(1);
    expect(
      applicableChecks([check], {
        ...record,
        attributes: { ...record.attributes, score: "0.4" },
      }),
    ).toHaveLength(0);
    expect(
      applicableChecks([check], {
        ...record,
        attributes: { ...record.attributes, note: "new note" },
      }),
    ).toHaveLength(1);
  });
  it("retains contradictions until an explicit applicable resolution", () => {
    const pass = {
      ...check,
      id: "check-2",
      outcome: "supported" as const,
      prior_check_ids: [check.id],
    };
    expect(applicableChecks([check, pass], record)).toHaveLength(2);
    expect(
      applicableChecks([check, pass], record, [
        {
          id: "resolution-1",
          check_ids: [check.id],
          followup_check_ids: [pass.id],
          published_release_id: "release-2",
          resolved_at: "2026-09-19",
          explanation: "Reviewed correction",
        },
      ]),
    ).toEqual([pass]);
  });
  it("pins pagination to filters and releases", () => {
    const p = auditPage(
      [1, 2, 3],
      { limit: 1 },
      { release: "one", outcome: "supported" },
    );
    expect(
      auditPage(
        [1, 2, 3],
        { cursor: p.next_cursor!, limit: 1 },
        { release: "one", outcome: "supported" },
      ).items,
    ).toEqual([2]);
    expect(() =>
      auditPage([1, 2, 3], { cursor: p.next_cursor! }, { release: "two" }),
    ).toThrow();
  });
  it("keeps paired filters rather than combining unrelated review outcomes", () => {
    const rows = auditIndex([
      check,
      {
        ...check,
        id: "check-2",
        run_id: "run-2",
        outcome: "supported",
        category: "structure",
      },
    ]);
    expect(
      rows[0].checks_filter.some(
        (f) => f.run_id === "run-1" && f.outcome === "supported",
      ),
    ).toBe(false);
    expect(rows[0].check_count).toBe(2);
  });
  it("fails incomplete run inventory", () => {
    expect(() =>
      validateAudit({
        ...bundle,
        runs: [{ ...bundle.runs[0], record_count: 2 }],
      }),
    ).toThrow();
  });
});
