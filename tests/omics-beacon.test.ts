/**
 * Guard the BEACON Table 3 batch.
 *
 * The extractor needs the pinned PDF, which is not in the repo, so these tests
 * check the committed batch instead: the values it carries, the links that make
 * the benchmark reachable, and the rows it deliberately leaves out.
 */
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { currentCatalogueBase, readJsonl } from "../scripts/omics/inputs";
import { buildRelease } from "../scripts/omics/release";
import { createCatalogueQuery } from "../services/omics/src/catalogue-query";
import { benchmarkCoverage } from "../scripts/omics/audit-benchmark-evidence";
import { BENCHMARK_ID, TASK_ORDER } from "../scripts/omics/extract-beacon";
import { relationAcceptsKind } from "../services/omics/src/entity-kinds";
import { type RecordEntry } from "../scripts/omics/schema";

const batch = readJsonl<RecordEntry>("data/omics/reviewed/beacon-2026.jsonl");
const byId = new Map(batch.map((record) => [record.id, record]));
const of = (kind: string) => batch.filter((record) => record.kind === kind);
const attr = (record: RecordEntry, key: string) =>
  String(record.attributes[key] ?? "");

const query = createCatalogueQuery(
  buildRelease(
    currentCatalogueBase(
      ["migrated", "discovery"].flatMap((name) =>
        readJsonl<RecordEntry>(`data/omics/${name}.jsonl`),
      ),
    ),
    "2026-09-18T00:00:00Z",
    { entity_schema_version: "1.1" },
  ).snapshot,
);

describe("BEACON Table 3 batch", () => {
  it("matches its extraction receipt", () => {
    const receipt = JSON.parse(
      fs.readFileSync(
        "data/omics/reviews/2026-09-18-beacon-extraction.json",
        "utf8",
      ),
    );
    const digest = createHash("sha256")
      .update(fs.readFileSync("data/omics/reviewed/beacon-2026.jsonl"))
      .digest("hex");
    expect(receipt.records_sha256).toBe(digest);
    expect(receipt.errors).toEqual([]);
  });

  it("carries one evaluation and one result per method and task", () => {
    // 17 methods, 13 tasks each. The 18th Table 3 row is Literature SOTA, whose
    // numbers belong to the cited papers under their own protocols.
    const methods = [...of("method"), ...of("configuration")];
    expect(methods).toHaveLength(17);
    expect(of("task")).toHaveLength(TASK_ORDER.length);
    expect(of("evaluation")).toHaveLength(methods.length * TASK_ORDER.length);
    expect(of("result")).toHaveLength(methods.length * TASK_ORDER.length);
    expect(batch.some((record) => /literature|sota/i.test(record.name))).toBe(
      false,
    );
  });

  it("makes the benchmark reachable in two hops", () => {
    for (const task of of("task"))
      expect(task.links).toContainEqual({
        relation: "part_of",
        target_id: BENCHMARK_ID,
      });
    const coverage = benchmarkCoverage([
      {
        id: BENCHMARK_ID,
        kind: "benchmark",
        name: "BEACON",
        status: "discovered",
        description: "RNA benchmark suite",
        facets: {}, source_ids: [], links: [], attributes: {},
      },
      ...batch,
    ]);
    expect(coverage[0]).toMatchObject({
      id: BENCHMARK_ID,
      evaluations: 221,
      results: 221,
    });
  });

  it("gives every evaluation one resolvable model, benchmark and dataset", () => {
    for (const evaluation of of("evaluation")) {
      const relations = (evaluation.links || []).map((link) => link.relation);
      expect(relations.sort()).toEqual(["benchmark", "dataset", "model"]);
      for (const link of evaluation.links || []) {
        const target = byId.get(link.target_id);
        expect(target, `${evaluation.id} -> ${link.target_id}`).toBeDefined();
        expect(relationAcceptsKind(link.relation, target!.kind)).toBe(true);
      }
    }
  });

  it("transcribes printed values, including the rows a naive parser mangles", () => {
    // Checked by eye against Table 3 on page 8. Splice-H510 and UTRBERT-6mer are
    // the model names whose own digits a whitespace split would capture as data.
    const printed: [string, string, string, string][] = [
      ["cnn", "ssp", "49.95(0.82)", "49.95"],
      ["rna-fm", "vdp", "0.347(0.003)", "0.347"],
      ["splice-h510", "ssp", "64.93(0.84)", "64.93"],
      ["utrbert-6mer", "ssp", "38.56(28.76)", "38.56"],
      ["beacon-b512", "cri-off", "3.82(1.04)", "3.82"],
    ];
    for (const [model, task, value, numeric] of printed) {
      const result = batch.find((record) =>
        record.id.startsWith(`beacon-result-${model}-${task}-`),
      );
      expect(result, `${model} ${task}`).toBeDefined();
      expect(attr(result!, "printed_value")).toBe(value);
      expect(attr(result!, "numeric_value")).toBe(numeric);
    }
  });

  it("keeps VDP an error metric and every other task a score", () => {
    for (const result of of("result")) {
      const lower = result.id.includes("-vdp-");
      expect(attr(result, "metric_direction")).toBe(lower ? "lower" : "higher");
      expect(attr(result, "unit")).toBe(lower ? "error" : "percent");
    }
  });

  it("records where each number came from", () => {
    for (const result of of("result")) {
      expect(attr(result, "source_locator")).toMatch(
        /^Table3,p\.8,row\(.+\),column\(.+\)$/,
      );
      const review = result.attributes.review as Record<string, string>;
      expect(review.artifact_sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(result.status).toBe("source_checked");
    }
  });

  it("reaches the suite page, not just the task pages", () => {
    // The complaint this batch answers: the benchmark page counted only results
    // linked straight to the suite, and every BEACON result hangs off a task.
    const suite = query.results({ id: BENCHMARK_ID, limit: 1 });
    expect(suite.total).toBe(221);
    expect(suite.evaluation_count).toBe(221);
    const panels = query.get({ id: BENCHMARK_ID })!.published_comparisons;
    expect(panels).toHaveLength(TASK_ORDER.length);
    for (const panel of panels) expect(panel.rows).toHaveLength(17);
  });
});
