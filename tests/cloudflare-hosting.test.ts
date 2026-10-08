import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import ts from "typescript";
import worker, { UPSTREAM_FETCH, resetObservedIdentity } from "../cloudflare/worker.mjs";
import { isProxied } from "../cloudflare/routing.mjs";
import { cacheableRequest, storableResponse } from "../cloudflare/page-cache.mjs";

const ORIGIN = "https://rewire-database-web-abc123-nw.a.run.app";
const env = { FRONTEND_ORIGIN: `${ORIGIN}/` };
const FRONTEND = "c".repeat(40);
const RELEASE = "2026-10-07-1448159e6a81";
const identity = { frontend: FRONTEND, release: RELEASE };
const page = (body = "<h1>page</h1>", headers: Record<string, string> = {}, status = 200) => new Response(body, { status, headers: {
  "content-type": "text/html; charset=utf-8", "cache-control": "private, no-cache, no-store, max-age=0, must-revalidate",
  "x-rewire-frontend": FRONTEND, "x-rewire-data-release": RELEASE, "x-rewire-edge-cache": "public", ...headers,
} });
let store: Map<string, Response>;
beforeEach(() => {
  resetObservedIdentity();
  store = new Map();
  vi.stubGlobal("caches", { default: {
    match: vi.fn(async (key: Request) => store.get(key.url)?.clone()),
    put: vi.fn(async (key: Request, response: Response) => { store.set(key.url, response); }),
  } });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("Worker deployment configuration", () => {
  it("explicitly turns Cloudflare's outer Worker cache off, so the gateway runs on every request", () => {
    // Wrangler uploads `cache` only when the config sets it. TypeScript's JSONC
    // reader (a declared dependency) parses the file without loading Wrangler.
    const { config: rawConfig, error } = ts.parseConfigFileTextToJson("wrangler.jsonc", fs.readFileSync("wrangler.jsonc", "utf8"));
    expect(error).toBeUndefined();
    expect(rawConfig.cache).toEqual({ enabled: false });
    expect(rawConfig.main).toBe("cloudflare/worker.mjs");
    expect(rawConfig.vars).toHaveProperty("FRONTEND_ORIGIN");
    expect(rawConfig).not.toHaveProperty("assets");
  });
});

describe("independent Cloudflare frontend", () => {
  it("forwards known download paths to the frontend's exact-manifest redirect without credentials", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 307, headers: { location: "https://raw.githubusercontent.com/rewire-bio/rewire-benchmark-data/a/x.csv.gz" } }));
    vi.stubGlobal("fetch", fetcher);
    const response = await worker.fetch(new Request("https://benchmarks.rewirebio.io/omics/releases/id/records.csv?v=1", { headers: { cookie: "a=1", authorization: "Bearer x", range: "bytes=1-2" } }), env);
    const [upstream] = fetcher.mock.calls[0] as unknown as [Request];
    expect(upstream.url).toBe(`${ORIGIN}/omics/releases/id/records.csv?v=1`);
    expect(upstream.headers.has("cookie")).toBe(false);
    expect(upstream.headers.has("authorization")).toBe(false);
    expect(upstream.headers.get("range")).toBe("bytes=1-2");
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("raw.githubusercontent.com");
  });
  it("always reaches the frontend origin past Cloudflare's CDN cache", async () => {
    const fetcher = vi.fn(async () => page());
    vi.stubGlobal("fetch", fetcher);
    for (const path of ["/", "/models/", "/omics/releases/id/records.csv", "/release-manifest.json", "/contribute/"])
      await worker.fetch(new Request(`https://benchmarks.rewirebio.io${path}`), env);
    expect(fetcher.mock.calls.length).toBe(5);
    for (const call of fetcher.mock.calls as unknown as [Request, RequestInit][]) expect(call[1]).toEqual({ redirect: "manual", cache: "no-store" });
    expect(UPSTREAM_FETCH).toEqual({ redirect: "manual", cache: "no-store" });
  });
  it.each([
    ["a download redirect", "/omics/releases/id/records.csv", 307],
    ["a literature download", "/benchmark-literature/results.csv", 307],
    ["a missing download", "/omics/releases/invented/records.csv", 404],
    ["the release manifest", "/release-manifest.json", 200],
    ["the publication receipt", "/deployment.json", 200],
    ["a contribution page", "/contribute/", 200],
  ])("serves %s as no-store even if the origin response looks cacheable", async (_name, path, status) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(status === 307 ? null : "{}", { status, headers: {
      "cache-control": "public, max-age=14400", "cdn-cache-control": "max-age=14400", "cloudflare-cdn-cache-control": "max-age=14400",
      ...(status === 307 ? { location: "https://raw.githubusercontent.com/rewire-bio/rewire-benchmark-data/a/x.csv.gz" } : {}),
    } })));
    const response = await worker.fetch(new Request(`https://benchmarks.rewirebio.io${path}`), env);
    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.has("cdn-cache-control")).toBe(false);
    expect(response.headers.has("cloudflare-cdn-cache-control")).toBe(false);
    if (status === 307) expect(response.headers.get("location")).toBe("https://raw.githubusercontent.com/rewire-bio/rewire-benchmark-data/a/x.csv.gz");
    expect(store.size).toBe(0);
  });
  it("leaves the origin's headers on public pages it does not cache", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => page("x", { "cache-control": "private, no-cache, no-store, max-age=0, must-revalidate" })));
    const response = await worker.fetch(new Request("https://benchmarks.rewirebio.io/models/", { headers: { cookie: "a=1" } }), env);
    expect(response.headers.get("cache-control")).toBe("private, no-cache, no-store, max-age=0, must-revalidate");
    expect(response.headers.get("x-rewire-cache")).toBe("BYPASS");
  });
  it("never forwards download POST bodies", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const refused = await worker.fetch(new Request("https://example.test/omics/releases/id/records.csv", { method: "POST", body: "private" }), env);
    expect(refused.status).toBe(404);
    expect(refused.headers.get("cache-control")).toBe("no-store");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("preserves reviewed legacy redirects and repeated encoded query values", async () => {
    const response = await worker.fetch(new Request("https://benchmarks.rewirebio.io/literature/?q=a%26b&kind=model&q=%CE%B2"), env);
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("https://benchmarks.rewirebio.io/?kind=result&origin=literature&q=a%26b&kind=model&q=%CE%B2");
  });
  it("fails closed without a configured frontend origin", async () => {
    vi.stubGlobal("fetch", vi.fn());
    expect((await worker.fetch(new Request("https://example.test/"), { FRONTEND_ORIGIN: "" })).status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("renders on Cloud Run on a miss, then serves anonymous HTML from the edge under the origin's identity", async () => {
    const fetcher = vi.fn(async () => page());
    vi.stubGlobal("fetch", fetcher);
    const first = await worker.fetch(new Request("https://benchmarks.rewirebio.io/database/result/example/"), env);
    expect(first.headers.get("x-rewire-cache")).toBe("MISS");
    expect(first.headers.get("cache-control")).toBe("public, max-age=0, must-revalidate");
    const [key] = [...store.keys()];
    expect(key).toBe(`https://benchmarks.rewirebio.io/database/result/example/?__rewire_cache=${FRONTEND}.${RELEASE}`);
    const second = await worker.fetch(new Request("https://benchmarks.rewirebio.io/database/result/example/"), env);
    expect(second.headers.get("x-rewire-cache")).toBe("HIT");
    expect(await second.text()).toBe("<h1>page</h1>");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("keys a new frontend or data release separately; eviction only means a rerender", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => page()));
    await worker.fetch(new Request("https://benchmarks.rewirebio.io/"), env);
    const adopted = "2026-10-09-aaaaaaaaaaaa";
    vi.stubGlobal("fetch", vi.fn(async () => page("<h1>new</h1>", { "x-rewire-data-release": adopted })));
    resetObservedIdentity(); // the identity window has elapsed
    const response = await worker.fetch(new Request("https://benchmarks.rewirebio.io/"), env);
    expect(await response.text()).toBe("<h1>new</h1>");
    expect([...store.keys()].sort()).toEqual([
      `https://benchmarks.rewirebio.io/?__rewire_cache=${FRONTEND}.${adopted}`,
      `https://benchmarks.rewirebio.io/?__rewire_cache=${FRONTEND}.${RELEASE}`,
    ].sort());
  });
  it.each([
    ["cookies", { cookie: "session=1" }],
    ["authorization", { authorization: "Bearer token" }],
    ["RSC payloads", { rsc: "1" }],
    ["router prefetches", { "next-router-prefetch": "1" }],
    ["router state", { "next-router-state-tree": "%5B%5D" }],
    ["intercepted routes", { "next-url": "/database/" }],
  ])("bypasses the cache for %s", async (_name, headers) => {
    const fetcher = vi.fn(async () => page());
    vi.stubGlobal("fetch", fetcher);
    for (let i = 0; i < 2; i++) {
      const response = await worker.fetch(new Request("https://benchmarks.rewirebio.io/models/", { headers }), env);
      expect(response.headers.get("x-rewire-cache")).toBe("BYPASS");
    }
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(store.size).toBe(0);
  });
  it("bypasses _rsc requests, non-GET methods and private paths", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => page()));
    for (const request of [
      new Request("https://example.test/models/?_rsc=abc"),
      new Request("https://example.test/models/", { method: "HEAD" }),
      new Request("https://example.test/contribute/"),
      new Request("https://example.test/_analytics/"),
      new Request("https://example.test/deployment.json"),
      new Request("https://example.test/release-manifest.json"),
    ]) expect(cacheableRequest(request)).toBe(false);
    expect(cacheableRequest(new Request("https://example.test/models/"))).toBe(true);
  });
  it.each([
    ["no origin opt-in", page("x", { "x-rewire-edge-cache": "" })],
    ["an error", page("x", {}, 500)],
    ["a 404", page("x", {}, 404)],
    ["a Set-Cookie", page("x", { "set-cookie": "a=1" })],
    ["an RSC body", page("x", { "content-type": "text/x-component" })],
    ["JSON", page("x", { "content-type": "application/json" })],
    ["Vary: Cookie", page("x", { vary: "RSC, Cookie" })],
    ["Vary: *", page("x", { vary: "*" })],
    ["an unknown Vary field", page("x", { vary: "Accept-Language" })],
    ["another frontend", page("x", { "x-rewire-frontend": "d".repeat(40) })],
  ])("never stores a response with %s", (_name, response) => {
    expect(storableResponse(response, identity)).toBe(false);
  });
  it("stores Next's own navigation variation, which cache-eligible requests never carry", () => {
    expect(storableResponse(page("x", { vary: "RSC, Next-Router-State-Tree, Next-Router-Prefetch, Next-Url, Accept-Encoding" }), identity)).toBe(true);
  });
  it("still serves the page when the edge cache write fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => page()));
    vi.stubGlobal("caches", { default: { match: vi.fn(async () => undefined), put: vi.fn(async () => { throw new Error("cache unavailable"); }) } });
    const response = await worker.fetch(new Request("https://example.test/models/"), env);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("<h1>page</h1>");
  });
  it("stores immutable static assets with a long browser lifetime", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => page("js", { "content-type": "application/javascript; charset=UTF-8", "cache-control": "public, max-age=31536000, immutable" })));
    const response = await worker.fetch(new Request("https://example.test/_next/static/chunks/app.js"), env);
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(store.size).toBe(1);
  });
  it("rewrites origin redirects to the public host and never follows them", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 308, headers: { location: `${ORIGIN}/models/` } }));
    vi.stubGlobal("fetch", fetcher);
    const response = await worker.fetch(new Request("https://benchmarks.rewirebio.io/models"), env);
    expect(response.headers.get("location")).toBe("https://benchmarks.rewirebio.io/models/");
    expect((fetcher.mock.calls[0] as any)[1].redirect).toBe("manual");
  });
  it("keeps result and evaluation pages on the frontend, not the API", () => {
    for (const route of ["/database/result/example/", "/database/evaluation/example/", "/api-copy/private"]) expect(isProxied(route)).toBe(false);
  });
  it("preserves authenticated POST and query bytes through direct Functions requests", async () => {
    const fetcher = vi.fn(async () => new Response("{}", { headers: { "cache-control": "public,max-age=600", "cdn-cache-control": "max-age=600" } }));
    vi.stubGlobal("fetch", fetcher);
    const response = await worker.fetch(new Request("https://benchmarks.rewirebio.io/api/trpc/submission.create?x=a%26b&x=2", { method: "POST", headers: { authorization: "Bearer example", cookie: "example=1", "content-type": "application/json" }, body: '{"example":true}' }), env);
    const [upstream, options] = fetcher.mock.calls[0] as any;
    expect(upstream.url).toBe("https://europe-west2-rewire-it.cloudfunctions.net/contributions/api/trpc/submission.create?x=a%26b&x=2");
    expect(upstream.method).toBe("POST");
    expect(upstream.headers.get("authorization")).toBe("Bearer example");
    expect(upstream.headers.get("cookie")).toBe("example=1");
    expect(await upstream.text()).toBe('{"example":true}');
    expect(options).toEqual({ redirect: "manual", cache: "no-store" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.has("cdn-cache-control")).toBe(false);
    expect(store.size).toBe(0);
  });
  it("retains Firebase Auth helpers without relying on the website Hosting deployment", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 302, headers: { location: "https://rewire-it.firebaseapp.com/__/auth/handler?state=one" } }));
    vi.stubGlobal("fetch", fetcher);
    const response = await worker.fetch(new Request("https://example.test/__/auth/handler?state=one"), env);
    expect((fetcher.mock.calls[0] as any)[0].url).toBe("https://rewire-it.firebaseapp.com/__/auth/handler?state=one");
    expect(response.headers.get("location")).toBe("https://example.test/__/auth/handler?state=one");
  });
  it("does not follow external redirects carrying credentials", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 302, headers: { location: "https://external.test/target" } }));
    vi.stubGlobal("fetch", fetcher);
    const response = await worker.fetch(new Request("https://example.test/api/trpc/submission.create", { headers: { authorization: "Bearer token" } }), env);
    expect(response.headers.get("location")).toBe("https://external.test/target");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect((fetcher.mock.calls[0] as any)[1].redirect).toBe("manual");
  });
});
