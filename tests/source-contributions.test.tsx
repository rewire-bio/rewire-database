import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { preparedFromSnapshot } from "./helpers/prepared";
import type { CatalogueSnapshot } from "../shared/omics/catalogue-query";
import SourceContributions from "../components/catalogue/SourceContributions";
import type { PreparedQuery } from "../lib/catalogue-build";

const snapshot = JSON.parse(fs.readFileSync("public/omics/catalogue.json", "utf8")) as CatalogueSnapshot;
const query = preparedFromSnapshot(snapshot) as unknown as PreparedQuery;
const sources = snapshot.records.filter((record) => record.kind === "source" && record.status !== "excluded");
// The source with the most results, and one with claims, whatever the release holds.
const busiest = sources.map((source) => ({ source, overview: query.sourceRecords({ id: source.id, limit: 1 }) }))
  .sort((a, b) => (b.overview.counts.result || 0) - (a.overview.counts.result || 0))[0];
const withClaims = sources.find((source) => query.sourceRecords({ id: source.id, limit: 1 }).counts.claim);
const render = (id: string, params = {}) => renderToStaticMarkup(<SourceContributions query={query} id={id} params={params} />);
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");

describe("source contributions", () => {
  it("counts every citing kind and shows the source's results with printed values", () => {
    const { source, overview } = busiest;
    expect(overview.counts.result).toBeGreaterThan(50);
    const html = render(source.id);
    expect(html).toContain('id="source-contributions"');
    for (const kind of Object.keys(overview.counts)) expect(html).toContain(`href="#source-${kind === "result" ? "results" : kind === "claim" ? "claims" : kind.replace(/_/g, "-")}"`);
    const rows = [...html.matchAll(/<tr><th scope="row">/g)].length;
    expect(rows).toBe(50);
    const first = query.sourceResults({ id: source.id, limit: 50 });
    for (const item of first.items.slice(0, 5)) {
      expect(html).toMatch(new RegExp(`href="/database/result/${item.id}/?"`));
      expect(text(html)).toContain(item.printed_value);
    }
    expect(text(html)).toContain(`Results 1 to 50 of ${overview.counts.result.toLocaleString()}`);
    expect(html).toMatch(/href="\?result=[^"]+#source-results" rel="next"/);
  });
  it("pages results through the URL and falls back to the first page for a stale cursor", () => {
    const { source } = busiest;
    const next = query.sourceResults({ id: source.id, limit: 50 }).next_cursor!;
    const second = render(source.id, { result: next });
    expect(text(second)).toContain("Results 51 to 100");
    expect(second).toContain('href="?#source-results" rel="prev"');
    expect(text(render(source.id, { result: "not-a-cursor" }))).toContain("Results 1 to 50");
  });
  it("lists claims with what they state and where in the source they were checked", () => {
    expect(withClaims).toBeDefined();
    const html = render(withClaims!.id);
    const claimId = query.sourceRecords({ id: withClaims!.id, kind: "claim", limit: 25 }).pages.claim.items[0];
    const claim = query.record(claimId)!;
    expect(html).toContain('id="source-claims"');
    expect(html).toMatch(new RegExp(`href="/database/claim/${claim.id}/?"`));
    if (typeof claim.attributes.source_locator === "string") expect(text(html)).toContain(claim.attributes.source_locator);
  });
  it("shows nothing for a release without the source index", () => {
    const empty = { ...query, sourceRecords: () => ({ release_id: "x", source_id: "s", counts: {}, total: 0, pages: {} }) } as unknown as PreparedQuery;
    expect(renderToStaticMarkup(<SourceContributions query={empty} id="s" params={{}} />)).toBe("");
  });
});
