import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createCatalogueQuery,
  type CatalogueRecord,
  type CatalogueSnapshot,
  type ResultRow,
} from "../services/omics/src/catalogue-query";
import {
  comparisonRange,
  numericScore,
  scoreInterval,
} from "../components/catalogue/comparison-utils";
import {
  ComparisonWorkspace,
  comparisonChoices,
} from "../components/catalogue/BenchmarkCharts";

function record(
  id: string,
  kind: CatalogueRecord["kind"],
  attributes: Record<string, unknown> = {},
  links: CatalogueRecord["links"] = [],
): CatalogueRecord {
  return {
    id,
    kind,
    name: id,
    description: "",
    status: "source_checked",
    facets: {},
    source_ids: ["source"],
    links,
    attributes,
  };
}
function fixture(): CatalogueSnapshot {
  const records = [
    record("source", "source", { url: "https://example.org/paper" }),
    record("model", "model"),
    record("protocol", "protocol"),
    record("dataset", "dataset"),
    record("other-dataset", "dataset"),
  ];
  for (let i = 0; i < 30; i++)
    records.push(
      record(
        `evaluation-${String(i).padStart(2, "0")}`,
        "evaluation",
        { origin: "author_reported", evaluation_group_id: `group-${i}` },
        [
          { relation: "model", target_id: "model" },
          { relation: "protocol", target_id: "protocol" },
          {
            relation: "dataset",
            target_id: i % 2 ? "other-dataset" : "dataset",
          },
        ],
      ),
      record(
        `result-${String(i).padStart(2, "0")}`,
        "result",
        {
          numeric_value: i / 30,
          printed_value: `${i}/30`,
          metric: "accuracy",
          unit: "fraction",
          metric_direction: "higher",
        },
        [
          {
            relation: "evaluation",
            target_id: `evaluation-${String(i).padStart(2, "0")}`,
          },
        ],
      ),
    );
  return {
    schema_version: "1.1",
    release_id: "test-release",
    released_at: "2026-09-22",
    coverage: {},
    records,
  };
}
function row(value: unknown, uncertainty?: unknown): ResultRow {
  return {
    result: record("r", "result", { numeric_value: value, uncertainty }),
  } as ResultRow;
}

describe("comparison workspace scientific values", () => {
  it("does not coerce missing or malformed values to zero", () => {
    for (const value of [null, undefined, "", " ", "N/A", Infinity, {}, false])
      expect(numericScore(value)).toBeNull();
    expect(numericScore("0")).toBe(0);
    expect(numericScore(-0.4)).toBe(-0.4);
  });
  it("rejects unresolved plus-minus and recognises only defined uncertainty", () => {
    expect(
      scoreInterval(
        row(0.5, { type: "reported_plus_minus_type_unresolved", value: "0.1" }),
      ),
    ).toBeNull();
    expect(
      scoreInterval(row(0.5, { kind: "standard_error", printed_value: "0.1" })),
    ).toEqual({ low: 0.4, high: 0.6, label: "standard error" });
    expect(
      scoreInterval(row(0.5, { type: "standard_deviation", value: -1 })),
    ).toBeNull();
    expect(
      scoreInterval(
        row(0.5, { type: "confidence_interval", lower: 0.4, upper: 0.6 }),
      ),
    ).toBeNull();
    expect(
      scoreInterval(
        row(0.5, {
          type: "confidence_interval",
          lower: 0.4,
          upper: 0.6,
          level: "95%",
        }),
      ),
    ).toEqual({ low: 0.4, high: 0.6, label: "95% confidence interval" });
  });
  it("recognises explicit bounded units and known unitless metrics without guessing unknown scores", () => {
    expect(
      comparisonRange([row(0.82)], "macro_mcc", "correlation", false),
    ).toEqual([-1, 1]);
    expect(comparisonRange([row(82)], "GDT_TS", "score_0_100", false)).toEqual([
      0, 100,
    ]);
    for (const metric of ["AUROC", "F1", "Precision", "AP", "NDCG", "macro_f1"])
      expect(
        comparisonRange([row(0.82)], metric, "dimensionless", false),
      ).toEqual([0, 1]);
    expect(
      comparisonRange([row(0.82)], "unknown_score", "dimensionless", false),
    ).not.toEqual([0, 1]);
    expect(
      comparisonRange([row(82)], "accuracy", "dimensionless", false),
    ).not.toEqual([0, 1]);
  });
  it("uses known ranges and includes defined uncertainty without truncation", () => {
    expect(comparisonRange([row(0.82)], "accuracy", "fraction", false)).toEqual(
      [0, 1],
    );
    expect(comparisonRange([row(82)], "accuracy", "percent", false)).toEqual([
      0, 100,
    ]);
    expect(
      comparisonRange(
        [row(-0.82)],
        "Spearman correlation",
        "dimensionless",
        false,
      ),
    ).toEqual([-1, 1]);
    const range = comparisonRange(
      [row(3, { type: "standard_deviation", value: 2 })],
      "error",
      "arbitrary",
      false,
    );
    expect(range[0]).toBeLessThan(1);
    expect(range[1]).toBeGreaterThan(5);
    const zoom = comparisonRange(
      [row(0.82), row(0.85)],
      "accuracy",
      "fraction",
      true,
    );
    expect(zoom[0]).toBeGreaterThan(0.8);
    expect(zoom[1]).toBeLessThan(0.9);
  });
});

