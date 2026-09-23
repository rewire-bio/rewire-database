import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CountRows } from "../components/catalogue/CatalogueCharts";
import {
  catalogueSearch,
  readCatalogueFilters,
  safeBrowseReturnTo,
  researchAreaLabel,
  supportsEvaluationSummary,
  explorerPrintedScore,
  defaultFilters,
} from "../lib/omics-browse";

describe("catalogue browsing context", () => {
  it("round-trips filters and opaque pagination without losing reserved characters", () => {
    const filters = {
      ...defaultFilters,
      kind: "result" as const,
      q: "A&B + RNA",
      area: "dna-genomes",
      origin: "rewire",
    };
    const search = catalogueSearch(filters, "cursor+abc/==");
    expect(readCatalogueFilters(search)).toEqual(filters);
    expect(new URLSearchParams(search).get("cursor")).toBe("cursor+abc/==");
  });
  it("allows only local explorer return links", () => {
    expect(safeBrowseReturnTo("/?kind=model&q=ESM#browse")).toBe(
      "/?kind=model&q=ESM#browse",
    );
    expect(safeBrowseReturnTo("/database/?kind=result#browse")).toBe(
      "/database/?kind=result#browse",
    );
    for (const unsafe of [
      "https://evil.test/",
      "//evil.test/",
      "/\\evil.test/",
      "/contribute/",
      "javascript:alert(1)",
      "/%2f%2fevil.test",
      "/?x=1\n",
    ])
      expect(safeBrowseReturnTo(unsafe)).toBeNull();
  });
  it("uses readable research labels without changing stored identities", () => {
    expect(researchAreaLabel("dna-genomes")).toBe("DNA and genomes");
    expect(researchAreaLabel("new_research-area")).toBe("New research area");
  });
});

describe("coverage is readable counts, not a performance chart", () => {
  it("sorts by the displayed count and renders exact zero without a minimum bar", () => {
    const markup = renderToStaticMarkup(
      <CountRows
        title="Linked evaluations"
        rows={[
          { label: "Empty", value: 0 },
          { label: "Two", value: 2 },
          { label: "Ten", value: 10 },
        ]}
      />,
    );
    expect(markup.indexOf("Ten")).toBeLessThan(markup.indexOf("Two"));
    expect(markup.indexOf("Two")).toBeLessThan(markup.indexOf("Empty"));
    expect(markup).toContain("width:0%");
    expect(markup).toContain("width:20%");
    expect(markup).not.toContain("<svg");
    expect(markup).toContain('aria-label="Linked evaluations"');
  });
  it("handles an entirely empty collection without invalid geometry", () => {
    const markup = renderToStaticMarkup(
      <CountRows
        title="Counts"
        rows={[{ label: "No evaluations", value: 0 }]}
      />,
    );
    expect(markup).toContain("width:0%");
    expect(markup).not.toContain("NaN");
  });
});

describe("explorer initial hierarchy", () => {
  it("places search before primary views and keeps additional record types in a closed disclosure", async () => {
    const { default: Explorer } = await import("../app/database/Explorer");
    const markup = renderToStaticMarkup(
      <Explorer
        initial={
          {
            items: [],
            total: 0,
            next_cursor: null,
            release_id: "test",
          } as never
        }
        release={
          {
            release_id: "test",
            facets: { areas: [], statuses: [], counts: {} },
          } as never
        }
      />,
    );
    expect(markup.indexOf('type="search"')).toBeLessThan(
      markup.indexOf('aria-label="Browse the database"'),
    );
    expect(markup).toMatch(/<details[^>]*><summary>More record types/);
    expect(markup).not.toMatch(/<details[^>]* open/);
    expect(markup).toContain("Reset filters");
    expect(markup).toContain('aria-label="Catalogue pages"');
  });
});

it("does not describe citations or claims as unevaluated models", () => {
  expect(supportsEvaluationSummary("source")).toBe(false);
  expect(supportsEvaluationSummary("claim")).toBe(false);
  for (const kind of [
    "model",
    "benchmark",
    "protocol",
    "dataset",
    "method",
    "configuration",
    "pipeline",
    "service",
    "task",
    "evaluator",
    "baseline",
    "result",
    "evaluation",
    "dataset_subset",
  ] as const)
    expect(supportsEvaluationSummary(kind)).toBe(true);
});

it("preserves printed percentages including uncertainty", () => {
  expect(explorerPrintedScore("31.29% ± 7.29", "percent")).toBe(
    "31.29% ± 7.29",
  );
  expect(explorerPrintedScore("78.5", "percent")).toBe("78.5%");
  expect(explorerPrintedScore("0.75", "fraction")).toBe("0.75");
  expect(explorerPrintedScore("0.3452228016183431", "fraction")).toBe("0.345");
  expect(explorerPrintedScore("78.54321", "percent")).toBe("78.5%");
  expect(explorerPrintedScore(null, "percent")).toBe("Unreported");
});

it("omits unsupported evaluation counts on citation rows even when the API supplies zeros", async () => {
  const { default: Explorer } = await import("../app/database/Explorer");
  const source = {
    id: "source-example",
    kind: "source",
    name: "Example paper",
    status: "source_checked",
    description: "A primary source.",
    attributes: {},
    facets: { areas: [] },
    source_ids: [],
    links: [],
  };
  const markup = renderToStaticMarkup(
    <Explorer
      initial={
        {
          items: [source],
          total: 1,
          next_cursor: null,
          release_id: "test",
          evaluation_summaries: {
            "source-example": { evaluation_count: 0, result_count: 0 },
          },
        } as never
      }
      release={
        {
          release_id: "test",
          facets: { areas: [], statuses: [], counts: {} },
        } as never
      }
    />,
  );
  expect(markup).toContain("Example paper");
  expect(markup).not.toContain("No evaluations linked");
  expect(markup).not.toContain("metric rows");
});
