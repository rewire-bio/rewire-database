import { describe, expect, it, vi } from "vitest";
import { checkSitemap, checkSitemapIndex } from "../scripts/seo/check-page-metadata";
import { SITEMAP_CHUNK_SIZE, sitemapChunkCount, sitemapChunkXml, sitemapEntries, sitemapIndexXml } from "../lib/sitemap";

vi.mock("../lib/use-cases-build", () => ({ buildUseCases: () => { throw new Error("The sitemap must not load use-case evidence"); } }));

const origin = "https://benchmarks.rewirebio.io";

describe("chunked sitemap", () => {
  it("splits the release's pages into consecutive files listed by one index, each URL exactly once", () => {
    const entries = sitemapEntries();
    const chunks = sitemapChunkCount(entries);
    expect(chunks).toBe(Math.ceil(entries.length / SITEMAP_CHUNK_SIZE));
    const index = checkSitemapIndex(sitemapIndexXml(chunks));
    expect(index.failures).toEqual([]);
    expect(index.files).toHaveLength(chunks);
    const urls: string[] = [];
    for (let file = 0; file < chunks; file++) {
      const part = checkSitemap(sitemapChunkXml(entries, file)!);
      expect(part.failures.filter((failure) => !failure.includes("lastmod"))).toEqual([]);
      expect(part.urls.size).toBeLessThanOrEqual(SITEMAP_CHUNK_SIZE);
      urls.push(...part.urls);
    }
    expect(urls).toEqual(entries.map((entry) => origin + entry.path));
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls).toContain(`${origin}/use-cases/`);
    expect(urls.some((url) => url.startsWith(`${origin}/use-cases/`) && url !== `${origin}/use-cases/`)).toBe(true);
  });
  it("has no file past the last chunk and escapes XML", () => {
    expect(sitemapChunkXml([{ path: "/" }], 1)).toBeNull();
    expect(sitemapChunkXml([{ path: "/" }], -1)).toBeNull();
    expect(sitemapChunkXml([{ path: "/?a=1&b=2" }], 0)).toContain("/?a=1&amp;b=2");
    expect(sitemapChunkCount([])).toBe(1);
  });
  it("serves the index and the files as XML, and 404 for anything else", async () => {
    const { GET: index } = await import("../app/sitemap.xml/route");
    const { GET: file } = await import("../app/sitemap/[file]/route");
    const response = index();
    expect(response.headers.get("content-type")).toBe("application/xml; charset=utf-8");
    expect(checkSitemapIndex(await response.text()).failures).toEqual([]);
    expect((file(new Request(`${origin}/sitemap/0.xml`), { params: { file: "0.xml" } })).status).toBe(200);
    for (const bad of ["00.xml", "1.json", "-1.xml", "999.xml"])
      expect(file(new Request(`${origin}/sitemap/${bad}`), { params: { file: bad } }).status, bad).toBe(404);
  });
});
