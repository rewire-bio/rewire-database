import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import {
  createCatalogueQuery,
  type CatalogueRecord,
  type CatalogueSnapshot,
} from "../services/omics/src/catalogue-query";
import { type PublishedComparison } from "../services/omics/src/published-comparisons";
import BenchmarkCharts from "../components/catalogue/BenchmarkCharts";

vi.mock("next/link", () => ({
  default: ({ children, ...props }: React.ComponentProps<"a">) => (
    <a {...props}>{children}</a>
  ),
}));

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
    expect(html).not.toContain("/database/model/model-17");
    expect(html).toContain("Show all 30");
    expect(html).toContain("/database/result/result-18");
    expect(panels[0].rows[29].result.id).toBe("result-29");
    expect(html).toContain('role="img"');
    expect(html).not.toMatch(/Highest scores first|Lowest scores first|Score, best first/);
    expect(panels[0].rows[0].result.attributes.printed_value).toBe(
      "-0.16666666666666666",
    );
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

function exactValuePanel() {
  const snapshot = fixture();
  const values = [
    "-0.037894589438910123",
    "1.2345678901234567e-12",
    null,
    "0.9012345678901234567",
    "-2.5000000000000000e-08",
    "0.0000000000000000",
  ];
  values.forEach((value, index) => {
    const result = snapshot.records.find((row) => row.id === `result-${index}`)!;
    result.attributes.numeric_value = value;
    result.attributes.printed_value = value ?? "N/A";
  });
  const panel = createCatalogueQuery(snapshot).get({ id: "benchmark" })!
    .published_comparisons[0];
  return { ...panel, rows: panel.rows.slice(0, values.length) };
}

