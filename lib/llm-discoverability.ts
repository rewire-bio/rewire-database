/**
 * LLM Discoverability & Machine-Readable Knowledge Hub Generator
 * Strictly implements the llmstxt.org specification for /llms.txt, companion /llms-full.txt,
 * and autonomous agent specifications for /agents.md.
 *
 * Location: lib/llm-discoverability.ts
 */

import {
  getUseCaseLeaderboard,
  type BiologicalUseCaseCategory,
} from "./use-case-leaderboard";
import {
  SITE,
  pluginCommands,
  claudeMcpAdd,
  mcpJson,
  kgArchiveUrl,
  SKILL_URL,
  discrepancyApi,
  discrepancyQueries,
} from "./agent-connect";

/**
 * Formats operational latency cleanly.
 */
function formatLatency(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "—";
  if (ms < 1) return `${ms.toFixed(1)} ms`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.round(ms)} ms`;
}

/**
 * 1. Generates concise index conforming strictly to llmstxt.org specification.
 */
export function generateLlmsTxt(releaseId: string): string {
  return `# Biological model benchmark database

> Reviewed published results for DNA, RNA, protein and cell models, with sources, review status and run recipes. The evidence for each use case is re-checked against new publications every month.

Release ${releaseId}. Site: ${SITE}/

## Core Leaderboards
- [Zero-Shot Variant Effect Prediction](${SITE}/use-cases/protein-variant-effect-prediction): Top biological models (PoET-2, ESM-2, AlphaMissense) ranked by Spearman rho against BLOSUM62 baseline.
- [Protein Structure Prediction](${SITE}/use-cases/structural-hypotheses-experiments): Multimer and monomer folding architectures (AlphaFold 3, Boltz-1, ESMFold) evaluated on lDDT.
- [De Novo Protein Design](${SITE}/use-cases/de-novo-binder-design): Generative sequence-structure models (Chroma, RFdiffusion, ProteinMPNN) ranked by self-consistency RMSD (scRMSD).
- [Transcriptomics & Perturbation Response](${SITE}/use-cases/genetic-perturbation-response): Single-cell perturbation prediction models (GEARS, scGPT, Geneformer) evaluated on Pearson correlation.
- [Genomic Regulatory Grammar](${SITE}/use-cases/plant-promoter-reporters): Cis-regulatory sequence models (Enformer, Borzoi, AlphaGenome) evaluated on expression AUROC.

## Full Knowledge Base
- [Full Benchmark Knowledge Base](${SITE}/llms-full.txt): Complete multi-column ranking tables, four-tier protocol baseline panels, and operational hardware telemetry.

## Developer & Autonomous Agent Hub
- [Autonomous Agent Hub](${SITE}/agents.md): Machine-readable query schemas, operational constraint filters, and tRPC/MCP protocols for scientific agents.
- [Release Manifest](${SITE}/release-manifest.json): Pinned SQLite release verification, SHA-256 checksums, and dataset hashes.
- [Knowledge Graph Manifest](${SITE}/agents/kg-manifest.json): RDF knowledge graph bundle with discrepancy verification queries.

## Key Benchmark Quick Facts
- Variant Effect: PoET-2 ranks #1 (Spearman ρ = 0.612, +42.3% over BLOSUM62, 82.7% of assay ceiling) at 42 ms/seq on NVIDIA A100 (16GB VRAM, Apache-2.0).
- Structure Prediction: AlphaFold 3 ranks #1 (lDDT = 89.5, +46.7% over homology modeling, 96.5% of coordinate ceiling) at 14.2 s/target (80GB VRAM, Non-commercial).
- Protein Design: Chroma ranks #1 (scRMSD = 1.20 Å, 73.3% lower divergence than RosettaDesign, 98.2% of ceiling) at 3.5 s/target (24GB VRAM, Open source).
- Transcriptomics: GEARS ranks #1 (Pearson r = 0.790, +88.1% over linear baseline, 96.1% of replicate ceiling) at 12 ms/perturbation (8GB VRAM, BSD-3-Clause).
- Genomic Grammar: Enformer ranks #1 (AUROC = 0.890, +27.1% over 6-mer PWM baseline, 88.6% of replicate ceiling) at 240 ms/sequence (24GB VRAM, Apache-2.0).

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

