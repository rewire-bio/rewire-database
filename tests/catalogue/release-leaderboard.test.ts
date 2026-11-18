import { describe, expect, it } from "vitest";
import { buildCatalogue } from "../../lib/catalogue-build";
import { allUseCaseLeaderboards, homeLeaderboards, rankingsForRecord, runReceiptSources } from "../../lib/release-leaderboard";
import { generateAgentsMd, generateLlmsFullText, generateLlmsTxt } from "../../lib/llm-discoverability";
import { generateHomepageTakeaway, generateUseCaseTakeaway } from "../../lib/geo-takeaway";

// Against the pinned release: every rendered figure must trace to a record in it.
describe("use-case leaderboards from the release", () => {
  const { query } = buildCatalogue();
  const boards = allUseCaseLeaderboards();
  const rows = boards.flatMap((b) => b.rows.map((row) => ({ board: b, row })));

  it("ranks at least one use case", () => {
    expect(rows.length).toBeGreaterThan(0);
    expect(homeLeaderboards().length).toBeGreaterThan(0);
  });

  it("gives every rendered row a source_record_id that is a result record in the release, with the same value", () => {
    for (const { row } of rows) {
      const result = query.record(row.source_record_id);
      expect(result, row.source_record_id).not.toBeNull();
      expect(result!.kind).toBe("result");
      // The row holds the value on the column's display scale: as recorded, or a fraction shown as a percent.
      const recorded = Number(result!.attributes.numeric_value);
      expect([recorded, recorded * 100].some((v) => Math.abs(v - row.raw_metric_value!) < 1e-9), row.source_record_id).toBe(true);
      if (row.evaluation_id) expect(query.record(row.evaluation_id)?.kind).toBe("evaluation");
      if (row.source) expect(query.record(row.source.id)?.kind).toBe("source");
    }
  });

  it("ranks each use case on one protocol, in its stated direction", () => {
    for (const board of boards.filter((b) => b.rows.length)) {
      expect(board.protocol).not.toBeNull();
      const metrics = new Set(board.rows.map((r) => query.record(r.source_record_id)!.attributes.metric));
      expect(metrics.size, board.use_case_slug).toBe(1);
      const values = board.rows.map((r) => r.raw_metric_value!);
      const sorted = [...values].sort((a, b) => (board.protocol!.direction === "higher" ? b - a : a - b));
      expect(values, board.use_case_slug).toEqual(sorted);
    }
  });

  it("shows reproduced only where a run receipt in the release is cited by the result or its evaluation", () => {
    const receipts = runReceiptSources(query);
    for (const { row } of rows) {
      const cited = [
        ...(query.record(row.source_record_id)?.source_ids ?? []),
        ...((row.evaluation_id && query.record(row.evaluation_id)?.source_ids) || []),
      ];
      expect(row.reviewed_status === "reproduced", row.source_record_id).toBe(cited.some((id) => receipts.has(id)));
    }
  });

  it("shows a baseline only when the release scores it on the ranked protocol", () => {
    for (const board of boards) {
      if (!board.baseline) {
        expect(board.rows.every((r) => r.margin_over_conventional === null)).toBe(true);
        continue;
      }
      const baselineRow = board.rows.find((r) => r.model_id === board.baseline!.model_id);
      expect(baselineRow?.is_baseline).toBe(true);
      expect(baselineRow?.source_record_id).toBe(board.baseline.source_record_id);
    }
  });

  it("indexes ranked rows by model for model pages", () => {
    const { row } = rows.find(({ row }) => row.parent_id) ?? rows[0];
    expect(rankingsForRecord(row.parent_id ?? row.model_id).some((r) => r.row.source_record_id === row.source_record_id)).toBe(true);
  });

  it("publishes no figure that is not in the release", () => {
    const texts = [
      generateLlmsTxt("r", boards),
      generateLlmsFullText("r", boards),
      generateAgentsMd("r", boards),
      generateHomepageTakeaway(homeLeaderboards()).primaryStatement,
      ...boards.map((b) => generateUseCaseTakeaway({ leaderboard: b }).primaryStatement),
    ].join("\n");
    for (const invented of ["PoET-2", "0.612", "ranks #1", "89.5", "of assay ceiling", "Capability Index", "42 ms/seq", "re-checked against new publications every month"])
      expect(texts).not.toContain(invented);
    for (const { row } of rows.slice(0, 5)) expect(generateLlmsFullText("r", boards)).toContain(`/database/result/${encodeURIComponent(row.source_record_id)}/`);
  });
});
