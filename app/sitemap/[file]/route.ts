import { sitemapChunkXml, sitemapEntries, xmlResponse } from "@/lib/sitemap";

export const dynamic = "force-dynamic";

export function GET(_request: Request, { params }: { params: { file: string } }) {
  const match = /^(0|[1-9][0-9]{0,3})\.xml$/.exec(params.file);
  const body = match ? sitemapChunkXml(sitemapEntries(), Number(match[1])) : null;
  return body === null ? new Response("Not found", { status: 404 }) : xmlResponse(body);
}
