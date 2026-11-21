import { describe, expect, it, vi } from "vitest";
import { awaitWorkerRouting, edgeConfig, frontendOrigin, publishEdge } from "../scripts/deploy-cloudflare.mjs";

const config = edgeConfig({ CLOUDFLARE_ACCOUNT_ID: "test", CLOUDFLARE_API_TOKEN: "token", CLOUDFLARE_PUBLIC_ORIGIN: "https://example.test" });
const versions = [{ version_id: "previous", percentage: 100 }];
function setup(failure = "") {
  const commands: string[][] = [];
  const run = vi.fn(async (args: string[]) => { commands.push(args); if (args.includes(failure)) throw Error(failure); return ""; });
  const fetchImpl = vi.fn(async (_url: string, _options?: RequestInit) => new Response(JSON.stringify({ success: true, result: { deployments: [{ versions }] } })));
  return { commands, run, fetchImpl };
}

describe("Cloudflare publication acceptance", () => {
  it("deploys the Worker with the frontend's run.app origin, then runs public acceptance", async () => {
    const { commands, run, fetchImpl } = setup();
    await publishEdge({ config, frontend: "https://rewire-database-web-x-nw.a.run.app", deployWorker: true, acceptance: "core", run, fetchImpl: fetchImpl as never, awaitRouting: async () => {} });
    expect(commands).toEqual([
      ["npx", "--no-install", "wrangler", "deploy", "--var", "FRONTEND_ORIGIN:https://rewire-database-web-x-nw.a.run.app"],
      ["node", "scripts/smoke-deployment.mjs", "https://example.test", "--independent-frontend"],
      ["node", "scripts/check-cloudflare-ranges.mjs", "https://example.test"],
      ["node", "scripts/check-live-catalogue.mjs", "https://example.test", "--website", "--independent-frontend", "--acceptance=core"],
    ]);
  });
  it("leaves an unchanged Worker alone and still verifies through it", async () => {
    const { commands, run, fetchImpl } = setup();
    await publishEdge({ config, frontend: "https://x.a.run.app", deployWorker: false, acceptance: "full", run, fetchImpl: fetchImpl as never, awaitRouting: async () => {} });
    expect(commands.some((args) => args.includes("wrangler"))).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(commands.at(-1)).toContain("--acceptance=full");
  });
  it("restores the previous Worker version when acceptance fails after a Worker deploy", async () => {
    const { run, fetchImpl } = setup("scripts/check-live-catalogue.mjs");
    await expect(publishEdge({ config, frontend: "https://x.a.run.app", deployWorker: true, acceptance: "core", run, fetchImpl: fetchImpl as never, awaitRouting: async () => {} }))
      .rejects.toThrow("previous Worker version restored");
    expect(JSON.parse(fetchImpl.mock.calls[1][1]!.body as string)).toEqual({ strategy: "percentage", versions });
  });
  it("only proxies to a run.app HTTPS origin", () => {
    expect(() => frontendOrigin("https://example.test")).toThrow();
    expect(() => frontendOrigin("http://x.a.run.app")).toThrow();
    expect(frontendOrigin("https://x.a.run.app/")).toBe("https://x.a.run.app");
  });
  it("waits for consecutive answers of both public APIs from the frontend before acceptance", async () => {
    const frontend = (status: number) => new Response("{}", { status, headers: status === 200 ? { "x-rewire-frontend": "a".repeat(40) } : {} });
    // Rounds: both routed twice, then the catalogue API fails once, then all routed.
    const catalogue = [200, 200, 404];
    const fetchImpl = vi.fn(async (url: string) => frontend(url.includes("/api/trpc/") ? catalogue.shift() ?? 200 : 200));
    await awaitWorkerRouting("https://example.test", { fetchImpl: fetchImpl as never, required: 3, sleep: async () => {} });
    const paths = fetchImpl.mock.calls.map(([url]) => new URL(url).pathname);
    expect(paths.filter((path) => path === "/api/trpc/catalogue.release").length).toBe(6);
    // The JSON API index is asked without a query, and only when the catalogue answer was routed.
    expect(fetchImpl.mock.calls.map(([url]) => url).filter((url) => new URL(url).pathname === "/api/v1/")).toEqual(Array(5).fill("https://example.test/api/v1/"));
    // A Worker from before /api/v1 sends it to Firebase: catalogue answers alone never pass.
    const previous = vi.fn(async (url: string) => (url.includes("/api/v1/") ? new Response("Not found", { status: 404 }) : frontend(200)));
    await expect(awaitWorkerRouting("https://example.test", { fetchImpl: previous as never, required: 3, timeoutMs: 0, sleep: async () => {} }))
      .rejects.toThrow("did not route");
    const firebase = vi.fn(async () => new Response("{}", { status: 200 }));
    await expect(awaitWorkerRouting("https://example.test", { fetchImpl: firebase as never, required: 3, timeoutMs: 0, sleep: async () => {} }))
      .rejects.toThrow("did not route");
  });
});
