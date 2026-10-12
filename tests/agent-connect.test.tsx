import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const releaseId = "2026-10-12-cba623554ce3";
vi.mock("@/lib/data-pin", () => ({ dataPin: () => ({ release_id: releaseId }) }));

import { agentGuide, claudeMcpAdd, kgArchiveUrl, mcpJson, pluginCommands, reproducePrompt, KG_ALIAS } from "../lib/agent-connect";
import AgentConnect from "../components/AgentConnect";
import { GET as kgRedirect } from "../app/agents/kg.tar.gz/route";
import { GET as llms } from "../app/llms.txt/route";

describe("connect your agent", () => {
  it("installs the plugin and the knowledge-graph server from one set of commands", () => {
    expect(pluginCommands).toEqual(["/plugin marketplace add rewire-bio/rewire-benchmarks", "/plugin install bio-model-benchmarks"]);
    expect(claudeMcpAdd()).toBe(`claude mcp add rewire-benchmark-graph -- uvx --from git+https://github.com/rewire-bio/rdf-kg-mcp@v0.1.0 rdf-kg-mcp serve ${KG_ALIAS}`);
    expect(JSON.parse(mcpJson()).mcpServers["rewire-benchmark-graph"].args.at(-1)).toBe(KG_ALIAS);
    expect(kgArchiveUrl(releaseId)).toBe(`https://github.com/rewire-bio/rewire-benchmark-data/releases/download/kg/${releaseId}/kg-${releaseId}.tar.gz`);
    expect(reproducePrompt("mfass-v2-baseline", "mfass-v2")).toContain("run recipe mfass-v2-baseline (protocol mfass-v2)");
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
    expect(text).toContain("re-checked against new publications every month");
  });

  it("shows the plugin install on the home page box", () => {
    const markup = renderToStaticMarkup(<AgentConnect />);
    for (const line of pluginCommands) expect(markup).toContain(line);
    expect(markup).toContain('href="/agents/"');
    expect(markup).toContain("nothing is submitted without your consent");
  });
});
