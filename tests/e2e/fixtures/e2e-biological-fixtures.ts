/**
/**
 * Biological Benchmark Fixtures for rewire-database E2E Opaque-Box Test Suite
 *
 * Grounded in the 5 foundational biological use cases:
 * 1. Structure Prediction (e.g. AlphaFold 3, ESMFold, OpenFold, Chai-1, Boltz-1)
 * 2. Variant Effect (e.g. ESM-2, AlphaMissense, Tranception, SaProt, MSA Transformer)
 * 3. Protein Design (e.g. RFdiffusion, Chroma, ProteinMPNN, ESM-IF1, ProGen2)
 * 4. Transcriptomics (e.g. scGPT, Geneformer, scBERT, UCE, CellLM)
 * 5. Genomic Grammar (e.g. Enformer, HyenaDNA, Nucleotide Transformer, DNABERT-2, Caduceus)
 *
 * Implements 4-tier baseline hierarchies:
 * - Null control
 * - Conventional pre-ML baseline
 * - Experimental assay noise ceiling
 * - Frontier AI models
 *
 * Telemetry: latency ms, throughput items/sec, min VRAM GB, parameter count M, open weights, licenses.
 */

import type { CatalogueRecord, CatalogueSnapshot } from "@/shared/omics/catalogue-query";
import type { Comparison } from "@/lib/use-case-comparisons";
import type { RecordDetail } from "@/lib/entity-detail";

export interface ProtocolBaselineAnchor {
  null_baseline: { name: string; value: number; description: string };
  conventional_baseline: { name: string; method_id: string; value: number; description: string };
  experimental_ceiling?: { name: string; value: number; assay_replicate_noise: string };
}

export interface OperationalTelemetry {
  inference_latency_ms: number;
  throughput_items_per_sec: number;
  min_vram_gb: number;
  parameter_count_millions: number;
  estimated_cost_per_1k_evals_usd: number;
  open_weights: boolean;
  license: string;
  context_window_length: number;
}

export interface BiologicalModelRankingRow {
  model_id: string;
  model_name: string;
  creator: string;
  category: string;
  primary_metric_name: string;
  raw_metric_value: number;
  use_case_index_score: number; // 0-100 normalized
  margin_over_conventional: number; // % delta
  fraction_of_biological_ceiling?: number;
  baselines: ProtocolBaselineAnchor;
  telemetry: OperationalTelemetry;
  pareto_optimal: boolean;
  reviewed_status: "reproduced" | "source_checked" | "community_verified";
  source_record_id: string;
  is_baseline?: boolean;
  study_citations?: Array<{
    study_id: string;
    title: string;
    journal: string;
    year: number;
    doi: string;
  }>;
}

export interface BiologicalUseCaseDefinition {
  slug: string;
  name: string;
  description: string;
  primaryMetric: string;
  metricDirection: "higher_is_better" | "lower_is_better";
  scaleMin: number;
  scaleMax: number;
  baselines: ProtocolBaselineAnchor;
  geoSummary: string;
}

export const BIOLOGICAL_USE_CASES: Record<string, BiologicalUseCaseDefinition> = {
  "structure-prediction": {
    slug: "structure-prediction",
    name: "Structure Prediction",
    description: "Atomic-resolution 3D macromolecular structure prediction for monomeric, multimeric, and protein-ligand/nucleic complexes.",
    primaryMetric: "Average lDDT-Ca / TM-Score",
    metricDirection: "higher_is_better",
    scaleMin: 0.15,
    scaleMax: 0.94,
    baselines: {
      null_baseline: {
        name: "Random Coordinate Backbone",
        value: 0.15,
        description: "Uniformly distributed random coordinate chains in compact globular volume.",
      },
      conventional_baseline: {
        name: "HHpred / Modeller (Template-Based)",
        method_id: "hhpred-modeller-v3",
        value: 0.62,
        description: "Classical homology modeling with sequence profiles against PDB templates.",
      },
      experimental_ceiling: {
        name: "X-ray / Cryo-EM Replicate Resolution",
        value: 0.94,
        assay_replicate_noise: "±0.03 lDDT between independent crystal structures of identical sequences.",
      },
    },
    geoSummary: "AlphaFold 3 leads Structure Prediction with an index score of 96.2 (0.91 lDDT), representing a +46.8% margin over conventional homology modeling (HHpred) and reaching 96.8% of the experimental crystallographic noise ceiling.",
  },
  "variant-effect": {
    slug: "variant-effect",
    name: "Variant Effect",
    description: "Zero-shot and supervised scoring of missense, indel, and non-coding variant pathogenicity and fitness impact.",
    primaryMetric: "Spearman Rho (ProteinGym DMS)",
    metricDirection: "higher_is_better",
    scaleMin: 0.0,
    scaleMax: 0.78,
    baselines: {
      null_baseline: {
        name: "Random Mutation Scoring",
        value: 0.0,
        description: "Zero correlation against experimental deep mutational scanning assays.",
      },
      conventional_baseline: {
        name: "BLOSUM62 / SIFT Matrix",
        method_id: "sift-blosum62",
        value: 0.31,
        description: "Classical evolutionary conservation and chemical substitution matrix scoring.",
      },
      experimental_ceiling: {
        name: "DMS Experimental Assay Noise Ceiling",
        value: 0.78,
        assay_replicate_noise: "±0.08 inter-replicate Spearman correlation in high-throughput DMS assays.",
      },
    },
    geoSummary: "AlphaMissense leads Variant Effect with an index score of 87.2 (0.68 Spearman rho), achieving a +119.4% margin over classical conservation baselines (SIFT/BLOSUM62) and reaching 87.2% of the experimental assay ceiling.",
  },
  "protein-design": {
    slug: "protein-design",
    name: "Protein Design",
    description: "De novo generative backbone generation, sequence inverse folding, and functional motif scaffolding.",
    primaryMetric: "In Silico Success Rate (scRMSD < 2.0A)",
    metricDirection: "higher_is_better",
    scaleMin: 0.01,
    scaleMax: 0.85,
    baselines: {
      null_baseline: {
        name: "Random Sequence/Fold Assembly",
        value: 0.01,
        description: "Chance unguided polymer folding into target secondary/tertiary topology.",
      },
      conventional_baseline: {
        name: "Rosetta Remodel / FastDesign",
        method_id: "rosetta-remodel-2011",
        value: 0.18,
        description: "Physical forcefield energy minimization and simulated annealing backbone sampling.",
      },
      experimental_ceiling: {
        name: "Biophysical Synthesis & Expression Ceiling",
        value: 0.85,
        assay_replicate_noise: "±0.05 yeast/phage display experimental expression yield threshold.",
      },
    },
    geoSummary: "RFdiffusion leads Protein Design with an index score of 84.5 (0.72 in-silico success rate), delivering a +300% margin over physical energy minimization (Rosetta FastDesign) and reaching 84.7% of the synthesis expression ceiling.",
  },
  "transcriptomics": {
    slug: "transcriptomics",
    name: "Transcriptomics",
    description: "Single-cell gene expression representation, cell type classification, perturbation response, and gene gene regulatory inference.",
    primaryMetric: "Cell Type Annotation Macro-F1",
    metricDirection: "higher_is_better",
    scaleMin: 0.12,
    scaleMax: 0.92,
    baselines: {
      null_baseline: {
        name: "Majority Class Prior",
        value: 0.12,
        description: "Random cell assignment weighted by tissue class prior frequency.",
      },
      conventional_baseline: {
        name: "Seurat v4 / SingleR (Marker-based)",
        method_id: "seurat4-singler",
        value: 0.68,
        description: "Top 2000 highly variable genes with Spearman correlation to reference profiles.",
      },
      experimental_ceiling: {
        name: "Inter-Annotator Agreement Ceiling",
        value: 0.92,
        assay_replicate_noise: "±0.04 disagreement between independent expert histologist cell type annotations.",
      },
    },
    geoSummary: "scGPT leads Transcriptomics with an index score of 95.0 (0.88 Macro-F1), achieving a +29.4% margin over classical marker methods (Seurat/SingleR) and reaching 95.7% of the inter-annotator agreement ceiling.",
  },
  "genomic-grammar": {
    slug: "genomic-grammar",
    name: "Genomic Grammar",
    description: "Long-range non-coding regulatory syntax, chromatin accessibility, transcription factor binding, and variant effect prediction.",
    primaryMetric: "Variant Regulatory Effect AUROC",
    metricDirection: "higher_is_better",
    scaleMin: 0.50,
    scaleMax: 0.89,
    baselines: {
      null_baseline: {
        name: "Random Genomic Binary Signal",
        value: 0.50,
        description: "Random uninformative binary classification AUROC.",
      },
      conventional_baseline: {
        name: "PhastCons / PhyloP Conservation",
        method_id: "phylop-100way",
        value: 0.65,
        description: "Multi-species alignment 100-vertebrate phylogenetic conservation score.",
      },
      experimental_ceiling: {
        name: "MPRA Replicate Reproducibility Ceiling",
        value: 0.89,
        assay_replicate_noise: "±0.05 barcode replicate Pearson r in massively parallel reporter assays.",
      },
    },
    geoSummary: "Enformer leads Genomic Grammar with an index score of 79.5 (0.81 AUROC), achieving a +24.6% margin over phylogenetic conservation (PhyloP) and reaching 91.0% of the experimental MPRA ceiling.",
  },
};

