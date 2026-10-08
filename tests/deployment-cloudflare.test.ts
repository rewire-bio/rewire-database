import { describe, expect, it, vi } from "vitest";
import { edgeConfig, frontendOrigin, publishEdge } from "../scripts/deploy-cloudflare.mjs";

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
    await publishEdge({ config, frontend: "https://rewire-database-web-x-nw.a.run.app", deployWorker: true, acceptance: "core", run, fetchImpl: fetchImpl as never });
    expect(commands).toEqual([
      ["npx", "--no-install", "wrangler", "deploy", "--var", "FRONTEND_ORIGIN:https://rewire-database-web-x-nw.a.run.app"],
      ["node", "scripts/smoke-deployment.mjs", "https://example.test", "--independent-frontend"],
      ["node", "scripts/check-cloudflare-ranges.mjs", "https://example.test"],
      ["node", "scripts/check-live-catalogue.mjs", "https://example.test", "--website", "--independent-frontend", "--acceptance=core"],
    ]);
  });
  it("leaves an unchanged Worker alone and still verifies through it", async () => {
    const { commands, run, fetchImpl } = setup();
    await publishEdge({ config, frontend: "https://x.a.run.app", deployWorker: false, acceptance: "full", run, fetchImpl: fetchImpl as never });
    expect(commands.some((args) => args.includes("wrangler"))).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(commands.at(-1)).toContain("--acceptance=full");
  });
  it("restores the previous Worker version when acceptance fails after a Worker deploy", async () => {
    const { run, fetchImpl } = setup("scripts/check-live-catalogue.mjs");
    await expect(publishEdge({ config, frontend: "https://x.a.run.app", deployWorker: true, acceptance: "core", run, fetchImpl: fetchImpl as never }))
      .rejects.toThrow("previous Worker version restored");
    expect(JSON.parse(fetchImpl.mock.calls[1][1]!.body as string)).toEqual({ strategy: "percentage", versions });
  });
  it("only proxies to a run.app HTTPS origin", () => {
    expect(() => frontendOrigin("https://example.test")).toThrow();
    expect(() => frontendOrigin("http://x.a.run.app")).toThrow();
    expect(frontendOrigin("https://x.a.run.app/")).toBe("https://x.a.run.app");
  });
});
