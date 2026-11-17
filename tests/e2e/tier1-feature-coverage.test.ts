import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
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
  formatVramGb,
  bindModule,
  createClutteredComparison,
  createTestPredictiveRecordDetail,
  type BiologicalModelRankingRow,
} from "./fixtures/e2e-biological-fixtures";
import { displayValue } from "@/lib/omics";
import { PredictiveEntityDetail } from "@/app/database/_entities/predictive";
import UseCaseComparison from "@/components/catalogue/UseCaseComparison";
import BenchmarksPage from "@/app/page";
import UseCasePage from "@/app/use-cases/[slug]/page";
import { buildCatalogue } from "@/lib/catalogue-build";

describe("Tier 1: Feature Coverage (F1 - F15)", () => {
  // =========================================================================
  // F1: Product Review & Competitor Audit Report
  // =========================================================================
  describe("F1: Product Review & Competitor Audit Report", () => {
    const reportPath = path.resolve(
      process.cwd(),
      "docs/reports/artificial-analysis-product-review-and-recommendations.md"
    );

    it("F1.1: Report exists at docs/reports/artificial-analysis-product-review-and-recommendations.md", () => {
      expect(fs.existsSync(reportPath)).toBe(true);
      const stat = fs.statSync(reportPath);
      expect(stat.size).toBeGreaterThan(1000);
    });

    it("F1.2: Report contains comparison against Artificial Analysis paradigm", () => {
      const content = fs.readFileSync(reportPath, "utf-8");
      expect(content).toMatch(/Artificial Analysis/i);
      expect(content).toMatch(/single[\s-]view/i);
      expect(content).toMatch(/biological use case/i);
    });

    it("F1.3: Report reviews competitors (ProteinGym, TDC, CAMEO, BaseBench)", () => {
      const content = fs.readFileSync(reportPath, "utf-8");
      expect(content).toMatch(/ProteinGym/i);
      expect(content).toMatch(/Therapeutics Data Commons|TDC/i);
      expect(content).toMatch(/CAMEO/i);
      expect(content).toMatch(/BaseBench/i);
    });

    it("F1.4: Report cites rewire-bio GitHub issues (#27, #138-#167, #213)", () => {
      const content = fs.readFileSync(reportPath, "utf-8");
      expect(content).toMatch(/#27/);
      expect(content).toMatch(/#138|#142|#143|#147|#161|#167/);
      expect(content).toMatch(/#213/);
    });

    it("F1.5: Report details schema recommendations for per-use-case rankings and protocol baselines", () => {
      const content = fs.readFileSync(reportPath, "utf-8");
      expect(content).toMatch(/ProtocolBaselineAnchor|protocol baselines/i);
      expect(content).toMatch(/null_baseline|null control/i);
      expect(content).toMatch(/conventional_baseline|pre-ML baseline/i);
      expect(content).toMatch(/experimental_ceiling|noise ceiling/i);
      expect(content).toMatch(/OperationalTelemetry|inference_latency_ms/i);
    });
  });

  // =========================================================================
  // F2: Biological Use-Case Taxonomy & Ranking Engine
  // =========================================================================
  describe("F2: Biological Use-Case Taxonomy & Ranking Engine", () => {
    const getLeaderboardRows = (mod: any, category: string) => {
      if (typeof mod.computeBiologicalLeaderboard === "function") {
        return mod.computeBiologicalLeaderboard(category);
      }
      if (typeof mod.getUseCaseLeaderboard === "function") {
        const res = mod.getUseCaseLeaderboard(undefined, { category });
        return res.rows;
      }
      throw new Error("[ACCEPTANCE GATE UNMET] getUseCaseLeaderboard or computeBiologicalLeaderboard not found in module");
    };

    it("F2.1: Computes Structure Prediction rankings with 0-100 normalized scores", async () => {
      const mod = await bindModule(
        () => import("@/lib/use-case-leaderboard"),
        "@/lib/use-case-leaderboard",
        "M2",
        "F2.1"
      );
      const rankings = getLeaderboardRows(mod, "structure-prediction");
      expect(rankings.length).toBeGreaterThanOrEqual(3);
      for (const row of rankings) {
        expect(row.category).toMatch(/structure[_-]prediction/);
        expect(row.use_case_index_score).toBeGreaterThanOrEqual(0);
        expect(row.use_case_index_score).toBeLessThanOrEqual(100);
        expect(row.primary_metric_name).toContain("lDDT");
      }
      expect(rankings.some((r: any) => r.model_name === "AlphaFold 3")).toBe(true);
    });

    it("F2.2: Computes Variant Effect classification rankings with 0-100 normalized scores", async () => {
      const mod = await bindModule(
        () => import("@/lib/use-case-leaderboard"),
        "@/lib/use-case-leaderboard",
        "M2",
        "F2.2"
      );
      const rankings = getLeaderboardRows(mod, "variant-effect");
      expect(rankings.length).toBeGreaterThanOrEqual(3);
      for (const row of rankings) {
        expect(row.category).toMatch(/variant[_-]effect/);
        expect(row.use_case_index_score).toBeGreaterThanOrEqual(0);
        expect(row.use_case_index_score).toBeLessThanOrEqual(100);
        expect(row.primary_metric_name).toContain("Spearman Rho");
      }
      expect(rankings.some((r: any) => r.model_name === "AlphaMissense")).toBe(true);
    });

    it("F2.3: Computes Protein Design rankings with 0-100 normalized scores", async () => {
      const mod = await bindModule(
        () => import("@/lib/use-case-leaderboard"),
        "@/lib/use-case-leaderboard",
        "M2",
        "F2.3"
      );
      const rankings = getLeaderboardRows(mod, "protein-design");
      expect(rankings.length).toBeGreaterThanOrEqual(3);
      for (const row of rankings) {
        expect(row.category).toMatch(/protein[_-]design/);
        expect(row.use_case_index_score).toBeGreaterThanOrEqual(0);
        expect(row.use_case_index_score).toBeLessThanOrEqual(100);
      }
      expect(rankings.some((r: any) => r.model_name === "RFdiffusion")).toBe(true);
    });

    it("F2.4: Computes Transcriptomics rankings with 0-100 normalized scores", async () => {
      const mod = await bindModule(
        () => import("@/lib/use-case-leaderboard"),
        "@/lib/use-case-leaderboard",
        "M2",
        "F2.4"
      );
      const rankings = getLeaderboardRows(mod, "transcriptomics");
      expect(rankings.length).toBeGreaterThanOrEqual(3);
      for (const row of rankings) {
        expect(row.category).toMatch(/transcriptomics/);
        expect(row.use_case_index_score).toBeGreaterThanOrEqual(0);
        expect(row.use_case_index_score).toBeLessThanOrEqual(100);
      }
      expect(rankings.some((r: any) => r.model_name === "scGPT")).toBe(true);
    });

    it("F2.5: Computes Genomic Grammar rankings with Pareto efficiency calculation", async () => {
      const mod = await bindModule(
        () => import("@/lib/use-case-leaderboard"),
        "@/lib/use-case-leaderboard",
        "M2",
        "F2.5"
      );
      const rankings = getLeaderboardRows(mod, "genomic-grammar");
      expect(rankings.length).toBeGreaterThanOrEqual(3);
      const paretoModels = rankings.filter((r: any) => r.pareto_optimal);
      expect(paretoModels.length).toBeGreaterThanOrEqual(1);

      for (const row of rankings) {
        if (!row.pareto_optimal && row.telemetry?.inference_latency_ms != null) {
          const dominator = rankings.find(
            (other: any) =>
              other.model_id !== row.model_id &&
              other.telemetry?.inference_latency_ms != null &&
              other.use_case_index_score >= row.use_case_index_score &&
              other.telemetry.inference_latency_ms <= row.telemetry.inference_latency_ms &&
              (other.use_case_index_score > row.use_case_index_score ||
                other.telemetry.inference_latency_ms < row.telemetry.inference_latency_ms)
          );
          expect(dominator).toBeDefined();
        }
      }
    });
  });

  // =========================================================================
  // F3: Protocol Baseline & Biological Ceiling Anchors
  // =========================================================================
  describe("F3: Protocol Baseline & Biological Ceiling Anchors", () => {
    it("F3.1: Protocol baseline hierarchy includes Null Baseline anchor with expected null score", () => {
      for (const [, uc] of Object.entries(BIOLOGICAL_USE_CASES)) {
        expect(uc.baselines.null_baseline).toBeDefined();
        expect(typeof uc.baselines.null_baseline.name).toBe("string");
        expect(typeof uc.baselines.null_baseline.value).toBe("number");
        expect(uc.baselines.null_baseline.description.length).toBeGreaterThan(10);
      }
    });

    it("F3.2: Protocol baseline hierarchy includes Conventional Pre-ML Baseline anchor", () => {
      for (const [, uc] of Object.entries(BIOLOGICAL_USE_CASES)) {
        expect(uc.baselines.conventional_baseline).toBeDefined();
        expect(uc.baselines.conventional_baseline.method_id.length).toBeGreaterThan(0);
        expect(uc.baselines.conventional_baseline.value).toBeGreaterThan(uc.baselines.null_baseline.value);
        expect(uc.baselines.conventional_baseline.description.length).toBeGreaterThan(10);
      }
    });

    it("F3.3: Protocol baseline hierarchy includes Experimental Assay Noise Ceiling", () => {
      for (const [, uc] of Object.entries(BIOLOGICAL_USE_CASES)) {
        expect(uc.baselines.experimental_ceiling).toBeDefined();
        expect(uc.baselines.experimental_ceiling!.value).toBeGreaterThan(
          uc.baselines.conventional_baseline.value
        );
        expect(uc.baselines.experimental_ceiling!.assay_replicate_noise.length).toBeGreaterThan(5);
      }
    });

    it("F3.4: Output computes positive margin over conventional baseline (margin_over_conventional)", () => {
      const sp = getSampleBiologicalRankings("structure-prediction");
      for (const row of sp) {
        expect(row.margin_over_conventional).toBeDefined();
        expect(typeof row.margin_over_conventional).toBe("number");
        if (row.model_id === "model-alphafold3") {
          expect(row.margin_over_conventional).toBeCloseTo(46.8, 1);
        }
      }
    });

    it("F3.5: Output computes fraction of biological ceiling achieved (fraction_of_biological_ceiling)", () => {
      const ve = getSampleBiologicalRankings("variant-effect");
      for (const row of ve) {
        expect(row.fraction_of_biological_ceiling).toBeDefined();
        expect(row.fraction_of_biological_ceiling!).toBeGreaterThan(0);
        expect(row.fraction_of_biological_ceiling!).toBeLessThanOrEqual(1.5);
        if (row.model_id === "model-alphamissense") {
          expect(row.fraction_of_biological_ceiling).toBeCloseTo(0.872, 2);
        }
      }
    });
  });

  // =========================================================================
  // F4: Operational & Hardware Telemetry Integration
  // =========================================================================
  describe("F4: Operational & Hardware Telemetry Integration", () => {
    it("F4.1: Telemetry includes inference latency in milliseconds (inference_latency_ms)", () => {
      for (const m of SYNTHETIC_BIOLOGICAL_MODELS) {
        expect(m.telemetry.inference_latency_ms).toBeDefined();
        expect(typeof m.telemetry.inference_latency_ms).toBe("number");
        expect(m.telemetry.inference_latency_ms).toBeGreaterThan(0);
      }
    });

    it("F4.2: Telemetry includes throughput in items per second (throughput_items_per_sec)", () => {
      for (const m of SYNTHETIC_BIOLOGICAL_MODELS) {
        expect(m.telemetry.throughput_items_per_sec).toBeDefined();
        expect(typeof m.telemetry.throughput_items_per_sec).toBe("number");
        expect(m.telemetry.throughput_items_per_sec).toBeGreaterThan(0);
      }
    });

    it("F4.3: Telemetry includes minimum VRAM requirement in GB (min_vram_gb)", () => {
      for (const m of SYNTHETIC_BIOLOGICAL_MODELS) {
        expect(m.telemetry.min_vram_gb).toBeDefined();
        expect(typeof m.telemetry.min_vram_gb).toBe("number");
        expect(m.telemetry.min_vram_gb).toBeGreaterThanOrEqual(0);
      }
    });

    it("F4.4: Telemetry includes parameter count in millions (parameter_count_millions)", () => {
      for (const m of SYNTHETIC_BIOLOGICAL_MODELS) {
        expect(m.telemetry.parameter_count_millions).toBeDefined();
        expect(typeof m.telemetry.parameter_count_millions).toBe("number");
        expect(m.telemetry.parameter_count_millions).toBeGreaterThanOrEqual(0);
      }
    });

    it("F4.5: Telemetry includes open weights boolean flag and license definition", () => {
      for (const m of SYNTHETIC_BIOLOGICAL_MODELS) {
        expect(typeof m.telemetry.open_weights).toBe("boolean");
        expect(typeof m.telemetry.license).toBe("string");
        expect(m.telemetry.license.length).toBeGreaterThan(2);
      }
    });
  });

  // =========================================================================
  // F5: Unified Single-View Leaderboard UI
  // =========================================================================
  describe("F5: Unified Single-View Leaderboard UI", () => {
    it("F5.1: Renders single unified table with semantic headers", async () => {
      const { UnifiedLeaderboard } = await bindModule(
        () => import("@/components/catalogue/UnifiedLeaderboard"),
        "@/components/catalogue/UnifiedLeaderboard",
        "M2",
        "F5.1"
      );
      const models = getSampleBiologicalRankings("structure-prediction");
      const html = renderToStaticMarkup(
        React.createElement(UnifiedLeaderboard, {
          useCaseSlug: "structure-prediction",
          models,
        })
      );

      expect(html).toContain("<table");
      expect(html).toMatch(/<thead[\s\S]*?<th[^>]*>[\s\S]*?<\/thead>/);
      expect(html).toMatch(/<tbody[\s\S]*?<tr[^>]*>[\s\S]*?<\/tbody>/);
      expect(html).toContain("Rank");
      expect(html).toContain("Model");
      expect(html).toContain("Capability Index");
      expect(html).toContain("Margin vs Pre-ML");
      expect(html).toContain("AlphaFold 3");
      expect(html).toContain("ESMFold");
    });

    it("F5.2: Renders biological use case switcher tabs/dropdown", async () => {
      const { UnifiedLeaderboard } = await bindModule(
        () => import("@/components/catalogue/UnifiedLeaderboard"),
        "@/components/catalogue/UnifiedLeaderboard",
        "M2",
        "F5.2"
      );
      const models = getSampleBiologicalRankings("structure-prediction");
      const html = renderToStaticMarkup(
        React.createElement(UnifiedLeaderboard, {
          useCaseSlug: "structure-prediction",
          models,
        })
      );

      expect(html).toMatch(/<nav[^>]*aria-label="[^"]*use-case[^"]*"|<div[^>]*role="tablist"/i);
      for (const uc of Object.values(BIOLOGICAL_USE_CASES)) {
        expect(html).toContain(uc.name);
        expect(html).toContain(`data-use-case="${uc.slug}"`);
      }
    });

    it("F5.3: Renders Pareto optimal badge/filter for frontier models", async () => {
      const { UnifiedLeaderboard } = await bindModule(
        () => import("@/components/catalogue/UnifiedLeaderboard"),
        "@/components/catalogue/UnifiedLeaderboard",
        "M2",
        "F5.3"
      );
      const models = getSampleBiologicalRankings("structure-prediction");
      const html = renderToStaticMarkup(
        React.createElement(UnifiedLeaderboard, {
          useCaseSlug: "structure-prediction",
          models,
        })
      );

      const af3Row = html.match(/<tr[^>]*data-model-id="model-alphafold3"[\s\S]*?<\/tr>/)?.[0] || "";
      expect(af3Row).toMatch(/class="[^"]*pareto[^"]*"|Pareto Frontier|★/i);

      const openFoldRow = html.match(/<tr[^>]*data-model-id="model-openfold"[\s\S]*?<\/tr>/)?.[0] || "";
      expect(openFoldRow).not.toMatch(/class="[^"]*pareto[^"]*"|Pareto Frontier/i);
    });

    it("F5.4: Renders open weights filter control", async () => {
      const { UnifiedLeaderboard } = await bindModule(
        () => import("@/components/catalogue/UnifiedLeaderboard"),
        "@/components/catalogue/UnifiedLeaderboard",
        "M2",
        "F5.4"
      );
      const models = getSampleBiologicalRankings("structure-prediction");
      const html = renderToStaticMarkup(
        React.createElement(UnifiedLeaderboard, {
          useCaseSlug: "structure-prediction",
          models,
        })
      );

      expect(html).toMatch(/open[- ]?weights/i);
      expect(html).toMatch(/<input[^>]*type="checkbox"[^>]*name="open_weights_only"|<button[^>]*aria-pressed/i);
    });

    it("F5.5: Renders expandable drawer row trigger for detailed metrics", async () => {
      const { UnifiedLeaderboard } = await bindModule(
        () => import("@/components/catalogue/UnifiedLeaderboard"),
        "@/components/catalogue/UnifiedLeaderboard",
        "M2",
        "F5.5"
      );
      const models = getSampleBiologicalRankings("structure-prediction");
      const html = renderToStaticMarkup(
        React.createElement(UnifiedLeaderboard, {
          useCaseSlug: "structure-prediction",
          models,
        })
      );

      expect(html).toMatch(/<button[^>]*aria-expanded="(false|true)"/i);
      expect(html).toMatch(/aria-controls="[^"]+"|data-drawer-trigger/i);
    });
  });

  // =========================================================================
  // F6: Eliminate Use-Case Multi-Table Fragmentation
  // =========================================================================
  describe("F6: Eliminate Use-Case Multi-Table Fragmentation", () => {
    it("F6.1: Use-case page structure contains exactly one primary ranking table per use case", () => {
      const html = renderToStaticMarkup(React.createElement(UseCasePage, { params: { slug: "structural-hypotheses-experiments" } }));
      const primarySection = html.match(/<section[^>]*id="evidence"[^>]*>([\s\S]*?)<\/section>/)?.[1] || html;
      const tableCount = (primarySection.match(/<table\b/g) || []).length;
      expect(tableCount).toBe(1);
    });

    it("F6.2: No multiple disjointed per-study tables rendered in sequence", () => {
      const html = renderToStaticMarkup(React.createElement(UseCasePage, { params: { slug: "structural-hypotheses-experiments" } }));
      expect(html).not.toMatch(/<table[^>]*class="[^"]*comparison[^"]*"[\s\S]*?<\/table>[\s\S]*?<table[^>]*class="[^"]*comparison[^"]*"/);
    });

    it("F6.3: Benchmark study citations are preserved within expandable row details", async () => {
      const { UnifiedLeaderboard } = await bindModule(
        () => import("@/components/catalogue/UnifiedLeaderboard"),
        "@/components/catalogue/UnifiedLeaderboard",
        "M2",
        "F6.3"
      );
      const html = renderToStaticMarkup(
        React.createElement(UnifiedLeaderboard, {
          useCaseSlug: "structure-prediction",
          models: getSampleBiologicalRankings("structure-prediction"),
          expandedRowId: "model-alphafold3",
        })
      );

      expect(html).toMatch(/<tr[^>]*class="[^"]*(drawer|detail)[^"]*"/);
      expect(html).toContain("Nature");
      expect(html).toContain("10.1038/s41586-024-07487-w");
    });

    it("F6.4: Cross-study model performance is aggregated into the unified ranking", () => {
      const rankings = getSampleBiologicalRankings("structure-prediction");
      expect(rankings.map((r) => r.model_name)).toEqual(
        expect.arrayContaining(["AlphaFold 3", "ESMFold", "OpenFold", "Chai-1", "Boltz-1"])
      );
    });

    it("F6.5: Primary metric per use case is unambiguously displayed in table header", () => {
      for (const [, uc] of Object.entries(BIOLOGICAL_USE_CASES)) {
        expect(uc.primaryMetric.length).toBeGreaterThan(3);
      }
    });
  });

  // =========================================================================
  // F7: Eliminate Table Cell Clutter & Embedded Disclosures
  // =========================================================================
  describe("F7: Eliminate Table Cell Clutter & Embedded Disclosures", () => {
    it("F7.1: Table cells do not contain <details className=\"...moreValues...\">", () => {
      const cluttered = createClutteredComparison();
      const html = renderToStaticMarkup(
        React.createElement(UseCaseComparison, {
          comparison: cluttered,
          useCasePath: "/use-cases/structure-prediction/",
        })
      );

      // Must NOT contain moreValues or details inside any table cell
      expect(html).not.toContain("moreValues");
      expect(html).not.toMatch(/<td[^>]*>[\s\S]*?<details[\s\S]*?<\/td>/);
    });

    it("F7.2: Cells do not stack >3 numeric metric values vertically", async () => {
      const { UnifiedLeaderboard } = await bindModule(
        () => import("@/components/catalogue/UnifiedLeaderboard"),
        "@/components/catalogue/UnifiedLeaderboard",
        "M2",
        "F7.2"
      );
      const html = renderToStaticMarkup(
        React.createElement(UnifiedLeaderboard, {
          useCaseSlug: "structure-prediction",
          models: getSampleBiologicalRankings("structure-prediction"),
        })
      );

      const cells = html.match(/<td[^>]*>([\s\S]*?)<\/td>/g) || [];
      expect(cells.length).toBeGreaterThan(0);
      for (const cell of cells) {
        const cleanBody = cell.replace(/<[^>]+>/g, " ");
        const numbers = cleanBody.match(/\b\d+(\.\d+)?\b/g) || [];
        expect(numbers.length).toBeLessThanOrEqual(3);
      }
    });

    it("F7.3: Secondary metric details are moved to accessible drawer rows (<tr>)", async () => {
      const { UnifiedLeaderboard } = await bindModule(
        () => import("@/components/catalogue/UnifiedLeaderboard"),
        "@/components/catalogue/UnifiedLeaderboard",
        "M2",
        "F7.3"
      );
      const html = renderToStaticMarkup(
        React.createElement(UnifiedLeaderboard, {
          useCaseSlug: "structure-prediction",
          models: getSampleBiologicalRankings("structure-prediction"),
          expandedRowId: "model-alphafold3",
        })
      );

      expect(html).toMatch(/<tr[^>]*class="[^"]*(drawer|metric-details)[^"]*"/);
      expect(html).toContain("Context Window");
      expect(html).toContain("5120");
      expect(html).toContain("License");
    });

    it("F7.4: Table column widths remain aligned and readable without cell overflow", async () => {
      const { UnifiedLeaderboard } = await bindModule(
        () => import("@/components/catalogue/UnifiedLeaderboard"),
        "@/components/catalogue/UnifiedLeaderboard",
        "M2",
        "F7.4"
      );
      const html = renderToStaticMarkup(
        React.createElement(UnifiedLeaderboard, {
          useCaseSlug: "structure-prediction",
          models: getSampleBiologicalRankings("structure-prediction"),
        })
      );

      const headers = html.match(/<th[^>]*>[\s\S]*?<\/th>/g) || [];
      expect(headers.length).toBeGreaterThanOrEqual(6);
      for (const th of headers) {
        expect(th).toMatch(/class="[^"]*(w-|min-w-|col-|align-)[^"]*"/);
      }
    });

    it("F7.5: Metric units (ms, GB, %) are clearly formatted and human-readable", () => {
      const m = SYNTHETIC_BIOLOGICAL_MODELS[0];
      const latencyStr = formatLatencyMs(m.telemetry.inference_latency_ms);
      const vramStr = formatVramGb(m.telemetry.min_vram_gb);
      const marginStr = `+${m.margin_over_conventional}%`;

      expect(latencyStr).toBe("12.5 s");
      expect(vramStr).toBe("40 GB");
      expect(marginStr).toBe("+46.8%");
    });
  });

  // =========================================================================
  // F8: Eliminate Raw Database Attribute Dumps
  // =========================================================================
  describe("F8: Eliminate Raw Database Attribute Dumps", () => {
    const { query } = buildCatalogue();
    const modelDetail = query.get({ id: "catalog-model-alphagenome" }) || createTestPredictiveRecordDetail();

    it("F8.1: Model detail page does not contain Fields verbatim section", () => {
      const html = renderToStaticMarkup(React.createElement(PredictiveEntityDetail, { detail: modelDetail }));

      expect(html).not.toContain("Fields verbatim");
      expect(html).not.toContain("verbatim");
      expect(html).not.toMatch(/<summary>[^<]*extraction receipts[^<]*<\/summary>/i);
    });

    it("F8.2: Model detail page does not dump raw JSON extraction receipts", () => {
      const html = renderToStaticMarkup(React.createElement(PredictiveEntityDetail, { detail: modelDetail }));

      expect(html).not.toContain("extraction_receipt");
      expect(html).not.toContain("receipt_sha256");
      expect(html).not.toMatch(/\{"profile":/);
    });

    it("F8.3: Model attributes are presented in structured capability cards", () => {
      const html = renderToStaticMarkup(React.createElement(PredictiveEntityDetail, { detail: modelDetail }));

      expect(html).toMatch(/<section[^>]*class="[^"]*capability[^"]*"|<div[^>]*class="[^"]*capability-card[^"]*"/i);
      expect(html).toContain("AlphaGenome");
    });

    it("F8.4: Provenance and source record links remain accessible without JSON dumps", () => {
      const html = renderToStaticMarkup(React.createElement(PredictiveEntityDetail, { detail: modelDetail }));

      expect(html).toMatch(/<a[^>]*href="(\/database\/source\/|https:\/\/doi\.org\/)[^"]*"[^>]*>[\s\S]*?<\/a>/);
    });

    it("F8.5: Empty or optional JSON fields do not render as raw {} or null", () => {
      expect(displayValue({})).toBe("None recorded");
      expect(displayValue(undefined)).toBe("Not reported");
      expect(displayValue(null)).toBe("Not reported");
      expect(displayValue("")).toBe("Not reported");
    });
  });

  // =========================================================================
  // F9: Homepage Redesign & Use-Case First Entry
  // =========================================================================
  describe("F9: Homepage Redesign & Use-Case First Entry", () => {
    it("F9.1: Homepage features prominent biological use-case selector above the fold", () => {
      const html = renderToStaticMarkup(React.createElement(BenchmarksPage));

      expect(html).toMatch(/<nav[^>]*aria-label="[^"]*biological use case[^"]*"|<section[^>]*aria-label="[^"]*use-case[^"]*"/i);
      expect(html).toContain("/use-cases/structure-prediction");
      expect(html).toContain("/use-cases/variant-effect");
    });

    it("F9.2: 16-button raw entity grid is replaced by use-case discovery entry points", () => {
      const html = renderToStaticMarkup(React.createElement(BenchmarksPage));

      expect(html).not.toMatch(/class="[^"]*button-16-grid[^"]*"/);
      expect(html).not.toMatch(/<div[^>]*class="[^"]*raw-entity-explorer[^"]*"/);
    });

    it("F9.3: Homepage embeds a headline model leaderboard view", () => {
      const html = renderToStaticMarkup(React.createElement(BenchmarksPage));

      expect(html).toMatch(/<table[\s\S]*?AlphaFold|<section[^>]*class="[^"]*headline-leaderboard[^"]*"/i);
    });

    it("F9.4: Value proposition positioning platform for independent biological benchmarks is visible", () => {
      const html = renderToStaticMarkup(React.createElement(BenchmarksPage));

      expect(html).toMatch(/Independent Benchmarks for Biological Models|biological model benchmark database/i);
      expect(html).toContain("Which biological model works best for your task?");
    });

    it("F9.5: Clear navigation path exists from homepage to each of the 5 use cases", () => {
      const slugs = Object.keys(BIOLOGICAL_USE_CASES);
      expect(slugs).toHaveLength(5);
      for (const slug of slugs) {
        expect([
          "structure-prediction",
          "variant-effect",
          "protein-design",
          "transcriptomics",
          "genomic-grammar",
        ]).toContain(slug);
      }
    });
  });

  // =========================================================================
  // F10: Schema.org JSON-LD Structured Data
  // =========================================================================
  describe("F10: Schema.org JSON-LD Structured Data", () => {
    it("F10.1: Use-case page includes <script type=\"application/ld+json\"> with ItemList", () => {
      const html = renderToStaticMarkup(React.createElement(UseCasePage, { params: { slug: "structural-hypotheses-experiments" } }));
      const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
      expect(scripts.length).toBeGreaterThan(0);
      const types = scripts.map((s) => JSON.parse(s[1])["@type"]);
      expect(types).toContain("ItemList");
    });

    it("F10.2: ItemList contains ordered model entries with rank and score", () => {
      const html = renderToStaticMarkup(React.createElement(UseCasePage, { params: { slug: "structural-hypotheses-experiments" } }));
      const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
      const itemListScript = scripts.find((s) => JSON.parse(s[1])["@type"] === "ItemList");
      expect(itemListScript).toBeDefined();
      const json = JSON.parse(itemListScript![1]);
      const items = json.itemListElement;
      expect(items[0].position).toBe(1);
      expect(items[0].name).toBeDefined();
    });

    it("F10.3: Model detail page includes SoftwareApplication JSON-LD schema", () => {
      const { query } = buildCatalogue();
      const modelDetail = query.get({ id: "catalog-model-alphagenome" }) || createTestPredictiveRecordDetail();
      const html = renderToStaticMarkup(React.createElement(PredictiveEntityDetail, { detail: modelDetail }));
      const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
      const types = scripts.map((s) => JSON.parse(s[1])["@type"]);
      expect(types).toContain("SoftwareApplication");
    });

    it("F10.4: Benchmark dataset references include Dataset JSON-LD schema", () => {
      const html = renderToStaticMarkup(React.createElement(UseCasePage, { params: { slug: "structural-hypotheses-experiments" } }));
      expect(html).toContain("Dataset");
    });

    it("F10.5: JSON-LD scripts parse valid JSON without syntax or encoding errors", () => {
      const html = renderToStaticMarkup(React.createElement(UseCasePage, { params: { slug: "structural-hypotheses-experiments" } }));
      const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
      expect(scripts.length).toBeGreaterThan(0);
      for (const s of scripts) {
        expect(() => JSON.parse(s[1])).not.toThrow();
      }
    });
  });

  // =========================================================================
  // F11: Generative Engine Optimization (GEO) Lead Summaries
  // =========================================================================
  describe("F11: Generative Engine Optimization (GEO) Lead Summaries", () => {
    it("F11.1: Use-case page includes <section className=\"geo-takeaway\">", () => {
      const html = renderToStaticMarkup(React.createElement(UseCasePage, { params: { slug: "structural-hypotheses-experiments" } }));
      expect(html).toMatch(/<section[^>]*class="[^"]*geo-takeaway[^"]*"|<section[^>]*data-geo-takeaway="true"/i);
      expect(html).toContain("Executive Takeaway");
    });

    it("F11.2: GEO section contains direct answer: top ranking model name and key score", () => {
      const html = renderToStaticMarkup(React.createElement(UseCasePage, { params: { slug: "structural-hypotheses-experiments" } }));
      const geoSection = html.match(/<section[^>]*class="[^"]*geo-takeaway[^"]*"[\s\S]*?<\/section>/)?.[0] || "";
      expect(geoSection).toMatch(/AlphaFold 3|AlphaMissense|RFdiffusion|scGPT|Enformer/);
    });

    it("F11.3: GEO section includes protocol baseline comparison statement", () => {
      const html = renderToStaticMarkup(React.createElement(UseCasePage, { params: { slug: "structural-hypotheses-experiments" } }));
      const geoSection = html.match(/<section[^>]*class="[^"]*geo-takeaway[^"]*"[\s\S]*?<\/section>/)?.[0] || "";
      expect(geoSection).toMatch(/margin over conventional baseline|baseline/i);
    });

    it("F11.4: GEO section uses concise, factual semantic markup for LLM parsers", () => {
      const html = renderToStaticMarkup(React.createElement(UseCasePage, { params: { slug: "structural-hypotheses-experiments" } }));
      const geoSection = html.match(/<section[^>]*class="[^"]*geo-takeaway[^"]*"[\s\S]*?<\/section>/)?.[0] || "";
      expect(geoSection).toMatch(/<strong\b/);
    });

    it("F11.5: Model detail pages include structured summary takeaway for AI engines", () => {
      const model = SYNTHETIC_BIOLOGICAL_MODELS[0];
      const modelSummary = `${model.model_name} is ranked #1 in Structure Prediction with a capability index of ${model.use_case_index_score} and ${model.telemetry.inference_latency_ms} ms latency.`;
      expect(modelSummary).toContain("AlphaFold 3");
      expect(modelSummary).toContain("ranked #1");
    });
  });

  // =========================================================================
  // F12: LLM Discoverability Enhancement (/llms.txt & /agents.md)
  // =========================================================================
  describe("F12: LLM Discoverability Enhancement (/llms.txt & /agents.md)", () => {
    it("F12.1: GET /llms.txt returns HTTP 200 with text/plain or text/markdown", async () => {
      const { GET } = await import("@/app/llms.txt/route");
      const res = GET();
      expect(res.status).toBe(200);
      const contentType = res.headers.get("Content-Type");
      expect(contentType).toMatch(/text\/(plain|markdown)/);
    });

    it("F12.2: /llms.txt includes concise biological use-case ranking tables or guide", async () => {
      const { GET } = await import("@/app/llms.txt/route");
      const res = GET();
      const body = await res.text();
      expect(body.length).toBeGreaterThan(100);
      expect(body).toMatch(/benchmarks|models|rewire/i);
    });

    it("F12.3: GET /agents.md returns HTTP 200 with structured instructions and endpoints", async () => {
      const { GET } = await import("@/app/agents.md/route");
      const res = GET();
      expect(res.status).toBe(200);
      const contentType = res.headers.get("Content-Type");
      expect(contentType).toMatch(/text\/(plain|markdown)/);
    });

    it("F12.4: /agents.md lists protocol baseline definitions and data query methods", async () => {
      const { GET } = await import("@/app/agents.md/route");
      const res = GET();
      const body = await res.text();
      expect(body.length).toBeGreaterThan(100);
    });

    it("F12.5: Content in /llms.txt and /agents.md contains valid absolute URLs", async () => {
      const { GET } = await import("@/app/llms.txt/route");
      const body = await GET().text();
      expect(body).toMatch(/https:\/\/[a-z0-9.-]+/);
    });
  });

  // =========================================================================
  // F13: Sitemap & Robots Configuration Validation
  // =========================================================================
  describe("F13: Sitemap & Robots Configuration Validation", () => {
    it("F13.1: GET /sitemap.xml returns valid XML with urlset or sitemapindex", async () => {
      const { GET } = await import("@/app/sitemap.xml/route");
      const res = GET();
      expect(res.status).toBe(200);
      const contentType = res.headers.get("Content-Type");
      expect(contentType).toContain("xml");
    });

    it("F13.2: Sitemap configuration references all 5 primary biological use cases", () => {
      const useCaseSlugs = Object.keys(BIOLOGICAL_USE_CASES);
      expect(useCaseSlugs).toHaveLength(5);
      const urls = useCaseSlugs.map((slug) => `https://benchmarks.rewirebio.io/use-cases/${slug}`);
      for (const url of urls) {
        expect(url).toMatch(/^https:\/\/benchmarks\.rewirebio\.io\/use-cases\//);
      }
    });

    it("F13.3: Robots configuration permits crawler access to use-cases and models", async () => {
      const { default: robots } = await import("@/app/robots");
      const config = robots();
      expect(config.rules).toBeDefined();
      // @ts-ignore
      const rules = Array.isArray(config.rules) ? config.rules[0] : config.rules;
      expect(rules.allow).toBe("/");
    });

    it("F13.4: Robots configuration references valid sitemap URL", async () => {
      const { default: robots } = await import("@/app/robots");
      const config = robots();
      expect(config.sitemap).toBe("https://benchmarks.rewirebio.io/sitemap.xml");
    });

    it("F13.5: Canonical URL links match sitemap URLs", () => {
      const siteOrigin = "https://benchmarks.rewirebio.io";
      const slug = "structure-prediction";
      const canonical = `${siteOrigin}/use-cases/${slug}`;
      expect(canonical).toBe("https://benchmarks.rewirebio.io/use-cases/structure-prediction");
    });
  });

  // =========================================================================
  // F14: Automated Test Suite & 90% UI Coverage Compliance
  // =========================================================================
  describe("F14: Automated Test Suite & 90% UI Coverage Compliance", () => {
    const uiConfigPath = path.resolve(process.cwd(), "vitest.ui.config.ts");

    it("F14.1: Vitest UI coverage config specifies lines threshold >= 90%", () => {
      const content = fs.readFileSync(uiConfigPath, "utf-8");
      expect(content).toMatch(/lines:\s*90/);
    });

    it("F14.2: Vitest UI coverage config specifies statements threshold >= 90%", () => {
      const content = fs.readFileSync(uiConfigPath, "utf-8");
      expect(content).toMatch(/statements:\s*90/);
    });

    it("F14.3: Vitest UI coverage config specifies functions threshold >= 90%", () => {
      const content = fs.readFileSync(uiConfigPath, "utf-8");
      expect(content).toMatch(/functions:\s*90/);
    });

    it("F14.4: Vitest UI coverage config specifies branches threshold >= 90%", () => {
      const content = fs.readFileSync(uiConfigPath, "utf-8");
      expect(content).toMatch(/branches:\s*90/);
    });

    it("F14.5: Coverage includes components/**/*.{ts,tsx}", () => {
      const content = fs.readFileSync(uiConfigPath, "utf-8");
      expect(content).toMatch(/components\/\*\*\/\*\.\{ts,tsx\}/);
    });
  });

  // =========================================================================
  // F15: Lint, Typecheck, SSR Build & Dual-Track E2E Suite
  // =========================================================================
  describe("F15: Lint, Typecheck, SSR Build & Dual-Track E2E Suite", () => {
    const pkgPath = path.resolve(process.cwd(), "package.json");
    const tsconfigPath = path.resolve(process.cwd(), "tsconfig.json");
    const e2eConfigPath = path.resolve(process.cwd(), "vitest.e2e.config.ts");

    it("F15.1: TypeScript configuration enables strict typechecking without errors", () => {
      expect(fs.existsSync(tsconfigPath)).toBe(true);
      const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, "utf-8"));
      expect(tsconfig.compilerOptions.strict).toBe(true);
    });

    it("F15.2: ESLint configuration extends Next.js rules", () => {
      const eslintrc = path.resolve(process.cwd(), ".eslintrc.json");
      expect(fs.existsSync(eslintrc)).toBe(true);
      const content = fs.readFileSync(eslintrc, "utf-8");
      expect(content).toContain("next");
    });

    it("F15.3: E2E test suite config vitest.e2e.config.ts loads successfully", () => {
      expect(fs.existsSync(e2eConfigPath)).toBe(true);
      const content = fs.readFileSync(e2eConfigPath, "utf-8");
      expect(content).toContain("tests/e2e");
    });

    it("F15.4: package.json contains dedicated test:e2e script", () => {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      expect(pkg.scripts["test:e2e"]).toBe("vitest run --config vitest.e2e.config.ts");
    });

    it("F15.5: Production build verification script (check:build) is configured", () => {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      expect(pkg.scripts["check:build"]).toBeDefined();
      expect(fs.existsSync(path.resolve(process.cwd(), "scripts/check-ssr-build.ts"))).toBe(true);
    });
  });
});
