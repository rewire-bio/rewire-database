import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const releaseId = "2026-10-12-cba623554ce3";
vi.mock("@/lib/data-pin", () => ({ dataPin: () => ({ release_id: releaseId }) }));
// The route adds the release's leaderboards; this release id has no file here, so it has none.
vi.mock("@/lib/release-leaderboard", () => ({ allUseCaseLeaderboards: () => [] }));
const nav = vi.hoisted(() => ({ path: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.path }));

import { agentGuide, claudeMcpAdd, discrepancyApi, examplePrompts, kgArchiveUrl, mcpJson, pluginCommands, rerunPrompt, KG_ALIAS, RDF_KG_MCP_VERSION } from "../lib/agent-connect";
import { generateAgentsMd } from "../lib/llm-discoverability";
import AgentsPage from "../app/agents/page";
import AgentConnect from "../components/AgentConnect";
import { GET as kgRedirect } from "../app/agents/kg.tar.gz/route";
import { GET as llms } from "../app/llms.txt/route";

describe("connect your agent", () => {
  it("installs the plugin and the knowledge-graph server from one set of commands", () => {
    expect(pluginCommands).toEqual(["/plugin marketplace add rewire-bio/rewire-benchmarks", "/plugin install bio-model-benchmarks@rewire-benchmarks"]);
    expect(claudeMcpAdd()).toBe(`claude mcp add rewire-benchmark-graph -- uvx --from git+https://github.com/rewire-bio/rdf-kg-mcp@${RDF_KG_MCP_VERSION} rdf-kg-mcp serve ${KG_ALIAS}`);
    expect(JSON.parse(mcpJson()).mcpServers["rewire-benchmark-graph"].args.at(-1)).toBe(KG_ALIAS);
    expect(kgArchiveUrl(releaseId)).toBe(`https://github.com/rewire-bio/rewire-benchmark-data/releases/download/kg/${releaseId}/kg-${releaseId}.tar.gz`);
    expect(rerunPrompt("mfass-v2-baseline", "mfass-v2")).toContain("run recipe mfass-v2-baseline (protocol mfass-v2)");
  });

  it("takes the rdf-kg-mcp version from one constant on the page and in both text guides", () => {
    expect(RDF_KG_MCP_VERSION).toMatch(/^v\d+\.\d+\.\d+$/);
    const texts = [renderToStaticMarkup(<AgentsPage />), agentGuide(releaseId), generateAgentsMd(releaseId)];
    for (const text of texts) {
      const pins = [...text.matchAll(/rdf-kg-mcp@([^\s"&<]+)/g)].map((match) => match[1]);
      expect(pins.length).toBeGreaterThan(0);
      expect(new Set(pins)).toEqual(new Set([RDF_KG_MCP_VERSION]));
    }
  });

  it("describes the plugin as it is: a local CPU rerun, and no tool that submits a result", () => {
    const page = renderToStaticMarkup(<AgentsPage />);
    expect(page).toContain("three MCP servers (the knowledge graph, genomic data and the rewirebench runner), five skills, six commands and a benchmarking agent");
    expect(page).toContain("No tool in the plugin submits a result to the database.");
    expect(page).not.toMatch(/reproduce/i);
    expect(examplePrompts.join(" ")).not.toMatch(/reproduce/i);
    const guide = agentGuide(releaseId);
    expect(guide).toContain("No tool in the plugin submits a result to the database.");
    expect(guide).not.toContain("explicit consent");
    // The page says what it can vouch for: nothing goes to Rewire. It makes no wider claim.
    expect(guide).toContain("Your model and data are not sent to Rewire.");
    expect(guide).not.toContain("not sent anywhere");
    expect(page).toContain("The one full-protocol recipe that ships today");
  });

  it("says which skills need the servers the single MCP entry does not add", () => {
    const page = renderToStaticMarkup(<AgentsPage />);
    expect(Object.keys(JSON.parse(mcpJson()).mcpServers)).toEqual(["rewire-benchmark-graph"]);
    expect(page).toContain("This entry adds the knowledge graph only.");
    expect(page).toContain("plugins/bio-model-benchmarks/.mcp.json");
  });

  it("names release_id wherever it describes a public API call, since the API refuses a call without it", () => {
    const page = renderToStaticMarkup(<AgentsPage />);
    const guide = agentGuide(releaseId);
    for (const procedure of discrepancyApi(releaseId)) {
      expect(procedure.input).toMatch(/^release_id \(required/);
      expect(procedure.example.release_id).toBe(releaseId);
      expect(guide).toContain(`${procedure.name}: ${procedure.input}`);
    }
    expect(page).toContain(`release_id (required: ${releaseId}, the release this site serves)`);
    const calls = [...generateAgentsMd(releaseId).matchAll(/GET (\/api\/trpc\/catalogue\.\w+)(\?input=(\{[^`]*\}))?`/g)];
    expect(calls.length).toBeGreaterThanOrEqual(5);
    for (const [, path, , input] of calls)
      if (!path.endsWith("catalogue.release")) expect(JSON.parse(input).release_id).toBe(releaseId);
  });

  it("redirects the stable bundle address to the release this revision serves", () => {
    const response = kgRedirect();
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(kgArchiveUrl(releaseId));
  });

  it("serves the same commands as plain text for agents", async () => {
    const text = await llms().text();
    expect(text).toBe(agentGuide(releaseId));
    for (const line of [...pluginCommands, claudeMcpAdd(), kgArchiveUrl(releaseId)]) expect(text).toContain(line);
    expect(text).not.toContain("re-checked against new publications every month");
    expect(text).toContain("Every figure links to the published source it was taken from.");
  });

  it("shows the plugin install on the home page box", () => {
    const markup = renderToStaticMarkup(<AgentConnect />);
    for (const line of pluginCommands) expect(markup).toContain(line);
    expect(markup).toContain('href="/agents/"');
    expect(markup).toContain("Copy the install commands");
  });
});

describe("agent strip on the browse pages", () => {
  it("shows on the browse pages only", async () => {
    const { default: AgentConnectStrip, AGENT_STRIP_PATHS } = await import("../components/AgentConnectStrip");
    const render = (path: string) => { nav.path = path; return renderToStaticMarkup(<AgentConnectStrip />); };
    for (const path of AGENT_STRIP_PATHS) expect(render(path)).toContain("/plugin install bio-model-benchmarks@rewire-benchmarks");
    expect(render("/use-cases")).toContain("Connect your agent");
    for (const path of ["/", "/agents/", "/use-cases/cnv-detection-characterisation/", "/database/model/x/"]) expect(render(path)).toBe("");
  });
});