/**
 * Normalizes a raw metric score onto a standardized 0-100 capability index scale.
 * Supports both higher-is-better (direction = +1) and lower-is-better (direction = -1).
 */
export function normalizeBiologicalScore(
  rawValue: number,
  min: number,
  max: number,
  direction: 1 | -1 = 1
): number {
  if (!Number.isFinite(rawValue) || !Number.isFinite(min) || !Number.isFinite(max)) {
    return 50.0;
  }
  if (max === min) return 50.0;
  const ratio = direction === 1 ? (rawValue - min) / (max - min) : (max - rawValue) / (max - min);
  const clamped = Math.max(0, Math.min(1, ratio));
  return Math.round(clamped * 1000) / 10;
}

/**
 * Computes margin over conventional baseline as percentage delta.
 * Includes absolute denominator protection for negative baselines and safe zero guards.
 */
export function computeMarginOverConventional(
  rawValue: number,
  conventionalValue: number,
  direction: 1 | -1 = 1
): number {
  if (!Number.isFinite(rawValue) || !Number.isFinite(conventionalValue)) {
    return 0.0;
  }
  if (conventionalValue === 0) {
    if (rawValue === 0) return 0.0;
    return direction * (rawValue > 0 ? 100.0 : -100.0);
  }
  const delta = direction * ((rawValue - conventionalValue) / Math.abs(conventionalValue));
  return Math.round(delta * 1000) / 10;
}

/**
 * Computes fraction of biological experimental ceiling reached [0.0 - 1.0+].
 * Safely guards against null, undefined, zero, NaN, and infinite ceilings.
 */
export function computeFractionOfCeiling(
  rawValue: number,
  ceilingValue?: number | null
): number | undefined {
  if (ceilingValue == null || !Number.isFinite(ceilingValue) || ceilingValue === 0) {
    return undefined;
  }
  if (!Number.isFinite(rawValue)) {
    return undefined;
  }
  const fraction = rawValue / ceilingValue;
  if (!Number.isFinite(fraction)) return undefined;
  return Math.round(fraction * 1000) / 1000;
}

/**
 * Computes Pareto efficiency frontier across models for a use case.
 * A model is Pareto optimal if no other model has BOTH higher score AND lower latency.
 */
export function computeParetoFrontier(models: BiologicalModelRankingRow[]): BiologicalModelRankingRow[] {
  return models.map((m) => {
    const dominated = models.some(
      (other) =>
        other.model_id !== m.model_id &&
        other.use_case_index_score >= m.use_case_index_score &&
        other.telemetry.inference_latency_ms <= m.telemetry.inference_latency_ms &&
        (other.use_case_index_score > m.use_case_index_score ||
          other.telemetry.inference_latency_ms < m.telemetry.inference_latency_ms)
    );
    return { ...m, pareto_optimal: !dominated };
  });
}

/**
 * Master catalog of 25 benchmarked biological models across 5 use cases.
 */
