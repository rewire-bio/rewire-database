/** One source for the agent setup commands, so the connect box, the agents page and llms.txt agree. */

export const SITE = "https://benchmarks.rewirebio.io";
export const MARKETPLACE = "rewire-bio/rewire-benchmarks";
export const PLUGIN = "bio-model-benchmarks";
export const GRAPH_SERVER = "rewire-benchmark-graph";
export const RDF_KG_MCP = "git+https://github.com/rewire-bio/rdf-kg-mcp@v0.1.0";
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

export const SKILL_URL = "https://github.com/rewire-bio/rewire-benchmarks/tree/main/skills/bio-model-benchmarks";

export const examplePrompts = [
  "Which models have published results on the MFASS splicing benchmark, and how do they compare with the baseline?",
  "Reproduce the published MFASS-v2 k-mer baseline locally and compare it with the published values.",
  "Run my model through the ProteinGym protocol next to the registered baselines and report the difference.",
];

/** Named SPARQL queries the knowledge-graph bundle ships for discrepancies between studies (rdf-kg-mcp 0.2 or later). */
export const discrepancyQueries = [
  { name: "open_discrepancies", params: "severity (optional)", returns: "unsettled findings, most severe first" },
  { name: "discrepancies_for_system", params: "system (IRI)", returns: "findings that compare a model, method or configuration" },
  { name: "discrepancy_history", params: "discrepancy (IRI)", returns: "a finding's follow-up actions in order" },
  { name: "contested_results_for_use_case", params: "use_case (IRI)", returns: "a use case's results that take part in unsettled findings" },
] as const;

/** The public API procedures that read the same findings from the release's SQL tables. */
export const discrepancyApi = [
  { name: "catalogue.discrepancies", input: "severity, state, settled (open or settled), system, rule, cursor, limit", returns: "a page of findings with counts" },
  { name: "catalogue.discrepancy", input: "id (an earlier ID also works)", returns: "one finding with its compared results and follow-up actions" },
] as const;

export const reproducePrompt = (recipeId: string, protocolId: string) =>
  `Using the ${PLUGIN} plugin, run recipe ${recipeId} (protocol ${protocolId}) locally and compare the result with the published values.`;

/** The plain-text guide served at /llms.txt and /agents.md. */
export function agentGuide(releaseId: string): string {
  return `# Biological model benchmark database

> Reviewed published results for DNA, RNA, protein and cell models, with sources, review status and run recipes. The evidence for each use case is re-checked against new publications every month.

Release ${releaseId}. Site: ${SITE}/

## Connect your agent

Claude Code, one plugin with the benchmark skill and the knowledge-graph MCP:

    ${pluginCommands.join("\n    ")}

Knowledge graph only:

    ${claudeMcpAdd()}

Other MCP clients:

${mcpJson().split("\n").map((line) => `    ${line}`).join("\n")}

The bundle for this exact release: ${kgArchiveUrl(releaseId)}

The skill (how to find, run and compare benchmarks with the rewirebench CLI): ${SKILL_URL}

## Contested results

Each release flags studies that disagree with what other studies report for the same models. A finding is an automatic lead, not a finding of error, and never withholds a result. Each one carries its follow-up history: what we investigated, reported to the authors, and when we will check again.

- Pages: ${SITE}/contested/ and ${SITE}/contested/<id>/
- API (GET ${SITE}/api/trpc/<procedure>?input=<URL-encoded JSON>):
${discrepancyApi.map((p) => `  - ${p.name}: ${p.input}. Returns ${p.returns}.`).join("\n")}
- Knowledge graph: the derived graph holds the same findings. With rdf-kg-mcp 0.2 or later, list_queries and run_query offer:
${discrepancyQueries.map((q) => `  - ${q.name}: ${q.params}. Returns ${q.returns}.`).join("\n")}

## Pages

- [Use cases](${SITE}/use-cases/): questions with the evidence that bears on them
- [Benchmarks](${SITE}/benchmarks/) and [models](${SITE}/models/)
- [Evidence and review methods](${SITE}/evidence/)
- [Collection coverage](${SITE}/coverage/) and [discrepancy investigations](${SITE}/investigations/)
- [Contested results](${SITE}/contested/): disagreements between studies and their follow-up
- [Database updates](${SITE}/updates/) and [Atom feed](${SITE}/updates/feed.xml)
- [Downloads](${SITE}/#downloads): the release as JSONL with checksums ([release manifest](${SITE}/release-manifest.json), [KG manifest](${SITE}/agents/kg-manifest.json))
- [Agent setup](${SITE}/agents/)

## Rules

- Runs happen on your machine. Your model and data are not sent anywhere.
- Nothing is submitted to the database without your explicit consent.
- A source-checked result is a transcription of a published number, not an independent reproduction.
`;
}
