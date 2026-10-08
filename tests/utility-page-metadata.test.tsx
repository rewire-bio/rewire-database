import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import EvidencePage from "../app/evidence/page";
import AuditsPage from "../app/audits/page";
import MfassV1Page from "../app/runs/mfass-v1/page";
import MfassV2Page from "../app/runs/mfass-v2/page";
import ContributePage from "../app/contribute/page";
import { checkPageMetadata } from "../scripts/seo/check-page-metadata";
import { utilityPageMetadataContracts } from "../scripts/seo/utility-page-metadata";

// The real pages and Breadcrumbs render normally; catalogue rows are irrelevant
// to their navigation, and the fixture release has no audit files on disk.
vi.mock("../lib/catalogue-build", () => ({
  buildCatalogue: () => ({
    catalogue: {
      release_id: "utility-metadata-test",
      released_at: "2026-09-25T00:00:00Z",
      records: [],
    },
  }),
}));

const origin = "https://benchmarks.rewirebio.io";
const cases = [
  {
    path: "/evidence/", Page: EvidencePage, indexable: true,
    hierarchy: [
      ["Database", "/"],
      ["Evidence and sources", "/evidence/"],
    ],
  },
  { path: "/audits/", Page: AuditsPage, indexable: true, hierarchy: [] },
  {
    path: "/runs/mfass-v1/", Page: MfassV1Page, indexable: false,
    hierarchy: [
      ["Database", "/"],
      ["Rewire evaluations", "/?kind=result&origin=rewire#browse"],
      ["MFASS v1 archive", "/runs/mfass-v1/"],
    ],
  },
  {
    path: "/runs/mfass-v2/", Page: MfassV2Page, indexable: true,
    hierarchy: [
      ["Database", "/"],
      ["Rewire evaluations", "/?kind=result&origin=rewire#browse"],
      ["MFASS v2", "/runs/mfass-v2/"],
    ],
  },
  {
    path: "/contribute/", Page: ContributePage, indexable: false,
    hierarchy: [["Database", "/"], ["Contribute", "/contribute/"]],
  },
];
const sitemap = new Set(cases.filter((page) => page.indexable).map((page) => origin + page.path));
const jsonLd = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;

function rendered(page: (typeof cases)[number]) {
  // Use a minimal head to isolate navigation. Full exported Next.js head tags
  // and social metadata are checked by check:build against the production server.
  return renderToStaticMarkup(
    <html>
      <head>
        <title>Utility page</title>
        <meta name="description" content="Utility page navigation test" />
        <link rel="canonical" href={origin + page.path} />
        <meta name="robots" content={`${page.indexable ? "index" : "noindex"}, follow`} />
      </head>
      <body>{createElement(page.Page)}</body>
    </html>,
  );
}

function contractFor(path: string) {
  const contract = utilityPageMetadataContracts.find((page) => page.path === path);
  expect(contract).toBeDefined();
  return contract!;
}

describe("utility-page export contracts", () => {
  it("covers all five utility pages exactly once", () => {
    expect(utilityPageMetadataContracts.map((page) => page.path)).toEqual(cases.map((page) => page.path));
  });

  it.each(cases)("accepts the actual $path page hierarchy and preserves indexing policy", (page) => {
    const html = rendered(page);
    const contract = contractFor(page.path);
    expect(contract.indexable).toBe(page.indexable);
    expect(contract.inSitemap).toBe(page.indexable);
    expect(contract.social).toBe(page.path !== "/contribute/");
    expect(checkPageMetadata(html, { ...contract, social: false }, sitemap)).toEqual([]);

    const structured = [...html.matchAll(jsonLd)].map((match) => JSON.parse(match[1]));
    expect(structured).toEqual(page.hierarchy.length ? [{
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: page.hierarchy.map(([name, path], index) => ({
        "@type": "ListItem", position: index + 1, name, item: origin + path,
      })),
    }] : []);
  });

  it.each(cases.filter((page) => page.hierarchy.length))(
    "rejects the stale $path contract and missing or duplicate structured navigation",
    (page) => {
      const html = rendered(page);
      const contract = { ...contractFor(page.path), social: false };
      expect(checkPageMetadata(html, { ...contract, breadcrumbs: undefined }, sitemap))
        .toContain(`${page.path}: structured data count mismatch`);
      expect(checkPageMetadata(html.replace(jsonLd, ""), contract, sitemap))
        .toContain(`${page.path}: structured data count mismatch`);
      const duplicate = html.replace("</body>", `${[...html.matchAll(jsonLd)][0][0]}</body>`);
      expect(checkPageMetadata(duplicate, contract, sitemap))
        .toContain(`${page.path}: structured data count mismatch`);
    },
  );

  it("requires the complete MFASS filter and fragment in both JSON-LD and visible links", () => {
    const page = cases.find((page) => page.path === "/runs/mfass-v2/")!;
    const html = rendered(page);
    const contract = { ...contractFor(page.path), social: false };
    expect(checkPageMetadata(html.replace("/?kind=result&origin=rewire#browse", "/?kind=result"), contract, sitemap))
      .toContain(`${page.path}: BreadcrumbList does not match the page hierarchy`);
    expect(checkPageMetadata(html.replace("/?kind=result&amp;origin=rewire#browse", "/?kind=result"), contract, sitemap))
      .toContain(`${page.path}: visible breadcrumb links disagree with JSON-LD`);
  });

  it("continues to reject structured data on the audit page", () => {
    const page = cases.find((page) => page.path === "/audits/")!;
    const extra = [...rendered(cases[0]).matchAll(jsonLd)][0][0];
    const html = rendered(page).replace("</body>", `${extra}</body>`);
    expect(checkPageMetadata(html, { ...contractFor(page.path), social: false }, sitemap))
      .toContain(`${page.path}: unexpected structured data context/type`);
  });
});
