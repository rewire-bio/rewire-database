/**
 * LLM Discoverability & Machine-Readable Knowledge Hub Generator
 * Strictly implements the llmstxt.org specification for /llms.txt, companion /llms-full.txt,
 * and autonomous agent specifications for /agents.md.
 *
 * Location: lib/llm-discoverability.ts
 */

import { protocolLabel, REVIEW_STATUS_LABELS, type LeaderboardResult } from "./use-case-leaderboard";
import { ORIGIN_DESCRIPTIONS, ORIGIN_NOT_RECORDED_DESCRIPTION } from "./result-origin";
import { leadStatement } from "./geo-takeaway";
import {
  SITE,
  pluginCommands,
  claudeMcpAdd,
  mcpJson,
  kgArchiveUrl,
  SKILL_URL,
  discrepancyApi,
  discrepancyQueries,
  trpcPath,
} from "./agent-connect";

const ranked = (boards: readonly LeaderboardResult[]) => boards.filter((b) => b.protocol && b.rows.length);
const resultUrl = (id: string) => `${SITE}/database/result/${encodeURIComponent(id)}/`;
const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\s+/g, " ");

/**
 * 1. Generates concise index conforming strictly to llmstxt.org specification.
 */
export function generateLlmsTxt(releaseId: string, boards: readonly LeaderboardResult[] = []): string {
  const leaderboards = ranked(boards);
  return `# Biological model benchmark database

> Reviewed published results for DNA, RNA, protein and cell models, with sources, review status and run recipes. Every figure links to the published source it was taken from. Each use case is ranked on one protocol at a time, never across protocols.

Release ${releaseId}. Site: ${SITE}/

${leaderboards.length ? `## Use-case leaderboards
${leaderboards.map((b) => `- [${b.use_case_title}](${SITE}${b.use_case_href}): ${b.rows.length} tools ranked on ${protocolLabel(b.protocol!)} (${b.protocol!.metric_label}, ${b.protocol!.direction} is better)${b.protocol!.relevance === "proxy" ? ", a proxy protocol" : ""}.`).join("\n")}

## Full Knowledge Base
- [Full Benchmark Knowledge Base](${SITE}/llms-full.txt): every use-case ranking table, with each value's result record, source, review status and origin.

` : ""}## Use cases
- [All use cases](${SITE}/use-cases/): each page lists the published comparisons for that use case, with their sources.
- [Contested results](${SITE}/contested/): where published studies disagree.

## Developer & Autonomous Agent Hub
- [Autonomous Agent Hub](${SITE}/agents.md): Machine-readable query schemas, operational constraint filters, and tRPC/MCP protocols for scientific agents.
- [JSON API](${SITE}/agents/api/): keyless read-only JSON for models, benchmarks, use-case leaderboards, a model's results and contested findings. OpenAPI description: ${SITE}/api/v1/openapi.json
- [Release Manifest](${SITE}/release-manifest.json): Pinned SQLite release verification, SHA-256 checksums, and dataset hashes.
- [Knowledge Graph Manifest](${SITE}/agents/kg-manifest.json): RDF knowledge graph bundle with discrepancy verification queries.

${leaderboards.length ? `## Key Benchmark Quick Facts
Each line is the best reported value on the protocol a use case is ranked on, with the result record it comes from.
${leaderboards.map((b) => `- ${b.use_case_title}: ${leadStatement(b)} (${resultUrl(b.rows[0].source_record_id)}).`).join("\n")}

` : ""}## Connect your agent

Claude Code, one plugin with three MCP servers (the knowledge graph, genomic data and the rewirebench runner), five skills, six commands and a benchmarking agent:

    ${pluginCommands.join("\n    ")}

Knowledge graph only:

    ${claudeMcpAdd()}

Other MCP clients:

${mcpJson().split("\n").map((line) => `    ${line}`).join("\n")}

The bundle for this exact release: ${kgArchiveUrl(releaseId)}

The skills (how to find evidence, prepare data, and run and verify benchmarks with rewirebench): ${SKILL_URL}

## Contested results

Each release flags studies that disagree with what other studies report for the same models. A finding is an automatic lead, not a finding of error, and never withholds a result. Each one carries its follow-up history: what we investigated, reported to the authors, and when we will check again.

- Pages: ${SITE}/contested/ and ${SITE}/contested/<id>/
- API (GET ${SITE}/api/trpc/<procedure>?input=<URL-encoded JSON>):
${discrepancyApi(releaseId).map((p) => `  - ${p.name}: ${p.input}. Returns ${p.returns}.`).join("\n")}
  - Example: GET ${SITE}${trpcPath(discrepancyApi(releaseId)[0].name, discrepancyApi(releaseId)[0].example)}
- Knowledge graph: the derived graph holds the same findings. The MCP server's list_queries and run_query tools offer:
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

- Runs happen on your machine. The plugin's run tools use CPU and start no GPU or paid run. Your model and data are not sent to Rewire.
- No tool in the plugin submits a result to the database. The rewirebench command line can send one to Rewire's review queue; the skills tell the agent to do that only when you ask.
- A source-checked result is a value checked against the source it cites, in most cases a transcription of a published number. It is not an independent reproduction.`;
}

