import { describe, expect, it } from "vitest";
import { currentCatalogueBase, readJsonl } from "../scripts/omics/inputs";
import { buildRelease } from "../scripts/omics/release";
import { type RecordEntry } from "../scripts/omics/schema";
import { createCatalogueQuery } from "../services/omics/src/catalogue-query";

const base = ["migrated", "discovery"].flatMap((name) =>
  readJsonl<RecordEntry>(`data/omics/${name}.jsonl`),
);
const release = buildRelease(
  currentCatalogueBase(base),
  "2026-09-17T00:00:00Z",
  {
    entity_schema_version: "1.1",
  },
).snapshot;
const query = createCatalogueQuery(release);

type Listed = ReturnType<typeof query.list> & {
  available: {
    areas: Record<string, number>;
    statuses: Record<string, number>;
  };
};
const list = (input: Parameters<typeof query.list>[0] = {}) =>
  query.list(input) as Listed;

const kinds = [...new Set(release.records.map((r) => r.kind))];
const releaseFacets = query.release().facets;

describe("facet options are scoped to the active filters", () => {
  it("never offers an option that returns nothing", () => {
    const dead: string[] = [];
    for (const kind of kinds) {
      const { available } = list({ kind });
      for (const [area, count] of Object.entries(available.areas))
        if (count === 0 || list({ kind, area }).total === 0)
          dead.push(`kind=${kind} area=${area}`);
      for (const [status, count] of Object.entries(available.statuses))
        if (count === 0 || list({ kind, status }).total === 0)
          dead.push(`kind=${kind} status=${status}`);
    }
    expect(dead).toEqual([]);
  });

  it("counts match the result total for that filter", () => {
    for (const kind of kinds.slice(0, 4)) {
      const { available } = list({ kind });
      for (const [status, count] of Object.entries(available.statuses))
        expect(list({ kind, status }).total).toBe(count);
    }
  });

  it("drops options that the release-wide list would have offered", () => {
    // The whole point: the release facets are global, so at least one kind must
    // see fewer options than the release advertises. Otherwise scoping is inert
    // and this test is not proving anything.
    const narrowed = kinds.some(
      (kind) =>
        Object.keys(list({ kind }).available.areas).length <
        releaseFacets.areas.length,
    );
    expect(narrowed).toBe(true);
  });

  it("re-scopes when another filter is already applied", () => {
    const kind = "result";
    const all = Object.keys(list({ kind }).available.areas);
    if (!all.length) return;
    const scoped = list({ kind, status: "source_checked" }).available.areas;
    for (const [area, count] of Object.entries(scoped))
      expect(list({ kind, status: "source_checked", area }).total).toBe(count);
  });
});
