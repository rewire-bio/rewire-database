/** One source for the agent setup commands, so the connect box, the agents page and llms.txt agree. */

export const SITE = "https://benchmarks.rewirebio.io";
export const MARKETPLACE = "rewire-bio/rewire-benchmarks";
export const PLUGIN = "bio-model-benchmarks";
export const GRAPH_SERVER = "rewire-benchmark-graph";
/** The rdf-kg-mcp release tag every setup command installs. Keep it at the tag the plugin's .mcp.json in rewire-benchmarks uses. */
export const RDF_KG_MCP_VERSION = "v0.4.0";
export const RDF_KG_MCP = `git+https://github.com/rewire-bio/rdf-kg-mcp@${RDF_KG_MCP_VERSION}`;
/** Redirects to the knowledge-graph bundle of the release this site serves. */
export const KG_ALIAS = `${SITE}/agents/kg.tar.gz`;

const KG_RELEASES = "https://github.com/rewire-bio/rewire-benchmark-data/releases/download";
export const kgArchiveUrl = (releaseId: string) => `${KG_RELEASES}/kg/${releaseId}/kg-${releaseId}.tar.gz`;
export const kgManifestUrl = (releaseId: string) => `${KG_RELEASES}/kg/${releaseId}/manifest.json`;

export const pluginCommands = [`/plugin marketplace add ${MARKETPLACE}`, `/plugin install ${PLUGIN}@rewire-benchmarks`];

export const claudeMcpAdd = (bundle = KG_ALIAS) =>
  `claude mcp add ${GRAPH_SERVER} -- uvx --from ${RDF_KG_MCP} rdf-kg-mcp serve ${bundle}`;

export const mcpJson = (bundle = KG_ALIAS) => JSON.stringify({
  mcpServers: { [GRAPH_SERVER]: { command: "uvx", args: ["--from", RDF_KG_MCP, "rdf-kg-mcp", "serve", bundle] } },
}, null, 2);

/** The plugin's five skills as text, for clients that cannot install the plugin. */
export const SKILL_URL = "https://github.com/rewire-bio/rewire-benchmarks/tree/main/plugins/bio-model-benchmarks/skills";

export const examplePrompts = [
  "Which models have published results on the MFASS splicing benchmark, and how do they compare with the baseline?",
  "Rerun Rewire's MFASS v2 k-mer baseline on this machine's CPU and compare it with the published values.",
  "Run my model through the ProteinGym protocol next to the registered baselines and report the difference.",
];

/** Named SPARQL queries the knowledge-graph bundle ships for discrepancies between studies (rdf-kg-mcp, pinned in RDF_KG_MCP_VERSION). */
export const discrepancyQueries = [
  { name: "open_discrepancies", params: "severity (optional)", returns: "unsettled findings, most severe first" },
  { name: "discrepancies_for_system", params: "system (IRI)", returns: "findings that compare a model, method or configuration" },
  { name: "discrepancy_history", params: "discrepancy (IRI)", returns: "a finding's follow-up actions in order" },
  { name: "contested_results_for_use_case", params: "use_case (IRI)", returns: "a use case's results that take part in unsettled findings" },
] as const;

/** The public API procedures that read the same findings from the release's SQL tables. */
export const discrepancyApi = [
  { name: "catalogue.discrepancies", input: "severity, state, settled (open or settled), system, rule, cursor, limit", returns: "a page of findings with counts" },
  { name: "catalogue.discrepancy", input: "id (an earlier ID also works)", returns: "one finding with its compared result IDs and follow-up actions" },
] as const;

import { generateLlmsTxt } from "./llm-discoverability";
import type { LeaderboardResult } from "./use-case-leaderboard";

export const reproducePrompt = (recipeId: string, protocolId: string) =>
  `Using the ${PLUGIN} plugin, run recipe ${recipeId} (protocol ${protocolId}) locally and compare the result with the published values.`;

/** The plain-text guide served at /llms.txt and /agents.md. */
export function agentGuide(releaseId: string, boards: readonly LeaderboardResult[] = []): string {
  return generateLlmsTxt(releaseId, boards);
}
