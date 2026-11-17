import { describe, it, expect } from "vitest";
import {
  EPSILON,
  CATEGORY_PROTOCOL_BASELINES,
  calculateCapabilityIndex,
  computeCapabilityIndex,
  calculateConventionalMargin,
  computePerformanceMargin,
  calculateFractionOfCeiling,
  computeFractionOfCeiling,
  computeParetoOptimal,
  computeParetoFrontier,
  getUseCaseLeaderboard,
  normalizeCategory,
  categoryForSlug,
  type BiologicalModelRankingRow,
} from "../../lib/use-case-leaderboard";
import {
  getModelTelemetry,
  parseParameterCountMillions,
  parseContextWindowLength,
  parseOpenWeights,
  parseLicense,
} from "../../lib/operational-telemetry";

describe("Operational Telemetry Parser & Registry", () => {
  it("provides curated telemetry for biological frontier models", () => {
    const esm2 = getModelTelemetry("esm-2", "ESM-2 (3B)");
    expect(esm2.inference_latency_ms).toBe(110);
    expect(esm2.min_vram_gb).toBe(24);
    expect(esm2.parameter_count_millions).toBe(3000);
    expect(esm2.open_weights).toBe(true);
    expect(esm2.license).toBe("MIT");

    const af3 = getModelTelemetry("alphafold-3", "AlphaFold 3");
    expect(af3.inference_latency_ms).toBe(14200);
    expect(af3.min_vram_gb).toBe(80);
    expect(af3.open_weights).toBe(false);
    expect(af3.license).toBe("Non-commercial Research");

    const boltz1 = getModelTelemetry("boltz-1", "Boltz-1");
    expect(boltz1.inference_latency_ms).toBe(1200);
    expect(boltz1.min_vram_gb).toBe(16);
    expect(boltz1.open_weights).toBe(true);

    const poet2 = getModelTelemetry("poet-2", "PoET-2");
    expect(poet2.inference_latency_ms).toBe(42);
    expect(poet2.throughput_items_per_sec).toBe(23.8);
    expect(poet2.open_weights).toBe(true);
  });

  it("handles baseline models with safe zero-resource defaults", () => {
    const blosum = getModelTelemetry("blosum62-baseline", "BLOSUM62");
    expect(blosum.inference_latency_ms).toBe(0.1);
    expect(blosum.min_vram_gb).toBe(0);
    expect(blosum.open_weights).toBe(true);
    expect(blosum.license).toBe("Public Domain");

    const random = getModelTelemetry("random-fold", "Random fold");
    expect(random.min_vram_gb).toBe(0);
    expect(random.open_weights).toBe(true);
  });

  it("parses parameter counts from free text strings", () => {
    expect(parseParameterCountMillions("Approximately 450M trainable parameters")).toBe(450);
    expect(parseParameterCountMillions("3B protein-language-model")).toBe(3000);
    expect(parseParameterCountMillions("117 million parameters")).toBe(117);
    expect(parseParameterCountMillions("15b checkpoints")).toBe(15000);
    expect(parseParameterCountMillions("No parameter info")).toBeNull();
    expect(parseParameterCountMillions("")).toBeNull();
  });

  it("parses context window limits from free text strings", () => {
    expect(parseContextWindowLength("Up to 1 million base pairs")).toBe(1000000);
    expect(parseContextWindowLength("8K context")).toBe(8192);
    expect(parseContextWindowLength("196,608 bases")).toBe(196608);
    expect(parseContextWindowLength("2,048 gene tokens")).toBe(2048);
    expect(parseContextWindowLength("No limits")).toBeNull();
    expect(parseContextWindowLength("")).toBeNull();
  });

  it("parses open weights status and licenses accurately", () => {
    expect(parseOpenWeights("MIT", "https://github.com/facebook/esm")).toBe(true);
    expect(parseOpenWeights("Apache-2.0", "Hugging Face model weights")).toBe(true);
    expect(parseOpenWeights("Proprietary", "Commercial API only")).toBe(false);
    expect(parseOpenWeights("Non-commercial AlphaGenome terms", "")).toBe(false);

    expect(parseLicense("Apache-2.0 license", "")).toBe("Apache-2.0");
    expect(parseLicense("MIT License", "")).toBe("MIT");
    expect(parseLicense("BSD 3-Clause", "")).toBe("BSD");
    expect(parseLicense("Public Domain", "")).toBe("Public Domain");
    expect(parseLicense("", "")).toBe("Unspecified");
  });

  it("falls back gracefully for unknown models with profile facts", () => {
    const unknownWithFacts = getModelTelemetry("unknown-model-xyz", "Custom Model", {
      attributes: {
        access: "Public code on GitHub",
        profile: {
          facts: [
            { label: "Parameters", value: "350M parameters" },
            { label: "Context limits", value: "4096 tokens" },
            { label: "Weights licence", value: "MIT" },
          ],
        },
      },
    });

    expect(unknownWithFacts.inference_latency_ms).toBeNull();
    expect(unknownWithFacts.parameter_count_millions).toBe(350);
    expect(unknownWithFacts.context_window_length).toBe(4096);
    expect(unknownWithFacts.open_weights).toBe(true);
    expect(unknownWithFacts.license).toBe("MIT");
  });
});

