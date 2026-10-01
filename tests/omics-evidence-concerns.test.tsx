import fs from "node:fs";
import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EvidenceConcerns } from "../components/catalogue/Profile";
import { createCatalogueQuery } from "../services/omics/src/catalogue-query";

it("surfaces the precise primary-source concern and excludes its result from comparisons", () => {
  const snapshot = JSON.parse(fs.readFileSync("public/omics/catalogue.json", "utf8"));
  const query = createCatalogueQuery(snapshot);
  const row = query.results({ id: "lit-b4-017" }).items[0];
  const comparison = query.compare({ ids: ["lit-b4-017", "b2-barcodebert-2026"] });
  expect(comparison.compatible).toBe(false);
  expect(comparison.reasons).toContain("A source has unresolved evidence concerns; this result cannot support a comparison.");
  const html = renderToStaticMarkup(<EvidenceConcerns sources={row.sources} />);
  expect(html).toContain("Section 4.3");
  expect(html).toContain("excluded from comparisons");
});