describe("additive catalogue browsing contract", () => {
  it("returns previous cursors and accurate ranges without crossing filters/releases", () => {
    const query = createCatalogueQuery(fixture());
    const first = query.results({ id: "model", limit: 10 });
    const second = query.results({
      id: "model",
      limit: 10,
      cursor: first.next_cursor!,
    });
    const third = query.results({
      id: "model",
      limit: 10,
      cursor: second.next_cursor!,
    });
    expect(first.previous_cursor).toBeNull();
    expect([first.range_start, first.range_end]).toEqual([1, 10]);
    expect(second.previous_cursor).toBe("");
    expect([third.range_start, third.range_end]).toEqual([21, 30]);
    expect(
      query.results({ id: "model", limit: 10, cursor: third.previous_cursor! })
        .items,
    ).toEqual(second.items);
    expect(() =>
      query.results({
        id: "model",
        metric: "different",
        cursor: first.next_cursor!,
      }),
    ).toThrow(/filters/);
    expect(() =>
      createCatalogueQuery({ ...fixture(), release_id: "new" }).results({
        id: "model",
        cursor: first.next_cursor!,
      }),
    ).toThrow(/release/);
  });
  it("filters exact protocol, dataset and tested subject while preserving legacy setup meaning", () => {
    const query = createCatalogueQuery(fixture());
    expect(
      query.results({
        id: "model",
        protocol_id: "protocol",
        dataset_id: "dataset",
        tested_entity_id: "model",
      }).total,
    ).toBe(15);
    expect(
      query.results({ id: "model", tested_entity_id: "absent" }).total,
    ).toBe(0);
    expect(
      query.results({ id: "model", configuration_id: "group-0" }).items[0]
        .result.id,
    ).toBe("result-00");
    expect(
      query.results({ id: "model", configuration_id: "evaluation-00" }).items[0]
        .result.id,
    ).toBe("result-00");
    expect(query.results({ id: "model" }).facets.protocols).toEqual([
      { id: "protocol", name: "protocol" },
    ]);
  });
  it("summarises linked evaluations separately from metric rows and retains empty records", () => {
    const snapshot = fixture();
    snapshot.records.push(
      record("extra", "result", { metric: "other" }, [
        { relation: "evaluation", target_id: "evaluation-00" },
      ]),
      record("empty", "model"),
    );
    const page = createCatalogueQuery(snapshot).list({ kind: "model" });
    expect(page.evaluation_summaries.model).toEqual({
      evaluation_count: 30,
      result_count: 31,
    });
    expect(page.evaluation_summaries.empty).toEqual({
      evaluation_count: 0,
      result_count: 0,
    });
  });
  it("shows available evaluations without inventing a reviewed comparison", () => {
    const initial = createCatalogueQuery(fixture()).results({ id: "model" });
    const html = renderToStaticMarkup(
      <ComparisonWorkspace
        panels={[]}
        recordId="model"
        initialResults={initial}
      />,
    );
    expect(html).toContain(
      "Results are available, but no reviewed comparison panel",
    );
    expect(html).toContain("All evaluations");
    expect(html).not.toContain("No evaluations linked");
  });
});

describe("comparison choice search", () => {
  const choices = [
    {
      id: "a-auc",
      title: "Held-out table",
      metric: "AUROC",
      protocol: { id: "a", name: "Assay A" },
      dataset: { id: "d", name: "Dataset" },
    },
    {
      id: "a-f1",
      title: "Held-out table",
      metric: "F1",
      protocol: { id: "a", name: "Assay A" },
      dataset: { id: "d", name: "Dataset" },
    },
    {
      id: "b-auc",
      title: "Table 2",
      metric: "AUROC",
      protocol: { id: "b", name: "Assay B" },
      dataset: { id: "d", name: "Dataset" },
    },
    {
      id: "b-f1",
      title: "Table 2",
      metric: "F1",
      protocol: { id: "b", name: "Assay B" },
      dataset: { id: "d", name: "Dataset" },
    },
  ];
  it("uses matching metric choices and a matching first panel when selecting another scope", () => {
    const searched = comparisonChoices(choices, "f1", "a-auc");
    expect(searched.scopeOptions.map((option) => option.id)).toEqual([
      "a-f1",
      "b-f1",
    ]);
    expect(searched.metricOptions.map((option) => option.id)).toEqual(["a-f1"]);
    expect(searched.scopes.map((scope) => scope.firstPanelId)).toEqual([
      "a-f1",
      "b-f1",
    ]);
    expect(searched.currentOption?.id).toBe("a-auc");
    const changedScope = comparisonChoices(
      choices,
      "f1",
      searched.scopes[1].firstPanelId,
    );
    expect(changedScope.metricOptions.map((option) => option.id)).toEqual([
      "b-f1",
    ]);
    expect(changedScope.currentOption?.id).toBe("b-f1");
  });
  it("retains the current selection separately when nothing matches and restores all choices on clear", () => {
    const searched = comparisonChoices(choices, "not present", "a-auc");
    expect(searched.scopes).toEqual([]);
    expect(searched.metricOptions).toEqual([]);
    expect(searched.currentOption?.id).toBe("a-auc");
    const reset = comparisonChoices(choices, "", "a-auc");
    expect(reset.metricOptions.map((option) => option.id)).toEqual([
      "a-auc",
      "a-f1",
    ]);
    expect(reset.scopes.map((scope) => scope.firstPanelId)).toEqual([
      "a-auc",
      "b-auc",
    ]);
  });
});
