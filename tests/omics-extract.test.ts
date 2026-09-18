/**
 * Guard the extracted benchmark batches.
 *
 * The extractors need the pinned artifacts, which are not in the repo, so these
 * tests check what was committed: that each batch still matches the receipt it
 * was written with, that its records hang together, and that the benchmarks it
 * covers are reachable from the catalogue.
 */
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import fs from "node:fs";
import {
  currentCatalogueBase,
  extractedBatches,
  readJsonl,
} from "../scripts/omics/inputs";
import { benchmarkCoverage } from "../scripts/omics/audit-benchmark-evidence";
import { buildRelease } from "../scripts/omics/release";
import { type RecordEntry } from "../scripts/omics/schema";
import { relationAcceptsKind } from "../services/omics/src/entity-kinds";
import {
  arrowDirection,
  headedBlocks,
  joinSmallCaps,
  layoutRows,
  parseCell,
  sectioned,
  tables,
} from "../scripts/omics/extract/tables";

const batches = extractedBatches.map((key) => ({
  key,
  records: readJsonl<RecordEntry>(`data/omics/reviewed/${key}-2026.jsonl`),
  receipt: JSON.parse(
    fs.readFileSync(
      `data/omics/reviews/2026-09-18-${key}-extraction.json`,
      "utf8",
    ),
  ),
}));

