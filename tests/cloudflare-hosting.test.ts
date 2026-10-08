import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
vi.mock("../benchmark-data.lock.json", () => ({ default: { revision: "a".repeat(40), manifest_sha256: "b".repeat(64) } }));
vi.mock("../lib/generated-download-locations.json", () => ({ default: {
  repository: "rewire-bio/rewire-benchmark-data", revision: "a".repeat(40), manifest_sha256: "b".repeat(64),
  groups: [{ destination: "/omics/releases/id", source: "data/omics/releases/id", files: ["records.csv"] }],
} }));
import worker from "../cloudflare/worker.mjs";
import { isProxied } from "../cloudflare/routing.mjs";
import { prepareCloudflare } from "../scripts/prepare-cloudflare.mjs";

afterEach(() => { vi.unstubAllGlobals(); });
const assets = { fetch: vi.fn(async () => new Response("missing", { status: 404 })) };
describe("independent Cloudflare frontend", () => {
  it("redirects known downloads directly to pinned GitHub bytes", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    for (const method of ["GET", "HEAD"]) {
      const response = await worker.fetch(new Request("https://benchmarks.rewirebio.io/omics/releases/id/records.csv?download=a%26b&v=1&v=2", { method, headers: { Range: "bytes=100-199", "If-Range": '"original-etag"' } }), { ASSETS: assets });
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(`https://raw.githubusercontent.com/rewire-bio/rewire-benchmark-data/${"a".repeat(40)}/data/omics/releases/id/records.csv.gz?download=a%26b&v=1&v=2`);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("never creates GitHub URLs for unknown exports or forwards download POST bodies", async () => {
    vi.stubGlobal("fetch", vi.fn());
    for (const request of [new Request("https://example.test/omics/unknown"), new Request("https://example.test/omics/releases/id/records.csv", { method: "POST", body: "private" })]) {
      expect((await worker.fetch(request, { ASSETS: assets })).status).toBe(404);
    }
    expect(fetch).not.toHaveBeenCalled();
  });
  it("preserves reviewed legacy redirects and repeated encoded query values", async () => {
    const response = await worker.fetch(new Request("https://benchmarks.rewirebio.io/literature/?q=a%26b&kind=model&q=%CE%B2"), { ASSETS: assets });
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("https://benchmarks.rewirebio.io/?kind=result&origin=literature&q=a%26b&kind=model&q=%CE%B2");
  });
  it("serves result and evaluation details entirely from the frontend", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const local = { fetch: vi.fn(async () => new Response("current detail")) };
    for (const route of ["/database/result/example/", "/database/evaluation/example/"]) {
      expect(isProxied(route)).toBe(false);
      expect(await (await worker.fetch(new Request(`https://example.test${route}`), { ASSETS: local })).text()).toBe("current detail");
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("keeps unknown routes as genuine 404s with no fallback origin", async () => {
    vi.stubGlobal("fetch", vi.fn());
    expect(isProxied("/api-copy/private")).toBe(false);
    expect((await worker.fetch(new Request("https://example.test/missing/"), { ASSETS: assets })).status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("never fetches missing content-addressed chunks from another service", async () => {
    vi.stubGlobal("fetch", vi.fn());
    expect((await worker.fetch(new Request("https://example.test/_next/static/chunks/missing.js"), { ASSETS: assets })).status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("preserves authenticated POST and query bytes through direct Functions requests", async () => {
    const fetcher = vi.fn(async () => new Response("{}", { headers: { "cache-control": "public,max-age=600", "cdn-cache-control": "max-age=600" } }));
    vi.stubGlobal("fetch", fetcher);
    const response = await worker.fetch(new Request("https://benchmarks.rewirebio.io/api/trpc/submission.create?x=a%26b&x=2", { method: "POST", headers: { authorization: "Bearer example", cookie: "example=1", "content-type": "application/json" }, body: '{"example":true}' }), { ASSETS: assets });
    const [upstream, options] = fetcher.mock.calls[0] as any;
    expect(upstream.url).toBe("https://europe-west2-rewire-it.cloudfunctions.net/contributions/api/trpc/submission.create?x=a%26b&x=2");
    expect(upstream.method).toBe("POST");
    expect(upstream.headers.get("authorization")).toBe("Bearer example");
    expect(upstream.headers.get("cookie")).toBe("example=1");
    expect(await upstream.text()).toBe('{"example":true}');
    expect(options.redirect).toBe("manual");
    expect(options.cf.cacheTtl).toBe(0);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.has("cdn-cache-control")).toBe(false);
  });
  it("retains Firebase Auth helpers without relying on the website Hosting deployment", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 302, headers: { location: "https://rewire-it.firebaseapp.com/__/auth/handler?state=one" } }));
    vi.stubGlobal("fetch", fetcher);
    const response = await worker.fetch(new Request("https://example.test/__/auth/handler?state=one"), { ASSETS: assets });
    expect((fetcher.mock.calls[0] as any)[0].url).toBe("https://rewire-it.firebaseapp.com/__/auth/handler?state=one");
    expect(response.headers.get("location")).toBe("https://example.test/__/auth/handler?state=one");
  });
  it("does not follow external redirects carrying credentials", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 302, headers: { location: "https://external.test/target" } }));
    vi.stubGlobal("fetch", fetcher);
    const response = await worker.fetch(new Request("https://example.test/api/trpc/submission.create", { headers: { authorization: "Bearer token" } }), { ASSETS: assets });
    expect(response.headers.get("location")).toBe("https://external.test/target");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect((fetcher.mock.calls[0] as any)[1].redirect).toBe("manual");
  });
  it("stages all detail pages and excludes only API/auth/data archive", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "database-cf-test-"));
    try {
      for (const name of ["index.html", "404.html", "database/model/example/index.html", "database/result/example/index.html", "database/evaluation/example/index.html", "omics/records.csv"]) {
        await mkdir(path.dirname(path.join(root, "out", name)), { recursive: true });
        await writeFile(path.join(root, "out", name), name);
      }
      const inventory = await prepareCloudflare(root);
      expect(inventory.static_files).toBe(6);
      expect(inventory.asset_limit).toBe(20000);
      await expect(readFile(path.join(root, ".cloudflare/assets/omics/records.csv"))).rejects.toThrow();
      for (const type of ["result", "evaluation"]) expect(await readFile(path.join(root, `.cloudflare/assets/database/${type}/example/index.html`), "utf8")).toBe(`database/${type}/example/index.html`);
      await expect(prepareCloudflare(root, { assetLimit: "999999" })).rejects.toThrow("must be 20000 or 100000");
      expect((await prepareCloudflare(root, { assetLimit: "100000" })).asset_limit).toBe(100000);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
