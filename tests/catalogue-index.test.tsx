import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { parseCatalogue, recordHref } from "../lib/omics";
import { catalogueIndexPaths, indexRecords, indexMetadata, MODEL_PAGE_SIZE, modelPageCount, modelIndexHref, validModelPage } from "../lib/catalogue-index";
import StaticIndex from "../components/catalogue/StaticIndex";
const catalogue = parseCatalogue(JSON.parse(fs.readFileSync("public/omics/catalogue.json").toString()));
vi.mock("next/navigation", () => ({ usePathname: () => "/models/" }));
import Header from "../components/header";

describe("static catalogue indexes", () => {
  it("links every current benchmark exactly once through canonical anchors without tasks or protocols", () => {
    const html = renderToStaticMarkup(<StaticIndex catalogue={catalogue} kind="benchmark" />);
    const hrefs = [...html.matchAll(/href="(\/database\/[^"]+)"/g)].map((match) => match[1]);
    expect(hrefs).toEqual(indexRecords(catalogue.records, "benchmark").map(recordHref));
    expect(hrefs.every((href) => !href.includes("?"))).toBe(true);
    expect(html).toContain(`${hrefs.length} benchmark`);
    expect(html).toContain('href="/?kind=benchmark#browse"');
  });
  it("covers every model once in stable alphabetical pages with keyboard-native pagination", () => {
    const hrefs: string[] = [];
    const count = modelPageCount(catalogue.records);
    for (let page = 1; page <= count; page++) {
      const html = renderToStaticMarkup(<StaticIndex catalogue={catalogue} kind="model" page={page} />);
      const current = [...html.matchAll(/href="(\/database\/[^"]+)"/g)].map((match) => match[1]);
      expect(current.length).toBeLessThanOrEqual(MODEL_PAGE_SIZE);
      hrefs.push(...current);
      expect(html).toContain(`href="${modelIndexHref(page)}" aria-label="Page ${page}" aria-current="page"`);
      if (page > 1) expect(html).toContain(`href="${modelIndexHref(page - 1)}" rel="prev"`);
      if (page < count) expect(html).toContain(`href="${modelIndexHref(page + 1)}" rel="next"`);
      expect(html).not.toContain("<button");
    }
    expect(hrefs).toEqual(indexRecords(catalogue.records, "model").map(recordHref));
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(indexRecords([...catalogue.records].reverse(), "model").map(recordHref)).toEqual(hrefs);
  });
  it("gives every index page its own canonical and sitemap path without duplicate page 1 or query combinations", () => {
    const paths = catalogueIndexPaths(catalogue.records);
    expect(paths).toEqual(["/benchmarks/", ...Array.from({ length: modelPageCount(catalogue.records) }, (_, i) => modelIndexHref(i + 1))]);
    expect(indexMetadata("benchmark").alternates?.canonical).toBe("https://benchmarks.rewirebio.io/benchmarks/");
    for (let page = 1; page <= modelPageCount(catalogue.records); page++) expect(indexMetadata("model", page).alternates?.canonical).toBe(`https://benchmarks.rewirebio.io${modelIndexHref(page)}`);
    for (const invalid of ["1", "01", "0", "-1", "2.0", "02", "999999", "Infinity", "a"]) expect(validModelPage(invalid, catalogue.records)).toBe(false);
    expect(validModelPage("2", catalogue.records)).toBe(true);
    expect(paths.every((path) => !path.includes("?"))).toBe(true);
  });
  it("keeps excluded records and other entity types out and leaves records unchanged", () => {
    const before = JSON.stringify(catalogue);
    const records = [...catalogue.records, { ...indexRecords(catalogue.records, "model")[0], id: "excluded-model", status: "excluded" }];
    expect(indexRecords(records, "model").some((record) => record.id === "excluded-model")).toBe(false);
    renderToStaticMarkup(<StaticIndex catalogue={catalogue} kind="model" />);
    expect(JSON.stringify(catalogue)).toBe(before);
  });
  it("links both indexes from primary navigation in initial HTML", () => {
    const html = renderToStaticMarkup(<Header />);
    expect(html).toMatch(/href="\/benchmarks\/?"/);
    expect(html).toMatch(/href="\/models\/?"/);
    expect(html).toContain('aria-controls="mobile-primary-navigation"');
  });
});
