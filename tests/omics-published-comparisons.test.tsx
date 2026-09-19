import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createCatalogueQuery,
  type CatalogueRecord,
  type CatalogueSnapshot,
} from "../services/omics/src/catalogue-query";
import { type PublishedComparison } from "../services/omics/src/published-comparisons";
import BenchmarkCharts from "../components/catalogue/BenchmarkCharts";

const record = (
  id: string,
  kind: CatalogueRecord["kind"],
  attributes: Record<string, unknown> = {},
  links: CatalogueRecord["links"] = [],
): CatalogueRecord => ({
  id,
  kind,
  name: id,
  description: "",
  status: "source_checked",
  facets: {},
  source_ids: ["source"],
  links,
  attributes,
});
function fixture(): CatalogueSnapshot {
  const panel: PublishedComparison = {
    id: "comparison",
    title: "One paper, one test split",
    protocol_id: "benchmark",
    dataset_id: "dataset",
    metric: "correlation",
    unit: "dimensionless",
    direction: "higher",
    result_ids: Array.from({ length: 30 }, (_, i) => `result-${i}`),
    source_ids: ["source"],
    source_locator: "Table 1",
    context:
      "Same held-out cohort; input information differs by configuration.",
    caveats: [
      "Unreported compute prevents a controlled efficiency comparison.",
    ],
    review: { method: "automated_source_review", date: "2026-09-17" },
  };
  const records = [
    record("source", "source", {
      url: "https://example.org/paper",
      version: "v1",
      retrieved_at: "2026-09-17",
      artifact_sha256: "a".repeat(64),
    }),
    record("benchmark", "benchmark", { comparison_panels: [panel] }),
    record("dataset", "dataset"),
  ];
  for (let i = 0; i < 30; i++)
    records.push(
      record(`model-${i}`, "model"),
      record(
        `evaluation-${i}`,
        "evaluation",
        {
          origin: i === 29 ? "paper_compilation" : "author_reported",
          comparison: { split: "test", aggregation: "mean" },
        },
        [
          { relation: "model", target_id: `model-${i}` },
          { relation: "benchmark", target_id: "benchmark" },
          { relation: "dataset", target_id: "dataset" },
        ],
      ),
      record(
        `result-${i}`,
        "result",
        {
          metric: "correlation",
          unit: "dimensionless",
          metric_direction: "higher",
          numeric_value: String((i - 5) / 30),
          printed_value: String((i - 5) / 30),
          source_locator: `Table 1 row ${i + 1}`,
        },
        [{ relation: "evaluation", target_id: `evaluation-${i}` }],
      ),
    );
  return {
    schema_version: "1.0",
    release_id: "release",
    released_at: "2026-09-17T00:00:00Z",
    coverage: {},
    records,
  };
}
describe("source-scoped comparison figures", () => {
  it("resolves every curated row independently of result-table pagination and keeps quoted origins", () => {
    const query = createCatalogueQuery(fixture());
    expect(query.results({ id: "benchmark", limit: 25 }).items).toHaveLength(
      25,
    );
    const panels = query.get({ id: "benchmark" })!.published_comparisons;
    expect(panels[0].rows).toHaveLength(30);
    expect(panels[0].rows[29].origin).toBe("paper_compilation");
    const html = renderToStaticMarkup(<BenchmarkCharts panels={panels} />);
    expect(html).toContain("/database/model/model-29");
    expect(html).toContain("/database/result/result-29");
    expect(html).toContain('role="img"');
    expect(html).toContain("Source order is preserved");
    expect(html).toContain("-0.16666666666666666");
  });
  it.each(["metric", "unit", "metric_direction"])(
    "rejects incompatible %s",
    (field) => {
      const snapshot = fixture();
      snapshot.records.find((r) => r.id === "result-29")!.attributes[field] =
        "different";
      expect(() =>
        createCatalogueQuery(snapshot).get({ id: "benchmark" }),
      ).toThrow("mixed metric, unit or direction");
    },
  );
  it.each(["split", "subset", "population", "aggregation"])(
    "rejects mixed %s",
    (field) => {
      const snapshot = fixture();
      (
        snapshot.records.find((r) => r.id === "evaluation-29")!.attributes
          .comparison as Record<string, unknown>
      )[field] = "different";
      expect(() =>
        createCatalogueQuery(snapshot).get({ id: "benchmark" }),
      ).toThrow(`mixed ${field}`);
    },
  );
  it.each(["disputed", "superseded", "needs_review"])(
    "rejects %s scores",
    (status) => {
      const snapshot = fixture();
      snapshot.records.find((r) => r.id === "result-29")!.status = status;
      expect(() =>
        createCatalogueQuery(snapshot).get({ id: "benchmark" }),
      ).toThrow("unchecked, superseded or missing");
    },
  );
  it("requires a source-backed relationship before showing a protocol under a task", () => {
    const snapshot = fixture();
    const benchmark = snapshot.records.find((r) => r.id === "benchmark")!;
    const parent = record("parent", "benchmark", {
      comparison_panels: benchmark.attributes.comparison_panels,
    });
    snapshot.records.push(parent);
    benchmark.links.push({ relation: "evaluates_task", target_id: "parent" });
    expect(() => createCatalogueQuery(snapshot).get({ id: "parent" })).toThrow(
      "unverified protocol association",
    );
    snapshot.records.push(
      record(
        "claim",
        "claim",
        {
          field: "links:evaluates_task:parent",
          value: "parent",
          source_locator: "Methods",
        },
        [{ relation: "subject", target_id: "benchmark" }],
      ),
    );
    expect(
      createCatalogueQuery(snapshot).get({ id: "parent" })!
        .published_comparisons,
    ).toHaveLength(1);
  });
  it("never upgrades incomplete comparisons to the stronger compatibility gate", () => {
    const query = createCatalogueQuery(fixture());
    expect(query.get({ id: "benchmark" })!.published_comparisons).toHaveLength(
      1,
    );
    expect(query.compare({ ids: ["result-0", "result-1"] }).compatible).toBe(
      false,
    );
  });
});

