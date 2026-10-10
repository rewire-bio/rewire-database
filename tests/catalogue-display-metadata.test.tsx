import fs from "node:fs";
import { preparedFromSnapshot } from "./helpers/prepared";
import type { PreparedCatalogue } from "../shared/omics/prepared-catalogue";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  type CatalogueSnapshot,
} from "../shared/omics/catalogue-query";
import RecordPage, { generateMetadata } from "../app/database/protocol/[id]/page";
const fixture = vi.hoisted(() => ({
  snapshot: null as CatalogueSnapshot | null,
  query: null as PreparedCatalogue | null,
}));
vi.mock("../lib/catalogue-build", () => ({
  buildCatalogue: () => ({
    catalogue: fixture.snapshot!,
    query: fixture.query!,
  }),
}));
const release = JSON.parse(fs.readFileSync("public/omics/catalogue.json").toString()) as CatalogueSnapshot;
// Releases before 2026-10-10-cbb3da59bc08 embedded BEELINE conditions in protocol
// names as JSON. The display rule must still clean such a name, so one released
// protocol is given that legacy form here; the release itself is not changed.
const conditions = '{"reference_network":"Cell-type specific ChIP-Seq","gene_selection":"TFs+500"}';
const base = release.records.find((r) => r.kind === "protocol" && r.name.startsWith("BEELINE")) ??
  release.records.find((r) => r.kind === "protocol")!;
const legacy = { ...base, name: `BEELINE 2020 Figure 5 · mESC · ${conditions}` };
fixture.snapshot = { ...release, records: release.records.map((r) => (r.id === base.id ? legacy : r)) };
fixture.query = preparedFromSnapshot(fixture.snapshot!);
const affected = [legacy];
describe("protocol display and metadata", () => {
  it("reads metadata without expanding record relationships or comparisons", () => {
    const record = affected[0];
    const expected = generateMetadata({ params: { id: record.id } });
    const get = vi.spyOn(fixture.query!, "get").mockImplementation(() => { throw new Error("unnecessary relationship expansion"); });
    try {
      expect(generateMetadata({ params: { id: record.id } })).toEqual(expected);
      expect(get).not.toHaveBeenCalled();
    } finally { get.mockRestore(); }
  });
  it("never shows embedded condition JSON in any released protocol's title or description", () => {
    for (const record of release.records.filter((r) => r.kind === "protocol" && r.status !== "excluded")) {
      const metadata = generateMetadata({ params: { id: record.id } });
      expect(`${metadata.title} ${metadata.description}`, record.id).not.toMatch(/\{"|reference_network|gene_selection/);
    }
  });
  it("keeps the canonical URL of a legacy condition name while cleaning its title and description", () => {
    for (const record of affected) {
      const metadata = generateMetadata({
        params: { id: record.id },
      });
      expect(metadata.title).not.toContain("reference_network");
      expect(metadata.description).not.toContain("gene_selection");
      expect(metadata.title).toContain("Reference network:");
      expect(metadata.alternates?.canonical).toBe(
        `https://benchmarks.rewirebio.io/database/protocol/${record.id}/`,
      );
    }
  });
  it("cleans the protocol heading while retaining original technical evidence", () => {
    const record = affected[0];
    const html = renderToStaticMarkup(
      <RecordPage params={{ id: record.id }} />,
    );
    const heading = html.match(/<h1>([\s\S]*?)<\/h1>/)![1];
    expect(heading).toContain("Reference network:");
    expect(heading).not.toContain("reference_network");
    expect(html).toContain("Technical metadata and extraction receipts");
    // The source locator is the technical evidence the cleaned heading must not replace.
    const locator = record.attributes.source_locator;
    if (typeof locator === "string") expect(html).toContain(locator);
  });
});