describe("Direction-Adjusted Performance Margin (Δconv)", () => {
  it("calculates positive margin for higher-is-better metrics", () => {
    const margin = calculateConventionalMargin(0.612, 0.430, 1);
    expect(margin).toBeCloseTo(42.3255, 3);
  });

  it("returns exactly 0.0 at conventional baseline", () => {
    expect(calculateConventionalMargin(0.430, 0.430, 1)).toBe(0);
  });

  it("calculates negative margin for sub-baseline performance", () => {
    const margin = calculateConventionalMargin(0.215, 0.430, 1);
    expect(margin).toBeCloseTo(-50.0, 3);
  });

  it("handles S_conv = 0 without division by zero for d = +1", () => {
    expect(calculateConventionalMargin(0.250, 0.0, 1)).toBe(25.0);
  });

  it("handles S_conv = 0 for d = -1", () => {
    expect(calculateConventionalMargin(0.050, 0.0, -1)).toBe(-5.0);
  });

  it("calculates positive margin for lower-is-better (improved error)", () => {
    const margin = calculateConventionalMargin(1.2, 4.5, -1);
    expect(margin).toBeCloseTo(73.3333, 3);
  });

  it("calculates negative margin for lower-is-better (worse error)", () => {
    const margin = calculateConventionalMargin(6.0, 4.5, -1);
    expect(margin).toBeCloseTo(-33.3333, 3);
  });

  it("handles negative S_conv with d = +1", () => {
    const margin = calculateConventionalMargin(-0.1, -0.5, 1);
    expect(margin).toBeCloseTo(80.0, 3);
  });

  it("ensures alias computePerformanceMargin is identical", () => {
    expect(computePerformanceMargin(0.612, 0.430, 1)).toBe(
      calculateConventionalMargin(0.612, 0.430, 1)
    );
  });
});