export const SYNTHETIC_BIOLOGICAL_MODELS: BiologicalModelRankingRow[] = [
  // --- Structure Prediction ---
  {
    model_id: "model-alphafold3",
    model_name: "AlphaFold 3",
    creator: "Google DeepMind / Isomorphic Labs",
    category: "structure-prediction",
    primary_metric_name: "Average lDDT-Ca / TM-Score",
    raw_metric_value: 0.91,
    use_case_index_score: normalizeBiologicalScore(0.91, 0.15, 0.94),
    margin_over_conventional: computeMarginOverConventional(0.91, 0.62),
    fraction_of_biological_ceiling: computeFractionOfCeiling(0.91, 0.94),
    baselines: BIOLOGICAL_USE_CASES["structure-prediction"].baselines,
    telemetry: {
      inference_latency_ms: 12500,
      throughput_items_per_sec: 0.08,
      min_vram_gb: 40,
      parameter_count_millions: 1200,
      estimated_cost_per_1k_evals_usd: 4.5,
      open_weights: false,
      license: "Non-commercial Research Only",
      context_window_length: 5120,
    },
    pareto_optimal: true, // highest capability
    reviewed_status: "reproduced",
    source_record_id: "rec-af3-nature-2024",
    study_citations: [
      {
        study_id: "study-af3-2024",
        title: "Accurate structure prediction of biomolecular interactions with AlphaFold 3",
        journal: "Nature",
        year: 2024,
        doi: "10.1038/s41586-024-07487-w",
      },
    ],
  },
  {
    model_id: "model-esmfold",
    model_name: "ESMFold",
    creator: "Meta FAIR",
    category: "structure-prediction",
    primary_metric_name: "Average lDDT-Ca / TM-Score",
    raw_metric_value: 0.83,
    use_case_index_score: normalizeBiologicalScore(0.83, 0.15, 0.94),
    margin_over_conventional: computeMarginOverConventional(0.83, 0.62),
    fraction_of_biological_ceiling: computeFractionOfCeiling(0.83, 0.94),
    baselines: BIOLOGICAL_USE_CASES["structure-prediction"].baselines,
    telemetry: {
      inference_latency_ms: 1200,
      throughput_items_per_sec: 0.83,
      min_vram_gb: 16,
      parameter_count_millions: 15000,
      estimated_cost_per_1k_evals_usd: 0.8,
      open_weights: true,
      license: "Apache-2.0",
      context_window_length: 2048,
    },
    pareto_optimal: true, // fastest single-sequence folding
    reviewed_status: "reproduced",
    source_record_id: "rec-esmfold-science-2023",
    study_citations: [
      {
        study_id: "study-esmfold-2023",
        title: "Evolutionary-scale prediction of atomic-level protein structure with a language model",
        journal: "Science",
        year: 2023,
        doi: "10.1126/science.ade2574",
      },
    ],
  },
  {
    model_id: "model-openfold",
    model_name: "OpenFold",
    creator: "OpenFold Consortium / Columbia University",
    category: "structure-prediction",
    primary_metric_name: "Average lDDT-Ca / TM-Score",
    raw_metric_value: 0.85,
    use_case_index_score: normalizeBiologicalScore(0.85, 0.15, 0.94),
    margin_over_conventional: computeMarginOverConventional(0.85, 0.62),
    fraction_of_biological_ceiling: computeFractionOfCeiling(0.85, 0.94),
    baselines: BIOLOGICAL_USE_CASES["structure-prediction"].baselines,
    telemetry: {
      inference_latency_ms: 8500,
      throughput_items_per_sec: 0.12,
      min_vram_gb: 24,
      parameter_count_millions: 93,
      estimated_cost_per_1k_evals_usd: 1.5,
      open_weights: true,
      license: "Apache-2.0",
      context_window_length: 3000,
    },
    pareto_optimal: false,
    reviewed_status: "reproduced",
    source_record_id: "rec-openfold-nmeth-2024",
    study_citations: [
      {
        study_id: "study-openfold-2024",
        title: "OpenFold: retraining AlphaFold2 yields new insights into its learning mechanics",
        journal: "Nature Methods",
        year: 2024,
        doi: "10.1038/s41592-024-02274-1",
      },
    ],
  },
  {
    model_id: "model-chai1",
    model_name: "Chai-1",
    creator: "Chai Discovery",
    category: "structure-prediction",
    primary_metric_name: "Average lDDT-Ca / TM-Score",
    raw_metric_value: 0.89,
    use_case_index_score: normalizeBiologicalScore(0.89, 0.15, 0.94),
    margin_over_conventional: computeMarginOverConventional(0.89, 0.62),
    fraction_of_biological_ceiling: computeFractionOfCeiling(0.89, 0.94),
    baselines: BIOLOGICAL_USE_CASES["structure-prediction"].baselines,
    telemetry: {
      inference_latency_ms: 9200,
      throughput_items_per_sec: 0.11,
      min_vram_gb: 32,
      parameter_count_millions: 850,
      estimated_cost_per_1k_evals_usd: 2.2,
      open_weights: true,
      license: "Apache-2.0 (weights research only)",
      context_window_length: 4096,
    },
    pareto_optimal: false,
    reviewed_status: "source_checked",
    source_record_id: "rec-chai1-biorxiv-2024",
    study_citations: [
      {
        study_id: "study-chai1-2024",
        title: "Chai-1: Decoding the molecular interactions of life",
        journal: "bioRxiv",
        year: 2024,
        doi: "10.1101/2024.09.13.612984",
      },
    ],
  },
  {
    model_id: "model-boltz1",
    model_name: "Boltz-1",
    creator: "MIT / Valence Discovery",
    category: "structure-prediction",
    primary_metric_name: "Average lDDT-Ca / TM-Score",
    raw_metric_value: 0.87,
    use_case_index_score: normalizeBiologicalScore(0.87, 0.15, 0.94),
    margin_over_conventional: computeMarginOverConventional(0.87, 0.62),
    fraction_of_biological_ceiling: computeFractionOfCeiling(0.87, 0.94),
    baselines: BIOLOGICAL_USE_CASES["structure-prediction"].baselines,
    telemetry: {
      inference_latency_ms: 7400,
      throughput_items_per_sec: 0.14,
      min_vram_gb: 24,
      parameter_count_millions: 600,
      estimated_cost_per_1k_evals_usd: 1.8,
      open_weights: true,
      license: "MIT",
      context_window_length: 4096,
    },
    pareto_optimal: false,
    reviewed_status: "community_verified",
    source_record_id: "rec-boltz1-biorxiv-2024",
    study_citations: [
      {
        study_id: "study-boltz1-2024",
        title: "Boltz-1: Democratizing biomolecular interaction modeling",
        journal: "bioRxiv",
        year: 2024,
        doi: "10.1101/2024.11.02.621456",
      },
    ],
  },
  {
    model_id: "model-hhpred-baseline",
    model_name: "HHpred / Modeller",
    creator: "Baseline",
    category: "structure-prediction",
    primary_metric_name: "Average lDDT-Ca / TM-Score",
    raw_metric_value: 0.62,
    use_case_index_score: 50.0,
    margin_over_conventional: 0.0,
    fraction_of_biological_ceiling: computeFractionOfCeiling(0.62, 0.94),
    baselines: BIOLOGICAL_USE_CASES["structure-prediction"].baselines,
    telemetry: {
      inference_latency_ms: 18000,
      throughput_items_per_sec: 0.05,
      min_vram_gb: 0,
      parameter_count_millions: 0,
      estimated_cost_per_1k_evals_usd: 0.1,
      open_weights: true,
      license: "GPL-3.0",
      context_window_length: 2000,
    },
    pareto_optimal: false,
    reviewed_status: "source_checked",
    source_record_id: "rec-hhpred-2005",
    is_baseline: true,
  },

  // --- Variant Effect ---
  {
    model_id: "model-alphamissense",
    model_name: "AlphaMissense",
    creator: "Google DeepMind",
    category: "variant-effect",
    primary_metric_name: "Spearman Rho (ProteinGym DMS)",
    raw_metric_value: 0.68,
    use_case_index_score: normalizeBiologicalScore(0.68, 0.0, 0.78),
    margin_over_conventional: computeMarginOverConventional(0.68, 0.31),
    fraction_of_biological_ceiling: computeFractionOfCeiling(0.68, 0.78),
    baselines: BIOLOGICAL_USE_CASES["variant-effect"].baselines,
    telemetry: {
      inference_latency_ms: 45,
      throughput_items_per_sec: 22.2,
      min_vram_gb: 8,
      parameter_count_millions: 650,
      estimated_cost_per_1k_evals_usd: 0.05,
      open_weights: true,
      license: "CC-BY-4.0",
      context_window_length: 2048,
    },
    pareto_optimal: true, // top score
    reviewed_status: "reproduced",
    source_record_id: "rec-alphamissense-science-2023",
    study_citations: [
      {
        study_id: "study-alphamissense-2023",
        title: "Accurate proteome-wide missense variant effect prediction with AlphaMissense",
        journal: "Science",
        year: 2023,
        doi: "10.1126/science.adg7492",
      },
    ],
  },
  {
    model_id: "model-esm2-650m",
    model_name: "ESM-2 (650M)",
    creator: "Meta FAIR",
    category: "variant-effect",
    primary_metric_name: "Spearman Rho (ProteinGym DMS)",
    raw_metric_value: 0.61,
    use_case_index_score: normalizeBiologicalScore(0.61, 0.0, 0.78),
    margin_over_conventional: computeMarginOverConventional(0.61, 0.31),
    fraction_of_biological_ceiling: computeFractionOfCeiling(0.61, 0.78),
    baselines: BIOLOGICAL_USE_CASES["variant-effect"].baselines,
    telemetry: {
      inference_latency_ms: 28,
      throughput_items_per_sec: 35.7,
      min_vram_gb: 4,
      parameter_count_millions: 650,
      estimated_cost_per_1k_evals_usd: 0.02,
      open_weights: true,
      license: "MIT",
      context_window_length: 1024,
    },
    pareto_optimal: true, // lowest latency in class
    reviewed_status: "reproduced",
    source_record_id: "rec-esm2-science-2023",
    study_citations: [
      {
        study_id: "study-esm2-2023",
        title: "Language models enable zero-shot prediction of the functional effects of mutations",
        journal: "Science",
        year: 2023,
        doi: "10.1126/science.abn8536",
      },
    ],
  },
  {
    model_id: "model-tranception",
    model_name: "Tranception",
    creator: "Marks Lab / Harvard",
    category: "variant-effect",
    primary_metric_name: "Spearman Rho (ProteinGym DMS)",
    raw_metric_value: 0.64,
    use_case_index_score: normalizeBiologicalScore(0.64, 0.0, 0.78),
    margin_over_conventional: computeMarginOverConventional(0.64, 0.31),
    fraction_of_biological_ceiling: computeFractionOfCeiling(0.64, 0.78),
    baselines: BIOLOGICAL_USE_CASES["variant-effect"].baselines,
    telemetry: {
      inference_latency_ms: 150,
      throughput_items_per_sec: 6.67,
      min_vram_gb: 12,
      parameter_count_millions: 700,
      estimated_cost_per_1k_evals_usd: 0.12,
      open_weights: true,
      license: "MIT",
      context_window_length: 2048,
    },
    pareto_optimal: false,
    reviewed_status: "reproduced",
    source_record_id: "rec-tranception-icml-2022",
    study_citations: [
      {
        study_id: "study-tranception-2022",
        title: "Tranception: protein fitness prediction with autoregressive transformers and inference-time retrieval",
        journal: "ICML",
        year: 2022,
        doi: "10.48550/arXiv.2205.11107",
      },
    ],
  },
  {
    model_id: "model-saprot",
    model_name: "SaProt",
    creator: "Westlake University",
    category: "variant-effect",
    primary_metric_name: "Spearman Rho (ProteinGym DMS)",
    raw_metric_value: 0.66,
    use_case_index_score: normalizeBiologicalScore(0.66, 0.0, 0.78),
    margin_over_conventional: computeMarginOverConventional(0.66, 0.31),
    fraction_of_biological_ceiling: computeFractionOfCeiling(0.66, 0.78),
    baselines: BIOLOGICAL_USE_CASES["variant-effect"].baselines,
    telemetry: {
      inference_latency_ms: 85,
      throughput_items_per_sec: 11.8,
      min_vram_gb: 8,
      parameter_count_millions: 650,
      estimated_cost_per_1k_evals_usd: 0.08,
      open_weights: true,
      license: "Apache-2.0",
      context_window_length: 1024,
    },
    pareto_optimal: false,
    reviewed_status: "source_checked",
    source_record_id: "rec-saprot-iclr-2024",
    study_citations: [
      {
        study_id: "study-saprot-2024",
        title: "SaProt: Protein Language Modeling with Structure-aware Vocabulary",
        journal: "ICLR",
        year: 2024,
        doi: "10.48550/arXiv.2310.02697",
      },
    ],
  },
  {
    model_id: "model-msa-transformer",
    model_name: "MSA Transformer",
    creator: "Meta FAIR",
    category: "variant-effect",
    primary_metric_name: "Spearman Rho (ProteinGym DMS)",
    raw_metric_value: 0.63,
    use_case_index_score: normalizeBiologicalScore(0.63, 0.0, 0.78),
    margin_over_conventional: computeMarginOverConventional(0.63, 0.31),
    fraction_of_biological_ceiling: computeFractionOfCeiling(0.63, 0.78),
    baselines: BIOLOGICAL_USE_CASES["variant-effect"].baselines,
    telemetry: {
      inference_latency_ms: 520,
      throughput_items_per_sec: 1.92,
      min_vram_gb: 16,
      parameter_count_millions: 100,
      estimated_cost_per_1k_evals_usd: 0.45,
      open_weights: true,
      license: "MIT",
      context_window_length: 1024,
    },
    pareto_optimal: false,
    reviewed_status: "community_verified",
    source_record_id: "rec-msa-trans-icml-2021",
    study_citations: [
      {
        study_id: "study-msa-trans-2021",
        title: "MSA Transformer",
        journal: "ICML",
        year: 2021,
        doi: "10.48550/arXiv.2104.05244",
      },
    ],
  },

  // --- Protein Design ---
  {
    model_id: "model-rfdiffusion",
    model_name: "RFdiffusion",
    creator: "Baker Lab / IPD University of Washington",
    category: "protein-design",
    primary_metric_name: "In Silico Success Rate (scRMSD < 2.0A)",
    raw_metric_value: 0.72,
    use_case_index_score: normalizeBiologicalScore(0.72, 0.01, 0.85),
    margin_over_conventional: computeMarginOverConventional(0.72, 0.18),
    fraction_of_biological_ceiling: computeFractionOfCeiling(0.72, 0.85),
    baselines: BIOLOGICAL_USE_CASES["protein-design"].baselines,
    telemetry: {
      inference_latency_ms: 4200,
      throughput_items_per_sec: 0.24,
      min_vram_gb: 16,
      parameter_count_millions: 60,
      estimated_cost_per_1k_evals_usd: 1.2,
      open_weights: true,
      license: "BSD-3-Clause",
      context_window_length: 1024,
    },
    pareto_optimal: true,
    reviewed_status: "reproduced",
    source_record_id: "rec-rfdiffusion-nature-2023",
    study_citations: [
      {
        study_id: "study-rfdiffusion-2023",
        title: "De novo design of protein structure and function with RFdiffusion",
        journal: "Nature",
        year: 2023,
        doi: "10.1038/s41586-023-06415-8",
      },
    ],
  },
  {
    model_id: "model-chroma",
    model_name: "Chroma",
    creator: "Generate Biomedicines",
    category: "protein-design",
    primary_metric_name: "In Silico Success Rate (scRMSD < 2.0A)",
    raw_metric_value: 0.69,
    use_case_index_score: normalizeBiologicalScore(0.69, 0.01, 0.85),
    margin_over_conventional: computeMarginOverConventional(0.69, 0.18),
    fraction_of_biological_ceiling: computeFractionOfCeiling(0.69, 0.85),
    baselines: BIOLOGICAL_USE_CASES["protein-design"].baselines,
    telemetry: {
      inference_latency_ms: 3800,
      throughput_items_per_sec: 0.26,
      min_vram_gb: 16,
      parameter_count_millions: 120,
      estimated_cost_per_1k_evals_usd: 1.0,
      open_weights: true,
      license: "Custom Non-Commercial",
      context_window_length: 2048,
    },
    pareto_optimal: false,
    reviewed_status: "source_checked",
    source_record_id: "rec-chroma-nature-2023",
    study_citations: [
      {
        study_id: "study-chroma-2023",
        title: "Illuminating protein space with a programmable generative model",
        journal: "Nature",
        year: 2023,
        doi: "10.1038/s41586-023-06728-8",
      },
    ],
  },
  {
    model_id: "model-proteinmpnn",
    model_name: "ProteinMPNN",
    creator: "Baker Lab / IPD University of Washington",
    category: "protein-design",
    primary_metric_name: "In Silico Success Rate (scRMSD < 2.0A)",
    raw_metric_value: 0.62,
    use_case_index_score: normalizeBiologicalScore(0.62, 0.01, 0.85),
    margin_over_conventional: computeMarginOverConventional(0.62, 0.18),
    fraction_of_biological_ceiling: computeFractionOfCeiling(0.62, 0.85),
    baselines: BIOLOGICAL_USE_CASES["protein-design"].baselines,
    telemetry: {
      inference_latency_ms: 150,
      throughput_items_per_sec: 6.67,
      min_vram_gb: 4,
      parameter_count_millions: 1.8,
      estimated_cost_per_1k_evals_usd: 0.03,
      open_weights: true,
      license: "MIT",
      context_window_length: 2048,
    },
    pareto_optimal: true, // fastest sequence designer
    reviewed_status: "reproduced",
    source_record_id: "rec-proteinmpnn-science-2022",
    study_citations: [
      {
        study_id: "study-proteinmpnn-2022",
        title: "Robust deep learning-based protein sequence design using ProteinMPNN",
        journal: "Science",
        year: 2022,
        doi: "10.1126/science.add2187",
      },
    ],
  },
  {
    model_id: "model-esm-if1",
    model_name: "ESM-IF1",
    creator: "Meta FAIR",
    category: "protein-design",
    primary_metric_name: "In Silico Success Rate (scRMSD < 2.0A)",
    raw_metric_value: 0.58,
    use_case_index_score: normalizeBiologicalScore(0.58, 0.01, 0.85),
    margin_over_conventional: computeMarginOverConventional(0.58, 0.18),
    fraction_of_biological_ceiling: computeFractionOfCeiling(0.58, 0.85),
    baselines: BIOLOGICAL_USE_CASES["protein-design"].baselines,
    telemetry: {
      inference_latency_ms: 180,
      throughput_items_per_sec: 5.56,
      min_vram_gb: 6,
      parameter_count_millions: 142,
      estimated_cost_per_1k_evals_usd: 0.04,
      open_weights: true,
      license: "MIT",
      context_window_length: 1024,
    },
    pareto_optimal: false,
    reviewed_status: "reproduced",
    source_record_id: "rec-esm-if1-neurips-2022",
    study_citations: [
      {
        study_id: "study-esm-if1-2022",
        title: "Learning inverse folding from structurally defined proteins",
        journal: "NeurIPS",
        year: 2022,
        doi: "10.48550/arXiv.2204.05278",
      },
    ],
  },
  {
    model_id: "model-progen2",
    model_name: "ProGen2",
    creator: "Salesforce Research",
    category: "protein-design",
    primary_metric_name: "In Silico Success Rate (scRMSD < 2.0A)",
    raw_metric_value: 0.55,
    use_case_index_score: normalizeBiologicalScore(0.55, 0.01, 0.85),
    margin_over_conventional: computeMarginOverConventional(0.55, 0.18),
    fraction_of_biological_ceiling: computeFractionOfCeiling(0.55, 0.85),
    baselines: BIOLOGICAL_USE_CASES["protein-design"].baselines,
    telemetry: {
      inference_latency_ms: 950,
      throughput_items_per_sec: 1.05,
      min_vram_gb: 12,
      parameter_count_millions: 6400,
      estimated_cost_per_1k_evals_usd: 0.35,
      open_weights: true,
      license: "BSD-3-Clause",
      context_window_length: 1024,
    },
    pareto_optimal: false,
    reviewed_status: "community_verified",
    source_record_id: "rec-progen2-cell-systems-2023",
    study_citations: [
      {
        study_id: "study-progen2-2023",
        title: "ProGen2: Exploring the Boundaries of Protein Language Models",
        journal: "Cell Systems",
        year: 2023,
        doi: "10.1016/j.cels.2023.05.003",
      },
    ],
  },

  // --- Transcriptomics ---
  {
    model_id: "model-scgpt",
    model_name: "scGPT",
    creator: "Tsinghua University / Bo Wang Lab",
    category: "transcriptomics",
    primary_metric_name: "Cell Type Annotation Macro-F1",
    raw_metric_value: 0.88,
    use_case_index_score: normalizeBiologicalScore(0.88, 0.12, 0.92),
    margin_over_conventional: computeMarginOverConventional(0.88, 0.68),
    fraction_of_biological_ceiling: computeFractionOfCeiling(0.88, 0.92),
    baselines: BIOLOGICAL_USE_CASES["transcriptomics"].baselines,
    telemetry: {
      inference_latency_ms: 120,
      throughput_items_per_sec: 8.33,
      min_vram_gb: 8,
      parameter_count_millions: 100,
      estimated_cost_per_1k_evals_usd: 0.08,
      open_weights: true,
      license: "MIT",
      context_window_length: 1200,
    },
    pareto_optimal: true, // top score
    reviewed_status: "reproduced",
    source_record_id: "rec-scgpt-nmeth-2024",
    study_citations: [
      {
        study_id: "study-scgpt-2024",
        title: "scGPT: toward building a foundation model for single-cell multi-omics using generative AI",
        journal: "Nature Methods",
        year: 2024,
        doi: "10.1038/s41592-024-02201-0",
      },
    ],
  },
  {
    model_id: "model-geneformer",
    model_name: "Geneformer",
    creator: "Theodoris Lab / Broad Institute",
    category: "transcriptomics",
    primary_metric_name: "Cell Type Annotation Macro-F1",
    raw_metric_value: 0.86,
    use_case_index_score: normalizeBiologicalScore(0.86, 0.12, 0.92),
    margin_over_conventional: computeMarginOverConventional(0.86, 0.68),
    fraction_of_biological_ceiling: computeFractionOfCeiling(0.86, 0.92),
    baselines: BIOLOGICAL_USE_CASES["transcriptomics"].baselines,
    telemetry: {
      inference_latency_ms: 95,
      throughput_items_per_sec: 10.53,
      min_vram_gb: 6,
      parameter_count_millions: 30,
      estimated_cost_per_1k_evals_usd: 0.05,
      open_weights: true,
      license: "Apache-2.0",
      context_window_length: 2048,
    },
    pareto_optimal: true, // fastest single-cell transformer
    reviewed_status: "reproduced",
    source_record_id: "rec-geneformer-nature-2023",
    study_citations: [
      {
        study_id: "study-geneformer-2023",
        title: "Transfer learning enables predictions in network biology",
        journal: "Nature",
        year: 2023,
        doi: "10.1038/s41586-023-06139-9",
      },
    ],
  },
  {
    model_id: "model-scbert",
    model_name: "scBERT",
    creator: "Tencent AI Lab",
    category: "transcriptomics",
    primary_metric_name: "Cell Type Annotation Macro-F1",
    raw_metric_value: 0.83,
    use_case_index_score: normalizeBiologicalScore(0.83, 0.12, 0.92),
    margin_over_conventional: computeMarginOverConventional(0.83, 0.68),
    fraction_of_biological_ceiling: computeFractionOfCeiling(0.83, 0.92),
    baselines: BIOLOGICAL_USE_CASES["transcriptomics"].baselines,
    telemetry: {
      inference_latency_ms: 140,
      throughput_items_per_sec: 7.14,
      min_vram_gb: 8,
      parameter_count_millions: 250,
      estimated_cost_per_1k_evals_usd: 0.1,
      open_weights: true,
      license: "Apache-2.0",
      context_window_length: 1000,
    },
    pareto_optimal: false,
    reviewed_status: "source_checked",
    source_record_id: "rec-scbert-nat-mach-intell-2022",
    study_citations: [
      {
        study_id: "study-scbert-2022",
        title: "scBERT: a pre-trained deep language model for single-cell RNA-seq data",
        journal: "Nature Machine Intelligence",
        year: 2022,
        doi: "10.1038/s42256-022-00534-z",
      },
    ],
  },
  {
    model_id: "model-uce",
    model_name: "Universal Cell Embedding (UCE)",
    creator: "Arc Institute / Stanford",
    category: "transcriptomics",
    primary_metric_name: "Cell Type Annotation Macro-F1",
    raw_metric_value: 0.85,
    use_case_index_score: normalizeBiologicalScore(0.85, 0.12, 0.92),
    margin_over_conventional: computeMarginOverConventional(0.85, 0.68),
    fraction_of_biological_ceiling: computeFractionOfCeiling(0.85, 0.92),
    baselines: BIOLOGICAL_USE_CASES["transcriptomics"].baselines,
    telemetry: {
      inference_latency_ms: 110,
      throughput_items_per_sec: 9.09,
      min_vram_gb: 8,
      parameter_count_millions: 33,
      estimated_cost_per_1k_evals_usd: 0.06,
      open_weights: true,
      license: "MIT",
      context_window_length: 1500,
    },
    pareto_optimal: false,
    reviewed_status: "reproduced",
    source_record_id: "rec-uce-biorxiv-2023",
    study_citations: [
      {
        study_id: "study-uce-2023",
        title: "Universal Cell Embeddings: A foundation model for single-cell biology across organisms",
        journal: "bioRxiv",
        year: 2023,
        doi: "10.1101/2023.11.28.568918",
      },
    ],
  },
  {
    model_id: "model-celllm",
    model_name: "CellLM",
    creator: "BioMap",
    category: "transcriptomics",
    primary_metric_name: "Cell Type Annotation Macro-F1",
    raw_metric_value: 0.82,
    use_case_index_score: normalizeBiologicalScore(0.82, 0.12, 0.92),
    margin_over_conventional: computeMarginOverConventional(0.82, 0.68),
    fraction_of_biological_ceiling: computeFractionOfCeiling(0.82, 0.92),
    baselines: BIOLOGICAL_USE_CASES["transcriptomics"].baselines,
    telemetry: {
      inference_latency_ms: 80,
      throughput_items_per_sec: 12.5,
      min_vram_gb: 4,
      parameter_count_millions: 50,
      estimated_cost_per_1k_evals_usd: 0.04,
      open_weights: true,
      license: "MIT",
      context_window_length: 1000,
    },
    pareto_optimal: true, // highest throughput / low vram
    reviewed_status: "community_verified",
    source_record_id: "rec-celllm-2023",
    study_citations: [
      {
        study_id: "study-celllm-2023",
        title: "CellLM: Cross-tissue multi-organ single-cell pretraining",
        journal: "bioRxiv",
        year: 2023,
        doi: "10.1101/2023.08.15.553412",
      },
    ],
  },

  // --- Genomic Grammar ---
  {
    model_id: "model-enformer",
    model_name: "Enformer",
    creator: "Google DeepMind / Calico Life Sciences",
    category: "genomic-grammar",
    primary_metric_name: "Variant Regulatory Effect AUROC",
    raw_metric_value: 0.81,
    use_case_index_score: normalizeBiologicalScore(0.81, 0.5, 0.89),
    margin_over_conventional: computeMarginOverConventional(0.81, 0.65),
    fraction_of_biological_ceiling: computeFractionOfCeiling(0.81, 0.89),
    baselines: BIOLOGICAL_USE_CASES["genomic-grammar"].baselines,
    telemetry: {
      inference_latency_ms: 2500,
      throughput_items_per_sec: 0.4,
      min_vram_gb: 24,
      parameter_count_millions: 250,
      estimated_cost_per_1k_evals_usd: 1.5,
      open_weights: true,
      license: "Apache-2.0",
      context_window_length: 196608,
    },
    pareto_optimal: true, // highest regulatory AUROC
    reviewed_status: "reproduced",
    source_record_id: "rec-enformer-nmeth-2021",
    study_citations: [
      {
        study_id: "study-enformer-2021",
        title: "Effective gene expression prediction from sequence by integrating long-range interactions",
        journal: "Nature Methods",
        year: 2021,
        doi: "10.1038/s41592-021-01252-x",
      },
    ],
  },
  {
    model_id: "model-hyenadna",
    model_name: "HyenaDNA",
    creator: "Stanford Hazy Research",
    category: "genomic-grammar",
    primary_metric_name: "Variant Regulatory Effect AUROC",
    raw_metric_value: 0.79,
    use_case_index_score: normalizeBiologicalScore(0.79, 0.5, 0.89),
    margin_over_conventional: computeMarginOverConventional(0.79, 0.65),
    fraction_of_biological_ceiling: computeFractionOfCeiling(0.79, 0.89),
    baselines: BIOLOGICAL_USE_CASES["genomic-grammar"].baselines,
    telemetry: {
      inference_latency_ms: 320,
      throughput_items_per_sec: 3.12,
      min_vram_gb: 8,
      parameter_count_millions: 42,
      estimated_cost_per_1k_evals_usd: 0.2,
      open_weights: true,
      license: "Apache-2.0",
      context_window_length: 1000000,
    },
    pareto_optimal: true, // megabase context at low latency
    reviewed_status: "reproduced",
    source_record_id: "rec-hyenadna-neurips-2023",
    study_citations: [
      {
        study_id: "study-hyenadna-2023",
        title: "HyenaDNA: Long-Range Genomic Sequence Modeling at Single-Nucleotide Resolution",
        journal: "NeurIPS",
        year: 2023,
        doi: "10.48550/arXiv.2306.15794",
      },
    ],
  },
  {
    model_id: "model-nucleotide-transformer",
    model_name: "Nucleotide Transformer",
    creator: "InstaDeep / NVIDIA BioNeMo",
    category: "genomic-grammar",
    primary_metric_name: "Variant Regulatory Effect AUROC",
    raw_metric_value: 0.78,
    use_case_index_score: normalizeBiologicalScore(0.78, 0.5, 0.89),
    margin_over_conventional: computeMarginOverConventional(0.78, 0.65),
    fraction_of_biological_ceiling: computeFractionOfCeiling(0.78, 0.89),
    baselines: BIOLOGICAL_USE_CASES["genomic-grammar"].baselines,
    telemetry: {
      inference_latency_ms: 450,
      throughput_items_per_sec: 2.22,
      min_vram_gb: 12,
      parameter_count_millions: 2500,
      estimated_cost_per_1k_evals_usd: 0.35,
      open_weights: true,
      license: "Apache-2.0",
      context_window_length: 12288,
    },
    pareto_optimal: false,
    reviewed_status: "reproduced",
    source_record_id: "rec-nt-biorxiv-2023",
    study_citations: [
      {
        study_id: "study-nt-2023",
        title: "The Nucleotide Transformer: Building and Evaluating Robust Foundation Models for Human Genomics",
        journal: "bioRxiv",
        year: 2023,
        doi: "10.1101/2023.01.11.523679",
      },
    ],
  },
  {
    model_id: "model-dnabert2",
    model_name: "DNABERT-2",
    creator: "Zhou Lab",
    category: "genomic-grammar",
    primary_metric_name: "Variant Regulatory Effect AUROC",
    raw_metric_value: 0.74,
    use_case_index_score: normalizeBiologicalScore(0.74, 0.5, 0.89),
    margin_over_conventional: computeMarginOverConventional(0.74, 0.65),
    fraction_of_biological_ceiling: computeFractionOfCeiling(0.74, 0.89),
    baselines: BIOLOGICAL_USE_CASES["genomic-grammar"].baselines,
    telemetry: {
      inference_latency_ms: 210,
      throughput_items_per_sec: 4.76,
      min_vram_gb: 6,
      parameter_count_millions: 117,
      estimated_cost_per_1k_evals_usd: 0.15,
      open_weights: true,
      license: "Apache-2.0",
      context_window_length: 4096,
    },
    pareto_optimal: false,
    reviewed_status: "source_checked",
    source_record_id: "rec-dnabert2-iclr-2024",
    study_citations: [
      {
        study_id: "study-dnabert2-2024",
        title: "DNABERT-2: Efficient Foundation Model and Generalized Benchmark for Genome Understanding",
        journal: "ICLR",
        year: 2024,
        doi: "10.48550/arXiv.2306.15006",
      },
    ],
  },
  {
    model_id: "model-caduceus",
    model_name: "Caduceus",
    creator: "Stanford / Arc Institute",
    category: "genomic-grammar",
    primary_metric_name: "Variant Regulatory Effect AUROC",
    raw_metric_value: 0.77,
    use_case_index_score: normalizeBiologicalScore(0.77, 0.5, 0.89),
    margin_over_conventional: computeMarginOverConventional(0.77, 0.65),
    fraction_of_biological_ceiling: computeFractionOfCeiling(0.77, 0.89),
    baselines: BIOLOGICAL_USE_CASES["genomic-grammar"].baselines,
    telemetry: {
      inference_latency_ms: 290,
      throughput_items_per_sec: 3.45,
      min_vram_gb: 8,
      parameter_count_millions: 38,
      estimated_cost_per_1k_evals_usd: 0.18,
      open_weights: true,
      license: "Apache-2.0",
      context_window_length: 131072,
    },
    pareto_optimal: true, // bidirectional RC equivariance
    reviewed_status: "community_verified",
    source_record_id: "rec-caduceus-iclr-2024",
    study_citations: [
      {
        study_id: "study-caduceus-2024",
        title: "Caduceus: Bi-Directional Equivariant Long-Range DNA Sequence Modeling",
        journal: "ICLR",
        year: 2024,
        doi: "10.48550/arXiv.2403.03234",
      },
    ],
  },
];

