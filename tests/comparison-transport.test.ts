import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  packComparisons,
  unpackComparisons,
  type PackedComparisons,
} from "../lib/comparison-transport";
import {
  createCatalogueQuery,
  type CatalogueRecord,
  type CatalogueSnapshot,
  type ResultRow,
} from "../shared/omics/catalogue-query";
import type { ResolvedComparison } from "../shared/omics/published-comparisons";

const record = (
  id: string,
  kind: CatalogueRecord["kind"],
  attributes: CatalogueRecord["attributes"] = {},
): CatalogueRecord => ({
  id,
  kind,
  name: id,
  description: "Original source description",
  status: "source_checked",
  facets: { areas: ["proteins-complexes"] },
  source_ids: ["source-2", "source-1"],
  links: [{ relation: "source", target_id: "source-2" }],
  attributes,
});
function fixture(): ResolvedComparison[] {
  const protocol = record("protocol", "protocol", {
    full: { methodology: "Keep every field" },
  });
  const dataset = record("dataset", "dataset");
  const source = record("source", "source", {
    url: "https://example.org/paper",
    artifact_sha256: "a".repeat(64),
    version: "v2",
    source_locator: "Table 3",
  });
  const row: ResultRow = {
    result: record("result", "result", {
      numeric_value: "-0.209",
      printed_value: "−0.209",
      uncertainty: { low: "-0.3", high: "-0.1", method: "bootstrap" },
      missing_reason: null,
    }),
    evaluation: null,
    models: [record("model", "model")],
    benchmarks: [protocol],
    methods: [record("method", "method")],
    configurations: [record("model", "configuration", { checkpoint: "exact" })],
    pipelines: [record("pipeline", "pipeline")],
    services: [record("service", "service")],
    tasks: [record("task", "task")],
    protocols: [protocol],
    evaluators: [record("evaluator", "evaluator")],
    datasets: [dataset],
    dataset_subsets: [record("subset", "dataset_subset")],
    sources: [source, source],
    origin: "paper_compilation",
    review_status: "source_checked",
  };
  return [
    {
      id: "panel",
      title: "A source table",
      protocol_id: protocol.id,
      dataset_id: dataset.id,
      metric: "Spearman",
      unit: "dimensionless",
      direction: "higher",
      result_ids: ["result", "missing"],
      source_ids: [source.id],
      source_locator: "Table 3, original row order",
      context: "Partial assay coverage",
      caveats: [
        "Quoted evidence is not independent",
        "One seed, no uncertainty estimate",
      ],
      review: { method: "automated_source_review", date: "2026-09-23" },
      rows: [
        row,
        {
          ...row,
          result: record("missing", "result", {
            numeric_value: null,
            printed_value: "N/A",
            missing_reason: "not scored",
          }),
          evaluation: record("evaluation", "evaluation", {
            origin: "paper_compilation",
          }),
        },
      ],
      sources: [source],
      protocol,
      dataset,
    },
  ];
}
function freeze(value: unknown): void {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(freeze);
  }
}

describe("lossless internal comparison transport", () => {
  it("round-trips all metadata, entity groups, null evaluations and original array/property order", () => {
    const panels = fixture();
    const packed = packComparisons(panels);
    const restored = unpackComparisons(JSON.parse(JSON.stringify(packed)));
    expect(restored).toEqual(panels);
    expect(JSON.stringify(restored)).toBe(JSON.stringify(panels));
    expect(packed.records.length).toBeLessThan(30);
    expect(packed.panels[0].rows[0].sources[0]).toBe(
      packed.panels[0].rows[0].sources[1],
    );
  });
  it("does not merge equal IDs with different metadata or record representations", () => {
    const panels = fixture();
    const original = panels[0].rows[0].models[0];
    const distinct = {
      ...original,
      attributes: { added: "source-scoped distinction" },
    };
    panels[0].rows[0].models.push(
      distinct,
      JSON.parse(JSON.stringify(original)),
    );
    const packed = packComparisons(panels);
    const indices = packed.panels[0].rows[0].models;
    expect(indices[0]).not.toBe(indices[1]);
    expect(indices[0]).toBe(indices[2]);
    expect(unpackComparisons(packed)).toEqual(panels);
  });
  it("does not mutate frozen inputs when packing or unpacking", () => {
    const panels = fixture();
    freeze(panels);
    const before = JSON.stringify(panels);
    const packed = packComparisons(panels);
    freeze(packed);
    const packedBefore = JSON.stringify(packed);
    expect(unpackComparisons(packed)).toEqual(panels);
    expect(JSON.stringify(panels)).toBe(before);
    expect(JSON.stringify(packed)).toBe(packedBefore);
    expect(unpackComparisons(packComparisons([]))).toEqual([]);
  });
  it.each([-1, 0.5, Number.MAX_SAFE_INTEGER, NaN, Infinity])(
    "rejects invalid reference index %s",
    (index) => {
      const packed = packComparisons(fixture());
      packed.panels[0].rows[0].result = index;
      expect(() => unpackComparisons(packed)).toThrow(
        "Invalid comparison record index",
      );
    },
  );
  it("rejects unknown formats and missing source records", () => {
    const packed = packComparisons(fixture());
    expect(() =>
      unpackComparisons({
        ...packed,
        format: "future",
      } as unknown as PackedComparisons),
    ).toThrow("Unsupported comparison transport format");
    packed.panels[0].sources = [packed.records.length];
    expect(() => unpackComparisons(packed)).toThrow(
      "Invalid comparison record index",
    );
  });
  it("round-trips every current published panel without changing source values or catalogue records", () => {
    const snapshot: CatalogueSnapshot = JSON.parse(
      fs.readFileSync("public/omics/catalogue.json").toString(),
    );
    const original = JSON.stringify(snapshot);
    const query = createCatalogueQuery(snapshot);
    const seen = new Set<string>();
    for (const owner of snapshot.records.filter((r) =>
      Array.isArray(r.attributes.comparison_panels),
    )) {
      const panels = query.get({ id: owner.id })!.published_comparisons;
      const packed = packComparisons(panels);
      const restored = unpackComparisons(JSON.parse(JSON.stringify(packed)));
      expect(JSON.stringify(restored)).toBe(JSON.stringify(panels));
      panels.forEach((panel) => seen.add(panel.id));
    }
    const expected = new Set(
      snapshot.records.flatMap((owner) =>
        Array.isArray(owner.attributes.comparison_panels)
          ? owner.attributes.comparison_panels.map(
              (panel: { id: string }) => panel.id,
            )
          : [],
      ),
    );
    expect([...seen].sort()).toEqual([...expected].sort());
    const legacy = JSON.parse(fs.readFileSync("tests/fixtures/legacy-coverage-ids.json", "utf8")).panel_ids as string[];
    expect(legacy).toHaveLength(765);
    expect(legacy.filter(id => seen.has(id))).toHaveLength(765);
    expect(JSON.stringify(snapshot)).toBe(original);
  }, 120_000);
});
