import fs from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createCatalogueQuery,
  type CatalogueSnapshot,
} from "../services/omics/src/catalogue-query";
import RecordPage, { generateMetadata } from "../app/database/[kind]/[id]/page";
const fixture = vi.hoisted(() => ({
  snapshot: null as CatalogueSnapshot | null,
  query: null as ReturnType<typeof createCatalogueQuery> | null,
}));
vi.mock("../lib/catalogue-build", () => ({
  buildCatalogue: () => ({
    catalogue: fixture.snapshot!,
    query: fixture.query!,
  }),
}));
fixture.snapshot = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      "data/omics/releases/2026-09-22-f58a0f1d267f/catalogue.json.gz",
    ),
  ).toString(),
);
fixture.query = createCatalogueQuery(fixture.snapshot!);
const affected = fixture.snapshot!.records.filter(
  (r) => r.kind === "protocol" && r.name.includes('"reference_network"'),
);
describe("protocol display and metadata", () => {
  it("reads metadata without expanding record relationships or comparisons", () => {
    const record = affected[0];
    const expected = generateMetadata({ params: { id: record.id, kind: record.kind } });
    const get = vi.spyOn(fixture.query!, "get").mockImplementation(() => { throw new Error("unnecessary relationship expansion"); });
    try {
      expect(generateMetadata({ params: { id: record.id, kind: record.kind } })).toEqual(expected);
      expect(get).not.toHaveBeenCalled();
    } finally { get.mockRestore(); }
  });
  it("keeps all BEELINE canonical URLs while cleaning titles and descriptions", () => {
    for (const record of affected) {
      const metadata = generateMetadata({
        params: { id: record.id, kind: record.kind },
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
      <RecordPage params={{ id: record.id, kind: record.kind }} />,
    );
    const heading = html.match(/<h1>([\s\S]*?)<\/h1>/)![1];
    expect(heading).toContain("Reference network:");
    expect(heading).not.toContain("reference_network");
    expect(html).toContain("Technical metadata and extraction receipts");
    expect(html).toContain("&quot;reference_network&quot;");
  });
});