/**
 * Returns biological model ranking rows for a given use case slug or all,
 * with dynamically computed Pareto efficiency and sorted by capability index descending.
 */
export function getSampleBiologicalRankings(useCaseSlug?: string): BiologicalModelRankingRow[] {
  const models = useCaseSlug
    ? SYNTHETIC_BIOLOGICAL_MODELS.filter((m) => m.category === useCaseSlug)
    : [...SYNTHETIC_BIOLOGICAL_MODELS];
  return computeParetoFrontier(models).sort((a, b) => b.use_case_index_score - a.use_case_index_score);
}

/**
 * Builds a valid synthetic CatalogueSnapshot populated with models, benchmarks, and claims.
 */
export function createSyntheticBiologicalSnapshot(): CatalogueSnapshot {
  const records: CatalogueRecord[] = [];

  // Add model entities
  for (const m of SYNTHETIC_BIOLOGICAL_MODELS) {
    records.push({
      id: m.model_id,
      kind: "model",
      name: m.model_name,
      description: `${m.model_name} developed by ${m.creator} for ${m.category}.`,
      status: m.reviewed_status,
      facets: {
        areas: [m.category],
        creators: [m.creator],
        licenses: [m.telemetry.license],
      },
      source_ids: [m.source_record_id],
      links: [{ relation: "evaluated_on", target_id: `benchmark-${m.category}` }],
      attributes: {
        creator: m.creator,
        open_weights: m.telemetry.open_weights,
        parameter_count_millions: m.telemetry.parameter_count_millions,
        inference_latency_ms: m.telemetry.inference_latency_ms,
        min_vram_gb: m.telemetry.min_vram_gb,
        primary_metric_name: m.primary_metric_name,
        raw_metric_value: m.raw_metric_value,
        use_case_index_score: m.use_case_index_score,
      },
    });
  }

  // Add benchmark entities for the 5 use cases
  for (const [slug, def] of Object.entries(BIOLOGICAL_USE_CASES)) {
    records.push({
      id: `benchmark-${slug}`,
      kind: "benchmark",
      name: `${def.name} Standard Benchmark Panel`,
      description: def.description,
      status: "reviewed",
      facets: { areas: [slug] },
      source_ids: [`rec-benchmark-${slug}`],
      links: [],
      attributes: {
        use_case_slug: slug,
        primary_metric: def.primaryMetric,
        baselines: def.baselines,
      },
    });
  }

  return {
    schema_version: "3.4",
    release_id: "2026-11-02-a7f03c9e55a5",
    released_at: "2026-11-02T00:00:00Z",
    coverage: {
      models: SYNTHETIC_BIOLOGICAL_MODELS.length,
      use_cases: Object.keys(BIOLOGICAL_USE_CASES).length,
    },
    records,
  };
}

