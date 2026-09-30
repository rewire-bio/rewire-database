import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import worker from "../cloudflare/worker.mjs";
import { isProxied } from "../cloudflare/routing.mjs";
import { prepareCloudflare } from "../scripts/prepare-cloudflare.mjs";

afterEach(() => { vi.unstubAllGlobals(); });
const assets = { fetch: vi.fn(async () => new Response("missing", { status: 404 })) };
describe("Cloudflare hybrid hosting", () => {
  it("preserves reviewed legacy redirects and repeated encoded query values", async () => {
    const response = await worker.fetch(new Request("https://benchmarks.rewirebio.io/literature/?q=a%26b&kind=model&q=%CE%B2"), { ASSETS: assets });
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("https://benchmarks.rewirebio.io/?kind=result&origin=literature&q=a%26b&kind=model&q=%CE%B2");
  });
  it("keeps core assets local and unknown routes as genuine 404s", async () => {
    expect(isProxied("/omics-copy/private")).toBe(false);
    expect(isProxied("/database/model/example/")).toBe(false);
    const response = await worker.fetch(new Request("https://benchmarks.rewirebio.io/missing/"), { ASSETS: assets });
    expect(response.status).toBe(404);
  });
  it("streams range exports with their exact bytes and headers", async () => {
    const bytes = new Uint8Array([0, 255, 4, 10]);
    const fetcher = vi.fn(async () => new Response(bytes, { status: 206, headers: { "content-range": "bytes 0-3/200", etag: '"release-checksum"' } }));
    vi.stubGlobal("fetch", fetcher);
    const response = await worker.fetch(new Request("https://benchmarks.rewirebio.io/omics/releases/id/records.csv?download=1", { headers: { range: "bytes=0-3" } }), { ASSETS: assets });
    const [upstream, options] = fetcher.mock.calls[0] as any;
    expect(upstream.url).toBe("https://rewire-it.web.app/omics/releases/id/records.csv?download=1");
    expect(upstream.headers.get("range")).toBe("bytes=0-3");
    expect(upstream.headers.get("accept-encoding")).toBe("identity");
    expect(options.redirect).toBe("manual");
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 0-3/200");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  });
  it("fetches missing content-addressed chunks from Firebase during rollout and rollback", async () => {
    const fetcher = vi.fn(async () => new Response("console.log('newer chunk')", { headers: { "content-type": "application/javascript" } }));
    vi.stubGlobal("fetch", fetcher);
    const response = await worker.fetch(new Request("https://benchmarks.rewirebio.io/_next/static/chunks/newer.js"), { ASSETS: assets });
    expect(response.status).toBe(200);
    expect((fetcher.mock.calls[0] as any)[0].url).toBe("https://rewire-it.web.app/_next/static/chunks/newer.js");
    expect(await response.text()).toContain("newer chunk");
  });
  it("never returns a successful HTML fallback for a missing script", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>fallback</html>", { headers: { "content-type": "text/html" } })));
    const response = await worker.fetch(new Request("https://benchmarks.rewirebio.io/_next/static/chunks/missing.js"), { ASSETS: assets });
    expect(response.status).toBe(404);
  });
  it("preserves authenticated POST requests and prevents private CDN caching", async () => {
    const fetcher = vi.fn(async () => new Response("{}", { headers: { "cache-control": "public,max-age=600", "cdn-cache-control": "max-age=600" } }));
    vi.stubGlobal("fetch", fetcher);
    const response = await worker.fetch(new Request("https://benchmarks.rewirebio.io/api/trpc/submission.create", { method: "POST", headers: { authorization: "Bearer example" }, body: '{"example":true}' }), { ASSETS: assets });
    const [upstream, options] = fetcher.mock.calls[0] as any;
    expect(upstream.method).toBe("POST");
    expect(upstream.headers.get("authorization")).toBe("Bearer example");
    expect(await upstream.text()).toBe('{"example":true}');
    expect(options.cf.cacheTtl).toBe(0);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.has("cdn-cache-control")).toBe(false);
  });
  it("keeps origin redirects on the requested domain without following them", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 301, headers: { location: "https://rewire-it.web.app/database/result/example/?a=b" } })));
    const response = await worker.fetch(new Request("https://benchmarks.rewirebio.io/database/result/example?a=b"), { ASSETS: assets });
    expect(response.headers.get("location")).toBe("https://benchmarks.rewirebio.io/database/result/example/?a=b");
  });
  it("stages core UI and leaves immutable exports and bulk record routes untouched", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "database-cf-test-"));
    try {
      for (const name of ["index.html", "404.html", "database/model/example/index.html", "database/result/example/index.html", "omics/records.csv"]) {
        await mkdir(path.dirname(path.join(root, "out", name)), { recursive: true });
        await writeFile(path.join(root, "out", name), name);
      }
      const inventory = await prepareCloudflare(root);
      expect(inventory.static_files).toBe(4);
      expect(await readFile(path.join(root, "out/omics/records.csv"), "utf8")).toBe("omics/records.csv");
      await expect(readFile(path.join(root, ".cloudflare/assets/omics/records.csv"))).rejects.toThrow();
      expect(await readFile(path.join(root, ".cloudflare/assets/database/model/example/index.html"), "utf8")).toBe("database/model/example/index.html");
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
