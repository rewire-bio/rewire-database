import { describe, expect, it, vi } from "vitest";
import { smokeDeployment } from "../scripts/smoke-deployment.mjs";

const release = "2026-10-06-161b59a1d02c";
function fixture(breakPath?: string) {
  return vi.fn(async (input: Parameters<typeof fetch>[0]) => {
    const url = new URL(input instanceof Request ? input.url : input);
    const path = url.pathname;
    if (path === breakPath) return new Response("Unavailable", { status: 503 });
    if (path.startsWith("/api/")) {
      const input = JSON.parse(url.searchParams.get("input")!);
      return Response.json({ result: { data: { release_id: release, items: [{ kind: input.kind, name: input.kind === 'model' ? 'AlphaGenome' : 'Example benchmark', id: `${input.kind}-example` }] } } });
    }
    if (path.endsWith("manifest.json")) return Response.json({ release_id: release });
    if (path.endsWith("records.csv")) return new Response(null, { headers: { "content-type": "text/csv", "content-length": "100" } });
    if (path.endsWith(".js")) return new Response("/* bundle */", { headers: { "content-type": "text/javascript" } });
    return new Response(`<h1>Database</h1><input id="catalogue-search"><div id="downloads"></div><script src="/_next/static/main.js"></script><a href="/omics/releases/${release}/manifest.json">Manifest</a><section id="question"></section><section id="evidence"></section><section id="gaps"></section><section id="sources"></section><details><summary>Results</summary></details>`, { headers: { "content-type": "text/html" } });
  });
}
describe("read-only deployment smoke", () => {
  it("checks route HTML, JavaScript, download, search/filter APIs and detail pages", async () => {
    const request = fixture();
    await smokeDeployment("https://example.test", { request, log: vi.fn() });
    expect(request).toHaveBeenCalledTimes(13);
    const urls = request.mock.calls.map(([input]) => new URL(input instanceof Request ? input.url : input));
    expect(urls.every(url => url.origin === "https://example.test")).toBe(true);
    const api = urls.filter(url => url.pathname.startsWith("/api/"));
    expect(JSON.parse(api[0].searchParams.get("input")!)).toMatchObject({ q: "AlphaGenome", kind: "model", release_id: release });
    expect(JSON.parse(api[1].searchParams.get("input")!)).toMatchObject({ kind: "benchmark", release_id: release });
  });
  it("fails when a core route is unavailable", async () => {
    await expect(smokeDeployment("https://example.test", { request: fixture("/models/"), log: vi.fn() })).rejects.toThrow("HTTP 503");
  });
  it("fails when the API returns no known model", async () => {
    const normal = fixture();
    const request = async (input: Parameters<typeof fetch>[0]) => new URL(input instanceof Request ? input.url : input).pathname.startsWith("/api/")
      ? Response.json({ result: { data: { release_id: release, items: [] } } }) : normal(input);
    await expect(smokeDeployment("https://example.test", { request, log: vi.fn() })).rejects.toThrow("Known model search");
  });
  it.each([
    ['manifest', 'Manifest and HTML release must match'],
    ['search', 'unrelated records'],
    ['filter', 'Benchmark filter was ignored'],
    ['download', 'HTML fallback'],
  ])("rejects a broken %s contract", async (scenario, message) => {
    const normal = fixture();
    const request = async (input: Parameters<typeof fetch>[0]) => {
      const url = new URL(input instanceof Request ? input.url : input);
      if (scenario === 'manifest' && url.pathname.endsWith('manifest.json')) return Response.json({ release_id: 'different-release' });
      if (scenario === 'download' && url.pathname.endsWith('records.csv')) return new Response('', { headers: { 'content-type': 'text/html' } });
      const response = await normal(input);
      if (url.pathname.startsWith('/api/')) {
        const body = await response.json();
        if (scenario === 'search') body.result.data.items[0].name = 'Unrelated model';
        if (scenario === 'filter' && body.result.data.items[0].kind === 'benchmark') body.result.data.items[0].kind = 'model';
        return Response.json(body);
      }
      return response;
    };
    await expect(smokeDeployment('https://example.test', { request, log: vi.fn() })).rejects.toThrow(message);
  });
});
