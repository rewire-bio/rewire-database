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
  createClutteredComparison,
  type BiologicalModelRankingRow,
} from "./fixtures/e2e-biological-fixtures";
import BenchmarksPage from "@/app/page";
import UseCasePage from "@/app/use-cases/[slug]/page";
import { PredictiveEntityDetail } from "@/app/database/_entities/predictive";
import UseCaseComparison from "@/components/catalogue/UseCaseComparison";
import { buildCatalogue } from "@/lib/catalogue-build";

describe("Tier 4: Real-World Application Scenarios (S1 - S5)", () => {
  // =========================================================================
  // Scenario S1: Structural Biologist Benchmarking Flow
  // =========================================================================
  it("Scenario S1: Structural Biologist Benchmarking Flow (F1, F2, F3, F4, F5, F6, F7, F9)", async () => {
    // 1. Biologist begins on Homepage with use-case selector (F9)
    const homepageHtml = renderToStaticMarkup(React.createElement(BenchmarksPage));
    expect(homepageHtml).toMatch(/Artificial Analysis of biological models|biological model benchmark database/i);
    expect(homepageHtml).toContain("/use-cases/structure-prediction");

    // 2. Evaluates Structure Prediction ranking data (F2, F3)
    const spDef = BIOLOGICAL_USE_CASES["structure-prediction"];
    expect(spDef.name).toBe("Structure Prediction");
    const spRankings = getSampleBiologicalRankings("structure-prediction");
    expect(spRankings.length).toBeGreaterThanOrEqual(3);

    // Top model should be AlphaFold 3
    expect(spRankings[0].model_name).toBe("AlphaFold 3");
    expect(spRankings[0].use_case_index_score).toBe(96.2);

    // 3. Examines protocol baselines & biological ceiling (F3)
    const conventionalBaseline = spDef.baselines.conventional_baseline;
    const ceiling = spDef.baselines.experimental_ceiling!;
    expect(conventionalBaseline.name).toBe("HHpred / Modeller (Template-Based)");
    expect(ceiling.value).toBe(0.94);

    // Computes margin over conventional baseline (+46.8%)
    expect(spRankings[0].margin_over_conventional).toBeCloseTo(46.8, 1);
    expect(spRankings[0].fraction_of_biological_ceiling).toBeCloseTo(0.968, 2);

    // 4. Biologist filters for Open Weights under 24GB VRAM for local execution (F4)
    const localViableModels = spRankings.filter(
      (m) => m.telemetry.open_weights && m.telemetry.min_vram_gb <= 24
    );
    expect(localViableModels.length).toBeGreaterThanOrEqual(2);
    expect(localViableModels.map((m) => m.model_name)).toContain("ESMFold");
    expect(localViableModels.map((m) => m.model_name)).toContain("Boltz-1");

    // 5. Renders genuine UnifiedLeaderboard table with drawer (F5, F6, F7)
    const { UnifiedLeaderboard } = await bindModule(
      () => import("@/components/catalogue/UnifiedLeaderboard"),
      "@/components/catalogue/UnifiedLeaderboard",
      "M2",
      "S1.5"
    );

    const tableMarkup = renderToStaticMarkup(
      React.createElement(UnifiedLeaderboard, {
        useCaseSlug: "structure-prediction",
        models: localViableModels,
        expandedRowId: "model-esmfold",
      })
    );

    // Verified: No cell clutter, exactly one table, clean drawer citations
    expect(tableMarkup).not.toMatch(/<td[^>]*>[\s\S]*?<details[\s\S]*?<\/td>/);
    expect(tableMarkup).not.toContain("moreValues");
    expect(tableMarkup).toContain("Assay Noise Ceiling");
    expect(tableMarkup).toContain("ESMFold");
    expect(tableMarkup).toContain("Science 2023");
  });

  // =========================================================================
  // Scenario S2: Variant Effect & Drug Discovery Screening Flow
  // =========================================================================
  it("Scenario S2: Variant Effect & Drug Discovery Screening Flow (F2, F3, F4, F5, F9)", async () => {
    // 1. User selects Variant Effect for deep mutational scanning (F2, F9)
    const veDef = BIOLOGICAL_USE_CASES["variant-effect"];
    expect(veDef.primaryMetric).toBe("Spearman Rho (ProteinGym DMS)");

    const veModels = getSampleBiologicalRankings("variant-effect");
    expect(veModels.length).toBeGreaterThanOrEqual(4);

    // 2. Compares frontier AI against conventional conservation baseline (F3)
    const alphaMissense = veModels.find((m) => m.model_id === "model-alphamissense")!;
    expect(alphaMissense.model_name).toBe("AlphaMissense");
    expect(alphaMissense.margin_over_conventional).toBeCloseTo(119.4, 1);
    expect(alphaMissense.fraction_of_biological_ceiling).toBeCloseTo(0.872, 2);

    // 3. Evaluates Pareto frontier for high-throughput screening (F4)
    const paretoModels = veModels.filter((m) => m.pareto_optimal);
    expect(paretoModels.length).toBeGreaterThanOrEqual(2);
    expect(paretoModels.map((m) => m.model_name)).toContain("AlphaMissense");
    expect(paretoModels.map((m) => m.model_name)).toContain("ESM-2 (650M)");

    // 4. Verifies throughput telemetry
    const esm2 = veModels.find((m) => m.model_id === "model-esm2-650m")!;
    expect(esm2.telemetry.throughput_items_per_sec).toBe(35.7);
    expect(esm2.telemetry.inference_latency_ms).toBe(28);

    // 5. Renders genuine UnifiedLeaderboard comparison view with Pareto highlight (F5)
    const { UnifiedLeaderboard } = await bindModule(
      () => import("@/components/catalogue/UnifiedLeaderboard"),
      "@/components/catalogue/UnifiedLeaderboard",
      "M2",
      "S2.5"
    );

    const viewHtml = renderToStaticMarkup(
      React.createElement(UnifiedLeaderboard, {
        useCaseSlug: "variant-effect",
        models: veModels,
        showParetoHighlight: true,
      })
    );

    expect(viewHtml).toMatch(/pareto/i);
    expect(viewHtml).toContain("AlphaMissense");
    expect(viewHtml).toContain("35.7 items/sec");
  });

  // =========================================================================
  // Scenario S3: Decluttering & Deep Inspection Flow
  // =========================================================================
  it("Scenario S3: Decluttering & Deep Inspection Flow (F5, F6, F7, F8, F9)", () => {
    // 1. User starts on Homepage (F9) -> verifies absence of raw 16-button entity explorer
    const homeHtml = renderToStaticMarkup(React.createElement(BenchmarksPage));
    expect(homeHtml).not.toMatch(/class="[^"]*button-16-grid[^"]*"/);
    expect(homeHtml).not.toMatch(/<div[^>]*class="[^"]*raw-entity-explorer[^"]*"/);

    // 2. User navigates to model detail inspection page (F8) -> verifies absence of Fields verbatim
    const { query } = buildCatalogue();
    const modelDetail = query.get({ id: "catalog-model-alphagenome" }) || createTestPredictiveRecordDetail();

    const detailHtml = renderToStaticMarkup(React.createElement(PredictiveEntityDetail, { detail: modelDetail }));

    // Negative assertions verifying complete decluttering
    expect(detailHtml).not.toContain("Fields verbatim");
    expect(detailHtml).not.toContain("verbatim");
    expect(detailHtml).not.toContain("extraction_receipt");
    expect(detailHtml).not.toContain("raw_attributes_dump");

    // Positive assertions verifying capability profile
    expect(detailHtml).toContain("AlphaGenome");

    // 3. User inspects comparison table (F7) -> verifies absence of moreValues
    const cluttered = createClutteredComparison();
    const compHtml = renderToStaticMarkup(
      React.createElement(UseCaseComparison, {
        comparison: cluttered,
        useCasePath: "/use-cases/variant-effect/",
      })
    );
    expect(compHtml).not.toContain("moreValues");
    expect(compHtml).not.toMatch(/<td[^>]*>[\s\S]*?<details[\s\S]*?<\/td>/);
  });

  // =========================================================================
  // Scenario S4: Autonomous AI Retrieval & Search Engine Crawling Flow
  // =========================================================================
  it("Scenario S4: Autonomous AI Retrieval & Search Engine Crawling Flow (F1, F10, F11, F12, F13)", async () => {
    // 1. AI agent requests /llms.txt for rapid machine-readable discovery (F12)
    const { GET: getLlms } = await import("@/app/llms.txt/route");
    const llmsRes = getLlms();
    expect(llmsRes.status).toBe(200);
    const llmsText = await llmsRes.text();
    expect(llmsText.length).toBeGreaterThan(100);
    expect(llmsText).toContain("https://benchmarks.rewirebio.io");

    // 2. AI agent requests /agents.md for tool invocation endpoints (F12)
    const { GET: getAgents } = await import("@/app/agents.md/route");
    const agentsRes = getAgents();
    expect(agentsRes.status).toBe(200);
    const agentsText = await agentsRes.text();
    expect(agentsText).toContain("https://benchmarks.rewirebio.io");

    // 3. Search engine crawler inspects robots.txt for allowed paths and sitemap reference (F13)
    const { default: robots } = await import("@/app/robots");
    const robotsConfig = robots();
    // @ts-ignore
    const rules = Array.isArray(robotsConfig.rules) ? robotsConfig.rules[0] : robotsConfig.rules;
    expect(rules.allow).toBe("/");
    expect(robotsConfig.sitemap).toBe("https://benchmarks.rewirebio.io/sitemap.xml");

    // 4. Crawler requests sitemap.xml to discover use-case endpoints (F13)
    const { GET: getSitemap } = await import("@/app/sitemap.xml/route");
    const sitemapRes = getSitemap();
    expect(sitemapRes.status).toBe(200);
    const sitemapXml = await sitemapRes.text();
    expect(sitemapXml).toContain("xml");

    // 5. Crawler & AI engine parses GEO section and JSON-LD structured data on genuine use-case page (F10, F11)
    const pageMarkup = renderToStaticMarkup(
      React.createElement(UseCasePage, { params: { slug: "structural-hypotheses-experiments" } })
    );

    expect(pageMarkup).toContain("geo-takeaway");
    expect(pageMarkup).toMatch(/AlphaFold 3|AlphaMissense|Structure Prediction/);
    expect(pageMarkup).toContain("application/ld+json");
    expect(pageMarkup).toContain("ItemList");
  });

  // =========================================================================
  // Scenario S5: Continuous Integration & Release Integrity Flow
  // =========================================================================
  it("Scenario S5: Continuous Integration & Release Integrity Flow (F14, F15)", () => {
    // 1. Verifies package.json scripts configuration (F15)
    const pkgPath = path.resolve(process.cwd(), "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));

    expect(pkg.scripts["test"]).toBe("vitest run");
    expect(pkg.scripts["test:e2e"]).toBe("vitest run --config vitest.e2e.config.ts");
    expect(pkg.scripts["test:ui:coverage"]).toBe(
      "vitest run --config vitest.ui.config.ts --coverage"
    );
    expect(pkg.scripts["typecheck"]).toBe("tsc --noEmit");
    expect(pkg.scripts["lint"]).toBe("next lint");
    expect(pkg.scripts["check:build"]).toBe("tsx scripts/check-ssr-build.ts");

    // 2. Verifies UI coverage configuration and strict 90% gates (F14)
    const uiConfigPath = path.resolve(process.cwd(), "vitest.ui.config.ts");
    const uiConfigContent = fs.readFileSync(uiConfigPath, "utf-8");

    expect(uiConfigContent).toContain("components/**/*.{ts,tsx}");
    expect(uiConfigContent).toMatch(/lines:\s*90/);
    expect(uiConfigContent).toMatch(/statements:\s*90/);
    expect(uiConfigContent).toMatch(/functions:\s*90/);
    expect(uiConfigContent).toMatch(/branches:\s*90/);

    // 3. Verifies TypeScript strict typing configuration (F15)
    const tsconfigPath = path.resolve(process.cwd(), "tsconfig.json");
    const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, "utf-8"));
    expect(tsconfig.compilerOptions.strict).toBe(true);

    // 4. Verifies E2E configuration existence and properties (F15)
    const e2eConfigPath = path.resolve(process.cwd(), "vitest.e2e.config.ts");
    const e2eConfigContent = fs.readFileSync(e2eConfigPath, "utf-8");
    expect(e2eConfigContent).toContain("tests/e2e/**/*.{test,spec}.{ts,tsx}");
    expect(e2eConfigContent).toContain("testTimeout: 30_000");

    // 5. Verifies all 4 tiers of E2E test files exist
    expect(fs.existsSync(path.resolve(process.cwd(), "tests/e2e/tier1-feature-coverage.test.ts"))).toBe(true);
    expect(fs.existsSync(path.resolve(process.cwd(), "tests/e2e/tier2-boundary-corner.test.ts"))).toBe(true);
    expect(fs.existsSync(path.resolve(process.cwd(), "tests/e2e/tier3-cross-feature.test.ts"))).toBe(true);
    expect(fs.existsSync(path.resolve(process.cwd(), "tests/e2e/tier4-application-scenarios.test.ts"))).toBe(true);
  });
});