// =========================================================================
// Standardized Biological Test Utilities & Telemetry Formatters
// =========================================================================

/**
 * Strict Progressive Milestone Binding Helper.
 * 
 * In a dual-track workflow, tests must define expectations against planned module
 * paths without crashing Vitest during module collection, but MUST FAIL HONESTLY
 * if the module is missing or fails to satisfy its exported contract.
 * 
 * NEVER fall back to synthetic mocks. NEVER swallow the load error.
 */
export async function bindModule<T>(
  loader: () => Promise<T>,
  modulePath: string,
  milestone: string,
  featureId: string
): Promise<T> {
  try {
    return await loader();
  } catch (err) {
    throw new Error(
      `[ACCEPTANCE GATE UNMET] Milestone ${milestone} (Feature ${featureId}) is incomplete.\n` +
      `Required production module '${modulePath}' is not implemented or failed to load.\n` +
      `Underlying error: ${err instanceof Error ? err.message : String(err)}\n` +
      `Action: The Implementation Track worker must author '${modulePath}' to satisfy this contract.`
    );
  }
}

/**
 * Formats inference latency in human-readable units (ms or s).
 * Returns "N/A" for null, undefined, zero, or non-finite values.
 */
export function formatLatencyMs(latencyMs: number | null | undefined): string {
  if (latencyMs == null || latencyMs <= 0 || !Number.isFinite(latencyMs)) return "N/A";
  if (latencyMs >= 1000) {
    const sec = latencyMs / 1000;
    return `${sec.toFixed(sec >= 10 ? 1 : 2)} s`;
  }
  return `${Math.round(latencyMs)} ms`;
}
export const formatLatency = formatLatencyMs;

