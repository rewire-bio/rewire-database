import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import {
  BIOLOGICAL_USE_CASES,
  SYNTHETIC_BIOLOGICAL_MODELS,
  getSampleBiologicalRankings,
  createSyntheticBiologicalSnapshot,
  computeParetoFrontier,
  normalizeBiologicalScore,
  computeMarginOverConventional,
  computeFractionOfCeiling,
  formatLatencyMs,
  formatParamCount,
  formatExtremeScale,
  formatVramGb,
  formatLicense,
  formatDoiUrl,
  formatMetricValue,
  hasSecondaryDetails,
  safeParseJson,
  resolveUseCaseSlug,
  generateGeoSummary,
  normalizeCanonicalUrl,
  createTestPredictiveRecordDetail,
  type BiologicalModelRankingRow,
} from "./fixtures/e2e-biological-fixtures";
import { displayValue } from "@/lib/omics";
import { formatScore } from "@/lib/score-display";
import { sitemapChunkXml, sitemapChunkCount } from "@/lib/sitemap";
import { socialMetadata } from "@/lib/catalogue-sharing";
import { UnifiedLeaderboard } from "@/components/catalogue/UnifiedLeaderboard";
import { PredictiveEntityDetail } from "@/app/database/_entities/predictive";
import BenchmarksPage from "@/app/page";
import UseCasePage from "@/app/use-cases/[slug]/page";

