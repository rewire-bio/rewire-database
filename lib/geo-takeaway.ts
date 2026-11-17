/**
 * Generative Engine Optimization (GEO) Lead Summaries & Factual Triple Generator
 * Produces structured, concise answer triples for AI scrapers (ChatGPT Search, Perplexity, Claude, Google AI Overviews).
 *
 * Location: lib/geo-takeaway.ts
 */

import {
  CATEGORY_PROTOCOL_BASELINES,
  getUseCaseLeaderboard,
  type BiologicalUseCaseCategory,
  type LeaderboardResult,
} from "./use-case-leaderboard";
import { getModelTelemetry } from "./operational-telemetry";

export interface GeoTakeawayTriple {
  modelName: string;
  creator?: string;
  category: string;
  useCaseTitle: string;
  primaryMetricName: string;
  metricValue: string;
  conventionalBaselineName: string;
  marginOverConventional: string;
  fractionOfBiologicalCeiling?: string;
  vramGb?: string;
  latency?: string;
  license?: string;
  openWeights?: boolean;
}

export interface GeoHighlightItem {
  label: string;
  value: string;
  subtext: string;
}

export interface GeoTakeawayData {
  title: string;
  primaryStatement: string;
  secondaryStatement?: string;
  highlights?: GeoHighlightItem[];
  triple?: GeoTakeawayTriple;
}

const PRIMARY_CATEGORY_SLUGS = new Set([
  "structure-prediction",
  "variant-effect",
  "protein-design",
  "transcriptomics",
  "genomic-grammar",
  "structural-hypotheses-experiments",
  "protein-variant-effect-prediction",
  "de-novo-binder-design",
  "genetic-perturbation-response",
  "plant-promoter-reporters",
]);

function formatMetricValue(val: number): string {
  const n = Number(val);
  if (!Number.isFinite(n)) return String(val);
  if (Math.abs(n) >= 10) return n.toFixed(1);
  if (Math.abs(n) >= 1) return n.toFixed(2);
  return n.toFixed(3);
}

function formatAccessMode(openWeights: boolean, minVramGb: number | null | undefined): string {
  if (openWeights) return "open weights";
  return minVramGb !== null && minVramGb !== undefined ? "gated weights" : "hosted API";
}

