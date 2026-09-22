import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createCatalogueQuery,
  type CatalogueSnapshot,
  type CatalogueRecord,
} from "../services/omics/src/catalogue-query";
import {
  defaultFilters,
  filterCatalogue,
  readCatalogueFilters,
  primaryKinds,
  secondaryKinds,
  testedEntities,
  groupEntities,
} from "../lib/omics-browse";
import RecordPage, {
  generateMetadata,
  generateStaticParams,
} from "../app/database/[kind]/[id]/page";
import Results from "../components/catalogue/Results";

const fixture = vi.hoisted(() => ({
  snapshot: null as CatalogueSnapshot | null,
}));
vi.mock("../lib/catalogue-build", () => ({
  buildCatalogue: () => ({
    catalogue: fixture.snapshot!,
    query: createCatalogueQuery(fixture.snapshot!),
  }),
}));

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
    description: `${kind} description`,
    status: "source_checked",
    facets: {},
    source_ids: ["source"],
    links,
    attributes,
  };
}
function snapshot() {
  const records = [
    record("source", "source", {
      url: "https://example.org/paper",
      version: "v1",
    }),
    record("model", "model"),
    record("configured", "configuration", { legacy_kinds: ["model"] }, [
      { relation: "uses_model", target_id: "model" },
    ]),
    record("suite", "benchmark"),
    record("biological-task", "task", { legacy_kinds: ["benchmark"] }, [
      { relation: "part_of", target_id: "suite" },
    ]),
    record("procedure", "protocol", { legacy_kinds: ["benchmark"] }, [
      { relation: "evaluates_task", target_id: "biological-task" },
    ]),
    record("dataset", "dataset"),
    record(
      "evaluation",
      "evaluation",
      { origin: "author_reported", protocol: "Held-out evaluation." },
      [
        { relation: "model", target_id: "configured" },
        { relation: "benchmark", target_id: "procedure" },
        { relation: "dataset", target_id: "dataset" },
      ],
    ),
    record(
      "finding",
      "result",
      {
        printed_value: "78.5",
        numeric_value: "78.5",
        metric: "accuracy",
        metric_direction: "higher",
        unit: "percent",
        source_locator: "Table 1",
      },
      [{ relation: "evaluation", target_id: "evaluation" }],
    ),
  ];
  for (const [subject, relation, target] of [
    ["configured", "uses_model", "model"],
    ["biological-task", "part_of", "suite"],
    ["procedure", "evaluates_task", "biological-task"],
  ]) {
    records.push(
      record(
        `claim-${subject}`,
        "claim",
        { field: `links:${relation}:${target}`, source_locator: "Methods" },
        [{ relation: "subject", target_id: subject }],
      ),
    );
  }
  fixture.snapshot = {
    schema_version: "1.1",
    release_id: "release",
    released_at: "2026-09-17T00:00:00Z",
    coverage: {},
    records,
  };
  return createCatalogueQuery(fixture.snapshot);
}