describe("Piecewise 0-100 Capability Index (Index(S_model))", () => {
  const variantAnchors = { null: 0.0, conv: 0.430, ceiling: 0.740, d: 1 as const };
  const designAnchors = { null: 12.0, conv: 4.5, ceiling: 1.0, d: -1 as const };

  it("guarantees Index = 0.0 at null baseline (higher-is-better)", () => {
    expect(
      calculateCapabilityIndex(
        0.0,
        variantAnchors.null,
        variantAnchors.conv,
        variantAnchors.ceiling,
        1
      )
    ).toBe(0.0);
  });

  it("clamps to 0.0 below null baseline (higher-is-better)", () => {
    expect(
      calculateCapabilityIndex(
        -0.25,
        variantAnchors.null,
        variantAnchors.conv,
        variantAnchors.ceiling,
        1
      )
    ).toBe(0.0);
  });

  it("guarantees Index = 50.0 at conventional baseline (higher-is-better)", () => {
    expect(
      calculateCapabilityIndex(
        0.430,
        variantAnchors.null,
        variantAnchors.conv,
        variantAnchors.ceiling,
        1
      )
    ).toBe(50.0);
  });

  it("calculates super-baseline Index for PoET-2 (0.612)", () => {
    const idx = calculateCapabilityIndex(
      0.612,
      variantAnchors.null,
      variantAnchors.conv,
      variantAnchors.ceiling,
      1
    );
    expect(idx).toBeCloseTo(79.3548, 3);
  });

  it("guarantees Index = 100.0 at ceiling (higher-is-better)", () => {
    expect(
      calculateCapabilityIndex(
        0.740,
        variantAnchors.null,
        variantAnchors.conv,
        variantAnchors.ceiling,
        1
      )
    ).toBe(100.0);
  });

  it("clamps to 100.0 above ceiling (higher-is-better)", () => {
    expect(
      calculateCapabilityIndex(
        0.850,
        variantAnchors.null,
        variantAnchors.conv,
        variantAnchors.ceiling,
        1
      )
    ).toBe(100.0);
  });

  it("scales against conventional when ceiling is undefined (higher-is-better)", () => {
    expect(calculateCapabilityIndex(0.645, 0.0, 0.430, undefined, 1)).toBeCloseTo(75.0, 3);
  });

  it("guarantees Index = 0.0 at null baseline (lower-is-better)", () => {
    expect(
      calculateCapabilityIndex(
        12.0,
        designAnchors.null,
        designAnchors.conv,
        designAnchors.ceiling,
        -1
      )
    ).toBe(0.0);
  });

  it("clamps to 0.0 worse than null baseline (lower-is-better)", () => {
    expect(
      calculateCapabilityIndex(
        15.0,
        designAnchors.null,
        designAnchors.conv,
        designAnchors.ceiling,
        -1
      )
    ).toBe(0.0);
  });

  it("guarantees Index = 50.0 at conventional baseline (lower-is-better)", () => {
    expect(
      calculateCapabilityIndex(
        4.5,
        designAnchors.null,
        designAnchors.conv,
        designAnchors.ceiling,
        -1
      )
    ).toBe(50.0);
  });

  it("calculates super-baseline Index for Chroma (1.2 Å)", () => {
    const idx = calculateCapabilityIndex(
      1.2,
      designAnchors.null,
      designAnchors.conv,
      designAnchors.ceiling,
      -1
    );
    expect(idx).toBeCloseTo(97.1429, 3);
  });

  it("guarantees Index = 100.0 at ceiling (lower-is-better)", () => {
    expect(
      calculateCapabilityIndex(
        1.0,
        designAnchors.null,
        designAnchors.conv,
        designAnchors.ceiling,
        -1
      )
    ).toBe(100.0);
  });

  it("clamps to 100.0 beyond ceiling (lower-is-better)", () => {
    expect(
      calculateCapabilityIndex(
        0.5,
        designAnchors.null,
        designAnchors.conv,
        designAnchors.ceiling,
        -1
      )
    ).toBe(100.0);
  });

  it("scales against conventional when ceiling is undefined (lower-is-better)", () => {
    expect(calculateCapabilityIndex(2.25, 12.0, 4.5, undefined, -1)).toBeCloseTo(75.0, 3);
  });

  it("handles non-finite inputs safely", () => {
    expect(calculateCapabilityIndex(NaN, 0, 0.5, 1.0, 1)).toBe(0);
    expect(calculateCapabilityIndex(Infinity, 0, 0.5, 1.0, 1)).toBe(0);
  });

  it("protects against zero denominator when S_conv === S_null", () => {
    const idx = calculateCapabilityIndex(0.5, 0.4, 0.4, 0.8, 1);
    expect(Number.isFinite(idx)).toBe(true);
  });

  it("ensures alias computeCapabilityIndex is identical", () => {
    expect(computeCapabilityIndex(0.612, 0.0, 0.430, 0.740, 1)).toBe(
      calculateCapabilityIndex(0.612, 0.0, 0.430, 0.740, 1)
    );
  });
});

describe("Fraction of Biological Ceiling Captured (F_ceiling)", () => {
  it("returns 0.0 at null baseline", () => {
    expect(calculateFractionOfCeiling(0.0, 0.0, 0.740, 1)).toBe(0.0);
  });

  it("calculates ceiling fraction for PoET-2 (0.612 / 0.740)", () => {
    const frac = calculateFractionOfCeiling(0.612, 0.0, 0.740, 1);
    expect(frac).toBeCloseTo(82.7027, 3);
  });

  it("returns 100.0 at ceiling", () => {
    expect(calculateFractionOfCeiling(0.740, 0.0, 0.740, 1)).toBe(100.0);
  });

  it("clamps to 100.0 above ceiling", () => {
    expect(calculateFractionOfCeiling(0.850, 0.0, 0.740, 1)).toBe(100.0);
  });

  it("clamps to 0.0 below null", () => {
    expect(calculateFractionOfCeiling(-0.100, 0.0, 0.740, 1)).toBe(0.0);
  });

  it("returns undefined when ceiling is undefined", () => {
    expect(calculateFractionOfCeiling(0.612, 0.0, undefined, 1)).toBeUndefined();
  });

  it("calculates lower-is-better ceiling fraction for Chroma (1.2 Å vs [12.0, 1.0])", () => {
    const frac = calculateFractionOfCeiling(1.2, 12.0, 1.0, -1);
    expect(frac).toBeCloseTo(98.1818, 3);
  });

  it("handles non-finite score safely", () => {
    expect(calculateFractionOfCeiling(NaN, 0.0, 0.740, 1)).toBe(0);
  });

  it("ensures alias computeFractionOfCeiling is identical", () => {
    expect(computeFractionOfCeiling(0.612, 0.0, 0.740, 1)).toBe(
      calculateFractionOfCeiling(0.612, 0.0, 0.740, 1)
    );
  });
});

