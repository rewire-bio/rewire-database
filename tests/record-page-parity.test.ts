import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { buildCatalogue } from "../lib/catalogue-build";
import { buildUseCases } from "../lib/use-cases-build";
import { recordSearchMetadata } from "../lib/catalogue-seo";
import { recordPageMetadata } from "../lib/record-page";
import { recordPageBuilder, recordPageRoutes } from "../services/omics/src/record-pages";
import type { CatalogueSnapshot } from "../services/omics/src/catalogue-query";

// Pages built from the prepared release file carry only a bounded context.
// Their search metadata must equal metadata built from the complete release
// (catalogue.json), for every page.
describe("server-rendered record page parity with the complete release", () => {
  it("produces identical canonical, title, description and robots metadata for every route", () => {
    const { query } = buildCatalogue();
    const catalogue = JSON.parse(fs.readFileSync("public/omics/catalogue.json", "utf8")) as CatalogueSnapshot;
    const build = recordPageBuilder(query, buildUseCases().query);
    const routes = recordPageRoutes(catalogue);
    expect(routes.length).toBeGreaterThan(20_000);
    const byId = new Map(catalogue.records.map((item) => [item.id, item]));
    for (const { kind, record } of routes) {
      const page = build(kind, record.id)!;
      expect(page.release_id).toBe(catalogue.release_id);
      const expected = recordSearchMetadata(byId.get(record.id)!, catalogue.records);
      const actual = recordPageMetadata(page);
      expect({ title: actual.title, description: actual.description, alternates: actual.alternates, robots: actual.robots }, `${kind}/${record.id}`)
        .toEqual({ title: expected.title, description: expected.description, alternates: expected.alternates, robots: expected.robots });
    }
  }, 120_000);
});
