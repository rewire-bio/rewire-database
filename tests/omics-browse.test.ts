import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { filterCatalogue, readCatalogueFilters } from "../lib/omics-browse";
const records = JSON.parse(fs.readFileSync("tests/fixtures/legacy-browse.json", "utf8")) as import("../lib/omics").OmicsRecord[];
describe("one catalogue with provenance filters", () => {
  it("includes all migrated in-scope literature results without importing excluded rows", () => {
    const rows = filterCatalogue(
      records,
      readCatalogueFilters("?kind=result&origin=literature"),
    );
    expect(rows).toHaveLength(155);
    expect(rows.filter((row) => row.attributes.legacy_id)).toHaveLength(143);
    expect(rows.every((row) => row.status === "source_checked")).toBe(true);
  });
  it("keeps own runs in the same result collection with distinct provenance", () => {
    const all = filterCatalogue(records, readCatalogueFilters("?kind=result"));
    const own = filterCatalogue(
      records,
      readCatalogueFilters("?kind=result&origin=rewire"),
    );
    expect(own).toHaveLength(12);
    expect(all).toHaveLength(167);
    expect(
      own.every((row) => all.includes(row) && row.status === "reproduced"),
    ).toBe(true);
  });
  it("combines search, area and evidence filters from shareable URLs", () => {
    const selected = filterCatalogue(
      records,
      readCatalogueFilters(
        "?kind=result&origin=rewire&area=dna-genomes&q=SpliceAI&status=reproduced",
      ),
    );
    expect(selected).toHaveLength(3);
    expect(
      filterCatalogue(
        records,
        readCatalogueFilters("?kind=model&origin=rewire&q=DreaMS"),
      ),
    ).toHaveLength(1);
  });
  it("falls back safely for unknown record types and provenance", () => {
    expect(
      readCatalogueFilters("?kind=clinical&origin=invented"),
    ).toMatchObject({ kind: "model", origin: "" });
  });
});