describe("readable comparison evidence", () => {
  it("rounds visible scores while preserving missing values and descending numeric order", () => {
    const panel = exactValuePanel();
    const html = renderToStaticMarkup(<BenchmarkCharts panels={[panel]} />);
    const values = [...html.matchAll(/href="\/database\/result\/([^/\"]+)\/"[^>]*>([^<]*)<\/a>/g)];
    expect(values.map((match) => [match[1], match[2]])).toEqual([
      ["result-3", "0.901"],
      ["result-1", "1.23e-12"],
      ["result-5", "0"],
      ["result-4", "-2.5e-8"],
      ["result-0", "-0.0379"],
      ["result-2", "N/A"],
    ]);
    expect(html.match(/role="img"/g)).toHaveLength(5);
    expect(html).toContain("Not available");
    expect(html).toContain("1 unavailable value;");
  });

  it("sorts using full precision when rounded scores tie and leaves source records intact", () => {
    const panel = exactValuePanel();
    panel.rows = panel.rows.slice(0, 2);
    panel.rows[0].result.attributes.printed_value = "0.34521";
    panel.rows[0].result.attributes.numeric_value = "0.34521";
    panel.rows[1].result.attributes.printed_value = "0.34524";
    panel.rows[1].result.attributes.numeric_value = "0.34524";
    const original = JSON.stringify(panel);
    const html = renderToStaticMarkup(<BenchmarkCharts panels={[panel]} />);
    const values = [...html.matchAll(/href="\/database\/result\/([^/\"]+)\/"[^>]*>([^<]*)<\/a>/g)];
    expect(values.map((match) => [match[1], match[2]])).toEqual([
      ["result-1", "0.345"], ["result-0", "0.345"],
    ]);
    expect(JSON.stringify(panel)).toBe(original);
  });

  it("omits missingness commentary when every score is available", () => {
    const panels = createCatalogueQuery(fixture()).get({ id: "benchmark" })!
      .published_comparisons;
    const html = renderToStaticMarkup(<BenchmarkCharts panels={panels} />);
    expect(html).not.toContain("unavailable value");
    expect(html).not.toContain("missing scores remain labelled");
  });

  it("keeps the scope, evidence and material caveats visible while collapsing supporting details", () => {
    const panel = exactValuePanel();
    const genericCaveat = "Author-reported numbers, source checked but not independently reproduced.";
    const trainingCaveat = "Training data overlap is unresolved and may inflate the reported scores.";
    panel.caveats = [genericCaveat, ...panel.caveats, trainingCaveat];
    const html = renderToStaticMarkup(<BenchmarkCharts panels={[panel]} />);
    const header = html.match(/<header\b[^>]*>([\s\S]*?)<\/header>/)![1];
    const details = header.match(/<details\b([^>]*)>([\s\S]*?)<\/details>/)!;
    const summary = header.slice(0, details.index);
    expect(summary).toContain("correlation (dimensionless)");
    expect(summary).toContain("Higher values are better");
    expect(summary).toContain("/database/benchmark/benchmark");
    expect(summary).toContain("/database/dataset/dataset");
    expect(summary).toContain('href="https://example.org/paper"');
    expect(summary).toContain("Table 1");
    expect(summary).toContain("Evidence origin:");
    expect(summary).not.toContain(panel.context);
    expect(summary).toContain(panel.caveats[1]);
    expect(summary).toContain(trainingCaveat);
    expect(summary).not.toContain(genericCaveat);
    expect(details[1]).not.toMatch(/\bopen\b/);
    expect(details[2]).toContain("Comparison details and limitations");
    expect(details[2]).toContain(panel.context);
    expect(details[2]).toContain(genericCaveat);
    expect(details[2]).not.toContain(trainingCaveat);
    expect(details[2]).toContain("2026-09-17");
    expect(details[2]).toContain("Whiskers");
    for (const caveat of panel.caveats)
      expect(header.split(caveat)).toHaveLength(2);
  });

  it("collapses repeated BEELINE conditions only while retaining them in the visible protocol link", () => {
    const panel = exactValuePanel();
    const conditions = '{"reference_network":"ChIP-seq","gene_selection":"500 variable genes"}';
    panel.protocol = { ...panel.protocol, name: `BEELINE protocol · ${conditions}` };
    panel.caveats = [
      `Source-specific evaluation. Input conditions: ${conditions}. No equivalence to other releases, protocols or model families is inferred.`,
    ];
    const html = renderToStaticMarkup(<BenchmarkCharts panels={[panel]} />);
    const header = html.match(/<header\b[^>]*>([\s\S]*?)<\/header>/)![1];
    const details = header.match(/<details\b[^>]*>([\s\S]*?)<\/details>/)!;
    const summary = header.slice(0, details.index);
    const protocolLink = summary.match(/href="\/database\/benchmark\/benchmark\/"[^>]*>([^<]*)<\/a>/)![1];
    expect(protocolLink).toBe("BEELINE protocol · Reference network: ChIP-seq; Gene selection: 500 variable genes");
    expect(summary).not.toContain("Input conditions:");
    expect(details[1]).toContain("Input conditions: Reference network: ChIP-seq; Gene selection: 500 variable genes.");
    expect(header.split("Source-specific evaluation.")).toHaveLength(2);
  });

  it.each([
    ['Source-specific evaluation. Input conditions: {"reference_network":"Different network"}. No equivalence to other releases, protocols or model families is inferred.', "Input conditions: Reference network: Different network."],
    ["Unreviewed input conditions may change this comparison's interpretation.", "Unreviewed input conditions may change"],
  ])("keeps a nonidentical or unrecognized condition warning prominent: %s", (caveat, visibleText) => {
    const panel = exactValuePanel();
    panel.protocol = { ...panel.protocol, name: 'BEELINE protocol · {"reference_network":"ChIP-seq"}' };
    panel.caveats = [caveat];
    const html = renderToStaticMarkup(<BenchmarkCharts panels={[panel]} />);
    const header = html.match(/<header\b[^>]*>([\s\S]*?)<\/header>/)![1];
    const details = header.match(/<details\b[^>]*>([\s\S]*?)<\/details>/)!;
    expect(header.slice(0, details.index)).toContain(visibleText);
    expect(details[1]).not.toContain(visibleText);
  });

  it("retains generic scope and citation-label explanations in supporting details", () => {
    const panel = exactValuePanel();
    panel.caveats = [
      "Source-specific evaluation. No equivalence to other releases, protocols or model families is inferred.",
      "Comparison methods are named by the citation the table prints; the paper's text says which method each is.",
    ];
    const html = renderToStaticMarkup(<BenchmarkCharts panels={[panel]} />);
    const header = html.match(/<header\b[^>]*>([\s\S]*?)<\/header>/)![1];
    const details = header.match(/<details\b[^>]*>([\s\S]*?)<\/details>/)!;
    for (const note of ["Source-specific evaluation.", "Comparison methods are named by the citation the table prints;"]) {
      expect(header.slice(0, details.index)).not.toContain(note);
      expect(details[1]).toContain(note);
      expect(header.split(note)).toHaveLength(2);
    }
  });
});