/**
 * Formats neural architecture parameter scale (Millions, Billions, Trillions).
 * Accurately formats non-neural baselines (0 params) and extreme scales up to 10T+.
 */
export function formatParamCount(paramsM: number | null | undefined): string {
  if (paramsM == null || !Number.isFinite(paramsM)) return "N/A";
  if (paramsM === 0) return "< 1M (non-neural)";
  if (paramsM >= 1_000_000) {
    const t = paramsM / 1_000_000;
    return `${Number.isInteger(t) ? t : t.toFixed(1)}T`;
  }
  if (paramsM >= 1_000) {
    const b = paramsM / 1_000;
    return `${Number.isInteger(b) ? b : b.toFixed(1)}B`;
  }
  return `${paramsM}M`;
}
export const formatParameterCount = formatParamCount;
export const formatExtremeScale = formatParamCount;

/**
 * Formats minimum GPU VRAM requirement.
 * Returns "CPU / API" for 0 VRAM and "N/A" for null/unmeasured.
 */
export function formatVramGb(vramGb: number | null | undefined): string {
  if (vramGb == null || !Number.isFinite(vramGb)) return "N/A";
  if (vramGb === 0) return "CPU / API";
  return `${vramGb} GB`;
}
export const formatVram = formatVramGb;

/**
 * Formats license description with fallback based on open_weights status.
 */