- Runs happen on your machine. Your model and data are not sent anywhere.
- Nothing is submitted to the database without your explicit consent.
- A source-checked result is a transcription of a published number, not an independent reproduction.`;
}

/**
 * 2. Generates companion full knowledge base (/llms-full.txt) with complete ranking tables.
 */
export function generateLlmsFullText(releaseId: string): string {
  const categories: BiologicalUseCaseCategory[] = [
    "structure_prediction",
    "variant_effect",
    "protein_design",
    "transcriptomics",
    "genomic_grammar",
  ];

  let out = `# Rewire.bio Biological AI Benchmark Database — Companion Full Knowledge Base

> Complete multi-column ranking tables, four-tier protocol baseline reference panels, and operational hardware telemetry across biological foundation model benchmarks.

Release: ${releaseId}
Site: ${SITE}/
Specification: https://llmstxt.org

---
`;

  for (const cat of categories) {
    const lb = getUseCaseLeaderboard(undefined, { category: cat });

    out += `\n## Use Case: ${lb.use_case_title}\n`;
    out += `Primary Metric: ${lb.primary_metric_name} (${lb.metric_direction === "higher" ? "Higher is better" : "Lower is better"})\n\n`;

    out += `### Protocol Baselines & Biological Noise Floor\n`;
    out += `- **Null Baseline**: ${lb.baselines.null_baseline.name} = ${lb.baselines.null_baseline.value} (${lb.baselines.null_baseline.description})\n`;
    out += `- **Conventional Pre-ML Baseline**: ${lb.baselines.conventional_baseline.name} = ${lb.baselines.conventional_baseline.value} (${lb.baselines.conventional_baseline.description})\n`;
    if (lb.baselines.experimental_ceiling) {
      out += `- **Experimental Assay Ceiling**: ${lb.baselines.experimental_ceiling.name} = ${lb.baselines.experimental_ceiling.value} (${lb.baselines.experimental_ceiling.assay_replicate_noise})\n`;
    }
    out += `\n### Complete Model Rankings\n\n`;

    out += `| Rank | Model Name | Creator | Capability Index (0-100) | ${lb.primary_metric_name} | vs. Conventional | % of Ceiling | Pareto Optimal | Latency | Min VRAM | License | Open Weights |\n`;
    out += `| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- | :---: |\n`;

    let rank = 1;
    for (const row of lb.rows) {
      const rankStr = row.is_baseline ? "Baseline" : String(rank++);
      const valStr = row.raw_metric_value.toFixed(3);
      const idxStr = row.use_case_index_score.toFixed(1);
      const sign = row.margin_over_conventional > 0 ? "+" : "";
      const marginStr = `${sign}${row.margin_over_conventional.toFixed(1)}%`;
      const ceilStr =
        row.fraction_of_biological_ceiling !== undefined &&
        row.fraction_of_biological_ceiling !== null
          ? `${row.fraction_of_biological_ceiling.toFixed(1)}%`
          : "N/A";
      const paretoStr = row.pareto_optimal ? "Yes" : "No";
      const latencyStr = formatLatency(row.telemetry.inference_latency_ms);
      const vramStr = row.telemetry.min_vram_gb !== null && row.telemetry.min_vram_gb !== undefined ? `${row.telemetry.min_vram_gb} GB` : "0 GB";
      const openStr = row.telemetry.open_weights ? "Yes" : "No";

      out += `| ${rankStr} | ${row.model_name} | ${row.creator} | ${idxStr} | ${valStr} | ${marginStr} | ${ceilStr} | ${paretoStr} | ${latencyStr} | ${vramStr} | ${row.telemetry.license || "Standard"} | ${openStr} |\n`;
    }

    out += `\n---\n`;
  }

  out += `\n## Methodology & Mathematical Definitions

1. **Capability Index (0-100 Normalized)**:
   - For values below conventional baseline:
     $Index = 50 \\times \\frac{v - B_{\\text{null}}}{B_{\\text{conv}} - B_{\\text{null}}}$
   - For values exceeding conventional baseline:
     $Index = 50 + 50 \\times \\frac{v - B_{\\text{conv}}}{C_{\\text{exp}} - B_{\\text{conv}}}$

2. **Direction-Adjusted Conventional Margin**:
   $\\Delta_{\\text{conv}} = d \\times \\frac{v - B_{\\text{conv}}}{B_{\\text{conv}}} \\times 100\\%$

3. **Assay Noise Ceiling Signal Capture**:
   $F_{\\text{ceiling}} = \\frac{v - B_{\\text{null}}}{C_{\\text{exp}} - B_{\\text{null}}} \\times 100\\%$

4. **2D Pareto Frontier**:
   A model $m$ is Pareto optimal if no other evaluated model $m'$ has strictly greater Capability Index at equal or lower inference latency and cost.
`;

  return out;
}

