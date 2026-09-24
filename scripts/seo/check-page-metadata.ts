import fs from "node:fs";
import path from "node:path";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { SOCIAL_IMAGE, type BreadcrumbItem } from "../../lib/catalogue-sharing";

const ORIGIN = "https://benchmarks.rewire.it";
/** Decode only after extracting markup: escaped record text is not an HTML tag. */
function decode(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    quot: '"',
    apos: "'",
    lt: "<",
    gt: ">",
    nbsp: "\u00a0",
  };
  return value.replace(
    /&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi,
    (whole, entity: string) => {
      if (!entity.startsWith("#")) return named[entity.toLowerCase()] || whole;
      const code =
        entity[1].toLowerCase() === "x"
          ? parseInt(entity.slice(2), 16)
          : Number(entity.slice(1));
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    },
  );
}
function attributes(tag: string): Record<string, string> {
  return Object.fromEntries(
    [
      ...tag.matchAll(/([^\s=<>/]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g),
    ].map((match) => [
      match[1].toLowerCase(),
      decode(match[2] ?? match[3] ?? match[4]),
    ]),
  );
}
function visibleText(html: string): string {
  return decode(html.replace(/<[^>]*>/g, ""));
}

export function checkSitemap(xml: string): {
  urls: Set<string>;
  failures: string[];
} {
  const failures: string[] = [];
  const urls = new Set<string>();
  if (XMLValidator.validate(xml) !== true)
    return { urls, failures: ["Sitemap is not valid XML"] };
  const value = new XMLParser({
    isArray: (name) => name === "url",
    parseTagValue: false,
  }).parse(xml);
  if (!value.urlset || !Array.isArray(value.urlset.url))
    return { urls, failures: ["Sitemap has no URL entries"] };
  for (const entry of value.urlset.url) {
    const loc = entry.loc;
    if (typeof loc !== "string") {
      failures.push("Sitemap entry must have one loc");
      continue;
    }
    try {
      const url = new URL(loc);
      if (
        url.origin !== ORIGIN ||
        url.search ||
        url.hash ||
        !url.pathname.endsWith("/")
      )
        failures.push(`Sitemap has a noncanonical URL: ${loc}`);
    } catch {
      failures.push(`Sitemap has an invalid URL: ${loc}`);
    }
    if (urls.has(loc)) failures.push(`Sitemap duplicates ${loc}`);
    urls.add(loc);
    if (entry.lastmod !== undefined)
      failures.push(`Sitemap has unsupported lastmod: ${loc}`);
  }
  return { urls, failures };
}

/** Read the shared image once, outside the record loop. */
export function checkSocialImage(exportRoot: string): string[] {
  const url = new URL(SOCIAL_IMAGE.url);
  if (
    url.origin !== ORIGIN ||
    url.search ||
    url.hash ||
    !url.pathname.endsWith(".png")
  )
    return ["Social image must be a local canonical PNG"];
  const file = path.join(exportRoot, url.pathname);
  if (!fs.existsSync(file)) return [`Missing social PNG: ${file}`];
  const png = fs.readFileSync(file);
  if (
    png.length < 24 ||
    png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
    png.toString("ascii", 12, 16) !== "IHDR"
  )
    return [`Invalid social PNG: ${file}`];
  return png.readUInt32BE(16) === SOCIAL_IMAGE.width &&
    png.readUInt32BE(20) === SOCIAL_IMAGE.height
    ? []
    : [`Social PNG dimensions disagree with metadata: ${file}`];
}

export interface PageMetadataContract {
  path: string;
  canonical: string;
  title?: string;
  description?: string;
  indexable: boolean;
  /** Alias and legacy routes are not sitemap entries even when indexable. */
  inSitemap: boolean;
  social: boolean;
  breadcrumbs?: BreadcrumbItem[];
  website?: boolean;
}

/** Check exported tags, not the metadata API object or serialized hydration data.
 * The scanner targets the finite, server-generated Next.js markup contract; it is
 * not a general browser parser. Attribute order, quoting and React escapes vary.
 */
export function checkPageMetadata(
  html: string,
  expected: PageMetadataContract,
  sitemap: ReadonlySet<string>,
): string[] {
  const errors: string[] = [];
  const fail = (message: string) => errors.push(`${expected.path}: ${message}`);
  const heads = [...html.matchAll(/<head\b[^>]*>([\s\S]*?)<\/head\s*>/gi)];
  if (heads.length !== 1) fail("expected one generated head");
  const head = heads[0]?.[1] || "";
  const titles = [
    ...head.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/gi),
  ].map((match) => decode(match[1]));
  const metas = [...head.matchAll(/<meta\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)].map(
    (match) => attributes(match[0]),
  );
  const meta = (key: string) =>
    metas
      .filter(
        (tag) =>
          tag.name?.toLowerCase() === key ||
          tag.property?.toLowerCase() === key,
      )
      .map((tag) => tag.content || "");
  const one = (values: string[], label: string, value?: string) => {
    if (values.length !== 1 || !values[0]?.trim())
      fail(`expected one nonempty ${label}`);
    else if (value !== undefined && values[0] !== value)
      fail(`${label} mismatch`);
    return values[0] || "";
  };
  const title = one(titles, "title", expected.title);
  const description = one(
    meta("description"),
    "description",
    expected.description,
  );
  const canonicals = [...head.matchAll(/<link\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)]
    .map((match) => attributes(match[0]))
    .filter((tag) => tag.rel?.toLowerCase().split(/\s+/).includes("canonical"))
    .map((tag) => tag.href || "");
  one(canonicals, "canonical", expected.canonical);
  const directives = [...meta("robots"), ...meta("googlebot")].flatMap(
    (value) => value.toLowerCase().split(/[\s,]+/),
  );
  const noindex = directives.includes("noindex") || directives.includes("none");
  if (noindex === expected.indexable) fail("robots indexing policy mismatch");
  if (directives.includes("nofollow") || directives.includes("none"))
    fail("robots must permit following evidence links");
  if (sitemap.has(new URL(expected.path, ORIGIN).href) !== expected.inSitemap)
    fail("sitemap eligibility mismatch");
  if (expected.indexable && !sitemap.has(expected.canonical))
    fail("indexable canonical missing from sitemap");
  if (expected.social) {
    for (const key of ["og:title", "twitter:title"]) one(meta(key), key, title);
    for (const key of ["og:description", "twitter:description"])
      one(meta(key), key, description);
    one(meta("og:url"), "og:url", expected.canonical);
    one(meta("og:type"), "og:type", "website");
    one(meta("twitter:card"), "twitter:card", "summary_large_image");
    for (const key of ["og:image", "twitter:image"])
      one(meta(key), key, SOCIAL_IMAGE.url);
    for (const key of ["og:image:alt", "twitter:image:alt"])
      one(meta(key), key, SOCIAL_IMAGE.alt);
    one(meta("og:image:width"), "og:image:width", String(SOCIAL_IMAGE.width));
    one(
      meta("og:image:height"),
      "og:image:height",
      String(SOCIAL_IMAGE.height),
    );
    one(meta("og:image:type"), "og:image:type", "image/png");
  }
  const structured: Record<string, unknown>[] = [];
  for (const match of html.matchAll(
    /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi,
  )) {
    if (attributes(match[1]).type?.toLowerCase() !== "application/ld+json")
      continue;
    if (match[2].includes("<"))
      fail("JSON-LD contains unescaped HTML/script text");
    try {
      const data = JSON.parse(match[2]);
      if (!data || typeof data !== "object" || Array.isArray(data))
        fail("JSON-LD must be an object");
      else structured.push(data);
    } catch {
      fail("invalid JSON-LD");
    }
  }
  const allowed = [
    expected.breadcrumbs ? "BreadcrumbList" : "",
    expected.website ? "WebSite" : "",
  ].filter(Boolean);
  if (structured.length !== allowed.length)
    fail("structured data count mismatch");
  for (const data of structured) {
    if (
      data["@context"] !== "https://schema.org" ||
      !allowed.includes(String(data["@type"]))
    )
      fail("unexpected structured data context/type");
  }
  if (expected.website) {
    const websites = structured.filter((data) => data["@type"] === "WebSite");
    if (
      websites.length !== 1 ||
      websites[0].url !== expected.canonical ||
      websites[0]["@id"] !== `${expected.canonical}#website` ||
      typeof websites[0].name !== "string" ||
      !websites[0].name.trim()
    )
      fail("WebSite identity mismatch");
  }
  if (expected.breadcrumbs) {
    const crumbs = expected.breadcrumbs;
    const lists = structured.filter(
      (data) => data["@type"] === "BreadcrumbList",
    );
    const elements = lists[0]?.itemListElement;
    if (
      lists.length !== 1 ||
      !Array.isArray(elements) ||
      elements.length !== crumbs.length ||
      elements.some(
        (item, index) =>
          !item ||
          item["@type"] !== "ListItem" ||
          item.position !== index + 1 ||
          item.name !== crumbs[index].name ||
          item.item !== new URL(crumbs[index].path, ORIGIN).href,
      )
    )
      fail("BreadcrumbList does not match the page hierarchy");
    if (new URL(crumbs.at(-1)?.path || "", ORIGIN).href !== expected.canonical)
      fail("breadcrumb destination is not canonical");
    const navs = [
      ...html.matchAll(/<nav\b([^>]*)>([\s\S]*?)<\/nav\s*>/gi),
    ].filter((match) => attributes(match[1])["aria-label"] === "Breadcrumb");
    if (navs.length !== 1) fail("expected one visible breadcrumb navigation");
    const nav = navs[0]?.[2] || "";
    const links = [...nav.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi)];
    if (
      links.length !== crumbs.length - 1 ||
      links.some(
        (link, index) =>
          attributes(link[1]).href !== crumbs[index].path ||
          visibleText(link[2]) !== crumbs[index].name,
      )
    )
      fail("visible breadcrumb links disagree with JSON-LD");
    const current = [
      ...nav.matchAll(/<span\b([^>]*)>([\s\S]*?)<\/span\s*>/gi),
    ].filter((match) => attributes(match[1])["aria-current"] === "page");
    if (
      current.length !== 1 ||
      visibleText(current[0][2]) !== crumbs.at(-1)?.name
    )
      fail("visible current breadcrumb disagrees with JSON-LD");
  }
  return errors;
}
