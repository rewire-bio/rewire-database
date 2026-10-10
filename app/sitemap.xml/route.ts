import { sitemapChunkCount, sitemapEntries, sitemapIndexXml, xmlResponse } from "@/lib/sitemap";

// Generated from the running revision's pinned release, like every page.
export const dynamic = "force-dynamic";

/** A sitemap index: the release has more pages than one sitemap file should hold. */
export function GET() {
  return xmlResponse(sitemapIndexXml(sitemapChunkCount(sitemapEntries())));
}
