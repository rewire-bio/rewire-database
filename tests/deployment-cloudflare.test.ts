import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
const state = vi.hoisted(() => ({ plan: {} as any, commands: [] as string[][], failure: "" }));
vi.mock("../scripts/assert-not-smoke-export.mjs",()=>({assertNotSmokeExport:vi.fn()}));
vi.mock("node:fs/promises",async(original)=>({...(await original<object>()),readFile:vi.fn(async()=>JSON.stringify(state.plan))}));
vi.mock("node:child_process",async(original)=>({...(await original<object>()),spawn:vi.fn((command:string,args:string[])=>{
  state.commands.push([command,...args]);
  const child=new EventEmitter();queueMicrotask(()=>child.emit("exit",args.includes(state.failure) ? 1 : 0));return child;
})}));
const fingerprints={data:"a".repeat(64),backend:"b".repeat(64),hosting:"c".repeat(64)};
const receipt={schema:2,producer_repository:"rewire-bio/rewire-benchmark-data",producer_revision:"1".repeat(40),commit:"d".repeat(40),release_id:"2026-10-07-aaaaaaaaaaaa",manifest_sha256:"e".repeat(64),fingerprints};
const versions=[{version_id:"previous",percentage:100}];
let fetcher: Mock<[string, RequestInit?], Promise<Response>>;
beforeEach(()=>{
  vi.resetModules();state.commands=[];state.failure="";
  state.plan={mode:"web",backend:false,fingerprints,previous:receipt};
  vi.stubEnv("CLOUDFLARE_ACCOUNT_ID","test");vi.stubEnv("CLOUDFLARE_API_TOKEN","test-token");vi.stubEnv("CLOUDFLARE_PUBLIC_ORIGIN","https://example.test");
  fetcher=vi.fn(async(_url: string, _options?: RequestInit)=>new Response(JSON.stringify({success:true,result:{deployments:[{versions}]}})));
  vi.stubGlobal("fetch",fetcher);
});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
describe("Cloudflare publication acceptance",()=>{
  it("uses the checked UI-only plan for core acceptance with independent frontend checks",async()=>{
    await import("../scripts/deploy-cloudflare.mjs");
    expect(state.commands).toEqual([
      ["npx","--no-install","wrangler","deploy"],
      ["node","scripts/smoke-deployment.mjs","https://example.test","--independent-frontend"],
      ["node","scripts/check-cloudflare-ranges.mjs","https://example.test"],
      ["node","scripts/check-live-catalogue.mjs","https://example.test","--website","--independent-frontend","--acceptance=core"],
    ]);
  });
  it.each([{backend:true},{mode:"full"},{fingerprints:{...fingerprints,backend:"f".repeat(64)}}])("keeps full acceptance for backend/data or inconsistent plans (%j)",async(change)=>{
    state.plan={...state.plan,...change}; await import("../scripts/deploy-cloudflare.mjs");
    expect(state.commands.at(-1)).toContain("--acceptance=full");
  });
  it("restores the previous Worker version when core acceptance fails",async()=>{
    state.failure="scripts/check-live-catalogue.mjs";
    await expect(import("../scripts/deploy-cloudflare.mjs")).rejects.toThrow("previous Worker version restored");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetcher.mock.calls[1][1]!.body as string)).toEqual({strategy:"percentage",versions});
  });
});