describe.each(batches)("$key batch", ({ key, records, receipt }) => {
  const byId = new Map(records.map((record) => [record.id, record]));
  const of = (kind: string) => records.filter((r) => r.kind === kind);
  const attr = (record: RecordEntry, name: string) =>
    String(record.attributes[name] ?? "");

  it("matches its extraction receipt", () => {
    const digest = createHash("sha256")
      .update(fs.readFileSync(`data/omics/reviewed/${key}-2026.jsonl`))
      .digest("hex");
    expect(receipt.records_sha256).toBe(digest);
    expect(receipt.errors).toEqual([]);
    expect(receipt.artifact_sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("gives every evaluation one resolvable model, benchmark and dataset", () => {
    expect(of("evaluation").length).toBeGreaterThan(0);
    for (const evaluation of of("evaluation")) {
      const links = evaluation.links || [];
      expect(links.map((l) => l.relation).sort()).toEqual([
        "benchmark",
        "dataset",
        "model",
      ]);
      for (const link of links) {
        const target = byId.get(link.target_id);
        expect(target, `${evaluation.id} -> ${link.target_id}`).toBeDefined();
        expect(relationAcceptsKind(link.relation, target!.kind)).toBe(true);
      }
    }
  });

  it("gives every result a number, a direction and a locator", () => {
    expect(of("result").length).toBe(of("evaluation").length);
    for (const result of of("result")) {
      expect(Number.isFinite(Number(attr(result, "numeric_value")))).toBe(true);
      expect(["higher", "lower"]).toContain(attr(result, "metric_direction"));
      expect(attr(result, "source_locator").length).toBeGreaterThan(3);
      expect(result.status).toBe("source_checked");
      const review = result.attributes.review as Record<string, string>;
      expect(review.artifact_sha256).toBe(receipt.artifact_sha256);
    }
  });

  it("keeps one metric, unit and direction per task", () => {
    const seen = new Map<string, string>();
    for (const result of of("result")) {
      const task = (result.links || []).find(
        (l) => l.relation === "evaluation",
      );
      const evaluation = byId.get(task!.target_id)!;
      const benchmark = (evaluation.links || []).find(
        (l) => l.relation === "benchmark",
      )!.target_id;
      const shape = [
        attr(result, "metric"),
        attr(result, "unit"),
        attr(result, "metric_direction"),
      ].join("|");
      const previous = seen.get(benchmark);
      if (previous) expect(shape).toBe(previous);
      else seen.set(benchmark, shape);
    }
  });

  it("backs every task's benchmark edge with a sourced claim", () => {
    const claims = new Set(
      of("claim").flatMap((claim) =>
        (claim.links || [])
          .filter(
            (l) =>
              l.relation === "subject" &&
              claim.source_ids.length &&
              claim.attributes.source_locator,
          )
          .map((l) => `${l.target_id}|${String(claim.attributes.field)}`),
      ),
    );
    for (const task of of("task"))
      for (const link of task.links || [])
        if (link.relation === "part_of")
          expect(claims).toContain(
            `${task.id}|links:part_of:${link.target_id}`,
          );
  });
});

describe("extracted batches reach their benchmarks", () => {
  const base = ["migrated", "discovery"].flatMap((name) =>
    readJsonl<RecordEntry>(`data/omics/${name}.jsonl`),
  );
  const release = buildRelease(
    currentCatalogueBase(base),
    "2026-09-18T00:00:00Z",
    { entity_schema_version: "1.1" },
  ).snapshot;
  const coverage = benchmarkCoverage(release.records);
  const floor = JSON.parse(
    fs.readFileSync("data/omics/benchmark-evidence-floor.json", "utf8"),
  );

  it("covers at least the recorded floor", () => {
    // Counted before the entity separation the release performs, so there are
    // more benchmark-kinded records here than the published catalogue holds.
    // The floor is a lower bound on how many are reachable, which holds in
    // either view.
    const covered = coverage.filter((c) => c.evaluations > 0);
    expect(covered.length).toBeGreaterThanOrEqual(floor.covered);
  });

  it("reaches one benchmark per batch", () => {
    for (const { key, records } of batches) {
      const benchmarks = new Set(
        records.flatMap((record) =>
          (record.links || [])
            .filter((l) => l.relation === "part_of")
            .map((l) => l.target_id),
        ),
      );
      expect(benchmarks.size, key).toBe(1);
      const id = [...benchmarks][0];
      const row = coverage.find((c) => c.id === id);
      expect(row, `${key} -> ${id}`).toBeDefined();
      expect(row!.evaluations).toBe(
        records.filter((r) => r.kind === "evaluation").length,
      );
    }
  });
});

describe("table reading", () => {
  it("reads a number, its spread and an empty cell", () => {
    expect(parseCell("0.450")).toMatchObject({ value: "0.450", sd: null });
    expect(parseCell("64.18(0.44)")).toMatchObject({
      value: "64.18",
      sd: "0.44",
    });
    expect(parseCell("0.31 ± 1 × 10 − 2")).toMatchObject({
      value: "0.31",
      sd: "0.01",
    });
    for (const empty of ["-", "—", "N/A", "NA", ""])
      expect(parseCell(empty).value, empty).toBeNull();
  });

  it("treats a bold digit as the digit it is", () => {
    expect(
      parseCell("0.50 ± \u{1D7D2} × \u{1D7CF}\u{1D7CE} − \u{1D7D1}"),
    ).toMatchObject({
      value: "0.50",
      sd: "0.004",
    });
  });

  it("does not multiply its way into floating point noise", () => {
    expect(parseCell("0.29 ± 9 × 10 − 4").sd).toBe("0.0009");
  });

  it("reads a table nested inside other elements", () => {
    const html = `<table-wrap><label>Table 9</label><caption><p>Scores</p></caption>
      <table><tr><th>Model</th><th>AUROC ↑</th></tr>
      <tr><td>A</td><td>0.9</td></tr></table></table-wrap>`;
    const [found] = tables(html);
    expect(found.caption).toBe("Table 9 Scores");
    expect(found.rows).toEqual([
      ["Model", "AUROC ↑"],
      ["A", "0.9"],
    ]);
  });

  it("does not give a table the caption of the one below it", () => {
    const html = `<table><tr><td>x</td></tr></table>
      <figcaption>Table 2: the real one</figcaption>
      <table><tr><td>y</td></tr></table>`;
    const [first, second] = tables(html);
    expect(first.caption).toBe("");
    expect(second.caption).toBe("Table 2: the real one");
  });

  it("carries a spanning section label down its rows", () => {
    const rows = [
      ["Probed", "A", "1"],
      ["B", "2"],
      ["Fine-tuned", "C", "3"],
    ];
    expect(sectioned(rows, 2).map((r) => r.section)).toEqual([
      "Probed",
      "Probed",
      "Fine-tuned",
    ]);
  });

  it("splits a table into its stacked header blocks", () => {
    const blocks = headedBlocks({
      caption: "",
      rows: [
        ["", "length 50", "", "length 100", ""],
        ["", "scTM ↑", "scRMSD ↓", "scTM ↑", "scRMSD ↓"],
        ["RFdiffusion", "0.95", "0.45", "0.98", "0.48"],
        ["", "length 300", "", "length 500", ""],
        ["", "scTM ↑", "scRMSD ↓", "scTM ↑", "scRMSD ↓"],
        ["RFdiffusion", "0.96", "1.03", "0.79", "2.10"],
      ],
    });
    expect(blocks).toHaveLength(2);
    expect(blocks[0].groups[2]).toBe("length 50");
    expect(blocks[1].groups[3]).toBe("length 500");
    expect(blocks[1].rows[0][1]).toBe("0.96");
    expect(arrowDirection(blocks[0].metrics[2])).toBe("lower");
  });

  it("splits a PDF row on runs of spaces, not on single ones", () => {
    const text = ["HEAD", "Splice-H510   64.93   45.80", "END"].join("\n");
    expect(layoutRows(text, /^HEAD$/, /^END$/)).toEqual([
      ["Splice-H510", "64.93", "45.80"],
    ]);
  });

  it("rejoins small capitals a PDF split apart", () => {
    expect(joinSmallCaps("E NFORMER")).toBe("ENFORMER");
    expect(joinSmallCaps("D EEP SEA")).toBe("DEEPSEA");
    expect(joinSmallCaps("AUGUSTUS")).toBe("AUGUSTUS");
  });
});
