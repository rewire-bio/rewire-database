import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { checkLiveCatalogue } from "../scripts/check-live-catalogue.mjs";

// Synthetic transport fixtures. No public API or contribution endpoint is contacted.
function fixture(profile = "core", corrupt = "", independent = false) {
  const release_id = "2026-10-07-aaaaaaaaaaaa", input_sha256 = "b".repeat(64);
  const brca = {id: "brca", slug: "brca1-brca2-germline-interpretation", title: "BRCA"};
  const other = {id: "other", slug: "other", title: "Other"};
  const mapping = {id: "mapping", use_case_id: "brca", lifecycle: "active", relevance: "proxy", protocol_id: "protocol", evaluation_ids: ["evaluation"]};
  const useCases = {release_id, input_sha256, use_cases: [brca, other], mappings: [mapping]};
  const artifact = Buffer.from(JSON.stringify(useCases));
  const source = Buffer.from("Reviewed source");
  const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
  const manifest = {release_id, counts: {model: 2}, coverage: {use_cases: {input_sha256}, use_case_sources: [{sha256:hash(source)}]}, files: {"use-cases.json":hash(artifact)}};
  const bytes = Buffer.from(JSON.stringify(manifest));
  const lock = {repository:"rewire-bio/rewire-benchmark-data",revision:"c".repeat(40),manifest_sha256:"d".repeat(64),release_id};
  const locations = {...lock,groups:[{destination:`/omics/releases/${release_id}`,source:`data/omics/releases/${release_id}`,files:["use-cases.json"]},{destination:"/omics/sources",source:"website/files/public/omics/sources",files:[`${hash(source)}.md`]}]};
  const rawBase = `https://raw.githubusercontent.com/${lock.repository}/${lock.revision}/`;
  const requests: string[] = [];
  const row = {result:{id:"b2-barcodebert-2026"}, models:[{id:"model",name:"BarcodeBERT"}], evaluation:{id:"evaluation"}, benchmarks:[{}], datasets:[{}], sources:[{}], review_status:"source_checked"};
  const fetchImpl = vi.fn(async (url: string) => {
    const parsed = new URL(url); const endpoint = parsed.pathname.split(".").at(-1)!;
    requests.push(parsed.pathname + (parsed.searchParams.get("input") || ""));
    if (parsed.pathname.startsWith("/api/")) {
      const input = JSON.parse(parsed.searchParams.get("input")!);
      let data: any;
      switch (endpoint) {
        case "release": data={record_count:2}; break;
        case "list": data={items:[{},{}]}; break;
        case "get": data=input.id==="discovery-benchmark-nabench" ? {record:{id:input.id},published_comparisons:[{}],comparison_options:Array.from({length:41},(_,i)=>({id:String(i)})),aggregate_comparisons:[]} : {record:{id:input.id,attributes:{printed_value:"78.5"}}}; break;
        case "comparison": data={panel:{rows:[{},{}]}}; break;
        case "results": data={total:1,items:[row]}; break;
        case "evidence": data={items:[{field_path:"attributes.printed_value",value:"78.5",source_locator:"Table 1",review_status:"source_checked"}]}; break;
        case "useCases": data={input_sha256,total:2,items:input.limit===1 ? [brca] : [brca,other],next_cursor:null}; break;
        case "useCase": data={input_sha256,use_case:input.slug===brca.slug ? brca : other,evaluations_total:input.slug===brca.slug ? 1 : 0,evaluations_next_cursor:null,mappings:input.slug===brca.slug ? [{...mapping,evaluations:[{evaluation:{id:"evaluation"},results:[{id:"first"}],results_total:2,results_next_cursor:"next",configurations:[{id:"config"}]}]}] : []}; break;
        case "useCaseEvaluationResults": data={input_sha256,items:[{id:"second"}],next_cursor:null}; break;
        case "useCaseLinks": data={input_sha256,items:corrupt==="links" ? [] : [{mapping_id: "mapping",slug:brca.slug,configuration_ids:["config"]}]}; break;
        default: throw Error(`Unexpected API ${endpoint}`);
      }
      return new Response(JSON.stringify({result:{data:{release_id:corrupt==="release" ? "wrong" : release_id,...data}}}),{headers:{"content-type":"application/json"}});
    }
    if (independent && parsed.pathname === "/deployment.json") return Response.json({schema:4,release_id,producer_repository:lock.repository,producer_revision:corrupt==="producer" ? "wrong" : lock.revision});
    if (independent && parsed.hostname === "raw.githubusercontent.com") return new Response(gzipSync(corrupt === "artifact" ? Buffer.from("altered") : parsed.pathname.endsWith(".md.gz") ? source : artifact));
    if (independent && parsed.pathname.startsWith("/omics/")) return new Response(null, {status:302,headers:{location:corrupt==="redirect" ? "https://evil.example/export.gz" : rawBase + (parsed.pathname.includes("/sources/") ? "website/files/public" + parsed.pathname + ".gz" : "data" + parsed.pathname + ".gz")}});
    if(parsed.pathname==="/release-manifest.json" || parsed.pathname==="/omics/manifest.json") return new Response(corrupt==="manifest" ? JSON.stringify({...manifest,counts:{model:3}}) : bytes);
    if(parsed.pathname.endsWith("use-cases.json")) return new Response(corrupt==="artifact" ? Buffer.from("altered") : artifact);
    if(parsed.pathname.startsWith("/omics/sources/")) return new Response(source);
    return new Response(`${release_id} ${input_sha256} /use-cases/${brca.slug}/ /use-cases/other/`);
  });
  const verifyGate=vi.fn(async()=>{});
  const run=()=>checkLiveCatalogue({args:["https://example.test",...(profile === "default" ? [] : [`--acceptance=${profile}`]),"--website","--contributions=disabled",...(independent ? ["--independent-frontend"] : [])], read:vi.fn(async(path:URL)=>path.pathname.endsWith("benchmark-data.lock.json") ? JSON.stringify(lock) : path.pathname.endsWith("generated-download-locations.json") ? JSON.stringify(locations) : path.pathname.endsWith("manifest.json") ? bytes : artifact) as any,fetchImpl,verifyGate});
  return {run,requests,verifyGate,release_id};
}

