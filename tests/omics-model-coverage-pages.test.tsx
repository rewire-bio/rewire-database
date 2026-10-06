import fs from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  createCatalogueQuery,
  type CatalogueSnapshot,
} from "../services/omics/src/catalogue-query";
import RecordPage from "../app/database/model/[id]/page";

const fixture = vi.hoisted(() => ({
  snapshot: null as CatalogueSnapshot | null,
}));
vi.mock("../lib/catalogue-build", () => ({
  buildCatalogue: () => ({
    catalogue: fixture.snapshot!,
    query: createCatalogueQuery(fixture.snapshot!),
  }),
}));

const previous: CatalogueSnapshot = JSON.parse(
  fs.readFileSync("public/omics/catalogue.json").toString(),
);
fixture.snapshot = {
  ...previous,
  records: previous.records,
};
const query = createCatalogueQuery(fixture.snapshot);
const render = (id: string) =>
  renderToStaticMarkup(<RecordPage params={{ id }} />);

// SSR text can exist inside a closed disclosure without being initially visible.
const closedDisclosuresAt = (html: string, position: number) => {
  const stack: boolean[] = [];
  for (const [tag] of html.slice(0, position).matchAll(/<\/?details\b[^>]*>/g)) {
    if (tag.startsWith("</")) stack.pop();
    else stack.push(!/\sopen(?:\s|=|>)/.test(tag));
  }
  return stack.filter(Boolean).length;
};

describe("model coverage profile rendering", () => {
  it.each([
    {
      id: "catalog-model-mrna-fm",
      pipeline: "mrnabench-variants-2025-method-mrna-fm",
      rows: 8,
    },
    {
      id: "catalog-model-metagene-1",
      pipeline: "metagene-gene-mteb-method-metagene-1",
      rows: 16,
    },
  ])("shows evaluated pipelines before collapsed methods for $id", ({ id, pipeline, rows }) => {
    expect(query.results({ id }).total).toBe(0);
    expect(query.results({ id: pipeline }).total).toBe(rows);
    const html = render(id);
    const configurations = html.indexOf('id="configurations"');
    const methods = html.indexOf('id="use-model"');
    const pipelineLink = html.indexOf(
      `href="/database/pipeline/${pipeline}#results"`,
    );

    expect(html).toContain('href="#configurations"');
    expect(html).toContain("1 evaluated configuration using this model");
    expect(configurations).toBeGreaterThanOrEqual(0);
    expect(methods).toBeGreaterThan(configurations);
    expect(pipelineLink).toBeGreaterThan(configurations);
    expect(pipelineLink).toBeLessThan(methods);
    expect(closedDisclosuresAt(html, pipelineLink)).toBe(0);
    const visibleConfigurations = html.slice(configurations, methods);
    expect(visibleConfigurations).toContain(`Pipeline · ${rows} results`);
    expect(visibleConfigurations).toContain(
      "not assigned to the underlying model",
    );
    const methodsDisclosure = html.slice(methods).match(/<details\b[^>]*>/)?.[0];
    expect(methodsDisclosure).toBeDefined();
    expect(methodsDisclosure).not.toMatch(/\sopen(?:\s|=|>)/);
    expect(html).not.toContain("No evaluations linked in this release");
    expect(html).not.toContain("No reviewed evaluations are linked here");
    expect(html).not.toContain("0 evaluations · 0 results");
  });

  it("links ProteinMPNN checkpoint visitors to family evidence without assigning its scores to the checkpoint", () => {
    const id = "catalog-model-proteinmpnn";
    expect(query.results({ id }).total).toBe(0);
    expect(query.results({ id: "discovery-model-proteinmpnn" }).total).toBe(19);
    const html = render(id);
    const link = html.indexOf(
      'href="/database/model/discovery-model-proteinmpnn#results"',
    );
    expect(link).toBeGreaterThanOrEqual(0);
    expect(link).toBeLessThan(html.indexOf('id="use-model"'));
    expect(closedDisclosuresAt(html, link)).toBe(0);
    expect(html).toContain("View 19 results for the broader family");
    expect(html).toContain(
      "their attribution to this exact checkpoint has not been verified",
    );
    expect(html).toContain(
      "The cited sources do not establish that this exact checkpoint was used",
    );
    expect(html).not.toContain("Evaluations and results</h2>");
    expect(html).not.toContain("No evaluations linked in this release");
    expect(html).not.toContain("0 evaluations · 0 results");
  });

  it("retains AgroNT's standard linked result table and exact reported scores", () => {
    const id = "discovery-model-agro-nucleotide-transformer";
    const results = query.results({ id });
    expect(results.total).toBe(12);
    expect(results.evaluation_count).toBe(12);
    const html = render(id);
    expect(html).toContain('href="#results"');
    expect(html).toContain("12 evaluations · 12 results");
    expect(html).toContain("Evaluations and results</h2>");
    expect(html).toContain("<table");
    expect(html).toContain("Author-reported evaluation");
    expect(html).toContain("0.62");
    for (const { result } of results.items) {
      expect(html).toContain(`/database/result/${result.id}`);
    }
    expect(html.indexOf('id="results"')).toBeLessThan(
      html.indexOf('id="use-model"'),
    );
    expect(html).not.toContain("No evaluations linked in this release");
    expect(html).not.toContain("Results for the broader model family</h2>");
  });
});
