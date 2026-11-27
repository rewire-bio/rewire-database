import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import LinkedResults, { linkedCount } from "../components/catalogue/LinkedResults";
import type { OmicsRecord } from "../lib/omics";

const record = (id: string, kind: string, name = id) =>
  ({ id, kind, name, description: "", status: "source_checked", facets: {}, source_ids: [], links: [], attributes: {} }) as OmicsRecord;
const item = (id: string, kind: string, relation: string, results: number, evaluations = 1) => ({
  record: record(id, kind),
  relation,
  results,
  evaluations,
});
const model = record("esm-1b", "model", "ESM-1b");
const render = (items: ReturnType<typeof item>[], alongside = false, unchecked = 0) =>
  renderToStaticMarkup(<LinkedResults record={model} linked={{ items, unchecked }} alongside={alongside} />);
const jargon = /record|linked|claim|review|–|—/i;
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/href="[^"]*"/g, "");

describe("results held on related entries", () => {
  const configurations = [item("c-small", "configuration", "configuration_of", 2), item("c-large", "configuration", "configuration_of", 9, 3)];

  it("names what the entries are when they share a relation, most results first", () => {
    const html = render(configurations, true);
    expect(html).toContain("<h2>Results for 2 configurations of ESM-1b</h2>");
    expect(html).toContain("These configurations have results too. We have not yet checked that they belong with the scores above, so they are kept out of that table. Each has its scores on its own page.");
    expect(html.indexOf("c-large")).toBeLessThan(html.indexOf("c-small"));
    expect(html).toContain("<span>3 evaluations · 9 results</span>");
    expect(html).not.toContain("<h3>");
    expect(text(html)).not.toMatch(jargon);
  });

  it("explains a page with no results of its own, for one entry", () => {
    const html = render([item("v1", "model", "variant_of", 4)]);
    expect(html).toContain("<h2>Results for 1 version of ESM-1b</h2>");
    expect(html).toContain("This model has no results of its own. The version below does.");
    expect(html).toContain("<span>Model · 1 evaluation · 4 results</span>");
    expect(text(html)).not.toMatch(jargon);
  });

  it("groups mixed relations under plain labels, largest group first", () => {
    const html = render([item("pipe", "pipeline", "uses_model", 1), ...configurations], false, 2);
    expect(html).toContain("<h2>Results for other entries related to ESM-1b</h2>");
    expect(html.indexOf("<h3>Configurations</h3>")).toBeLessThan(html.indexOf("<h3>Tools that use this model</h3>"));
    expect(html).toContain("<span>Pipeline · 1 evaluation · 1 result</span>");
    expect(html).toContain("2 more related entries are listed without result counts under Related records at the end of this page.");
    expect(linkedCount({ items: [item("pipe", "pipeline", "uses_model", 1), ...configurations], unchecked: 0 })).toBe("3 related entries");
  });
});
