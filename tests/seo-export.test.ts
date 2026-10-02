import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  checkPageMetadata,
  checkSitemap,
  checkSocialImage,
  type PageMetadataContract,
} from "../scripts/seo/check-page-metadata";

const origin = "https://benchmarks.rewirebio.io";
const pagePath = "/database/model/test-model/";
const title = "Test <model>";
const description = "A model's results & sources.";
const image = `${origin}/images/social/catalogue.png`;
const alt =
  "rewire.it biological model benchmark database: models, benchmarks and source-linked evidence";
const breadcrumbs = [
  { name: "Database", path: "/" },
  { name: "Models", path: "/models/" },
  { name: title, path: pagePath },
];
const contract: PageMetadataContract = {
  path: pagePath,
  canonical: origin + pagePath,
  title,
  description,
  indexable: true,
  inSitemap: true,
  social: true,
  breadcrumbs,
};
const urls = new Set([origin + "/", origin + "/models/", origin + pagePath]);
const escape = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");
const tag = (key: string, value: string, attribute = "name") =>
  `<meta content="${escape(value)}" ${attribute}="${key}">`;
const structured = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: breadcrumbs.map((item, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name: item.name,
    item: origin + item.path,
  })),
};
const json = JSON.stringify(structured).replaceAll("<", "\\u003c");
const script = `<script type="application/ld+json">${json}</script>`;
// Hand-authored exported markup fixture, independent of Next's metadata generation.
const html = `<html><head><title>${escape(title)}</title>${tag("description", description)}<link href='${origin + pagePath}' rel='canonical'>${tag("robots", "index, follow")}${[
  ["og:title", title],
  ["og:description", description],
  ["og:url", origin + pagePath],
  ["og:type", "website"],
  ["og:image", image],
  ["og:image:alt", alt],
  ["og:image:type", "image/png"],
  ["og:image:width", "1200"],
  ["og:image:height", "630"],
]
  .map(([key, value]) => tag(key, value, "property"))
  .join("")}${[
  ["twitter:title", title],
  ["twitter:description", description],
  ["twitter:card", "summary_large_image"],
  ["twitter:image", image],
  ["twitter:image:alt", alt],
]
  .map(([key, value]) => tag(key, value))
  .join(
    "",
  )}</head><body><nav aria-label="Breadcrumb"><a href="/">Database</a><span aria-hidden="true">/</span><a href="/models/">Models</a><span aria-hidden="true">/</span><span aria-current="page">${escape(title)}</span></nav>${script}</body></html>`;
const check = (value = html, expected = contract, sitemap = urls) =>
  checkPageMetadata(value, expected, sitemap);
const temporary: string[] = [];
afterEach(() =>
  temporary
    .splice(0)
    .forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })),
);