describe("deployment live acceptance profiles",()=>{
  it("keeps core release, result, chart, evidence, BRCA, contribution and exact static-artifact checks bounded",async()=>{
    const f=fixture(); await f.run();
    const api=f.requests.filter(path=>path.startsWith("/api/"));
    expect(api).toHaveLength(11);
    expect(api.some(path=>path.includes("catalogue.comparison"))).toBe(true);
    expect(api.some(path=>path.includes("catalogue.evidence"))).toBe(true);
    expect(api.some(path=>path.includes('"slug":"brca1-brca2-germline-interpretation"'))).toBe(true);
    expect(api.some(path=>path.includes('"id":"protocol"'))).toBe(true);
    expect(api.some(path=>path.includes("useCaseEvaluationResults"))).toBe(false);
    expect(f.requests.some(path=>path.startsWith("/omics/sources/"))).toBe(false);
    expect(f.requests).not.toContain("/use-cases/other/");
    expect(f.requests).toContain(`/omics/releases/${f.release_id}/use-cases.json`);
    expect(f.requests).toContain("/omics/manifest.json");
    expect(f.verifyGate).toHaveBeenCalledWith("https://example.test",expect.objectContaining({mode:"disabled",releaseId:f.release_id}));
  });
  it.each(["full", "default"])("retains exhaustive evaluation result/configuration and source traversal in %s mode",async(profile)=>{
    const f=fixture(profile); await f.run();
    expect(f.requests.some(path=>path.includes("useCaseEvaluationResults"))).toBe(true);
    expect(f.requests.some(path=>path.includes('"id":"config"'))).toBe(true);
    expect(f.requests.some(path=>path.startsWith("/omics/sources/"))).toBe(true);
    expect(f.requests).toContain("/use-cases/other/");
  });
  it.each(["manifest","artifact","release","links"])("rejects a core %s mismatch instead of accepting a partial deployment",async(corrupt)=>{
    await expect(fixture("core",corrupt).run()).rejects.toThrow();
  });
  it("rejects an unknown profile before reading data or querying services",async()=>{
    const f=fixture("quick");await expect(f.run()).rejects.toThrow("Unknown live acceptance profile");expect(f.requests).toEqual([]);
  });
});

describe("independent frontend live acceptance", () => {
  it("verifies root metadata and exact gzip GitHub artifacts against original scientific checksums", async () => {
    const f = fixture("full", "", true); await f.run();
    expect(f.requests).toContain("/release-manifest.json");
    expect(f.requests).toContain("/deployment.json");
    expect(f.requests).not.toContain("/omics/manifest.json");
    expect(f.requests.some(path => path.endsWith("use-cases.json.gz"))).toBe(true);
    expect(f.requests.some(path => path.endsWith(".md.gz"))).toBe(true);
  });
  it.each(["manifest", "producer", "artifact", "redirect"])("rejects independent %s drift", async (corrupt) => {
    await expect(fixture("core", corrupt, true).run()).rejects.toThrow();
  });
});