function formatLatency(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "unmeasured latency";
  if (ms < 1) return `${ms.toFixed(1)} ms`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.round(ms)} ms`;
}

function formatVram(gb: number | null | undefined): string {
  if (gb === null || gb === undefined || !Number.isFinite(gb)) return "standard compute";
  return `${gb} GB VRAM`;
}

/**
 * Generates factual answer triple for a specific biological use case leaderboard.
 */
export function generateUseCaseTakeaway(options: {
  useCaseSlug?: string;
  category?: BiologicalUseCaseCategory | string;
  leaderboard?: LeaderboardResult;
  pageContext?: {
    slug: string;
    title: string;
    baselineName?: string;
    topToolName?: string;
    topMetricLabel?: string;
    topMetricValue?: string;
    comparisonCount?: number;
  };
}): GeoTakeawayData {
  const ctx = options.pageContext;
  if (ctx && !PRIMARY_CATEGORY_SLUGS.has(ctx.slug)) {
    const primaryStatement =
      ctx.topToolName && ctx.topMetricValue
        ? `For "${ctx.title}", ${ctx.topToolName} leads the primary reviewed comparison (${ctx.topMetricLabel || "primary metric"}: ${ctx.topMetricValue})${ctx.baselineName ? `, evaluated against the ${ctx.baselineName} baseline` : ""}.`
        : `For "${ctx.title}", ${ctx.comparisonCount || 0} reviewed comparisons are tracked${ctx.baselineName ? ` against the ${ctx.baselineName} baseline` : ""}.`;
    const highlights: GeoHighlightItem[] = [
      { label: "Use Case", value: ctx.title, subtext: `${ctx.comparisonCount || 0} comparisons tracked` },
      ...(ctx.topToolName && ctx.topMetricValue
        ? [{ label: ctx.topMetricLabel || "Primary Comparison", value: ctx.topToolName, subtext: `Lead value: ${ctx.topMetricValue}` }]
        : []),
      ...(ctx.baselineName
        ? [{ label: "Protocol Baseline", value: ctx.baselineName, subtext: "Pre-ML / conventional anchor" }]
        : []),
    ];
    return {
      title: "Executive Takeaway",
      primaryStatement,
      secondaryStatement: "Derived directly from source-checked comparisons recorded for this biological question.",
      highlights,
    };
  }

  const leaderboard =
    options.leaderboard ||
    getUseCaseLeaderboard(undefined, {
      use_case_slug: options.useCaseSlug,
      category: options.category,
    });

  const topModel = leaderboard.rows.find((r) => !r.is_baseline);

  if (!topModel) {
    return {
      title: "Executive Takeaway",
      primaryStatement: `No evaluated models have been verified for ${leaderboard.use_case_title} yet. Baseline calibrations are established under protocol review.`,
    };
  }

  const metricVal = formatMetricValue(topModel.raw_metric_value);
  const baseline = leaderboard.baselines.conventional_baseline;
  const marginSign = topModel.margin_over_conventional > 0 ? "+" : "";
  const marginStr = `${marginSign}${topModel.margin_over_conventional.toFixed(1)}%`;
  const ceilingStr =
    topModel.fraction_of_biological_ceiling !== undefined &&
    topModel.fraction_of_biological_ceiling !== null
      ? `${topModel.fraction_of_biological_ceiling.toFixed(1)}%`
      : undefined;

  const ceilingPhrase = ceilingStr
    ? ` and achieving ${ceilingStr} of experimental assay replicate ceiling`
    : "";

  const primaryStatement = `In ${leaderboard.use_case_title}, ${topModel.model_name} ranks #1 (${leaderboard.primary_metric_name}: ${metricVal}), outperforming the conventional ${baseline.name} baseline by ${marginStr}${ceilingPhrase}.`;

  const latencyStr = formatLatency(topModel.telemetry.inference_latency_ms);
  const vramStr = formatVram(topModel.telemetry.min_vram_gb);
  const accessStr = formatAccessMode(topModel.telemetry.open_weights, topModel.telemetry.min_vram_gb);
  const licenseStr = topModel.telemetry.license || "Standard license";

  const baseNote = `Hardware profile: ${vramStr}, ${latencyStr} inference latency (${licenseStr}, ${accessStr}).`;
  const secondaryStatement =
    ctx?.baselineName && ctx.baselineName !== baseline.name
      ? `${baseNote} Question-specific experimental baseline below: ${ctx.baselineName}.`
      : baseNote;

  return {
    title: "Executive Takeaway",
    primaryStatement,
    secondaryStatement,
    highlights: [
      { label: "Top Ranked Model", value: topModel.model_name, subtext: topModel.creator },
      {
        label: leaderboard.primary_metric_name,
        value: metricVal,
        subtext: ceilingStr ? `${ceilingStr} of assay ceiling` : "Reported benchmark score",
      },
      { label: "vs Pre-ML Baseline", value: marginStr, subtext: baseline.name },
      { label: "Compute Profile", value: vramStr, subtext: `${latencyStr} · ${accessStr}` },
    ],
    triple: {
      modelName: topModel.model_name,
      creator: topModel.creator,
      category: leaderboard.category,
      useCaseTitle: leaderboard.use_case_title,
      primaryMetricName: leaderboard.primary_metric_name,
      metricValue: metricVal,
      conventionalBaselineName: baseline.name,
      marginOverConventional: marginStr,
      fractionOfBiologicalCeiling: ceilingStr,
      vramGb: vramStr,
      latency: latencyStr,
      license: licenseStr,
      openWeights: topModel.telemetry.open_weights,
    },
  };
}

/**
 * Generates executive summary takeaway for the homepage featured leaderboard.
 */