export function formatLicense(openWeights: boolean, license?: string | null): string {
  if (!license || !license.trim()) {
    return openWeights ? "Open Source" : "Proprietary";
  }
  return license;
}

/**
 * Normalizes DOI strings into canonical HTTPS URLs.
 */
export function formatDoiUrl(doi?: string | null): string {
  if (!doi || !doi.trim()) return "No DOI available";
  const cleanDoi = doi.replace(/^https?:\/\/doi\.org\//i, "").trim();
  return `https://doi.org/${cleanDoi}`;
}

/**
 * Formats numerical metric values with bounded decimal places and fallback dash.
 */
export function formatMetricValue(val: number | null | undefined, decimals = 2): string {
  if (val == null || !Number.isFinite(val)) return "—";
  return Number(val.toFixed(decimals)).toString();
}

/**
 * Verifies whether a biological model row possesses expandable secondary details.
 */
export function hasSecondaryDetails(row: BiologicalModelRankingRow): boolean {
  return Boolean(
    (row.study_citations && row.study_citations.length > 0) ||
    row.fraction_of_biological_ceiling !== undefined ||
    row.telemetry.context_window_length !== undefined
  );
}

/**
 * Safely parses JSON strings with typed fallback on syntax errors.
 */
export function safeParseJson<T>(jsonStr: string, fallback: T): T {
  try {
    return JSON.parse(jsonStr) as T;
  } catch {
    return fallback;
  }
}

/**
 * Validates and resolves a use case category slug against registered biological use cases.
 */
export function resolveUseCaseSlug(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return BIOLOGICAL_USE_CASES[slug] ? slug : null;
}

/**
 * Generates structured Generative Engine Optimization (GEO) summary takeaway triples.
 */
export function generateGeoSummary(useCaseSlug: string, models: BiologicalModelRankingRow[]): string {
  const uc = BIOLOGICAL_USE_CASES[useCaseSlug];
  if (!uc || models.length === 0) {
    return "No models currently evaluated for this use case against registered protocol baselines.";
  }
  const top = models[0];
  const ceilingText = top.fraction_of_biological_ceiling !== undefined
    ? ` and reaching ${(top.fraction_of_biological_ceiling * 100).toFixed(1)}% of the experimental ceiling`
    : "";
  return `${top.model_name} leads ${uc.name} with an index score of ${top.use_case_index_score.toFixed(1)} (${top.raw_metric_value} ${top.primary_metric_name}), achieving a ${top.margin_over_conventional >= 0 ? "+" : ""}${top.margin_over_conventional.toFixed(1)}% margin over conventional baseline${ceilingText}.`;
}

/**
 * Normalizes canonical URLs by stripping trailing slashes.
 */
export function normalizeCanonicalUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * Generates a test RecordDetail for PredictiveEntityDetail tests.
 */
export function createTestPredictiveRecordDetail(overrides?: Partial<CatalogueRecord>): RecordDetail {
  const baseRecord: CatalogueRecord = {
    id: "alphafold-3",
    kind: "model",
    name: "AlphaFold 3",
    description: "Accurate structure prediction of biomolecular complexes.",
    status: "source_checked",
    facets: { areas: ["structure-prediction"], creators: ["Google DeepMind"] },
    source_ids: ["source-nature-2024"],
    links: [{ relation: "evaluated_on", target_id: "benchmark-casp15" }],
    attributes: {
      creator: "Google DeepMind",
      open_weights: false,
      inference_latency_ms: 12000,
      min_vram_gb: 24,
      ...overrides?.attributes,
    },
    ...overrides,
  };
  return {
    record: baseRecord,
    direct: [],
    reverse: [],
    sources: [{
      id: "source-nature-2024",
      kind: "source",
      name: "Nature (2024) AF3 Paper",
      description: "Primary reference",
      status: "source_checked",
      facets: {},
      source_ids: [],
      links: [],
      attributes: { url: "https://doi.org/10.1038/s41586-024-07487-w", version: "2024" },
    }],
    profile: { success: false },
  } as unknown as RecordDetail;
}

/**
 * Generates a cluttered Comparison fixture with >5 secondary values to test cell decluttering.
 */
export function createClutteredComparison(): Comparison {
  return {
    id: "study-cluttered-dms",
    title: "Deep Mutational Scanning Benchmark",
    endpoint: "spearman_rho",
    columnEndpoints: [],
    relevance: "direct",
    layout: "metrics",
    headline: { metric: "spearman_rho", label: "Spearman Rho", direction: "higher" },
    columns: [{ label: "Spearman Rho", metric: "spearman_rho", qualifier: null, direction: "higher" }],
    rows: [
      {
        id: "row-esm2",
        name: "ESM-2 3B",
        detail: "Zero-shot variant prediction",
        parentId: null,
        methodTypes: ["foundation_model"],
        origin: null,
        resultIds: ["res-1"],
        cells: [
          {
            printed: "0.68",
            numeric: 0.68,
            best: true,
            shown: { text: "0.68", missing: false },
            qualifier: null,
            secondary: [
              { label: "Precision", text: "0.72", title: "Precision" },
              { label: "Recall", text: "0.65", title: "Recall" },
              { label: "AUROC", text: "0.84", title: "AUROC" },
              { label: "AUPRC", text: "0.79", title: "AUPRC" },
              { label: "F1 Score", text: "0.68", title: "F1 Score" },
              { label: "Latency", text: "45 ms", title: "Latency" },
            ],
          },
        ],
      },
    ],
    origins: [],
    limitations: [],
    protocols: [],
    mappingIds: [],
    legend: [],
  } as unknown as Comparison;
}
