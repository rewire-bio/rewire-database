import { recordIsIndexable } from "./catalogue-seo";
import { recordHref } from "./omics";
import { catalogueIndexPaths, indexSource } from "./catalogue-index";
import { buildCatalogue } from "./catalogue-build";

export const SITEMAP_ORIGIN = "https://benchmarks.rewirebio.io";
/** URLs per sitemap file; the protocol allows 50,000. */
export const SITEMAP_CHUNK_SIZE = 10_000;

export type SitemapEntry = { path: string; lastModified?: string };

/** Every indexable canonical page of the pinned release, in a stable order. Reads
 * record IDs and the few use-case records only: never the use-case evidence blob,
 * which takes more than 1 GB once parsed. */
export function sitemapEntries(): SitemapEntry[] {
  const { catalogue, query } = buildCatalogue();
  const useCases = catalogue.coverage.use_cases
    ? query.recordsOfKind("use_case").filter((record) => record.status !== "excluded").map((record) => String(record.attributes.slug)).sort()
    : [];
  return [
    { path: "/" },
    { path: "/runs/mfass-v2/" },
    { path: "/evidence/" },
    { path: "/coverage/" },
    { path: "/use-cases/" },
    ...useCases.map((slug) => ({ path: `/use-cases/${slug}/` })),
    ...catalogueIndexPaths(indexSource(query, "model")).map((path) => ({ path })),
    ...query.recordIds().filter(recordIsIndexable).map((record) => ({ path: recordHref(record) })),
    { path: "/investigations/" },
    ...query.research().investigations.map((report) => ({ path: `/investigations/${report.id}/`, lastModified: report.review.reviewed_at })),
  ];
}

export const sitemapChunkPath = (index: number) => `/sitemap/${index}.xml`;
export const sitemapChunkCount = (entries: readonly unknown[]) => Math.max(1, Math.ceil(entries.length / SITEMAP_CHUNK_SIZE));

const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function sitemapIndexXml(chunks: number): string {
  const items = Array.from({ length: chunks }, (_, index) => `<sitemap><loc>${SITEMAP_ORIGIN}${sitemapChunkPath(index)}</loc></sitemap>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items.join("\n")}\n</sitemapindex>\n`;
}

/** One sitemap file, or null when the chunk does not exist. */
export function sitemapChunkXml(entries: readonly SitemapEntry[], index: number): string | null {
  if (!Number.isSafeInteger(index) || index < 0 || index >= sitemapChunkCount(entries)) return null;
  const items = entries.slice(index * SITEMAP_CHUNK_SIZE, (index + 1) * SITEMAP_CHUNK_SIZE).map((entry) =>
    `<url><loc>${escape(SITEMAP_ORIGIN + entry.path)}</loc>${entry.lastModified ? `<lastmod>${escape(entry.lastModified)}</lastmod>` : ""}</url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items.join("\n")}\n</urlset>\n`;
}

export const xmlResponse = (body: string) => new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
