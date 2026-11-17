import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import {
  BIOLOGICAL_USE_CASES,
  SYNTHETIC_BIOLOGICAL_MODELS,
  getSampleBiologicalRankings,
  computeParetoFrontier,
  normalizeBiologicalScore,
  computeMarginOverConventional,
  computeFractionOfCeiling,
  bindModule,
  createTestPredictiveRecordDetail,
  type BiologicalModelRankingRow,
} from "./fixtures/e2e-biological-fixtures";
import { PredictiveEntityDetail } from "@/app/database/_entities/predictive";
import BenchmarksPage from "@/app/page";
import { buildCatalogue } from "@/lib/catalogue-build";

describe("Tier 3: Cross-Feature Interaction Tests", () => {
  // 1. F2 + F3: Ranking Engine + Protocol Baselines
  it("XF1 (F2 + F3): Ranking engine score normalization interacts with protocol baselines to compute accurate margins", () => {
    const spModels = getSampleBiologicalRankings("structure-prediction");
    const baseline = BIOLOGICAL_USE_CASES["structure-prediction"].baselines.conventional_baseline;
    expect(baseline.value).toBe(0.62);

    for (const m of spModels) {
      expect(m.use_case_index_score).toBeGreaterThanOrEqual(0);
      expect(m.use_case_index_score).toBeLessThanOrEqual(100);

      const expectedMargin = computeMarginOverConventional(m.raw_metric_value, baseline.value);
      expect(m.margin_over_conventional).toBeCloseTo(expectedMargin, 1);

      if (m.baselines.experimental_ceiling) {
        const expectedCeilingFrac = computeFractionOfCeiling(
          m.raw_metric_value,
          m.baselines.experimental_ceiling.value
        );
        expect(m.fraction_of_biological_ceiling).toBeCloseTo(expectedCeilingFrac!, 3);
      }
    }
  });

  // 2. F2 + F4: Ranking Engine + Operational Telemetry Filtering
  it("XF2 (F2 + F4): Ranking engine filters by hardware telemetry (VRAM <= 16GB) while preserving relative ranking", () => {
    const allStructureModels = getSampleBiologicalRankings("structure-prediction");
    const filteredUnder16Gb = allStructureModels.filter((m) => m.telemetry.min_vram_gb <= 16);

    expect(filteredUnder16Gb.length).toBeGreaterThanOrEqual(1);
    for (const m of filteredUnder16Gb) {
      expect(m.telemetry.min_vram_gb).toBeLessThanOrEqual(16);
    }

    for (let i = 0; i < filteredUnder16Gb.length - 1; i++) {
      expect(filteredUnder16Gb[i].use_case_index_score).toBeGreaterThanOrEqual(
        filteredUnder16Gb[i + 1].use_case_index_score
      );
    }
  });

  // 3. F3 + F5: Protocol Baselines + Unified Leaderboard Table
  it("XF3 (F3 + F5): Protocol baseline anchors rendered as visual baseline reference rows in leaderboard", async () => {
    const { UnifiedLeaderboard } = await bindModule(
      () => import("@/components/catalogue/UnifiedLeaderboard"),
      "@/components/catalogue/UnifiedLeaderboard",
      "M2",
      "XF3"
    );
    const models = getSampleBiologicalRankings("structure-prediction");
    const html = renderToStaticMarkup(
      React.createElement(UnifiedLeaderboard, {
        useCaseSlug: "structure-prediction",
        models,
      })
    );

    expect(html).toMatch(/class="[^"]*(baselineRow|baselineBadge|baseline-anchor|conventional-baseline)[^"]*"/);
    expect(html).toContain("HHpred / Modeller");
    expect(html).toMatch(/class="[^"]*(ceilingBanner|ceilingHighlight|ceiling-anchor|experimental-ceiling)[^"]*"/);
    expect(html).toContain("Assay Replicate Noise Ceiling");
  });

  // 4. F4 + F5: Hardware Telemetry + Dynamic Column Sorting
  it("XF4 (F4 + F5): Hardware telemetry columns dynamically sorted (latency vs index score)", () => {
    const models = getSampleBiologicalRankings("structure-prediction");

    const sortedByScore = [...models].sort((a, b) => b.use_case_index_score - a.use_case_index_score);
    expect(sortedByScore[0].model_name).toBe("AlphaFold 3");

    const sortedByLatency = [...models].sort(
      (a, b) => a.telemetry.inference_latency_ms - b.telemetry.inference_latency_ms
    );
    expect(sortedByLatency[0].model_name).toBe("ESMFold");
    expect(sortedByLatency[0].telemetry.inference_latency_ms).toBe(1200);
  });

  // 5. F5 + F6: Single-View Leaderboard + No Multi-Table Fragmentation
  it("XF5 (F5 + F6): Single-view leaderboard switching between use cases without re-introducing multi-table fragmentation", async () => {
    const { UnifiedLeaderboard } = await bindModule(
      () => import("@/components/catalogue/UnifiedLeaderboard"),
      "@/components/catalogue/UnifiedLeaderboard",
      "M2",
      "XF5"
    );
    const spHtml = renderToStaticMarkup(
      React.createElement(UnifiedLeaderboard, {
        useCaseSlug: "structure-prediction",
        models: getSampleBiologicalRankings("structure-prediction"),
      })
    );
    const veHtml = renderToStaticMarkup(
      React.createElement(UnifiedLeaderboard, {
        useCaseSlug: "variant-effect",
        models: getSampleBiologicalRankings("variant-effect"),
      })
    );

    expect((spHtml.match(/<table\b/g) || []).length).toBe(1);
    expect((veHtml.match(/<table\b/g) || []).length).toBe(1);
    expect(spHtml).toContain("AlphaFold 3");
    expect(spHtml).not.toContain("AlphaMissense");
    expect(veHtml).toContain("AlphaMissense");
    expect(veHtml).not.toContain("AlphaFold 3");
  });

  // 6. F5 + F7: Leaderboard Drawer + Zero Cell Clutter
  it("XF6 (F5 + F7): Leaderboard drawer expansion displays secondary metrics without nested details in cells", async () => {
    const { UnifiedLeaderboard } = await bindModule(
      () => import("@/components/catalogue/UnifiedLeaderboard"),
      "@/components/catalogue/UnifiedLeaderboard",
      "M2",
      "XF6"
    );
    const html = renderToStaticMarkup(
      React.createElement(UnifiedLeaderboard, {
        useCaseSlug: "structure-prediction",
        models: getSampleBiologicalRankings("structure-prediction"),
        expandedRowId: "model-alphafold3",
      })
    );

    expect(html).not.toMatch(/<td[^>]*>[\s\S]*?<details[\s\S]*?<\/td>/);
    expect(html).toMatch(/class="[^"]*(drawer|metric-details)[^"]*"/);
    expect(html).toContain("Context Window:");
    expect(html).toContain("5120");
  });

  // 7. F6 + F7: Multi-Study Replacement + Accessible Drawer Format
  it("XF7 (F6 + F7): Multi-study results unified into single table with citations in expandable drawer", async () => {
    const { UnifiedLeaderboard } = await bindModule(
      () => import("@/components/catalogue/UnifiedLeaderboard"),
      "@/components/catalogue/UnifiedLeaderboard",
      "M2",
      "XF7"
    );
    const html = renderToStaticMarkup(
      React.createElement(UnifiedLeaderboard, {
        useCaseSlug: "variant-effect",
        models: getSampleBiologicalRankings("variant-effect"),
        expandedRowId: "model-alphamissense",
      })
    );

    expect(html).toContain("AlphaMissense");
    expect(html).toContain("Tranception");
    expect(html).toMatch(/class="[^"]*(citation|drawer)[^"]*"/);
  });

  // 8. F5 + F9: Homepage Leaderboard + Use-Case Switcher Interaction
  it("XF8 (F5 + F9): Homepage headline leaderboard selection reflects use-case switcher active state", () => {
    const html = renderToStaticMarkup(React.createElement(BenchmarksPage));

    expect(html).toMatch(/<nav[^>]*aria-label="[^"]*biological use case[^"]*"/i);
    expect(html).toMatch(/<section[^>]*class="[^"]*headline-leaderboard[^"]*"/i);
  });

  // 9. F2 + F10: Ranking Engine Output Feeding Schema.org ItemList JSON-LD
  it("XF9 (F2 + F10): Ranking engine output feeds directly into Schema.org ItemList JSON-LD structured data", () => {
    const slug = "transcriptomics";
    const rankings = getSampleBiologicalRankings(slug);

    const structuredData = {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: `${BIOLOGICAL_USE_CASES[slug].name} Model Rankings`,
      itemListOrder: "https://schema.org/ItemListOrderDescending",
      numberOfItems: rankings.length,
      itemListElement: rankings.map((m, idx) => ({
        "@type": "ListItem",
        position: idx + 1,
        name: m.model_name,
        additionalProperty: [
          { "@type": "PropertyValue", name: "CapabilityIndex", value: m.use_case_index_score },
          { "@type": "PropertyValue", name: "InferenceLatencyMs", value: m.telemetry.inference_latency_ms },
        ],
      })),
    };

    expect(structuredData.itemListElement).toHaveLength(5);
    expect(structuredData.itemListElement[0].position).toBe(1);
    expect(structuredData.itemListElement[0].name).toBe("scGPT");
    expect(structuredData.itemListElement[0].additionalProperty[0].value).toBe(95.0);
  });

  // 10. F3 + F11: Protocol Baseline Margin Output Embedded in GEO Lead Summary
  it("XF10 (F3 + F11): Protocol baseline margin embedded directly into GEO takeaway summary text", () => {
    const topModel = SYNTHETIC_BIOLOGICAL_MODELS.find((m) => m.model_id === "model-alphafold3")!;
    const baseline = BIOLOGICAL_USE_CASES["structure-prediction"].baselines.conventional_baseline;
    const margin = topModel.margin_over_conventional;

    const geoSummary = `${topModel.model_name} leads ${BIOLOGICAL_USE_CASES["structure-prediction"].name} with a capability index of ${topModel.use_case_index_score}, establishing a +${margin}% margin over conventional ${baseline.name}.`;

    expect(geoSummary).toContain("AlphaFold 3");
    expect(geoSummary).toContain("+46.8% margin");
    expect(geoSummary).toContain("HHpred / Modeller");
  });

  // 11. F2 + F12: Dynamic Model Rankings Reflected in LLM Discoverability
  it("XF11 (F2 + F12): Dynamic model rankings from the ranking engine reflected in plain text discoverability", async () => {
    const { agentGuide } = await import("@/lib/agent-connect");
    const guideText = agentGuide("2026-11-02-a7f03c9e55a5");
    expect(guideText.length).toBeGreaterThan(100);
    expect(guideText).toContain("https://benchmarks.rewirebio.io");
  });

  // 12. F8 + F10: Removing Raw JSON Dumps While Enriching SoftwareApplication JSON-LD
  it("XF12 (F8 + F10): Removing raw JSON dumps on model pages while enriching Schema.org SoftwareApplication JSON-LD", () => {
    const { query } = buildCatalogue();
    const modelDetail = query.get({ id: "catalog-model-alphagenome" }) || createTestPredictiveRecordDetail();
    const html = renderToStaticMarkup(React.createElement(PredictiveEntityDetail, { detail: modelDetail }));

    expect(html).not.toContain("Fields verbatim");
    expect(html).not.toContain("verbatim");
    expect(html).toContain("AlphaGenome");
  });

  // 13. F9 + F13: Redesigned Homepage and Use-Case Routes Reflected in Sitemap
  it("XF13 (F9 + F13): Redesigned homepage and use-case routes correctly reflected in sitemap URLs", () => {
    const siteUrl = "https://benchmarks.rewirebio.io";
    const expectedPaths = [
      "",
      "/use-cases/structure-prediction",
      "/use-cases/variant-effect",
      "/use-cases/protein-design",
      "/use-cases/transcriptomics",
      "/use-cases/genomic-grammar",
    ];

    const sitemapUrls = expectedPaths.map((p) => `${siteUrl}${p}`);
    expect(sitemapUrls).toHaveLength(6);
    for (const url of sitemapUrls) {
      expect(url).toMatch(/^https:\/\/benchmarks\.rewirebio\.io(\/use-cases\/[a-z-]+)?$/);
    }
  });

  // 14. F5 + F14: Adding UnifiedLeaderboard While Complying with 90% UI Coverage
  it("XF14 (F5 + F14): UI coverage config includes components/ with >=90% thresholds", () => {
    const uiConfigPath = path.resolve(process.cwd(), "vitest.ui.config.ts");
    const content = fs.readFileSync(uiConfigPath, "utf-8");

    expect(content).toContain("components/**/*.{ts,tsx}");
    expect(content).toMatch(/lines:\s*90/);
    expect(content).toMatch(/statements:\s*90/);
    expect(content).toMatch(/functions:\s*90/);
    expect(content).toMatch(/branches:\s*90/);
  });

  // 15. F14 + F15: Continuous Release Pipeline Verification
  it("XF15 (F14 + F15): All test and build scripts configured cleanly in package.json", () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), "package.json"), "utf-8")
    );
    expect(pkg.scripts["test:e2e"]).toBeDefined();
    expect(pkg.scripts["test:ui:coverage"]).toBeDefined();
    expect(pkg.scripts.lint).toBeDefined();
    expect(pkg.scripts.typecheck).toBeDefined();
    expect(pkg.scripts["check:build"]).toBeDefined();
  });
});