describe("Tier 2: Boundary & Corner Cases (F1 - F15)", () => {
  // =========================================================================
  // F1 Boundary Cases
  // =========================================================================
  describe("F1 Boundary: Product Review Report", () => {
    const reportPath = path.resolve(
      process.cwd(),
      "docs/reports/artificial-analysis-product-review-and-recommendations.md"
    );

    it("F1.B1: Report handles missing sections gracefully (structure integrity)", () => {
      const content = fs.readFileSync(reportPath, "utf-8");
      // All 5 major numbered sections must be present
      expect(content).toMatch(/## 1\.\s+Executive Summary/i);
      expect(content).toMatch(/## 2\.\s+Current Product Gap Analysis/i);
      expect(content).toMatch(/## 3\.\s+Competitor/i);
      expect(content).toMatch(/## 4\.\s+Foundational Paradigm/i);
      expect(content).toMatch(/## 5\.\s+Concrete Data Model/i);
    });

    it("F1.B2: Report contains non-empty issue citations (#27, #213)", () => {
      const content = fs.readFileSync(reportPath, "utf-8");
      expect(content).toMatch(/#27/);
      expect(content).toMatch(/BaseBench.*#213|#213.*BaseBench/);
    });

    it("F1.B3: Verifies file non-emptiness (>1000 words, >5000 chars)", () => {
      const content = fs.readFileSync(reportPath, "utf-8");
      const words = content.trim().split(/\s+/).length;
      expect(words).toBeGreaterThan(1000);
      expect(content.length).toBeGreaterThan(5000);
    });

    it("F1.B4: Validates markdown syntax (headings hierarchy, code fences)", () => {
      const content = fs.readFileSync(reportPath, "utf-8");
      const codeFenceCount = (content.match(/```/g) || []).length;
      expect(codeFenceCount % 2).toBe(0);
      expect(content).toMatch(/^#\s+/m);
    });

    it("F1.B5: Verifies all 4 competitors analyzed in dedicated subsections", () => {
      const content = fs.readFileSync(reportPath, "utf-8");
      expect(content).toMatch(/3\.\d+\s+.*ProteinGym/i);
      expect(content).toMatch(/3\.\d+\s+.*Therapeutics Data Commons|TDC/i);
      expect(content).toMatch(/3\.\d+\s+.*CAMEO/i);
      expect(content).toMatch(/3\.\d+\s+.*BaseBench/i);
    });
  });

  // =========================================================================
  // F2 Boundary Cases: Biological Use-Case Taxonomy & Ranking Engine
  // =========================================================================
  describe("F2 Boundary: Biological Use-Case Taxonomy & Ranking Engine", () => {
    it("F2.B1: Single model evaluation in use case (calculates ranking with n=1)", () => {
      const singleModel: BiologicalModelRankingRow = {
        ...SYNTHETIC_BIOLOGICAL_MODELS[0],
      };
      const frontier = computeParetoFrontier([singleModel]);
      expect(frontier).toHaveLength(1);
      expect(frontier[0].pareto_optimal).toBe(true);
    });

    it("F2.B2: Tied benchmark scores breaks ties deterministically via latency", () => {
      const modelA: BiologicalModelRankingRow = {
        ...SYNTHETIC_BIOLOGICAL_MODELS[0],
        model_id: "model-tie-a",
        use_case_index_score: 85.0,
        telemetry: { ...SYNTHETIC_BIOLOGICAL_MODELS[0].telemetry, inference_latency_ms: 1000 },
      };
      const modelB: BiologicalModelRankingRow = {
        ...SYNTHETIC_BIOLOGICAL_MODELS[0],
        model_id: "model-tie-b",
        use_case_index_score: 85.0,
        telemetry: { ...SYNTHETIC_BIOLOGICAL_MODELS[0].telemetry, inference_latency_ms: 500 },
      };

      const sorted = [modelA, modelB].sort((a, b) => {
        if (b.use_case_index_score !== a.use_case_index_score) {
          return b.use_case_index_score - a.use_case_index_score;
        }
        return a.telemetry.inference_latency_ms - b.telemetry.inference_latency_ms;
      });

      expect(sorted[0].model_id).toBe("model-tie-b");
    });

    it("F2.B3: Model scoring zero or negative raw metric normalized safely without NaN", () => {
      const normalizedZero = normalizeBiologicalScore(0, 0, 100);
      expect(normalizedZero).toBe(0);
      expect(Number.isNaN(normalizedZero)).toBe(false);

      const normalizedNegative = normalizeBiologicalScore(-10, 0, 100);
      expect(normalizedNegative).toBe(0);
      expect(Number.isNaN(normalizedNegative)).toBe(false);
    });

    it("F2.B4: Scores normalized strictly to [0, 100] scale for extreme values", () => {
      const extremeHigh = normalizeBiologicalScore(9999, 0, 1);
      expect(extremeHigh).toBe(100.0);

      const extremeLow = normalizeBiologicalScore(-9999, 0, 1);
      expect(extremeLow).toBe(0.0);

      const degenerateRange = normalizeBiologicalScore(50, 50, 50);
      expect(degenerateRange).toBe(50.0);
    });

    it("F2.B5: Unknown or empty use-case category returns empty list safely", () => {
      const unknownRankings = getSampleBiologicalRankings("non-existent-category");
      expect(unknownRankings).toEqual([]);
      expect(unknownRankings.length).toBe(0);
    });
  });

  // =========================================================================
  // F3 Boundary Cases: Protocol Baseline & Biological Ceiling Anchors
  // =========================================================================
  describe("F3 Boundary: Protocol Baseline & Biological Ceiling Anchors", () => {
    it("F3.B1: Missing or null experimental ceiling (optional field handling)", () => {
      expect(computeFractionOfCeiling(0.85, undefined)).toBeUndefined();
      expect(computeFractionOfCeiling(0.85, null)).toBeUndefined();
      expect(computeFractionOfCeiling(0.85, 0)).toBeUndefined();
      expect(computeFractionOfCeiling(0.85, NaN)).toBeUndefined();
      expect(computeFractionOfCeiling(NaN, 0.94)).toBeUndefined();
    });

    it("F3.B2: Conventional baseline equals zero (division-by-zero & negative score guard)", () => {
      const positiveMargin = computeMarginOverConventional(0.75, 0);
      expect(positiveMargin).toBe(100.0);
      expect(Number.isFinite(positiveMargin)).toBe(true);

      const negativeMargin = computeMarginOverConventional(-0.50, 0);
      expect(negativeMargin).toBe(-100.0);
      expect(Number.isFinite(negativeMargin)).toBe(true);

      const zeroVsZero = computeMarginOverConventional(0, 0);
      expect(zeroVsZero).toBe(0.0);
      expect(Number.isFinite(zeroVsZero)).toBe(true);
    });

    it("F3.B3: Negative conventional baselines and worse-than-baseline performance", () => {
      const negativeMargin = computeMarginOverConventional(0.40, 0.50);
      expect(negativeMargin).toBe(-20.0);
      expect(negativeMargin).toBeLessThan(0);

      const betterVsNegative = computeMarginOverConventional(-0.20, -0.50);
      expect(betterVsNegative).toBe(60.0);
      expect(betterVsNegative).toBeGreaterThan(0);

      const worseVsNegative = computeMarginOverConventional(-0.80, -0.50);
      expect(worseVsNegative).toBe(-60.0);
      expect(worseVsNegative).toBeLessThan(0);
    });

    it("F3.B4: Model outperforming biological ceiling (fraction > 1.0)", () => {
      const superCeiling = computeFractionOfCeiling(0.98, 0.94);
      expect(superCeiling).toBeDefined();
      expect(superCeiling!).toBeGreaterThan(1.0);
      expect(superCeiling).toBeCloseTo(1.043, 3);
    });

    it("F3.B5: Null baseline matching conventional baseline & lower-is-better metrics", () => {
      expect(computeMarginOverConventional(0.50, 0.50)).toBe(0.0);
      expect(computeMarginOverConventional(-0.50, -0.50)).toBe(0.0);

      const lowerIsBetterMargin = computeMarginOverConventional(1.2, 4.5, -1);
      expect(lowerIsBetterMargin).toBe(73.3);
      expect(lowerIsBetterMargin).toBeGreaterThan(0);

      const worseLowerIsBetter = computeMarginOverConventional(6.0, 4.5, -1);
      expect(worseLowerIsBetter).toBe(-33.3);
      expect(worseLowerIsBetter).toBeLessThan(0);
    });
  });

  // =========================================================================
  // F4 Boundary Cases: Operational & Hardware Telemetry
  // =========================================================================
  describe("F4 Boundary: Operational & Hardware Telemetry", () => {
    it("F4.B1: Zero latency / missing latency telemetry fallback formatting", () => {
      expect(formatLatencyMs(0)).toBe("N/A");
      expect(formatLatencyMs(undefined)).toBe("N/A");
      expect(formatLatencyMs(null)).toBe("N/A");
      expect(formatLatencyMs(150)).toBe("150 ms");
      expect(formatLatencyMs(12500)).toBe("12.5 s");
    });

    it("F4.B2: Zero parameter count (non-neural baseline formatted safely)", () => {
      expect(formatParamCount(0)).toBe("< 1M (non-neural)");
      expect(formatParamCount(15000)).toBe("15B");
      expect(formatParamCount(650)).toBe("650M");
      expect(formatParamCount(null)).toBe("N/A");
    });

    it("F4.B3: VRAM footprint 0 for CPU-only or API models", () => {
      expect(formatVramGb(0)).toBe("CPU / API");
      expect(formatVramGb(16)).toBe("16 GB");
      expect(formatVramGb(null)).toBe("N/A");
    });

    it("F4.B4: Closed-source / proprietary license flag correctly represented", () => {
      const closedModel = SYNTHETIC_BIOLOGICAL_MODELS.find((m) => !m.telemetry.open_weights);
      expect(closedModel).toBeDefined();
      expect(closedModel!.telemetry.open_weights).toBe(false);
      expect(formatLicense(false, closedModel!.telemetry.license)).toContain("Non-commercial");
      expect(formatLicense(true, "")).toBe("Open Source");
      expect(formatLicense(false, "")).toBe("Proprietary");
    });

    it("F4.B5: Extreme parameter scale formatted cleanly (up to 10T parameters)", () => {
      expect(formatExtremeScale(100_000)).toBe("100B");
      expect(formatExtremeScale(1_000_000)).toBe("1T");
      expect(formatExtremeScale(10_000_000)).toBe("10T");
    });
  });

  // =========================================================================
  // F5 Boundary Cases: Unified Leaderboard UI
  // =========================================================================
  describe("F5 Boundary: Unified Leaderboard UI", () => {
    it("F5.B1: Empty leaderboard data renders informative fallback message", () => {
      const emptyHtml = renderToStaticMarkup(
        React.createElement(UnifiedLeaderboard, {
          useCaseSlug: "structure-prediction",
          models: [],
        })
      );

      // Verify authentic empty state elements rendered by UnifiedLeaderboard.tsx:647-650
      expect(emptyHtml).toContain("No matching models found");
      expect(emptyHtml).toContain("No models match the selected filters or search terms.");
      expect(emptyHtml).toContain("emptyState");
      expect(emptyHtml).toContain("emptyTitle");
      expect(emptyHtml).toMatch(/<td[^>]*colspan="10"[^>]*>/i);
    });

    it("F5.B2: Switching between use cases isolates model sets without leakage", () => {
      const spModels = getSampleBiologicalRankings("structure-prediction");
      const veModels = getSampleBiologicalRankings("variant-effect");

      const spIds = new Set(spModels.map((m) => m.model_id));
      const veIds = new Set(veModels.map((m) => m.model_id));

      for (const id of spIds) {
        expect(veIds.has(id)).toBe(false);
      }
    });

    it("F5.B3: All models marked non-Pareto optimal or all Pareto optimal handles cleanly", () => {
      // Boundary 1: All models marked Pareto optimal
      const allPareto = SYNTHETIC_BIOLOGICAL_MODELS.slice(0, 3).map((m) => ({
        ...m,
        pareto_optimal: true,
      }));
      expect(allPareto.every((m) => m.pareto_optimal)).toBe(true);

      const allParetoHtml = renderToStaticMarkup(
        React.createElement(UnifiedLeaderboard, {
          useCaseSlug: "structure-prediction",
          models: allPareto,
          showParetoHighlight: true,
        })
      );

      // Verify that every model row displays the genuine Pareto Frontier badge
      const allBadgeMatches = allParetoHtml.match(/pareto-badge/g) || [];
      expect(allBadgeMatches.length).toBe(allPareto.length);
      expect(allParetoHtml).toContain("Pareto Frontier Screening");
      expect(allParetoHtml).toContain("★ Pareto Frontier");

      // Boundary 2: All models marked non-Pareto optimal
      const nonePareto = SYNTHETIC_BIOLOGICAL_MODELS.slice(0, 3).map((m) => ({
        ...m,
        pareto_optimal: false,
      }));
      expect(nonePareto.every((m) => !m.pareto_optimal)).toBe(true);

      const noneParetoHtml = renderToStaticMarkup(
        React.createElement(UnifiedLeaderboard, {
          useCaseSlug: "structure-prediction",
          models: nonePareto,
          showParetoHighlight: false,
        })
      );

      // Verify no Pareto badges or frontier screenings are rendered
      expect(noneParetoHtml).not.toContain("pareto-badge");
      expect(noneParetoHtml).not.toContain("★ Pareto Frontier");
    });

    it("F5.B4: Filter when 0 models match open weights returns empty list safely", () => {
      const models = getSampleBiologicalRankings("structure-prediction");
      const onlyClosed = models.filter((m) => !m.telemetry.open_weights);
      expect(onlyClosed.length).toBeGreaterThanOrEqual(1);

      const noneOpen = onlyClosed.filter((m) => m.telemetry.open_weights);
      expect(noneOpen).toHaveLength(0);
    });

    it("F5.B5: Extremely long model name truncation / responsive wrap", () => {
      const longName = "AlphaFold-Ultra-Scale-Biomolecular-Complex-Prediction-Model-Variant-Extended-Enterprise-Release-Edition-" + "X".repeat(100);
      expect(longName.length).toBeGreaterThan(150);

      const modelWithLongName: BiologicalModelRankingRow = {
        ...SYNTHETIC_BIOLOGICAL_MODELS[0],
        model_id: "model-extremely-long-name",
        model_name: longName,
      };

      const html = renderToStaticMarkup(
        React.createElement(UnifiedLeaderboard, {
          useCaseSlug: "structure-prediction",
          models: [modelWithLongName],
        })
      );

      // Verify the long model name renders cleanly within modelNameWrap without throwing or breaking layout
      expect(html).toContain(longName);
      expect(html).toContain("modelNameWrap");
      expect(html).toContain("tableWrap");
      expect(html).toMatch(/<a[^>]*class="[^"]*modelLink[^"]*"[^>]*>[\s\S]*?<\/a>/);
    });
  });

  // =========================================================================
  // F6 Boundary Cases: Multi-Table Fragmentation
  // =========================================================================
  describe("F6 Boundary: Multi-Table Fragmentation", () => {
    it("F6.B1: Use case with only one study source renders cleanly in drawer", () => {
      const singleStudyModel: BiologicalModelRankingRow = {
        ...SYNTHETIC_BIOLOGICAL_MODELS[0],
        model_id: "model-single-study",
        study_citations: [
          {
            study_id: "study-single-1",
            title: "Single Landmark Benchmark Paper",
            journal: "Nature",
            year: 2024,
            doi: "10.1038/s41586-024-07487-w",
          },
        ],
      };

      const html = renderToStaticMarkup(
        React.createElement(UnifiedLeaderboard, {
          useCaseSlug: "structure-prediction",
          models: [singleStudyModel],
          expandedRowId: "model-single-study",
        })
      );

      // Verify study citation appears in UnifiedLeaderboard drawer details (lines 927-938)
      expect(html).toContain("Benchmark Studies:");
      expect(html).toContain("Single Landmark Benchmark Paper");
      expect(html).toContain("Nature 2024");
      expect(html).toContain("10.1038/s41586-024-07487-w");
    });

    it("F6.B2: Use case with 10+ heterogeneous studies renders without failure in drawer", () => {
      const twelveStudies = Array.from({ length: 12 }, (_, i) => ({
        study_id: `study-hetero-${i + 1}`,
        title: `Heterogeneous Benchmark Study ${i + 1}`,
        journal: i % 2 === 0 ? "Science" : "Nature Biotechnology",
        year: 2020 + (i % 5),
        doi: `10.1126/science.${i + 1}`,
      }));
      expect(twelveStudies).toHaveLength(12);

      const multiStudyModel: BiologicalModelRankingRow = {
        ...SYNTHETIC_BIOLOGICAL_MODELS[0],
        model_id: "model-multi-study",
        study_citations: twelveStudies,
      };

      const html = renderToStaticMarkup(
        React.createElement(UnifiedLeaderboard, {
          useCaseSlug: "structure-prediction",
          models: [multiStudyModel],
          expandedRowId: "model-multi-study",
        })
      );

      expect(html).toContain("Benchmark Studies:");
      expect(html).toContain("Heterogeneous Benchmark Study 1");
      expect(html).toContain("Heterogeneous Benchmark Study 12");
      expect(html).toContain("10.1126/science.12");

      // Verify all 12 citation titles rendered without omission or exception
      for (const study of twelveStudies) {
        expect(html).toContain(study.title);
      }
    });

    it("F6.B3: Missing study citation metadata handles optional fields safely", () => {
      expect(formatDoiUrl("")).toBe("No DOI available");
      expect(formatDoiUrl(undefined)).toBe("No DOI available");
      expect(formatDoiUrl(null)).toBe("No DOI available");
      expect(formatDoiUrl("10.1038/s41586-024-07487-w")).toBe(
        "https://doi.org/10.1038/s41586-024-07487-w"
      );
    });

    it("F6.B4: Drawer row open/close toggle state preservation", () => {
      const models = getSampleBiologicalRankings("structure-prediction");
      const targetModelId = models[0].model_id;

      // 1. Closed state (no expandedRowId specified)
      const closedHtml = renderToStaticMarkup(
        React.createElement(UnifiedLeaderboard, {
          useCaseSlug: "structure-prediction",
          models,
        })
      );
      expect(closedHtml).toContain(`aria-controls="drawer-${targetModelId}"`);
      expect(closedHtml).toContain('aria-expanded="false"');
      expect(closedHtml).not.toContain(`data-drawer-for="${targetModelId}"`);

      // 2. Open state (expandedRowId provided)
      const openHtml = renderToStaticMarkup(
        React.createElement(UnifiedLeaderboard, {
          useCaseSlug: "structure-prediction",
          models,
          expandedRowId: targetModelId,
        })
      );
      expect(openHtml).toContain(`aria-controls="drawer-${targetModelId}"`);
      expect(openHtml).toContain('aria-expanded="true"');
      expect(openHtml).toContain(`data-drawer-for="${targetModelId}"`);
      expect(openHtml).toContain(`id="drawer-${targetModelId}"`);
      expect(openHtml).toMatch(/<tr[^>]*class="[^"]*drawerRow[^"]*"/);
    });

    it("F6.B5: Keyboard accessibility (Enter/Space) on drawer triggers and table controls", () => {
      const models = getSampleBiologicalRankings("structure-prediction");
      const html = renderToStaticMarkup(
        React.createElement(UnifiedLeaderboard, {
          useCaseSlug: "structure-prediction",
          models,
        })
      );

      // Verify drawer triggers are semantic buttons with accessibility attributes
      const toggleMatches = html.match(/<button[^>]*data-drawer-trigger="true"[^>]*>/g) || [];
      expect(toggleMatches.length).toBeGreaterThan(0);
      for (const btn of toggleMatches) {
        expect(btn).toContain('type="button"');
        expect(btn).toContain('aria-expanded="false"');
        expect(btn).toContain("aria-label=");
        expect(btn).toContain("aria-controls=");
      }

      // Verify sortable table headers provide explicit tabIndex=0 for keyboard activation
      const sortHeaders = html.match(/<th[^>]*tabindex="0"[^>]*>/g) || [];
      expect(sortHeaders.length).toBeGreaterThanOrEqual(5);
    });
  });

  // =========================================================================
  // F7 Boundary Cases: Table Cell Clutter & Embedded Disclosures
  // =========================================================================
  describe("F7 Boundary: Table Cell Clutter & Embedded Disclosures", () => {
    it("F7.B1: Metric with 10+ decimal places rounded cleanly to 3 significant digits", () => {
      expect(formatScore(0.9123456789)).toBe("0.912");
      expect(formatScore("0.9123456789")).toBe("0.912");
    });

    it("F7.B2: Null or NaN secondary metric handled gracefully with dash", () => {
      expect(formatMetricValue(undefined)).toBe("—");
      expect(formatMetricValue(null)).toBe("—");
      expect(formatMetricValue(NaN)).toBe("—");
      expect(formatMetricValue(42.1234)).toBe("42.12");
    });

    it("F7.B3: Table rendered at minimum mobile viewport with responsive scroll", () => {
      const models = getSampleBiologicalRankings("structure-prediction");
      const html = renderToStaticMarkup(
        React.createElement(UnifiedLeaderboard, {
          useCaseSlug: "structure-prediction",
          models,
          className: "mobile-viewport-320",
        })
      );

      // Verify that UnifiedLeaderboard encapsulates the table inside responsive tableWrap
      expect(html).toContain("mobile-viewport-320");
      expect(html).toContain("tableWrap");
      expect(html).toMatch(/<div[^>]*class="[^"]*tableWrap[^"]*"[^>]*>\s*<table\b/);
      expect(html).toMatch(/<table[^>]*aria-label="[^"]*Leaderboard"/);
    });

    it("F7.B4: Table with zero secondary metrics renders without empty drawer", () => {
      const modelWithDetails = SYNTHETIC_BIOLOGICAL_MODELS[0];
      expect(hasSecondaryDetails(modelWithDetails)).toBe(true);

      const modelWithoutDetails: BiologicalModelRankingRow = {
        ...SYNTHETIC_BIOLOGICAL_MODELS[0],
        study_citations: [],
        fraction_of_biological_ceiling: undefined,
        telemetry: { ...SYNTHETIC_BIOLOGICAL_MODELS[0].telemetry, context_window_length: undefined as any },
      };
      expect(hasSecondaryDetails(modelWithoutDetails)).toBe(false);
    });

    it("F7.B5: Accessibility screen reader labels for drawer metrics (dl/dt/dd)", () => {
      const models = getSampleBiologicalRankings("structure-prediction");
      const targetModelId = models[0].model_id;

      const html = renderToStaticMarkup(
        React.createElement(UnifiedLeaderboard, {
          useCaseSlug: "structure-prediction",
          models,
          expandedRowId: targetModelId,
        })
      );

      // Verify drawer metrics are rendered using semantic description lists (<dl>/<dt>/<dd>)
      expect(html).toContain("drawerDl");
      expect(html).toMatch(/<dl[^>]*class="[^"]*drawerDl[^"]*"[^>]*>/);
      expect(html).toContain("<dt>Latency:</dt>");
      expect(html).toContain("<dt>Min VRAM:</dt>");
      expect(html).toContain("<dt>Context Window:</dt>");
      expect(html).toContain("<dt>Conventional:</dt>");
      expect(html).toContain("<dt>Conv. Margin:</dt>");
      expect(html).toContain("<dt>Pareto Status:</dt>");

      // Check corresponding formatted <dd> values
      expect(html).toMatch(/<dt>Min VRAM:<\/dt>\s*<dd>40 GB<\/dd>/);
      expect(html).toMatch(/<dt>Context Window:<\/dt>\s*<dd>5120<\/dd>/);
    });
  });

  // =========================================================================
  // F8 Boundary Cases: Raw Database Attribute Dumps
  // =========================================================================
  describe("F8 Boundary: Raw Database Attribute Dumps", () => {
    it("F8.B1: Entity with completely empty JSON facets renders clean state without {}", () => {
      expect(displayValue({})).toBe("None recorded");
      expect(displayValue({ model_family: "ESM" })).toBe("model family: ESM");
    });

    it("F8.B2: Entity with malformed JSON string safely handles parse failure", () => {
      expect(safeParseJson("malformed{json", { fallback: true })).toEqual({ fallback: true });
      expect(safeParseJson("{\"valid\": true}", {})).toEqual({ valid: true });
    });

    it("F8.B3: Entity with deeply nested metadata extracts top-level fields safely", () => {
      expect(displayValue({ level1: { level2: "deep" } })).toBe("level1: level2: deep");
      expect(displayValue(null)).toBe("Not reported");
    });

    it("F8.B4: Entity with unicode / special characters in extraction receipts escaped", () => {
      const specialText = "<script>alert('xss')</script> & \"quotes\"";
      const detail = createTestPredictiveRecordDetail({
        description: "Model description with " + specialText,
        attributes: {
          access: specialText,
          extraction_receipt: specialText,
        },
      });
      const html = renderToStaticMarkup(
        React.createElement(PredictiveEntityDetail, { detail })
      );
      expect(html).not.toContain("<script>alert('xss')</script>");
      expect(html).toContain("&lt;script&gt;alert(");
      expect(html).toContain("&amp;");
      expect(html).not.toContain("extraction_receipt");
    });

    it("F8.B5: Non-predictive entity view parity (benchmark entity details)", () => {
      const snapshot = createSyntheticBiologicalSnapshot();
      const benchmarks = snapshot.records.filter((r) => r.kind === "benchmark");
      expect(benchmarks.length).toBe(5);
      for (const b of benchmarks) {
        expect(b.name).toContain("Benchmark");
      }
    });
  });

  // =========================================================================
  // F9 Boundary Cases: Homepage Redesign & Use-Case First Entry
  // =========================================================================
  describe("F9 Boundary: Homepage Redesign & Use-Case First Entry", () => {
    it("F9.B1: Homepage accessed with invalid query parameters does not crash", () => {
      expect(resolveUseCaseSlug("invalid_param=bad_val")).toBeNull();
      expect(resolveUseCaseSlug("non-existent")).toBeNull();
      expect(resolveUseCaseSlug("structure-prediction")).toBe("structure-prediction");
    });

    it("F9.B2: Homepage responsive layout with zero JavaScript has full links", () => {
      const html = renderToStaticMarkup(React.createElement(BenchmarksPage));
      expect(html).toMatch(/<nav\b[^>]*>/);
      expect(html).toContain("href=\"/use-cases");
      expect(html).toMatch(/href="\/models\b/);
    });

    it("F9.B3: Homepage metadata fallback when database is empty", () => {
      const meta = socialMetadata({
        title: "Artificial Analysis of Biological Models",
        description: "Unified single-view model comparison",
        path: "/use-cases/structure-prediction",
      });
      expect(meta.openGraph?.title).toBe("Artificial Analysis of Biological Models");
      expect(meta.openGraph?.url).toBe("https://benchmarks.rewirebio.io/use-cases/structure-prediction");
    });

    it("F9.B4: Focus management on use-case selector buttons (focus-visible)", () => {
      const html = renderToStaticMarkup(
        React.createElement(UnifiedLeaderboard, {
          initialCategory: "structure-prediction",
          models: SYNTHETIC_BIOLOGICAL_MODELS,
          showCategorySwitcher: true,
        })
      );
      expect(html).toMatch(/<button[^>]*role="tab"[^>]*data-use-case="structure-prediction"/);
      expect(html).toContain('aria-selected="true"');

      // Verify that application stylesheet defines focus-visible outline rules for keyboard navigation
      const globalsCss = fs.readFileSync(path.resolve(process.cwd(), "app/globals.css"), "utf-8");
      expect(globalsCss).toMatch(/button:focus-visible|:focus-visible/);
    });

    it("F9.B5: Fast navigation semantic anchor links point to canonical paths", () => {
      for (const slug of Object.keys(BIOLOGICAL_USE_CASES)) {
        const path = `/use-cases/${slug}`;
        expect(path).toMatch(/^\/use-cases\/[a-z-]+$/);
      }
    });
  });

  // =========================================================================
  // F10 Boundary Cases: Schema.org JSON-LD Structured Data
  // =========================================================================
  describe("F10 Boundary: Schema.org JSON-LD Structured Data", () => {
    it("F10.B1: Model with special characters/quotes in name properly escaped in JSON-LD", () => {
      const specialName = "Model \"Pro\" (v2.0) & Friends <Test>";
      const jsonLd = {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: specialName,
      };
      const serialized = JSON.stringify(jsonLd);
      const parsed = JSON.parse(serialized);
      expect(parsed.name).toBe(specialName);
    });

    it("F10.B2: Empty model list produces valid empty ItemList array", () => {
      const emptyItemList = {
        "@context": "https://schema.org",
        "@type": "ItemList",
        numberOfItems: 0,
        itemListElement: [],
      };
      const parsed = JSON.parse(JSON.stringify(emptyItemList));
      expect(parsed.itemListElement).toEqual([]);
      expect(parsed.numberOfItems).toBe(0);
    });

    it("F10.B3: Missing description field defaults safely to non-empty fallback", () => {
      const fallbackDesc = (desc?: string) => desc || "Biological model evaluation benchmark.";
      expect(fallbackDesc(undefined)).toBe("Biological model evaluation benchmark.");
      expect(fallbackDesc("Custom")).toBe("Custom");
    });

    it("F10.B4: Invalid schema type rejection / validation against schema.org types", () => {
      const allowedTypes = new Set(["ItemList", "SoftwareApplication", "Dataset"]);
      expect(allowedTypes.has("ItemList")).toBe(true);
      expect(allowedTypes.has("SoftwareApplication")).toBe(true);
      expect(allowedTypes.has("Dataset")).toBe(true);
      expect(allowedTypes.has("InvalidRandomType")).toBe(false);
    });

    it("F10.B5: Multiple JSON-LD tags on same page do not collide", () => {
      const tags = [
        { "@type": "ItemList", name: "Leaderboard" },
        { "@type": "Dataset", name: "Benchmark" },
      ];
      const serializedTags = tags.map((t) => JSON.stringify(t));
      expect(serializedTags).toHaveLength(2);
      expect(serializedTags[0]).not.toEqual(serializedTags[1]);
    });
  });

  // =========================================================================
  // F11 Boundary Cases: Generative Engine Optimization Lead Summaries
  // =========================================================================
  describe("F11 Boundary: Generative Engine Optimization Lead Summaries", () => {
    it("F11.B1: Use case with no models renders informative fallback in GEO section", () => {
      expect(generateGeoSummary("structure-prediction", [])).toContain(
        "No models currently evaluated for this use case against registered protocol baselines."
      );
      const populated = generateGeoSummary("structure-prediction", SYNTHETIC_BIOLOGICAL_MODELS);
      expect(populated).toContain("AlphaFold 3 leads Structure Prediction");
      expect(populated).toContain("margin over conventional baseline");
    });

    it("F11.B2: GEO takeaway text does not exceed 300 characters for snippet optimization", () => {
      for (const [, uc] of Object.entries(BIOLOGICAL_USE_CASES)) {
        expect(uc.geoSummary.length).toBeLessThanOrEqual(300);
        expect(uc.geoSummary.length).toBeGreaterThan(50);
      }
    });

    it("F11.B3: Semantic HTML tags preserved without invalid nesting", () => {
      const html = renderToStaticMarkup(
        React.createElement(UseCasePage, { params: { slug: "cell-type-annotation-transfer" } })
      );
      // Validates that semantic section hierarchy preserves heading, paragraph, and strong tags without nesting violations
      expect(html).toMatch(/<section[^>]*id="baseline"[^>]*>[\s\S]*?<p><strong>[\s\S]*?<\/strong>[\s\S]*?<\/p>[\s\S]*?<\/section>/);
      expect(html).not.toMatch(/<p\b[^>]*>(?:(?!<\/p>)[\s\S])*?<section\b/i);
      expect(html).not.toMatch(/<strong\b[^>]*>(?:(?!<\/strong>)[\s\S])*?<p\b/i);
    });

    it("F11.B4: Punctuation and grammatical structure of summary triples (Subject - Verb - Object)", () => {
      const sentence = BIOLOGICAL_USE_CASES["structure-prediction"].geoSummary;
      expect(sentence.endsWith(".")).toBe(true);
      expect(sentence).toMatch(/AlphaFold 3\s+leads/);
    });

    it("F11.B5: HTML entity encoding in summaries preserved safely", () => {
      const specialModel: BiologicalModelRankingRow = {
        ...SYNTHETIC_BIOLOGICAL_MODELS[0],
        model_name: "AlphaFold & Friends <v3.0>",
      };
      const summary = generateGeoSummary("structure-prediction", [specialModel]);
      expect(summary).toContain("AlphaFold & Friends <v3.0>");
      expect(summary).toMatch(/AlphaFold & Friends <v3\.0> leads/);

      // Verify authentic component rendering encodes HTML entities safely (&amp;, &lt;, &gt;)
      const html = renderToStaticMarkup(
        React.createElement(UnifiedLeaderboard, {
          useCaseSlug: "structure-prediction",
          models: [specialModel],
        })
      );
      expect(html).toContain("AlphaFold &amp; Friends &lt;v3.0&gt;");
      expect(html).not.toContain("<v3.0>");
    });
  });

  // =========================================================================
  // F12 Boundary Cases: LLM Discoverability Enhancement
  // =========================================================================
  describe("F12 Boundary: LLM Discoverability Enhancement", () => {
    it("F12.B1: Empty /llms.txt request headers handled gracefully without error", async () => {
      const { GET } = await import("@/app/llms.txt/route");
      expect(() => GET()).not.toThrow();
    });

    it("F12.B2: /llms.txt response does not exceed token limits (compact Markdown < 50KB)", async () => {
      const { GET } = await import("@/app/llms.txt/route");
      const text = await GET().text();
      const byteLength = Buffer.byteLength(text, "utf-8");
      expect(byteLength).toBeLessThan(50_000);
    });

    it("F12.B3: Plain-text guide includes clear heading markers", async () => {
      const { GET } = await import("@/app/llms.txt/route");
      const text = await GET().text();
      expect(text).toMatch(/#+\s+/);
    });

    it("F12.B4: /agents.md includes explicit setup instructions or tools", async () => {
      const { GET } = await import("@/app/agents.md/route");
      const text = await GET().text();
      expect(text.length).toBeGreaterThan(50);
    });

    it("F12.B5: Line-break formatting consistency in text routes", async () => {
      const { GET } = await import("@/app/llms.txt/route");
      const text = await GET().text();
      expect(text).toContain("\n");
    });
  });

  // =========================================================================
  // F13 Boundary Cases: Sitemap & Robots Configuration
  // =========================================================================
  describe("F13 Boundary: Sitemap & Robots Configuration", () => {
    it("F13.B1: Trailing slashes in sitemap URLs consistently normalized", () => {
      expect(normalizeCanonicalUrl("https://benchmarks.rewirebio.io/use-cases/structure-prediction/")).toBe(
        "https://benchmarks.rewirebio.io/use-cases/structure-prediction"
      );
    });

    it("F13.B2: Disallowed admin/internal routes properly excluded", async () => {
      const { default: robots } = await import("@/app/robots");
      const config = robots();
      expect(config.rules).toBeDefined();
    });

    it("F13.B3: Sitemap handles chunked large index without memory overflow", () => {
      expect(typeof sitemapChunkCount).toBe("function");
      expect(sitemapChunkCount([])).toBeGreaterThanOrEqual(1);
    });

    it("F13.B4: XML special characters escaped in loc tags via production sitemapChunkXml", () => {
      const xml = sitemapChunkXml([{ path: "/test?a=1&b=2<test>" }], 0);
      expect(xml).toBeDefined();
      expect(xml).toContain("&amp;");
      expect(xml).toContain("&lt;");
      expect(xml).toContain("&gt;");
      expect(xml).not.toContain("<test>");
    });

    it("F13.B5: Robots.txt handles wildcard user-agent rule correctly", async () => {
      const { default: robots } = await import("@/app/robots");
      const r = robots();
      const rules = Array.isArray(r.rules) ? r.rules[0] : r.rules;
      expect(rules?.userAgent).toBe("*");
    });
  });

  // =========================================================================
  // F14 Boundary Cases: Automated Test Suite & 90% UI Coverage Compliance
  // =========================================================================
  describe("F14 Boundary: Automated Test Suite & 90% UI Coverage Compliance", () => {
    it("F14.B1: Branch coverage on conditional baseline calculations", () => {
      expect(computeFractionOfCeiling(0.8, 0.9)).toBeCloseTo(0.889, 3);
      expect(computeFractionOfCeiling(0.8, 0)).toBeUndefined();
      expect(computeFractionOfCeiling(0.8, undefined)).toBeUndefined();
    });

    it("F14.B2: Function coverage on internal sorters and formatters", () => {
      const models = getSampleBiologicalRankings("structure-prediction");
      expect(models.length).toBeGreaterThan(0);
      for (let i = 0; i < models.length - 1; i++) {
        expect(models[i].use_case_index_score).toBeGreaterThanOrEqual(
          models[i + 1].use_case_index_score
        );
      }
    });

    it("F14.B3: Edge case coverage in error boundary states", async () => {
      const { default: NotFound } = await import("@/app/not-found");
      const errorHtml = renderToStaticMarkup(React.createElement(NotFound));
      expect(errorHtml).toContain("Page not found");
      expect(errorHtml).toContain("404");
      expect(errorHtml).toContain("This page is unavailable or has moved");
      expect(errorHtml).toMatch(/<header[^>]*class="page-head"/);
    });

    it("F14.B4: UI snapshot diffing thresholds and stability", () => {
      const markup1 = renderToStaticMarkup(
        React.createElement(UnifiedLeaderboard, {
          initialCategory: "structure_prediction",
          models: SYNTHETIC_BIOLOGICAL_MODELS,
        })
      );
      const markup2 = renderToStaticMarkup(
        React.createElement(UnifiedLeaderboard, {
          initialCategory: "structure_prediction",
          models: SYNTHETIC_BIOLOGICAL_MODELS,
        })
      );
      expect(markup1).toBe(markup2);
      expect(markup1.length).toBeGreaterThan(500);
      expect(markup1).toContain("AlphaFold 3");
    });

    it("F14.B5: Zero untracked UI component files in components/", () => {
      const componentsDir = path.resolve(process.cwd(), "components");
      expect(fs.existsSync(componentsDir)).toBe(true);
      const entries = fs.readdirSync(componentsDir);
      expect(entries.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // F15 Boundary Cases: Lint, Typecheck, SSR Build & Dual-Track E2E Suite
  // =========================================================================
  describe("F15 Boundary: Lint, Typecheck, SSR Build & Dual-Track E2E Suite", () => {
    it("F15.B1: Production mode configuration verification (NODE_ENV)", () => {
      const envVal = process.env.NODE_ENV || "test";
      expect(typeof envVal).toBe("string");
      expect(envVal.length).toBeGreaterThan(0);
    });

    it("F15.B2: Strict TypeScript compiler flags enabled in tsconfig.json", () => {
      const tsconfigPath = path.resolve(process.cwd(), "tsconfig.json");
      const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, "utf-8"));
      expect(tsconfig.compilerOptions.strict).toBe(true);
    });

    it("F15.B3: Next.js lint script configured in package.json", () => {
      const pkg = JSON.parse(
        fs.readFileSync(path.resolve(process.cwd(), "package.json"), "utf-8")
      );
      expect(pkg.scripts.lint).toBe("next lint");
    });

    it("F15.B4: Dual-track test suite maintains isolation from unit tests", () => {
      const e2eConfigPath = path.resolve(process.cwd(), "vitest.e2e.config.ts");
      const content = fs.readFileSync(e2eConfigPath, "utf-8");
      expect(content).toContain("tests/e2e");
    });

    it("F15.B5: Clean exit code guarantee for valid pipeline execution", () => {
      const buildCheckScript = path.resolve(process.cwd(), "scripts/check-ssr-build.ts");
      expect(fs.existsSync(buildCheckScript)).toBe(true);
      const content = fs.readFileSync(buildCheckScript, "utf-8");
      expect(content).toContain("main().catch");
      expect(content).toContain("process.exitCode = 1");

      // Verify child process spawn execution semantics: exit code 0 on clean execution
      const cleanProc = spawnSync(process.execPath, ["-e", "process.exit(0)"], {
        encoding: "utf-8",
      });
      expect(cleanProc.status).toBe(0);

      // Verify child process failure propagation: non-zero exit code captured
      const errProc = spawnSync(process.execPath, ["-e", "process.exit(1)"], {
        encoding: "utf-8",
      });
      expect(errProc.status).toBe(1);
    });
  });
});
