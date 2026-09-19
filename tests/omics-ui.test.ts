import {
  contributionInput,
  submissionOutput,
  submissionPageOutput,
} from "../lib/omics-contributions";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ContributionForm from "../app/contribute/ContributionForm";
import { describe, expect, it } from "vitest";
import {
  compareResults,
  originLabel,
  parseCatalogue,
  safeSourceUrl,
  type OmicsRecord,
} from "../lib/omics";
const record = (
  id: string,
  kind: OmicsRecord["kind"],
  attributes: Record<string, unknown> = {},
): OmicsRecord => ({
  id,
  kind,
  name: id,
  description: "",
  status: "source_checked",
  facets: { areas: ["glycomics"] },
  source_ids: [],
  links: [],
  attributes,
});
const comparison = {
  protocol_id: "p1",
  dataset_version: "v1",
  split: "test",
  population: "yeast",
  inputs: "sequence",
  adaptation: "zero-shot",
  metric_implementation: "spearman-v1",
  aggregation: "macro",
  budget: "one pass",
};
const a = record("a", "evaluation", { comparison, origin: "author_reported" });
const b = record("b", "evaluation", {
  comparison: { ...comparison },
  origin: "independent_paper",
});
const dataset = record("d1", "dataset", { version: "v1" });
a.links = [{ relation: "dataset", target_id: dataset.id }];
b.links = [{ relation: "dataset", target_id: dataset.id }];
const result = (id: string, evaluation: string) => ({
  ...record(id, "result", {
    metric: "Spearman",
    unit: "correlation",
    metric_direction: "higher",
  }),
  links: [{ relation: "evaluation", target_id: evaluation }],
});
describe("public omics catalogue", () => {
  it("preserves open research facets and removes excluded records", () => {
    const catalogue = parseCatalogue({
      schema_version: "1.0",
      release_id: "r1",
      released_at: "2026-09-16",
      coverage: {},
      records: [
        record("rna", "model"),
        { ...record("clinical", "model"), status: "excluded" },
      ],
    });
    expect(catalogue.records).toHaveLength(1);
    expect(catalogue.records[0].facets.areas).toEqual(["glycomics"]);
  });
  it("fails closed when private contributor data is nested in an export", () => {
    expect(() =>
      parseCatalogue({
        schema_version: "1.0",
        release_id: "r1",
        records: [
          record("one", "model", { review: { email: "private@example.com" } }),
        ],
      }),
    ).toThrow("Private contribution");
  });
  it("does not call externally reported evidence a rewire reproduction", () => {
    expect(originLabel("author_reported")).toBe("Author-reported evaluation");
    expect(originLabel("independent_paper")).toBe(
      "Independent external evaluation",
    );
    expect(originLabel("paper_compilation")).toContain("quoted");
  });
  it("rejects dangerous source URLs", () => {
    expect(safeSourceUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeSourceUrl("https://example.org/paper")).toBe(
      "https://example.org/paper",
    );
  });
});
describe("conservative comparison", () => {
  it("accepts matching fully known evaluation protocols", () => {
    expect(
      compareResults([result("r1", "a"), result("r2", "b")], [a, b, dataset])
        .compatible,
    ).toBe(true);
  });
  it("blocks different datasets even when version labels match", () => {
    const other = record("d2", "dataset", { version: "v1" });
    const otherEvaluation = {
      ...b,
      links: [{ relation: "dataset", target_id: other.id }],
    };
    expect(
      compareResults(
        [result("r1", "a"), result("r2", "b")],
        [a, otherEvaluation, dataset, other],
      ).reasons,
    ).toContain("Evaluations use different datasets.");
  });
  it("blocks unknowns with surrounding whitespace and unlinked copied evidence", () => {
    const unknown = {
      ...b,
      attributes: {
        ...b.attributes,
        comparison: { ...comparison, split: " unknown " },
      },
    };
    expect(
      compareResults(
        [result("r1", "a"), result("r2", "b")],
        [a, unknown, dataset],
      ).reasons,
    ).toContain("split is not fully reported.");
    const quoted = {
      ...b,
      attributes: { ...b.attributes, origin: "paper_compilation" },
    };
    expect(
      compareResults(
        [result("r1", "a"), result("r2", "b")],
        [a, quoted, dataset],
      ).compatible,
    ).toBe(false);
  });
  it("blocks matching unknowns and mismatched metrics", () => {
    const missing = {
      ...b,
      attributes: { comparison: { ...comparison, split: null } },
    };
    expect(
      compareResults(
        [result("r1", "a"), result("r2", "b")],
        [a, missing, dataset],
      ).reasons,
    ).toContain("split is not fully reported.");
    const different = result("r2", "b");
    different.attributes.metric = "AUROC";
    expect(
      compareResults([result("r1", "a"), different], [a, b, dataset])
        .compatible,
    ).toBe(false);
  });
  it("blocks superseded and quoted evidence", () => {
    const stale = { ...result("r1", "a"), status: "superseded" };
    expect(
      compareResults([stale, result("r2", "b")], [a, b, dataset]).compatible,
    ).toBe(false);
    expect(
      compareResults(
        [result("r1", "a"), result("r2", "b")],
        [
          a,
          {
            ...b,
            links: [{ relation: "original_evaluation", target_id: "a" }],
          },
        ],
      ).compatible,
    ).toBe(false);
  });
});

describe("unconfigured contribution form", () => {
  it("offers a local draft without presenting a working submission action", () => {
    const html = renderToStaticMarkup(createElement(ContributionForm));
    expect(html).toContain("Submissions are not open yet.");
    expect(html).toContain("Download draft");
    expect(html).not.toContain("Submit for review");
    expect(html).not.toContain('type="email"');
    expect(html).toContain("There is no newsletter enrolment");
  });
});

describe("browser-only contribution contract", () => {
  it("requires result evidence before sending it", () => {
    expect(
      contributionInput.safeParse({
        type: "result",
        title: "Test result",
        summary: "A source-linked result.",
        source_urls: ["https://example.org/paper"],
        details: {},
      }).success,
    ).toBe(false);
  });
  it("validates status and strips private fields from current and historical responses", () => {
    const body = {
      id: "submission-1",
      type: "model",
      title: "Test model",
      summary: "An omics model for review.",
      source_urls: ["https://example.org/paper"],
      details: {},
      status: "submitted",
      created_at: "2026-09-16T00:00:00Z",
      updated_at: "2026-09-16T00:00:00Z",
      email: "private@example.org",
    };
    const parsed = submissionOutput.parse({
      ...body,
      revisions: [
        {
          id: "revision-1",
          created_at: body.created_at,
          status: "submitted",
          actor: "contributor",
          payload: body,
        },
      ],
    });
    expect(JSON.stringify(parsed)).not.toContain("private@example.org");
    expect(
      submissionOutput.safeParse({ ...body, status: "unexpected" }).success,
    ).toBe(false);
  });
});

it("validates paginated private lists and strips unexpected identity fields from rows", () => {
  const row = {
    id: "private-1",
    type: "model",
    title: "A model",
    summary: "Evidence from a reviewed source",
    source_urls: ["https://example.org/paper"],
    details: {},
    status: "submitted",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    email: "private@example.org",
    uid: "private-user",
  };
  const page = submissionPageOutput.parse({
    items: [row],
    next_cursor: "opaque-cursor",
  });
  expect(page.next_cursor).toBe("opaque-cursor");
  expect(page.items[0]).not.toHaveProperty("email");
  expect(page.items[0]).not.toHaveProperty("uid");
  expect(submissionPageOutput.safeParse([row]).success).toBe(false);
});