/**
 * 2. Generates companion full knowledge base (/llms-full.txt) with complete ranking tables.
 */
export function generateLlmsFullText(releaseId: string, boards: readonly LeaderboardResult[] = []): string {
  let out = `# Rewire.bio Biological AI Benchmark Database: Full Knowledge Base

> One ranking table per use case, built from the published results in this release. Each use case is ranked on one protocol (one benchmark and metric); values are never compared across protocols. Every value links to its result record.

Release: ${releaseId}
Site: ${SITE}/
Specification: https://llmstxt.org

---
`;

  for (const board of boards) {
    out += `\n## Use Case: ${board.use_case_title}\n`;
    out += `Page: ${SITE}${board.use_case_href}\n`;
    if (!board.protocol || !board.rows.length) {
      out += `\nNo ranking. ${board.empty_reason ?? ""}\n\n---\n`;
      continue;
    }
    const protocol = board.protocol;
    out += `Protocol: ${protocolLabel(protocol)}${protocol.relevance === "proxy" ? " (judged a proxy for this use case)" : ""}\n`;
    out += `Metric: ${protocol.metric_label} (${protocol.direction === "higher" ? "higher is better" : "lower is better"})\n`;
    out += board.baseline
      ? `Baseline on this protocol: ${board.baseline.name} = ${board.baseline.display_value} (${resultUrl(board.baseline.source_record_id)})\n`
      : `Baseline on this protocol: none scored\n`;
    out += `\n| Rank | Model | ${protocol.metric_label} |${board.baseline ? " vs. baseline |" : ""} Review | Run receipt | Origin | Coverage | Open discrepancies | Source | Result record |\n`;
    out += `| :--- | :--- | :---: |${board.baseline ? " :---: |" : ""} :--- | :--- | :--- | :---: | :---: | :--- | :--- |\n`;
    for (const row of board.rows) {
      const margin = row.margin_over_conventional === null ? "" : `${row.margin_over_conventional > 0 ? "+" : ""}${row.margin_over_conventional.toFixed(1)}%`;
      out += `| ${row.rank} | ${cell(row.model_name + (row.model_detail ? ` (${row.model_detail})` : ""))}${row.is_baseline ? " [baseline]" : ""} | ${cell(row.display_value)} |${board.baseline ? ` ${margin} |` : ""} ${REVIEW_STATUS_LABELS[row.reviewed_status]} | ${row.receipt ? `${SITE}${row.receipt.href}` : "none"} | ${row.origin ?? "not recorded"} | ${row.coverage.evaluated}/${row.coverage.relevant} | ${row.open_findings.length} | ${cell(row.source?.name ?? "Not recorded")} | ${resultUrl(row.source_record_id)} |\n`;
    }
    if (board.unranked.length)
      out += `\nNot ranked (evaluated elsewhere in this use case, not on this protocol): ${board.unranked.map((m) => m.model_name).join(", ")}.\n`;
    out += `\n---\n`;
  }

  out += `\n## Definitions

1. **Rank**: competition rank (1, 2, 2, 4) by the protocol's metric in its stated direction, among tools with a value on that protocol.
2. **Margin over baseline**: shown only when the same protocol scores exactly one of the use case's baseline methods. $\\Delta = d \\times \\frac{v - B}{|B|} \\times 100\\%$, with $d = 1$ when higher is better and $-1$ when lower is better.
3. **Review**: Reproduced only when a run receipt in the release is cited by the result or its evaluation; Source-checked when the value was checked against the source it cites: a publication, or for a Rewire run the run's own execution report. Source-checked does not mean reproduced.
4. **Run receipt**: the source record of the executed full-protocol run behind a Reproduced value; "none" for every other row.
5. **Origin**: who produced the result, as the evaluation record states it.
${Object.entries(ORIGIN_DESCRIPTIONS).map(([origin, description]) => `   - \`${origin}\`: ${description}`).join("\n")}
   - \`not recorded\`: ${ORIGIN_NOT_RECORDED_DESCRIPTION}
6. **Coverage**: comparisons in the use case that score the tool, out of all the use case's comparisons.
`;

  return out;
}