describe("rounded comparison values in table view", () => {
  let tree: ReactTestRenderer | undefined;
  beforeEach(() => {
    let url = new URL("https://benchmarks.rewirebio.io/database/benchmark/benchmark/");
    const events = new EventTarget();
    vi.stubGlobal("window", {
      get location() {
        return url;
      },
      addEventListener: events.addEventListener.bind(events),
      removeEventListener: events.removeEventListener.bind(events),
      history: {
        pushState: (_state: unknown, _title: string, next: URL) => {
          url = new URL(next);
        },
      },
    });
  });
  afterEach(() => {
    if (tree) act(() => tree!.unmount());
    tree = undefined;
    vi.unstubAllGlobals();
  });

  it("switches between keyboard-accessible views with consistent rounded scores and numeric order", async () => {
    const panel = { ...exactValuePanel(), direction: "lower" as const };
    await act(async () => {
      tree = create(<BenchmarkCharts panels={[panel]} />);
    });
    const scoreLinks = () => tree!.root.findAllByType("a")
      .filter((link) => link.props.href.startsWith("/database/result/"))
      .map((link) => ({ href: link.props.href, text: link.children.join("") }));
    const chartValues = scoreLinks();
    expect(chartValues.map((value) => value.text)).toEqual([
      "0.901", "1.23e-12", "0",
      "-2.5e-8", "-0.0379", "N/A",
    ]);
    expect(tree!.root.findAll((node) => node.props.role === "region")
      .some((node) => node.props.tabIndex === 0 && node.props["aria-label"].includes("dot plot"))).toBe(true);
    await act(async () => {
      tree!.root.findAllByType("button")
        .find((button) => button.children.join("") === "Table")!.props.onClick();
    });
    expect(scoreLinks()).toEqual(chartValues);
    expect(tree!.root.findByType("caption").children.join("")).toBe("correlation: reported scores");
    const tableRegion = tree!.root.find((node) => node.props["aria-label"] === "Comparison values");
    expect(tableRegion.props.role).toBe("region");
    expect(tableRegion.props.tabIndex).toBe(0);
    expect(tree!.root.findByType("tbody").findAllByType("tr")).toHaveLength(6);
    await act(async () => {
      tree!.root.findAllByType("button")
        .find((button) => button.children.join("") === "Chart")!.props.onClick();
    });
    expect(scoreLinks()).toEqual(chartValues);
  });
});

describe("comparison missingness and evidence safeguards", () => {
  it("keeps unavailable cells in the evidence table without plotting them as zero", () => {
    const snapshot = fixture();
    const missing = snapshot.records.find((r) => r.id === "result-0")!;
    missing.attributes.numeric_value = null;
    missing.attributes.printed_value = "N/A";
    const panels = createCatalogueQuery(snapshot).get({
      id: "benchmark",
    })!.published_comparisons;
    expect(panels[0].rows).toHaveLength(30);
    const html = renderToStaticMarkup(<BenchmarkCharts panels={panels} />);
    expect(html.match(/role="img"/g)).toHaveLength(12);
    expect(html).toContain("Show all 30");
    expect(html).not.toContain("N/A");
    expect(html).toContain("1 unavailable value;");
    const smallPanel = { ...panels[0], rows: panels[0].rows.slice(0, 3) };
    const smallHtml = renderToStaticMarkup(
      <BenchmarkCharts panels={[smallPanel]} />,
    );
    expect(smallHtml.match(/role="img"/g)).toHaveLength(2);
    expect(smallHtml).toContain("N/A");
    expect(smallHtml.indexOf("/database/result/result-0")).toBeGreaterThan(
      smallHtml.indexOf("/database/result/result-1"),
    );
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
    {
      dataset: "dataset-b",
      split: "validation",
      values: ["0.3", "0.7", "0.2"],
    },
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
    const detail = createCatalogueQuery(pooledFixture()).get({
      id: "benchmark",
    })!;
    expect(detail.published_comparisons).toHaveLength(3);
    expect(detail.aggregate_comparisons).toEqual([]);
    const html = renderToStaticMarkup(
      <BenchmarkCharts panels={detail.published_comparisons} />,
    );
    expect(html).not.toMatch(/Highest scores first|Lowest scores first|Score, best first/);
    expect(html).not.toContain("Pooled by metric");
    expect(html).toContain("without a pooled ranking");
  });
  it("linked chart records do not contain nested chart definitions", () => {
    const detail = createCatalogueQuery(pooledFixture()).get({
      id: "benchmark",
    })!;
    for (const panel of detail.published_comparisons) {
      expect(panel.protocol.attributes.comparison_panels).toBeUndefined();
      for (const row of panel.rows)
        for (const linked of row.benchmarks)
          expect(linked.attributes.comparison_panels).toBeUndefined();
    }
  });
});