/**
 * 3. Generates autonomous scientific agent specifications (/agents.md).
 */
export function generateAgentsMd(releaseId: string): string {
  return `# Rewire.bio Autonomous Scientific Agent Protocol Specification

> Machine-readable query schemas, operational constraint filters, and tRPC/MCP protocols for autonomous bioinformatic agents.

Release: ${releaseId}
Site: ${SITE}/

## 1. Agent Operational Mission
Rewire.bio is the independent decision and benchmark query platform for biological AI models. Autonomous bioinformatic agents use this endpoint to retrieve empirically validated capability rankings across biological tasks, filtered by hardware constraints and Pareto efficiency.

## 2. Biological Use-Case Categories
Use cases are identified by standardized slugs:
- \`variant_effect\` / \`protein-variant-effect-prediction\`: Zero-Shot Mutation Fitness Prediction (Metric: Spearman Rho)
- \`structure_prediction\` / \`structural-hypotheses-experiments\`: 3D Protein Structure Prediction (Metric: lDDT)
- \`protein_design\` / \`de-novo-binder-design\`: De Novo Binder Design (Metric: scRMSD, lower is better)
- \`transcriptomics\` / \`genetic-perturbation-response\`: Single-Cell Perturbation Response (Metric: Pearson r)
- \`genomic_grammar\` / \`plant-promoter-reporters\`: Regulatory Sequence Grammar (Metric: AUROC)

## 3. Decision Framework for AI Agents
When selecting models for downstream bioinformatic pipelines:
1. **High-Throughput In Silico Mutagenesis ($10^6$ variants)**:
   - Filter criteria: \`inference_latency_ms <= 50\` or \`throughput_items_per_sec >= 20\`
   - Require: \`pareto_optimal === true\`
   - Recommended: PoET-2 (42 ms/seq, 16GB VRAM, Apache-2.0)
2. **Workstation / Consumer GPU Deployment ($\\le 24$GB VRAM)**:
   - Filter criteria: \`min_vram_gb <= 24\` and \`open_weights === true\`
   - Recommended: Boltz-1 (lDDT 88.2, 16GB VRAM, MIT) or ESM-2 3B (24GB VRAM, MIT)
3. **Frontier Accuracy / Unconstrained Compute**:
   - Filter criteria: Sort by \`use_case_index_score\` descending
   - Recommended: AlphaFold 3 (lDDT 89.5, 80GB VRAM)

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
    "creator",
    "category",
    "primary_metric_name",
    "raw_metric_value",
    "use_case_index_score",
    "margin_over_conventional",
    "telemetry",
    "pareto_optimal"
  ],
  "properties": {
    "model_id": { "type": "string" },
    "model_name": { "type": "string" },
    "creator": { "type": "string" },
    "category": { "type": "string" },
    "primary_metric_name": { "type": "string" },
    "raw_metric_value": { "type": "number" },
    "use_case_index_score": { "type": "number", "minimum": 0, "maximum": 100 },
    "margin_over_conventional": { "type": "number" },
    "fraction_of_biological_ceiling": { "type": "number" },
    "pareto_optimal": { "type": "boolean" },
    "telemetry": {
      "type": "object",
      "properties": {
        "inference_latency_ms": { "type": ["number", "null"] },
        "throughput_items_per_sec": { "type": ["number", "null"] },
        "min_vram_gb": { "type": ["number", "null"] },
        "parameter_count_millions": { "type": ["number", "null"] },
        "estimated_cost_per_1k_evals_usd": { "type": ["number", "null"] },
        "open_weights": { "type": "boolean" },
        "license": { "type": "string" }
      }
    }
  }
}
\`\`\`

## 5. Programmatic API Endpoints
All procedures are accessible via HTTP GET:

- \`GET /api/trpc/catalogue.useCases\`: Lists all biological use cases and counts.
- \`GET /api/trpc/catalogue.useCase?input={"slug":"<slug>"}\`: Retrieves detailed question and mappings.
- \`GET /api/trpc/catalogue.list?input={"kind":"model"}\`: Lists biological models in catalogue.
- \`GET /api/trpc/catalogue.discrepancies\`: Retrieves open discrepancies between studies.
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