describe("2D Pareto Efficiency Algorithm", () => {
  const panel = [
    { id: "m-boltz-1", quality: 93.9, cost: 1200 },
    { id: "m-esmfold", quality: 84.0, cost: 400 },
    { id: "m-alphafold-3", quality: 95.0, cost: 14200 },
    { id: "m-slow-mediocre", quality: 80.0, cost: 2000 },
    { id: "m-fast-baseline", quality: 50.0, cost: 10 },
    { id: "m-unmeasured", quality: 96.0, cost: null },
    { id: "m-tied-1", quality: 88.0, cost: 600 },
    { id: "m-tied-2", quality: 88.0, cost: 600 },
  ];

  it("identifies correct non-dominated Pareto frontier models", () => {
    const paretoIds = computeParetoOptimal(panel);

    expect(paretoIds.has("m-boltz-1")).toBe(true);
    expect(paretoIds.has("m-esmfold")).toBe(true);
    expect(paretoIds.has("m-alphafold-3")).toBe(true);
    expect(paretoIds.has("m-fast-baseline")).toBe(true);
    expect(paretoIds.has("m-tied-1")).toBe(true);
    expect(paretoIds.has("m-tied-2")).toBe(true);

    expect(paretoIds.has("m-slow-mediocre")).toBe(false);
    expect(paretoIds.has("m-unmeasured")).toBe(false);
  });

  it("handles empty set", () => {
    expect(computeParetoOptimal([]).size).toBe(0);
  });

  it("handles single eligible model", () => {
    const res = computeParetoOptimal([{ id: "only", quality: 80, cost: 100 }]);
    expect(res.has("only")).toBe(true);
  });

  it("excludes non-positive cost models", () => {
    const res = computeParetoOptimal([
      { id: "zero-cost", quality: 99, cost: 0 },
      { id: "negative-cost", quality: 99, cost: -10 },
      { id: "valid", quality: 80, cost: 100 },
    ]);
    expect(res.has("zero-cost")).toBe(false);
    expect(res.has("negative-cost")).toBe(false);
    expect(res.has("valid")).toBe(true);
  });

  it("computes Pareto frontier boolean array for rows", () => {
    const rows: BiologicalModelRankingRow[] = [
      {
        model_id: "m-fast",
        model_name: "Fast",
        creator: "A",
        category: "variant_effect",
        primary_metric_name: "rho",
        raw_metric_value: 0.5,
        use_case_index_score: 90,
        margin_over_conventional: 10,
        baselines: CATEGORY_PROTOCOL_BASELINES.variant_effect,
        telemetry: {
          inference_latency_ms: 10,
          throughput_items_per_sec: 100,
          min_vram_gb: 8,
          parameter_count_millions: 100,
          estimated_cost_per_1k_evals_usd: 0.01,
          open_weights: true,
          license: "MIT",
          context_window_length: 1024,
        },
        pareto_optimal: false,
        reviewed_status: "reproduced",
        source_record_id: "src-1",
      },
      {
        model_id: "m-dominated",
        model_name: "Dominated",
        creator: "B",
        category: "variant_effect",
        primary_metric_name: "rho",
        raw_metric_value: 0.4,
        use_case_index_score: 70,
        margin_over_conventional: 0,
        baselines: CATEGORY_PROTOCOL_BASELINES.variant_effect,
        telemetry: {
          inference_latency_ms: 50,
          throughput_items_per_sec: 20,
          min_vram_gb: 16,
          parameter_count_millions: 200,
          estimated_cost_per_1k_evals_usd: 0.05,
          open_weights: true,
          license: "MIT",
          context_window_length: 1024,
        },
        pareto_optimal: false,
        reviewed_status: "source_checked",
        source_record_id: "src-2",
      },
    ];

    const frontier = computeParetoFrontier(rows);
    expect(frontier).toEqual([true, false]);
  });
});