describe("generated-page metadata acceptance", () => {
  it("accepts actual head tags with mixed attribute order/quotes and decoded record text", () => {
    expect(check()).toEqual([]);
    expect(
      check(html.replaceAll("&amp;", "&#38;").replaceAll("&lt;", "&#x3c;")),
    ).toEqual([]);
  });
  it("rejects missing or duplicate head metadata even when matching text exists in hydration data", () => {
    const without = html
      .replace(/<link[^>]+>/, "")
      .replace(
        "</body>",
        `<script>self.__next_f.push(["${origin + pagePath}"])</script></body>`,
      );
    expect(check(without).join("\n")).toContain(
      "expected one nonempty canonical",
    );
    expect(
      check(html.replace(tag("description", description), "")).join("\n"),
    ).toContain("expected one nonempty description");
    expect(
      check(html.replace("</head>", `<title>Other</title></head>`)).join("\n"),
    ).toContain("expected one nonempty title");
    expect(
      check(html.replace("rel='canonical'", "rel='alternate'")).join("\n"),
    ).toContain("expected one nonempty canonical");
    expect(
      check(
        html.replace(
          "</head>",
          `<link rel="canonical" href="${origin + pagePath}"></head>`,
        ),
      ).join("\n"),
    ).toContain("expected one nonempty canonical");
  });
  it("rejects inherited snippets and wrong canonicals or social values", () => {
    expect(
      check(
        html.replace(
          `<title>${escape(title)}</title>`,
          "<title>Homepage</title>",
        ),
      ).join("\n"),
    ).toContain("title mismatch");
    expect(
      check(
        html.replace(`href='${origin + pagePath}'`, `href='${origin}/'`),
      ).join("\n"),
    ).toContain("canonical mismatch");
    expect(
      check(
        html.replace(
          tag("og:description", description, "property"),
          tag("og:description", "Homepage", "property"),
        ),
      ).join("\n"),
    ).toContain("og:description mismatch");
    expect(
      check(
        html.replace(
          tag("twitter:image", image),
          tag("twitter:image", `${origin}/wrong.png`),
        ),
      ).join("\n"),
    ).toContain("twitter:image mismatch");
  });
  it("enforces noindex and sitemap policy together without confusing aliases with canonical pages", () => {
    const noindex = html.replace("index, follow", "noindex, follow");
    expect(check(noindex).join("\n")).toContain(
      "robots indexing policy mismatch",
    );
    const claimContract = { ...contract, indexable: false, inSitemap: false };
    expect(check(html, claimContract, new Set()).join("\n")).toContain(
      "robots indexing policy mismatch",
    );
    expect(check(noindex, claimContract, new Set())).toEqual([]);
    expect(check(noindex, claimContract).join("\n")).toContain(
      "sitemap eligibility mismatch",
    );
    expect(
      check(html.replace("index, follow", "index, nofollow")).join("\n"),
    ).toContain("robots must permit following");
    expect(
      check(html, {
        ...contract,
        path: "/database/baseline/test-model/",
        inSitemap: false,
      }),
    ).toEqual([]);
    expect(check(html, contract, new Set()).join("\n")).toContain(
      "indexable canonical missing from sitemap",
    );
  });
  it("rejects malformed, unexpected, unescaped and missing JSON-LD", () => {
    expect(check(html.replace(json, "{broken json}")).join("\n")).toContain(
      "invalid JSON-LD",
    );
    expect(check(html.replace(script, "")).join("\n")).toContain(
      "structured data count mismatch",
    );
    expect(
      check(html.replace(json, JSON.stringify(structured))).join("\n"),
    ).toContain("JSON-LD contains unescaped HTML/script text");
    expect(
      check(html.replace('"@type":"BreadcrumbList"', '"@type":"Dataset"')).join(
        "\n",
      ),
    ).toContain("unexpected structured data context/type");
    expect(
      check(
        html.replace(json, '{"name":"</script><script>alert(1)</script>"}'),
      ).join("\n"),
    ).toContain("invalid JSON-LD");
  });
  it("requires structured hierarchy, visible link text and current-page destination to agree", () => {
    expect(
      check(html.replace('"position":2', '"position":7')).join("\n"),
    ).toContain("BreadcrumbList does not match");
    expect(
      check(html.replace('href="/models/"', 'href="/benchmarks/"')).join("\n"),
    ).toContain("visible breadcrumb links disagree");
    expect(
      check(
        html.replace('aria-current="page">Test', 'aria-current="page">Wrong'),
      ).join("\n"),
    ).toContain("visible current breadcrumb disagrees");
    const wrong = [
      ...breadcrumbs.slice(0, -1),
      { name: title, path: "/wrong/" },
    ];
    expect(
      check(html, { ...contract, breadcrumbs: wrong }).join("\n"),
    ).toContain("breadcrumb destination is not canonical");
  });
  it("checks homepage WebSite identity while allowing utility pages without structured data", () => {
    const base = `<html><head><title>Home</title>${tag("description", "Catalogue")}<link rel="canonical" href="${origin}/"></head><body>`;
    const homeContract = {
      path: "/",
      canonical: origin + "/",
      indexable: true,
      inSitemap: true,
      social: false,
      website: true,
    };
    const website = `<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite","@id":"${origin}/#website","url":"${origin}/","name":"Catalogue"}</script>`;
    expect(check(base + website + "</body></html>", homeContract)).toEqual([]);
    expect(
      check(
        base +
          website.replace("/#website", "/wrong#website") +
          "</body></html>",
        homeContract,
      ).join("\n"),
    ).toContain("WebSite identity mismatch");
    expect(
      check(base + "</body></html>", { ...homeContract, website: false }),
    ).toEqual([]);
  });
});

describe("exported sitemap and social asset", () => {
  const sitemap = (entries: string) =>
    `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</urlset>`;
  it("indexes valid URLs and rejects duplicate, noncanonical or unsupported timestamp entries", () => {
    expect(checkSitemap(sitemap(`<url><loc>${origin}/</loc></url>`))).toEqual({
      urls: new Set([origin + "/"]),
      failures: [],
    });
    const invalid = sitemap(
      `<url><loc>${origin}/</loc><lastmod>2026-09-23</lastmod></url><url><loc>${origin}/</loc></url><url><loc>${origin}/?q=x&amp;y=z</loc></url>`,
    );
    const result = checkSitemap(invalid);
    expect(result.failures.join("\n")).toContain("unsupported lastmod");
    expect(result.failures.join("\n")).toContain("duplicates");
    expect(result.failures.join("\n")).toContain("noncanonical URL");
    expect(checkSitemap("<urlset>").failures).toContain(
      "Sitemap is not valid XML",
    );
  });
  it("verifies the actual exported PNG exists and agrees with declared dimensions", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seo-export-"));
    temporary.push(dir);
    expect(checkSocialImage(dir).join("\n")).toContain("Missing social PNG");
    fs.mkdirSync(path.join(dir, "images/social"), { recursive: true });
    const file = path.join(dir, "images/social/catalogue.png");
    fs.copyFileSync("public/images/social/catalogue.png", file);
    expect(checkSocialImage(dir)).toEqual([]);
    const png = fs.readFileSync(file);
    png.writeUInt32BE(1, 16);
    fs.writeFileSync(file, png);
    expect(checkSocialImage(dir).join("\n")).toContain("dimensions disagree");
    fs.writeFileSync(file, "not a PNG");
    expect(checkSocialImage(dir).join("\n")).toContain("Invalid social PNG");
  });
});
