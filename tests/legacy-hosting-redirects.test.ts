import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { reviewedRedirects, domainIds } from "../scripts/legacy-redirects.mjs";
import { DOMAINS } from "../lib/benchmark-catalog";
import { readCatalogueFilters } from "../lib/omics-browse";

const { review, redirects } = reviewedRedirects();
describe("reviewed permanent legacy redirects", () => {
  it("pins every mapping to exact original paper metadata and its surviving source", () => {
    expect(review).toEqual(JSON.parse(fs.readFileSync("docs/seo/legacy-redirect-review-2026-09-23.json", "utf8")));
    expect(JSON.parse(fs.readFileSync("firebase.json", "utf8")).hosting.redirects).toEqual(redirects);
    expect(new Set(review.mappings.map((row: { paper_id: string }) => row.paper_id)).size).toBe(review.mappings.length);
    expect(review.mappings.length + review.excluded.length).toBe(JSON.parse(fs.readFileSync("data/benchmark-literature/papers.json", "utf8")).length);
  });
  it("covers only exact known paths and preserves fragments by omitting a destination fragment", () => {
    expect(domainIds).toEqual(DOMAINS.map(({ id }) => id));
    for (const redirect of redirects) {
      expect(redirect.type).toBe(301);
      expect(redirect.source.endsWith("{,/}")).toBe(true);
      expect(redirect.source).not.toMatch(/[\*:]/);
      expect(redirect.destination.startsWith("/")).toBe(true);
      expect(redirect.destination).not.toContain("#");
    }
    for (const row of review.excluded) expect(redirects.some((redirect: { source: string }) => redirect.source.includes(row.paper_id))).toBe(false);
  });
  it("retains destination filter precedence when Hosting appends incoming query keys", () => {
    const literature = readCatalogueFilters("?kind=result&origin=literature&kind=model&origin=rewire_run&q=RNA");
    expect(literature.kind).toBe("result");
    expect(literature.origin).toBe("literature");
    expect(literature.q).toBe("RNA");
    const domain = readCatalogueFilters("?kind=model&area=dna-genomes&kind=benchmark&area=wrong");
    expect(domain.kind).toBe("model");
    expect(domain.area).toBe("dna-genomes");
  });
});