describe("comparison missingness and evidence safeguards", () => {
  it("keeps unavailable cells in the evidence table without plotting them as zero", () => {
    const snapshot = fixture();
    const missing = snapshot.records.find((r) => r.id === "result-29")!;
    missing.attributes.numeric_value = null;
    missing.attributes.printed_value = "N/A";
    const panels = createCatalogueQuery(snapshot).get({
      id: "benchmark",
    })!.published_comparisons;
    expect(panels[0].rows).toHaveLength(30);
    const html = renderToStaticMarkup(<BenchmarkCharts panels={panels} />);
    expect(html.match(/role="img"/g)).toHaveLength(29);
    expect(html).toContain("N/A");
    expect(html).toContain("1 unavailable values");
  });
  it.each(["superseded", "disputed", "excluded"])(
    "rejects a %s evaluation even when the score is checked",
    (status) => {
      const snapshot = fixture();
      snapshot.records.find((r) => r.id === "evaluation-29")!.status = status;
      expect(() =>
        createCatalogueQuery(snapshot).get({ id: "benchmark" }),
      ).toThrow("inactive or missing evaluation");
    },
  );
  it("rejects unresolved source concerns and unpinned source artifacts", () => {
    const snapshot = fixture();
    const source = snapshot.records.find((r) => r.id === "source")!;
    source.attributes.evidence_concerns = [{ message: "Protocol unresolved" }];
    expect(() =>
      createCatalogueQuery(snapshot).get({ id: "benchmark" }),
    ).toThrow("unresolved source concerns");
    delete source.attributes.evidence_concerns;
    delete source.attributes.artifact_sha256;
    expect(() =>
      createCatalogueQuery(snapshot).get({ id: "benchmark" }),
    ).toThrow("not pinned");
  });
  it("rejects blank numeric strings", () => {
    const snapshot = fixture();
    snapshot.records.find(
      (r) => r.id === "result-29",
    )!.attributes.numeric_value = " ";
    expect(() =>
      createCatalogueQuery(snapshot).get({ id: "benchmark" }),
    ).toThrow("non-numerical");
  });
  it("also rejects null scores and different optional subsets in the strict comparison API", () => {
    const snapshot = fixture();
    for (const record of snapshot.records.filter(
      (r) => r.kind === "evaluation",
    ))
      record.attributes.comparison = {
        protocol_id: "benchmark",
        dataset_version: "v1",
        split: "test",
        population: "same cohort",
        inputs: "sequence",
        adaptation: "none",
        metric_implementation: "v1",
        aggregation: "mean",
        budget: "matched",
      };
    expect(
      createCatalogueQuery(snapshot).compare({ ids: ["result-0", "result-1"] })
        .compatible,
    ).toBe(true);
    snapshot.records.find(
      (r) => r.id === "result-1",
    )!.attributes.numeric_value = null;
    expect(
      createCatalogueQuery(snapshot).compare({ ids: ["result-0", "result-1"] })
        .compatible,
    ).toBe(false);
    snapshot.records.find(
      (r) => r.id === "result-1",
    )!.attributes.numeric_value = "0.5";
    (
      snapshot.records.find((r) => r.id === "evaluation-0")!.attributes
        .comparison as Record<string, unknown>
    ).subset = "A";
    (
      snapshot.records.find((r) => r.id === "evaluation-1")!.attributes
        .comparison as Record<string, unknown>
    ).subset = "B";
    expect(
      createCatalogueQuery(snapshot).compare({ ids: ["result-0", "result-1"] })
        .compatible,
    ).toBe(false);
  });
});

