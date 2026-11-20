import { describe, expect, it } from "vitest";
import { buildCatalogue } from "../../lib/catalogue-build";
import { allUseCaseLeaderboards, homeLeaderboards, rankingsForRecord, runReceiptSources } from "../../lib/release-leaderboard";
import { generateAgentsMd, generateLlmsFullText, generateLlmsTxt } from "../../lib/llm-discoverability";
import { generateHomepageTakeaway, generateUseCaseTakeaway } from "../../lib/geo-takeaway";
import { shortFact, telemetryFromRecord } from "../../lib/operational-telemetry";
import { originDescription, originEvaluationLabel, originLabel } from "../../lib/result-origin";

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
      expect([...metrics], board.use_case_slug).toEqual([board.protocol!.metric]);
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

  it("links a run receipt exactly on the reproduced rows", () => {
    const receipts = runReceiptSources(query);
    for (const { row } of rows) {
      expect(row.receipt !== null, row.source_record_id).toBe(row.reviewed_status === "reproduced");
      if (row.receipt) expect(receipts.has(row.receipt.id), row.source_record_id).toBe(true);
    }
  });

  it("shows each row the origin of the evaluation its value belongs to", () => {
    for (const { row } of rows) {
      expect(row.evaluation_id, row.source_record_id).not.toBeNull();
      const result = query.record(row.source_record_id)!;
      expect(result.links.find((l) => l.relation === "evaluation")?.target_id, row.source_record_id).toBe(row.evaluation_id);
      const origin = query.record(row.evaluation_id!)!.attributes.origin;
      expect(row.origin, row.source_record_id).toBe(origin);
      // A Rewire run is not flagged: the release does not record who developed each tool.
      expect(row.independent, row.source_record_id).toBe(origin === "independent_paper");
    }
  });

  it("gives every origin in the release a label that is not the unreported or the missing one", () => {
    // An origin the site has no label for is shown readably (underscores as spaces), so this does
    // not fail on a new vocabulary value; it checks that such a value is never merged with another.
    const origins = new Set(rows.map(({ row }) => row.origin));
    for (const origin of origins) {
      expect(origin, "every ranked evaluation in this release has an origin").not.toBeNull();
      if (origin !== "unreported") expect(originLabel(origin)).not.toBe(originLabel("unreported"));
      expect(originLabel(origin)).not.toBe(originLabel(null));
      expect(originEvaluationLabel(origin)).not.toBe(originEvaluationLabel(null));
      expect(originDescription(origin)).not.toBe("");
    }
  });

  it("cuts access and licence text only at the length limit and marks every cut", () => {
    for (const kind of ["model", "method", "pipeline", "service"]) for (const record of query.recordsOfKind(kind)) {
      const t = telemetryFromRecord(record);
      for (const text of [t.access, t.license]) for (const max of [28, 48, 60]) {
        if (!text) continue;
        const whole = text.trim().replace(/\.$/, "");
        const shown = shortFact(text, max);
        expect(shown.length, record.id).toBeLessThanOrEqual(max);
        if (whole.length <= max) expect(shown, record.id).toBe(whole);
        else {
          expect(shown.endsWith("…"), record.id).toBe(true);
          expect(whole.startsWith(shown.slice(0, -1)), record.id).toBe(true);
          expect(shown.length, record.id).toBeGreaterThan(max / 2);
        }
      }
    }
  });

  it("shows access and licence only in the record's own words (#230)", () => {
    for (const kind of ["model", "method", "pipeline", "service"]) for (const record of query.recordsOfKind(kind)) {
      const t = telemetryFromRecord(record);
      const facts = ((record.attributes.profile as { facts?: { value: string; status?: string }[] } | undefined)?.facts ?? [])
        .filter((f) => f.status === undefined || f.status === "source_checked").map((f) => f.value.trim());
      const written = [record.attributes.access, record.attributes.licence].filter((v): v is string => typeof v === "string").map((v) => v.trim()).concat(facts);
      for (const text of [t.access, t.license]) if (text !== null) expect(written, record.id).toContain(text);
      expect(t.license === null, record.id).toBe(t.license_scope === null);
      if (typeof record.attributes.open_weights !== "boolean") expect(t.open_weights, record.id).toBeNull();
    }
  });

  it("labels proxy protocols in the takeaway and llms.txt, and gives no tab to a use case without comparisons", () => {
    const llms = generateLlmsTxt("r", boards);
    for (const board of boards.filter((b) => b.rows.length && b.protocol!.relevance === "proxy")) {
      expect(generateUseCaseTakeaway({ leaderboard: board }).primaryStatement, board.use_case_slug).toContain("a proxy protocol");
      const line = llms.split("\n").find((l) => l.startsWith(`- [${board.use_case_title}]`))!;
      expect(line, board.use_case_slug).toContain("a proxy protocol");
    }
    for (const board of boards.filter((b) => !b.rows.length)) {
      expect(board.baseline).toBeNull();
      expect(homeLeaderboards().some((b) => b.use_case_slug === board.use_case_slug)).toBe(false);
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

  it("indexes each model's best row once per leaderboard for model pages", () => {
    const { row } = rows.find(({ row }) => row.parent_id) ?? rows[0];
    expect(rankingsForRecord(row.parent_id ?? row.model_id).some((r) => r.row.source_record_id === row.source_record_id)).toBe(true);
    const counts = new Map<string, number>();
    for (const { board, row } of rows) if (row.parent_id) counts.set(`${board.use_case_slug}|${row.parent_id}`, (counts.get(`${board.use_case_slug}|${row.parent_id}`) ?? 0) + 1);
    const repeated = [...counts].find(([, n]) => n > 1);
    if (repeated) {
      const parent = repeated[0].split("|")[1];
      const found = rankingsForRecord(parent);
      expect(new Set(found.map((r) => r.board.use_case_slug)).size).toBe(found.length);
    }
  });

  it("publishes no figure that is not in the release", () => {
    const texts = [
      generateLlmsTxt("r", boards),
      generateLlmsFullText("r", boards),
      generateAgentsMd("r", boards),
      generateHomepageTakeaway(homeLeaderboards()).primaryStatement,
      ...boards.map((b) => generateUseCaseTakeaway({ leaderboard: b }).primaryStatement),
    ].join("\n");
    // Phrases from the hand-written figures that no release value can produce.
    for (const invented of ["ranks #1", "of assay ceiling", "Capability Index", "42 ms/seq", "re-checked against new publications every month"])
      expect(texts).not.toContain(invented);
    for (const { row } of rows.slice(0, 5)) expect(generateLlmsFullText("r", boards)).toContain(`/database/result/${encodeURIComponent(row.source_record_id)}/`);
  });
});
