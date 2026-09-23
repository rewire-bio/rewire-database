import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createCatalogueQuery, type CatalogueSnapshot } from "../services/omics/src/catalogue-query";
import { omicsKinds, recordHref, type OmicsRecord } from "../lib/omics";
import { recordBreadcrumbs, safeJsonLd, SOCIAL_IMAGE } from "../lib/catalogue-sharing";
import Breadcrumbs from "../components/catalogue/Breadcrumbs";
import StaticIndex from "../components/catalogue/StaticIndex";
import { indexMetadata } from "../lib/catalogue-index";
import RecordPage, { generateMetadata } from "../app/database/[kind]/[id]/page";
import { metadata as homeMetadata } from "../app/page";

const fixture = vi.hoisted(() => ({ snapshot: null as CatalogueSnapshot | null }));
vi.mock("../lib/catalogue-build", () => ({ buildCatalogue: () => ({ catalogue: fixture.snapshot!, query: createCatalogueQuery(fixture.snapshot!) }) }));
const records: OmicsRecord[] = omicsKinds.map((kind) => ({
  id: `test-${kind.replace(/_/g, "-")}`, kind, name: `Example ${kind}`,
  description: `Available evidence for example ${kind}.`, status: "source_checked",
  facets: {}, links: [], source_ids: [], attributes: {},
}));
fixture.snapshot = { schema_version: "1.1", release_id: "test-release", released_at: "2026-09-01T00:00:00Z", records, coverage: {} };
function jsonLd(html: string) {
  return JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1]);
}

describe("truthful catalogue sharing", () => {
  it("uses stable model and benchmark indexes and no fictional kind indexes", () => {
    for (const record of records) {
      const items = recordBreadcrumbs(record);
      expect(items.map((item) => item.path)).toEqual([
        "/", ...(record.kind === "model" ? ["/models/"] : record.kind === "benchmark" ? ["/benchmarks/"] : []), recordHref(record),
      ]);
      const html = renderToStaticMarkup(<Breadcrumbs items={items} />);
      const data = jsonLd(html);
      expect(data["@type"]).toBe("BreadcrumbList");
      for (const [index, item] of data.itemListElement.entries()) {
        expect(item.position).toBe(index + 1);
        expect(html).toContain(items[index].name);
        if (index < items.length - 1) expect(html).toContain(`href="${items[index].path}"`);
        expect(item.item).toBe(`https://benchmarks.rewire.it${items[index].path}`);
      }
    }
  });
  it("renders breadcrumbs into actual record pages, separate from return-to-filter navigation", () => {
    for (const kind of ["model", "benchmark", "source", "dataset"] as const) {
      const record = records.find((record) => record.kind === kind)!;
      const html = renderToStaticMarkup(<RecordPage params={{ kind, id: record.id }} />);
      expect(jsonLd(html).itemListElement.at(-1).item).toBe(`https://benchmarks.rewire.it${recordHref(record)}`);
      expect(html).toContain('aria-current="page"');
      expect(html).toContain("Back to results");
      expect(html).not.toContain('"@type":"Dataset"');
    }
  });
  it("describes paginated model indexes with the visible page number", () => {
    const html = renderToStaticMarkup(<StaticIndex catalogue={fixture.snapshot!} kind="model" page={2} />);
    expect(jsonLd(html).itemListElement.map((item: { name: string }) => item.name)).toEqual(["Database", "Models", "Page 2"]);
    expect(html).toContain('href="/models/"');
    expect(html).toContain('aria-current="page">Page 2');
  });
  it("shares each page's title, description and canonical rather than inherited homepage metadata", () => {
    const pages = [homeMetadata, indexMetadata("model", 2), indexMetadata("benchmark"), ...records.map((record) => generateMetadata({ params: { kind: record.kind, id: record.id } }))];
    for (const metadata of pages) {
      expect(metadata.openGraph).toMatchObject({ title: metadata.title, description: metadata.description, url: metadata.alternates?.canonical, type: "website", images: [{ ...SOCIAL_IMAGE, type: "image/png" }] });
      expect(metadata.twitter).toMatchObject({ card: "summary_large_image", title: metadata.title, description: metadata.description });
    }
  });
  it("keeps legacy-kind sharing URLs canonical", () => {
    const record = records.find((record) => record.kind === "model")!;
    record.attributes.legacy_kinds = ["baseline"];
    expect(generateMetadata({ params: { id: record.id, kind: "baseline" } }).openGraph).toMatchObject({ url: `https://benchmarks.rewire.it${recordHref(record)}` });
    delete record.attributes.legacy_kinds;
  });
  it("prevents record strings from breaking out of JSON-LD script elements", () => {
    const name = '</script><script>alert("record")</script>';
    const value = safeJsonLd({ name });
    expect(value).not.toContain("<");
    expect(JSON.parse(value)).toEqual({ name });
    const html = renderToStaticMarkup(<Breadcrumbs items={[{ name: "Database", path: "/" }, { name, path: "/models/" }]} />);
    expect((html.match(/<script/g) || []).length).toBe(1);
    expect(jsonLd(html).itemListElement[1].name).toBe(name);
  });
  it("ships a real 1200 by 630 PNG for social crawlers", () => {
    const png = fs.readFileSync("public/images/social/catalogue.png");
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
  });
});