/**
 * 3. Generates autonomous scientific agent specifications (/agents.md).
 */
export function generateAgentsMd(releaseId: string, boards: readonly LeaderboardResult[] = []): string {
  const leaderboards = ranked(boards);
  return `# Rewire.bio Autonomous Scientific Agent Protocol Specification

> Machine-readable query schemas, operational constraint filters, and tRPC/MCP protocols for autonomous bioinformatic agents.

Release: ${releaseId}
Site: ${SITE}/

## 1. Agent Operational Mission
Rewire.bio is an independent database of published benchmark results for biological AI models. Agents use it to find which results exist for a use case, where they come from, how a use case's tools rank on one protocol, and where studies disagree.

## 2. Use-case leaderboards
Each use case is ranked on one protocol. Use cases are identified by slug:
${leaderboards.length ? leaderboards.map((b) => `- \`${b.use_case_slug}\`: ${protocolLabel(b.protocol!)} (Metric: ${b.protocol!.metric_label}, ${b.protocol!.direction} is better), ${b.rows.length} tools ranked`).join("\n") : "- No use case has a ranking in this release."}

## 3. Decision Framework for AI Agents
When choosing a model for a use case:
1. Read the ranking for the use case and the protocol it is ranked on. A rank holds only for that protocol.
2. Prefer rows where \`independent === true\`: the result comes from a study whose authors did not develop the tool. A Rewire run has \`origin === "rewire_run"\` and \`independent === false\`, because Rewire wrote some of the baselines it runs.
3. Check \`open_findings\`: a non-empty list means another study disagrees with the ranked result. Follow the link before relying on it.
4. Check \`coverage\`: a tool scored on one of many comparisons has less evidence behind its rank.
5. Hardware fields are filled only when the model record carries them; null means not recorded, not zero.

## 4. Machine-Readable Schema Contracts (JSON Schema)

### BiologicalModelRankingRow
\`\`\`json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "BiologicalModelRankingRow",
  "type": "object",
  "required": [
    "model_id",
    "model_name",
    "model_href",
    "use_case_slug",
    "primary_metric_name",
    "raw_metric_value",
    "display_value",
    "rank",
    "reviewed_status",
    "independent",
    "source_record_id",
    "coverage",
    "open_findings",
    "telemetry"
  ],
  "properties": {
    "model_id": { "type": "string", "description": "Configuration record id" },
    "model_name": { "type": "string" },
    "model_href": { "type": "string" },
    "parent_id": { "type": ["string", "null"] },
    "use_case_slug": { "type": "string" },
    "primary_metric_name": { "type": "string" },
    "raw_metric_value": { "type": ["number", "null"] },
    "display_value": { "type": "string" },
    "rank": { "type": ["integer", "null"], "minimum": 1 },
    "margin_over_conventional": { "type": ["number", "null"], "description": "Percent over the one baseline scored on the same protocol" },
    "reviewed_status": { "enum": ["reproduced", "source_checked", "author_reported"] },
    "receipt": { "type": ["object", "null"], "description": "Run receipt source record behind a reproduced value: id, name, href" },
    "origin": { "type": ["string", "null"], "description": "Origin of the evaluation the ranked value belongs to: author_reported, independent_paper, rewire_run, paper_compilation or unreported" },
    "independent": { "type": "boolean", "description": "True only for independent_paper. A Rewire run is not flagged, because the release does not record who developed each tool" },
    "source_record_id": { "type": "string", "description": "Result record id in the release" },
    "source": { "type": ["object", "null"] },
    "coverage": { "type": "object", "properties": { "evaluated": { "type": "integer" }, "relevant": { "type": "integer" } } },
    "open_findings": { "type": "array" },
    "is_baseline": { "type": "boolean" },
    "pareto_optimal": { "type": "boolean" },
    "telemetry": {
      "type": "object",
      "properties": {
        "inference_latency_ms": { "type": ["number", "null"] },
        "throughput_items_per_sec": { "type": ["number", "null"] },
        "min_vram_gb": { "type": ["number", "null"] },
        "estimated_cost_per_1k_evals_usd": { "type": ["number", "null"] },
        "parameters": { "type": ["string", "null"] },
        "context_window": { "type": ["string", "null"] },
        "license": { "type": ["string", "null"] },
        "license_scope": { "enum": ["weights", "record", "code", "tool", null], "description": "Which licence the text is. code: a code licence is recorded and the weights terms are not. tool: the code licence of a tool whose record says it has no weights" },
        "access": { "type": ["string", "null"] },
        "open_weights": { "type": ["boolean", "null"] }
      }
    }
  }
}
\`\`\`

## 5. Programmatic API Endpoints
All procedures are accessible via HTTP GET. Every procedure except \`catalogue.release\` needs \`release_id\`, the release this site serves (${releaseId}); a request without it is answered with 400, and one for another release with 404. URL-encode the JSON input.

- \`GET ${trpcPath("catalogue.release")}\`: Names the release this site serves.
- \`GET ${trpcPath("catalogue.useCases", { release_id: releaseId })}\`: Lists all biological use cases and counts.
- \`GET ${trpcPath("catalogue.useCase", { release_id: releaseId, slug: "<slug>" })}\`: Retrieves detailed question and mappings.
- \`GET ${trpcPath("catalogue.list", { release_id: releaseId, kind: "model" })}\`: Lists biological models in catalogue.
- \`GET ${trpcPath("catalogue.discrepancies", { release_id: releaseId, settled: "open" })}\`: Retrieves open discrepancies between studies.
- \`GET /api/v1/\`: Keyless read-only JSON API. Lists its endpoints: models, benchmarks, use cases, the leaderboard for a use case, results for a model and contested findings. Every answer names its release, the data licence and a citation, and links each result's sources.
- \`GET /api/v1/use-cases/<slug>/board/\`: A use case's leaderboard as JSON. Its field names are the API's own, described in the OpenAPI description; each row gives the value as the result record holds it (numeric_value, unit) beside the text the site prints.
- \`GET /api/v1/openapi.json\`: OpenAPI 3.1 description of the JSON API. Docs: ${SITE}/agents/api/
- \`GET /llms.txt\`: Concise index conforming to llmstxt.org.
- \`GET /llms-full.txt\`: Complete markdown ranking tables for all use cases.
- \`GET /release-manifest.json\`: Release integrity and dataset SHA-256 hashes.

## 6. MCP & Tool Integration

Install Claude Code plugin:

    ${pluginCommands.join("\n    ")}

Knowledge Graph MCP connection:

    ${claudeMcpAdd()}
`;
}