describe("explicit catalogue entity UI", () => {
  it("keeps four primary categories and exposes all specialist categories", () => {
    expect(primaryKinds).toEqual(["model", "benchmark", "dataset", "result"]);
    expect(secondaryKinds).toEqual(
      expect.arrayContaining([
        "method",
        "configuration",
        "pipeline",
        "service",
        "task",
        "protocol",
        "evaluator",
        "dataset_subset",
        "baseline",
      ]),
    );
    expect(readCatalogueFilters("?kind=protocol").kind).toBe("protocol");
    expect(
      filterCatalogue([record("a", "model"), record("b", "method")], {
        ...defaultFilters,
        kind: "method",
      }).map((item) => item.id),
    ).toEqual(["b"]);
  });
  it("labels the actual target kind even through historical model and benchmark roles", () => {
    const query = snapshot();
    const page = query.results({ id: "finding" });
    expect(groupEntities(testedEntities(page.items[0]))[0].label).toBe(
      "Configuration",
    );
    const html = renderToStaticMarkup(<Results id="finding" initial={page} />);
    expect(html).toContain("Configuration:");
    expect(html).toContain("Protocol:");
    expect(html).toContain("/database/configuration/configured");
    expect(html).not.toContain("Model:");
    expect(html).toContain("78.5");
  });
  it("shows result context as configuration, protocol and dataset", () => {
    snapshot();
    const html = renderToStaticMarkup(
      <RecordPage params={{ kind: "result", id: "finding" }} />,
    );
    expect(html).toContain("Tested configuration");
    expect(html).toContain("<dt>Protocol</dt>");
    expect(html).toContain("<dt>Dataset</dt>");
    expect(html).not.toContain("Tested model");
  });
  it("preserves declared old URLs while metadata and links use canonical kinds", () => {
    snapshot();
    expect(generateStaticParams()).toContainEqual({
      kind: "model",
      id: "configured",
    });
    expect(generateStaticParams()).toContainEqual({
      kind: "configuration",
      id: "configured",
    });
    expect(
      generateMetadata({ params: { kind: "model", id: "configured" } })
        .alternates?.canonical,
    ).toBe("https://benchmarks.rewire.it/database/configuration/configured/");
    const html = renderToStaticMarkup(
      <RecordPage params={{ kind: "model", id: "configured" }} />,
    );
    expect(html).toContain('<span class="kick">Configuration</span>');
    expect(html).toContain("Underlying model:");
    expect(html).not.toContain("model · method");
    expect(
      generateMetadata({ params: { kind: "source", id: "configured" } }),
    ).toEqual({});
  });
  it("exposes the source-backed suite-task-protocol hierarchy and recorded evaluations", () => {
    snapshot();
    const suite = renderToStaticMarkup(
      <RecordPage params={{ kind: "benchmark", id: "suite" }} />,
    );
    expect(suite).toContain("Evaluation design");
    expect(suite).toContain("/database/task/biological-task");
    const task = renderToStaticMarkup(
      <RecordPage params={{ kind: "task", id: "biological-task" }} />,
    );
    expect(task).toContain("/database/protocol/procedure");
    const protocol = renderToStaticMarkup(
      <RecordPage params={{ kind: "protocol", id: "procedure" }} />,
    );
    expect(protocol).toContain("Recorded evaluations");
    expect(protocol).toContain("/database/evaluation/evaluation");
  });
  it("keeps evaluated subsets distinct from their parent datasets", () => {
    snapshot();
    const subset = record(
      "held-out-cohort",
      "dataset_subset",
      { legacy_kinds: ["dataset"] },
      [{ relation: "part_of", target_id: "dataset" }],
    );
    fixture.snapshot!.records.push(
      subset,
      record(
        "subset-claim",
        "claim",
        {
          field: "links:part_of:dataset",
          source_locator: "Methods: held-out cohort",
        },
        [{ relation: "subject", target_id: subset.id }],
      ),
    );
    const evaluation = fixture.snapshot!.records.find(
      (item) => item.id === "evaluation",
    )!;
    evaluation.links = evaluation.links.map((link) =>
      link.relation === "dataset" ? { ...link, target_id: subset.id } : link,
    );
    const html = renderToStaticMarkup(
      <RecordPage params={{ kind: "result", id: "finding" }} />,
    );
    expect(html).toContain("<dt>Dataset subset</dt>");
    expect(html).toContain("/database/dataset_subset/held-out-cohort");
    expect(html).not.toContain("<dt>Dataset</dt>");
    const subsetHtml = renderToStaticMarkup(
      <RecordPage params={{ kind: "dataset", id: subset.id }} />,
    );
    expect(subsetHtml).toContain('<span class="kick">Dataset subset</span>');
    expect(subsetHtml).toContain("Subset and evaluation context");
    expect(subsetHtml).toContain("/database/dataset/dataset");
    expect(generateStaticParams()).toContainEqual({
      kind: "dataset",
      id: subset.id,
    });
  });
  it("includes reviewed run instructions and makes their scope explicit", () => {
    snapshot();
    const procedure = fixture.snapshot!.records.find(
      (item) => item.id === "procedure",
    )!;
    procedure.attributes.run_guide = {
      record_id: "procedure",
      summary: "Run the official evaluator.",
      status: "source_reviewed_not_executed",
      prerequisites: ["Install the documented environment."],
      steps: [
        {
          title: "Evaluate predictions",
          explanation: "Use the official scoring command.",
          shell: "python evaluate.py predictions.csv",
          source_ids: ["source"],
          source_locator: "README: evaluation",
        },
      ],
      outputs: ["Metric summary"],
      limitations: ["Inputs must match the published protocol."],
      source_ids: ["source"],
      review: { method: "official_repository_review", date: "2026-09-17" },
    };
    const html = renderToStaticMarkup(
      <RecordPage params={{ kind: "protocol", id: "procedure" }} />,
    );
    expect(html).toContain('href="#execution"');
    expect(html).toContain('id="execution"');
    expect(html).toContain('id="run"');
    expect(html).toContain("python evaluate.py predictions.csv");
    expect(html).toContain("These commands have not been executed by rewire");
    expect(html).toContain('aria-label="Copy commands: Evaluate predictions"');
  });
  it("does not present unreviewed associations as a scientific hierarchy", () => {
    snapshot();
    fixture.snapshot!.records = fixture.snapshot!.records.filter(
      (item) => item.kind !== "claim",
    );
    const suite = renderToStaticMarkup(
      <RecordPage params={{ kind: "benchmark", id: "suite" }} />,
    );
    expect(suite).not.toContain('id="evaluation-design"');
    const configuration = renderToStaticMarkup(
      <RecordPage params={{ kind: "configuration", id: "configured" }} />,
    );
    expect(configuration).not.toContain("Underlying model:");
  });
});