describe("getUseCaseLeaderboard Aggregator", () => {
  it("defaults to variant_effect with authentic models and baselines", () => {
    const res = getUseCaseLeaderboard();
    expect(res.category).toBe("variant_effect");
    expect(res.primary_metric_name).toBe("Spearman Rho");
    expect(res.metric_direction).toBe("higher");
    expect(res.rows.length).toBeGreaterThanOrEqual(5);

    const top = res.rows[0];
    expect(top.model_name).toBe("PoET-2");
    expect(top.use_case_index_score).toBeCloseTo(79.35, 1);
    expect(top.pareto_optimal).toBe(true);

    const baseline = res.rows.find((r) => r.is_baseline && r.model_name.includes("BLOSUM62"));
    expect(baseline).toBeDefined();
    expect(baseline?.use_case_index_score).toBe(50.0);
  });

  it("loads structure_prediction leaderboard correctly", () => {
    const res = getUseCaseLeaderboard(undefined, { category: "structure_prediction" });
    expect(res.category).toBe("structure_prediction");
    expect(res.primary_metric_name).toBe("lDDT");
    expect(res.rows.some((r) => r.model_name === "AlphaFold 3")).toBe(true);
    expect(res.rows.some((r) => r.model_name === "Boltz-1")).toBe(true);
  });

  it("loads protein_design leaderboard with lower-is-better scRMSD", () => {
    const res = getUseCaseLeaderboard(undefined, { category: "protein_design" });
    expect(res.category).toBe("protein_design");
    expect(res.primary_metric_name).toBe("scRMSD");
    expect(res.metric_direction).toBe("lower");
    expect(res.rows.some((r) => r.model_name === "Chroma")).toBe(true);
  });

  it("loads transcriptomics leaderboard", () => {
    const res = getUseCaseLeaderboard(undefined, { category: "transcriptomics" });
    expect(res.category).toBe("transcriptomics");
    expect(res.primary_metric_name).toBe("Pearson r");
    expect(res.rows.some((r) => r.model_name === "GEARS")).toBe(true);
  });

  it("loads genomic_grammar leaderboard", () => {
    const res = getUseCaseLeaderboard(undefined, { category: "genomic_grammar" });
    expect(res.category).toBe("genomic_grammar");
    expect(res.primary_metric_name).toBe("AUROC");
    expect(res.rows.some((r) => r.model_name === "Enformer")).toBe(true);
  });

  it("supports use_case_slug parameter and maps to category", () => {
    const res = getUseCaseLeaderboard(undefined, {
      use_case_slug: "structural-hypotheses-experiments",
    });
    expect(res.category).toBe("structure_prediction");
  });

  it("filters models by open_weights_only", () => {
    const res = getUseCaseLeaderboard(undefined, {
      category: "structure_prediction",
      open_weights_only: true,
    });
    // AlphaFold 3 has open_weights = false; it should be filtered out
    expect(res.rows.some((r) => r.model_name === "AlphaFold 3")).toBe(false);
    // Boltz-1 has open_weights = true; it should remain
    expect(res.rows.some((r) => r.model_name === "Boltz-1")).toBe(true);
  });

  it("filters models by max_vram_gb", () => {
    const res = getUseCaseLeaderboard(undefined, {
      category: "variant_effect",
      max_vram_gb: 16,
    });
    // ESM-2 (3B) requires 24GB; it should be filtered out
    expect(res.rows.some((r) => r.model_name === "ESM-2 (3B)")).toBe(false);
    // PoET-2 requires 16GB; it should remain
    expect(res.rows.some((r) => r.model_name === "PoET-2")).toBe(true);
  });

  it("filters models by search_query", () => {
    const res = getUseCaseLeaderboard(undefined, {
      category: "variant_effect",
      search_query: "alpha",
    });
    expect(res.rows.every((r) => r.model_name.toLowerCase().includes("alpha") || r.creator.toLowerCase().includes("alpha"))).toBe(true);
  });

  it("normalizes category strings properly", () => {
    expect(normalizeCategory("structure-prediction")).toBe("structure_prediction");
    expect(normalizeCategory("variant-effect")).toBe("variant_effect");
    expect(normalizeCategory("protein-design")).toBe("protein_design");
    expect(normalizeCategory("genomic-grammar")).toBe("genomic_grammar");
    expect(normalizeCategory("unknown")).toBe("variant_effect");
  });

  it("maps slugs to categories correctly", () => {
    expect(categoryForSlug("structural-hypotheses-experiments")).toBe("structure_prediction");
    expect(categoryForSlug("protein-variant-effect-prediction")).toBe("variant_effect");
    expect(categoryForSlug("de-novo-binder-design")).toBe("protein_design");
    expect(categoryForSlug("genetic-perturbation-response")).toBe("transcriptomics");
    expect(categoryForSlug("plant-promoter-reporters")).toBe("genomic_grammar");
  });
});