export function generateHomepageTakeaway(): GeoTakeawayData {
  return {
    title: "Frontier Benchmark Takeaway",
    primaryStatement:
      "Across biological foundation model benchmarks, AlphaFold 3 ranks #1 in Structure Prediction (lDDT 89.5, +46.7% over homology modeling), PoET-2 ranks #1 in Variant Effect Prediction (Spearman Rho 0.612, +42.3% over BLOSUM62), and Chroma ranks #1 in Protein Design (scRMSD 1.20 Å, 73.3% lower divergence than RosettaDesign).",
    secondaryStatement:
      "All evaluations are anchored against pre-ML conventional baselines and experimental assay noise ceilings with operational latency, memory, and cost telemetry.",
    highlights: [
      { label: "Structure Prediction", value: "AlphaFold 3", subtext: "89.5 lDDT · +46.7% vs Homology" },
      { label: "Variant Effect", value: "PoET-2", subtext: "0.612 ρ · +42.3% vs BLOSUM62" },
      { label: "Protein Design", value: "Chroma", subtext: "1.20 Å scRMSD · +73.3% vs Rosetta" },
      { label: "Transcriptomics", value: "GEARS", subtext: "0.790 r · +88.1% vs Linear/PCA" },
      { label: "Genomic Grammar", value: "Enformer", subtext: "0.890 AUROC · +27.1% vs 6-mer PWM" },
    ],
  };
}

/**
 * Generates structured capability takeaway for an individual model profile.
 */
export function generateModelTakeaway(record: {
  id: string;
  name: string;
  kind?: string;
  attributes?: Record<string, unknown>;
}): GeoTakeawayData {
  const telemetry = getModelTelemetry(record.id, record.name, record);

  // Check if model is evaluated in any of the core curated use cases
  for (const [catKey, config] of Object.entries(CATEGORY_PROTOCOL_BASELINES)) {
    if (catKey === "unstandardized") continue;
    const lb = getUseCaseLeaderboard(undefined, { category: catKey });
    const row = lb.rows.find(
      (r) =>
        r.model_id.toLowerCase().includes(record.id.replace("catalog-model-", "").toLowerCase()) ||
        r.model_name.toLowerCase() === record.name.toLowerCase()
    );

    if (row && !row.is_baseline) {
      const metricVal = formatMetricValue(row.raw_metric_value);
      const baseline = lb.baselines.conventional_baseline;
      const marginSign = row.margin_over_conventional > 0 ? "+" : "";
      const marginStr = `${marginSign}${row.margin_over_conventional.toFixed(1)}%`;
      const accessStr = formatAccessMode(telemetry.open_weights, telemetry.min_vram_gb);

      return {
        title: "Model Benchmark Takeaway",
        primaryStatement: `${record.name} is evaluated in ${config.title}, achieving a capability index of ${row.use_case_index_score.toFixed(1)}/100 (${lb.primary_metric_name}: ${metricVal}) with a ${marginStr} margin over conventional baseline (${baseline.name}).`,
        secondaryStatement: `Deployment profile: ${formatVram(telemetry.min_vram_gb)}, ${formatLatency(telemetry.inference_latency_ms)} latency (${telemetry.license || "Standard license"}, ${accessStr}).`,
      };
    }
  }

  // Fallback for catalog models with hardware/architecture telemetry
  const paramStr = telemetry.parameter_count_millions
    ? telemetry.parameter_count_millions >= 1000
      ? `${(telemetry.parameter_count_millions / 1000).toFixed(1)}B parameters`
      : `${telemetry.parameter_count_millions}M parameters`
    : "recorded architecture";
  const accessLabel = telemetry.open_weights
    ? "open weights"
    : telemetry.min_vram_gb !== null && telemetry.min_vram_gb !== undefined
    ? "gated weights access"
    : "proprietary API access";

  return {
    title: "Model Deployment Profile",
    primaryStatement: `${record.name} is a biological AI model in the rewire-database catalog with ${paramStr} and ${accessLabel}.`,
    secondaryStatement: `Prerequisites: ${formatVram(telemetry.min_vram_gb)}, ${formatLatency(telemetry.inference_latency_ms)} inference latency (${telemetry.license || "Standard license"}).`,
  };
}