function pooledFixture(): CatalogueSnapshot {
  const records: CatalogueRecord[] = [
    record("source", "source", {
      url: "https://example.org/paper",
      version: "v1",
      retrieved_at: "2026-09-17",
      artifact_sha256: "a".repeat(64),
    }),
    record("dataset-a", "dataset"),
    record("dataset-b", "dataset"),
  ];
  // Two tables of the same metric on different datasets and splits, plus a
  // third table whose metric appears only once.
  const tables = [
    { dataset: "dataset-a", split: "test", values: ["0.1", "0.5", "0.9"] },
    { dataset: "dataset-b", split: "validation", values: ["0.3", "0.7", "0.2"] },
  ];
  const panels: PublishedComparison[] = [];
  let index = 0;
  for (const [table, { dataset, split, values }] of tables.entries()) {
    const ids: string[] = [];
    for (const value of values) {
      const id = `result-${index}`;
      ids.push(id);
      records.push(
        record(`model-${index}`, "model"),
        record(
          `evaluation-${index}`,
          "evaluation",
          { origin: "author_reported", comparison: { split } },
          [
            { relation: "model", target_id: `model-${index}` },
            { relation: "benchmark", target_id: "benchmark" },
            { relation: "dataset", target_id: dataset },
          ],
        ),
        record(
          id,
          "result",
          {
            metric: "correlation",
            unit: "dimensionless",
            metric_direction: "higher",
            numeric_value: value,
            printed_value: value,
            source_locator: `Table ${table + 1} row ${ids.length}`,
          },
          [{ relation: "evaluation", target_id: `evaluation-${index}` }],
        ),
      );
      index++;
    }
    panels.push({
      id: `comparison-${table}`,
      title: `Table ${table + 1}`,
      protocol_id: "benchmark",
      dataset_id: dataset,
      metric: "correlation",
      unit: "dimensionless",
      direction: "higher",
      result_ids: ids,
      source_ids: ["source"],
      source_locator: `Table ${table + 1}`,
      context: "One paper, one reported table.",
      caveats: [`Table ${table + 1} caveat.`],
      review: { method: "automated_source_review", date: "2026-09-17" },
    });
  }
  const loneIds: string[] = [];
  for (const value of ["0.4", "0.6"]) {
    const id = `result-${index}`;
    loneIds.push(id);
    records.push(
      record(`model-${index}`, "model"),
      record(
        `evaluation-${index}`,
        "evaluation",
        { origin: "author_reported", comparison: { split: "test" } },
        [
          { relation: "model", target_id: `model-${index}` },
          { relation: "benchmark", target_id: "benchmark" },
          { relation: "dataset", target_id: "dataset-a" },
        ],
      ),
      record(
        id,
        "result",
        {
          metric: "accuracy",
          unit: "fraction",
          metric_direction: "higher",
          numeric_value: value,
          printed_value: value,
          source_locator: `Table 3 row ${loneIds.length}`,
        },
        [{ relation: "evaluation", target_id: `evaluation-${index}` }],
      ),
    );
    index++;
  }
  panels.push({
    id: "comparison-accuracy",
    title: "Table 3",
    protocol_id: "benchmark",
    dataset_id: "dataset-a",
    metric: "accuracy",
    unit: "fraction",
    direction: "higher",
    result_ids: loneIds,
    source_ids: ["source"],
    source_locator: "Table 3",
    context: "One paper, one reported table.",
    caveats: ["Table 3 caveat."],
    review: { method: "automated_source_review", date: "2026-09-17" },
  });
  records.push(record("benchmark", "benchmark", { comparison_panels: panels }));
  return {
    schema_version: "1.0",
    release_id: "release",
    released_at: "2026-09-17T00:00:00Z",
    coverage: {},
    records,
  };
}

describe("source-scoped comparison view", () => {
  it("does not rank incompatible datasets together", () => {
    const detail = createCatalogueQuery(pooledFixture()).get({id: "benchmark"})!;
    expect(detail.published_comparisons).toHaveLength(3);
    expect(detail.aggregate_comparisons).toEqual([]);
    const html = renderToStaticMarkup(<BenchmarkCharts panels={detail.published_comparisons} />);
    expect(html).toContain("Source order is preserved");
    expect(html).not.toContain("Pooled by metric");
    expect(html).toContain("without a pooled ranking");
  });
  it("linked chart records do not contain nested chart definitions", () => {
    const detail = createCatalogueQuery(pooledFixture()).get({id: "benchmark"})!;
    for (const panel of detail.published_comparisons) {
      expect(panel.protocol.attributes.comparison_panels).toBeUndefined();
      for (const row of panel.rows) for (const linked of row.benchmarks)
        expect(linked.attributes.comparison_panels).toBeUndefined();
    }
  });
});
