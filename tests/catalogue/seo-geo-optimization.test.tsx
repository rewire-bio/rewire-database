import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  generateLeaderboardItemListJsonLd,
  generateModelSoftwareApplicationJsonLd,
  generateBenchmarkDatasetJsonLd,
  CATEGORY_SLUG_MAP,
  resolveUseCaseTargetSlug,
} from "../../lib/catalogue-seo";
import { safeJsonLd } from "../../lib/catalogue-sharing";
import {
  GeoTakeaway,
  type GeoTakeawayProps,
} from "../../components/catalogue/GeoTakeaway";
import {
  generateUseCaseTakeaway,
  generateHomepageTakeaway,
  generateModelTakeaway,
} from "../../lib/geo-takeaway";
import {
  generateLlmsTxt,
  generateLlmsFullText,
  generateAgentsMd,
} from "../../lib/llm-discoverability";
import {
  sitemapEntries,
  sitemapChunkXml,
  sitemapIndexXml,
  sitemapChunkCount,
  PRIMARY_USE_CASE_PATHS,
} from "../../lib/sitemap";
import robots, { AI_BOT_USER_AGENTS } from "../../app/robots";
import { generateMetadata as generateUseCaseMetadata } from "../../app/use-cases/[slug]/page";
import UnifiedLeaderboard from "../../components/catalogue/UnifiedLeaderboard";
import BenchmarksPage from "../../app/page";
import UseCasePage from "../../app/use-cases/[slug]/page";
import { PredictiveEntityDetail } from "../../app/database/_entities/predictive";
import { EvaluationDesignEntityDetail } from "../../app/database/_entities/evaluation-design";
import { GET as getLlmsTxt } from "../../app/llms.txt/route";
import { GET as getLlmsFullTxt } from "../../app/llms-full.txt/route";
import { GET as getAgentsMd } from "../../app/agents.md/route";
import { createCatalogueQuery } from "../../shared/omics/catalogue-query";
import { buildCatalogue } from "../../lib/catalogue-build";
import type { RecordDetail } from "../../lib/entity-detail";

// Mock next/link for React static rendering in Node environment
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// ============================================================================
// Feature 10: Schema.org JSON-LD Structured Data
// ============================================================================
describe("Feature 10: Schema.org JSON-LD Structured Data", () => {
  it("TC-SEO-01: generateLeaderboardItemListJsonLd produces valid @type: ItemList with 1-based ranks", () => {
    const jsonLd = generateLeaderboardItemListJsonLd({
      name: "Test Leaderboard",
      description: "Evaluation rankings",
      url: "https://benchmarks.rewirebio.io/use-cases/variant-effect/",
      rows: [
        {
          model_id: "poet-2",
          model_name: "PoET-2",
          creator: "OpenProt",
          use_case_index_score: 94.1,
          telemetry: { min_vram_gb: 16, open_weights: true, license: "Apache-2.0" },
        },
        {
          model_id: "esm-2-3b",
          model_name: "ESM-2 (3B)",
          creator: "Meta AI",
          use_case_index_score: 88.5,
          telemetry: { min_vram_gb: 24, open_weights: true, license: "MIT" },
        },
      ],
    });

    expect(jsonLd["@context"]).toBe("https://schema.org");
    expect(jsonLd["@type"]).toBe("ItemList");
    expect(jsonLd.name).toBe("Test Leaderboard");
    expect(jsonLd.description).toBe("Evaluation rankings");
    expect(jsonLd.url).toBe("https://benchmarks.rewirebio.io/use-cases/variant-effect/");
    expect(jsonLd.numberOfItems).toBe(2);
    expect(jsonLd.itemListElement).toHaveLength(2);

    expect(jsonLd.itemListElement[0].position).toBe(1);
    expect(jsonLd.itemListElement[0].name).toBe("PoET-2");
    expect(jsonLd.itemListElement[0].url).toBe("https://benchmarks.rewirebio.io/database/model/poet-2/");

    expect(jsonLd.itemListElement[1].position).toBe(2);
    expect(jsonLd.itemListElement[1].name).toBe("ESM-2 (3B)");
    expect(jsonLd.itemListElement[1].url).toBe("https://benchmarks.rewirebio.io/database/model/esm-2-3b/");
  });

  it("TC-SEO-02: generateLeaderboardItemListJsonLd nests SoftwareApplication with full properties", () => {
    const jsonLd = generateLeaderboardItemListJsonLd({
      name: "Structure Prediction",
      description: "lDDT Rankings",
      rows: [
        {
          model_id: "alphafold-3",
          model_name: "AlphaFold 3",
          creator: "DeepMind",
          use_case_index_score: 96.5,
          is_baseline: false,
          telemetry: {
            min_vram_gb: 80,
            inference_latency_ms: 14200,
            open_weights: false,
            license: "Non-commercial",
          },
        },
        {
          model_id: "homology-baseline",
          model_name: "Homology Modeling Baseline",
          creator: "Baseline",
          is_baseline: true,
          primary_metric_name: "lDDT",
          raw_metric_value: 61.0,
        },
      ],
    });

    const af3App = jsonLd.itemListElement[0].item;
    expect(af3App["@type"]).toBe("SoftwareApplication");
    expect(af3App.name).toBe("AlphaFold 3");
    expect(af3App.applicationCategory).toBe("Bioinformatics Foundation Model");
    expect(af3App.operatingSystem).toBe("Linux, macOS, Windows");
    expect(af3App.memoryRequirements).toBe("80 GB VRAM");
    expect(af3App.author).toEqual({ "@type": "Organization", name: "DeepMind" });
    expect(af3App.license).toBe("Non-commercial");
    expect(af3App.offers).toBeUndefined(); // open_weights is false
    expect(af3App.description).toBe("Capability index score: 96.5");

    const baselineApp = jsonLd.itemListElement[1].item;
    expect(jsonLd.itemListElement[1].url).toBe("https://benchmarks.rewirebio.io/database/baseline/homology-baseline/");
    expect(baselineApp.description).toBe("lDDT: 61");
  });

  it("TC-SEO-03: generateLeaderboardItemListJsonLd handles empty rows and custom baseUrl", () => {
    const emptyJson = generateLeaderboardItemListJsonLd({
      name: "Empty",
      description: "Empty rows",
      rows: [],
      baseUrl: "https://custom.rewirebio.io",
    });
    expect(emptyJson.numberOfItems).toBe(0);
    expect(emptyJson.itemListElement).toEqual([]);
  });

  it("TC-SEO-04: generateModelSoftwareApplicationJsonLd emits full SoftwareApplication schema", () => {
    const schema = generateModelSoftwareApplicationJsonLd({
      id: "boltz-1",
      name: "Boltz-1",
      description: "Biomolecular complex prediction model.",
      creator: "MIT / Genesis Therapeutics",
      telemetry: {
        min_vram_gb: 16,
        inference_latency_ms: 2400,
        open_weights: true,
        license: "https://opensource.org/licenses/MIT",
        parameter_count_millions: 400,
      },
    });

    expect(schema["@context"]).toBe("https://schema.org");
    expect(schema["@type"]).toBe("SoftwareApplication");
    expect(schema.name).toBe("Boltz-1");
    expect(schema.url).toBe("https://benchmarks.rewirebio.io/database/model/boltz-1/");
    expect(schema.applicationCategory).toBe("Bioinformatics Foundation Model");
    expect(schema.operatingSystem).toBe("Linux, macOS, Windows");
    expect(schema.memoryRequirements).toBe("16 GB VRAM");
    expect(schema.author).toEqual({
      "@type": "Organization",
      name: "MIT / Genesis Therapeutics",
    });
    expect(schema.license).toBe("https://opensource.org/licenses/MIT");
    expect(schema.offers).toEqual({
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    });
  });

  it("TC-SEO-05: generateModelSoftwareApplicationJsonLd omits unmeasured attributes cleanly", () => {
    const schema = generateModelSoftwareApplicationJsonLd({
      id: "minimal-model",
      name: "MinimalModel",
      telemetry: null,
    });

    expect(schema.name).toBe("MinimalModel");
    expect(schema.memoryRequirements).toBeUndefined();
    expect(schema.author).toBeUndefined();
    expect(schema.license).toBeUndefined();
    expect(schema.offers).toBeUndefined();
  });

  it("TC-SEO-06: generateBenchmarkDatasetJsonLd emits complete Dataset schema", () => {
    const dataset = generateBenchmarkDatasetJsonLd({
      name: "ProteinGym DMS Benchmark",
      description: "Comprehensive benchmark of deep mutational scanning assays.",
      url: "https://benchmarks.rewirebio.io/benchmarks/proteingym/",
      variableMeasured: "Spearman Rho",
      creator: { name: "Marks Lab / Harvard Medical School" },
      citation: [
        "https://doi.org/10.1101/2023.12.07.570727",
        "https://doi.org/10.1038/s41587-021-01146-5",
      ],
      license: "https://creativecommons.org/licenses/by/4.0/",
    });

    expect(dataset["@context"]).toBe("https://schema.org");
    expect(dataset["@type"]).toBe("Dataset");
    expect(dataset.name).toBe("ProteinGym DMS Benchmark");
    expect(dataset.description).toContain("Comprehensive benchmark");
    expect(dataset.url).toBe("https://benchmarks.rewirebio.io/benchmarks/proteingym/");
    expect(dataset.variableMeasured).toBe("Spearman Rho");
    expect(dataset.creator).toEqual({
      "@type": "Organization",
      name: "Marks Lab / Harvard Medical School",
    });
    expect(dataset.citation).toHaveLength(2);
    expect(dataset.license).toBe("https://creativecommons.org/licenses/by/4.0/");
  });

  it("TC-SEO-07: generateBenchmarkDatasetJsonLd handles string creator and string citation", () => {
    const dataset = generateBenchmarkDatasetJsonLd({
      name: "Simple Benchmark",
      description: "Simple test dataset",
      creator: "Community Contributors",
      citation: "https://doi.org/10.1000/182",
    });

    expect(dataset.creator).toEqual({
      "@type": "Organization",
      name: "Community Contributors",
    });
    expect(dataset.citation).toEqual(["https://doi.org/10.1000/182"]);
  });

  it("TC-SEO-08: UnifiedLeaderboard renders <script type='application/ld+json'> by default", () => {
    const html = renderToStaticMarkup(
      <UnifiedLeaderboard
        initialCategory="variant_effect"
        showCategorySwitcher={false}
      />
    );

    expect(html).toContain('<script type="application/ld+json">');
    const match = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/);
    expect(match).not.toBeNull();
    const parsed = JSON.parse(match![1]);
    expect(parsed["@type"]).toBe("ItemList");
    expect(parsed.itemListElement.length).toBeGreaterThan(0);
  });

  it("TC-SEO-09: UnifiedLeaderboard suppresses JSON-LD when emitJsonLd is false", () => {
    const html = renderToStaticMarkup(
      <UnifiedLeaderboard
        initialCategory="variant_effect"
        emitJsonLd={false}
      />
    );

    expect(html).not.toContain('<script type="application/ld+json">');
  });

  it("TC-SEO-10: PredictiveEntityDetail renders SoftwareApplication JSON-LD for kind=model", () => {
    const { query } = buildCatalogue();
    const modelRecord = query.recordsOfKind("model")[0];
    const detail: RecordDetail = query.get({ id: modelRecord.id })!;

    const html = renderToStaticMarkup(<PredictiveEntityDetail detail={detail} />);
    expect(html).toContain('<script type="application/ld+json">');
    expect(html).toContain("Bioinformatics Foundation Model");
    expect(html).toContain(modelRecord.name);
  });

  it("TC-SEO-11: EvaluationDesignEntityDetail renders Dataset JSON-LD for kind=benchmark", () => {
    const { query } = buildCatalogue();
    const benchmarkRecord = query.recordsOfKind("benchmark")[0];
    const baseDetail = query.get({ id: benchmarkRecord.id })!;
    const detail: RecordDetail = {
      ...baseDetail,
      sources: [
        {
          id: "src-1",
          kind: "source",
          name: "Benchmark Paper",
          attributes: { doi: "10.1234/test" },
          links: [],
          source_ids: [],
          status: "source_checked",
          description: "",
          facets: {},
        },
      ],
    };

    const html = renderToStaticMarkup(<EvaluationDesignEntityDetail detail={detail} />);
    expect(html).toContain('<script type="application/ld+json">');
    expect(html).toContain('"@type":"Dataset"');
    expect(html).toContain(benchmarkRecord.name);
  });

  it("TC-SEO-12: safeJsonLd escapes opening angles while remaining valid JSON", () => {
    const malicious = { name: "Test</script><script>alert('xss')</script>" };
    const serialized = safeJsonLd(malicious);
    expect(serialized).not.toContain("</script>");
    expect(serialized).toContain("\\u003c/script>");
    expect(JSON.parse(serialized)).toEqual(malicious);
  });
});

// ============================================================================
// Feature 11: Generative Engine Optimization (GEO) Lead Summaries
// ============================================================================
describe("Feature 11: Generative Engine Optimization (GEO) Lead Summaries", () => {
  it("TC-GEO-01: GeoTakeaway renders semantic section with data-geo-takeaway attribute", () => {
    const html = renderToStaticMarkup(
      <GeoTakeaway
        title="Key Benchmark Finding"
        primaryStatement="PoET-2 ranks #1 on Variant Effect Prediction with a Spearman correlation of 0.612."
        secondaryStatement="Hardware profile: 16 GB VRAM, 42 ms latency (Apache-2.0, open weights)."
        testId="custom-takeaway"
      />
    );

    expect(html).toContain('data-geo-takeaway="true"');
    expect(html).toContain('data-testid="custom-takeaway"');
    expect(html).toContain("geo-takeaway");
    expect(html).toContain("Key Benchmark Finding");
    expect(html).toContain("PoET-2 ranks #1");
    expect(html).toContain("16 GB VRAM");
  });

  it("TC-GEO-02: GeoTakeaway renders cleanly across variant styles and handles empty state", () => {
    // 1. Explicit empty primaryStatement returns null
    const emptyHtml = renderToStaticMarkup(<GeoTakeaway primaryStatement="" />);
    expect(emptyHtml).toBe("");

    // 2. Default props with no arguments (<GeoTakeaway />) evaluates undefined data fallback to empty string and returns null
    const defaultEmptyHtml = renderToStaticMarkup(<GeoTakeaway />);
    expect(defaultEmptyHtml).toBe("");

    // 3. data with empty primaryStatement evaluates data?.primaryStatement || "" fallback and returns null
    const dataEmptyHtml = renderToStaticMarkup(<GeoTakeaway data={{ primaryStatement: "" }} />);
    expect(dataEmptyHtml).toBe("");

    // 4. data with primaryStatement only (evaluates data.primaryStatement default param, default title, default testId, default variant)
    const dataOnlyHtml = renderToStaticMarkup(
      <GeoTakeaway data={{ primaryStatement: "Factual triple summary" }} />
    );
    expect(dataOnlyHtml).toContain("Executive Takeaway");
    expect(dataOnlyHtml).toContain("Factual triple summary");
    expect(dataOnlyHtml).toContain('data-testid="geo-takeaway"');

    // 5. data with full fields (title, primaryStatement, secondaryStatement) and custom className
    const dataFullHtml = renderToStaticMarkup(
      <GeoTakeaway
        data={{
          title: "Custom Data Title",
          primaryStatement: "Primary summary statement",
          secondaryStatement: "Secondary hardware note",
        }}
        className="custom-style-class"
      />
    );
    expect(dataFullHtml).toContain("Custom Data Title");
    expect(dataFullHtml).toContain("Primary summary statement");
    expect(dataFullHtml).toContain("Secondary hardware note");
    expect(dataFullHtml).toContain("custom-style-class");

    // 6. Variant card
    const cardHtml = renderToStaticMarkup(
      <GeoTakeaway
        variant="card"
        primaryStatement="AlphaFold 3 ranks #1 in Structure Prediction."
      />
    );
    expect(cardHtml).toContain("AlphaFold 3 ranks #1");

    // 7. Variant inline
    const inlineHtml = renderToStaticMarkup(
      <GeoTakeaway
        variant="inline"
        primaryStatement="Chroma ranks #1 in Protein Design."
      />
    );
    expect(inlineHtml).toContain("Chroma ranks #1");
  });

  it("TC-GEO-03: generateUseCaseTakeaway produces structured factual triples for all 5 categories", () => {
    const categories = [
      "structure_prediction",
      "variant_effect",
      "protein_design",
      "transcriptomics",
      "genomic_grammar",
    ] as const;

    for (const cat of categories) {
      const data = generateUseCaseTakeaway({ category: cat });
      expect(data.title).toBe("Executive Takeaway");
      expect(data.primaryStatement).toBeTruthy();
      expect(data.secondaryStatement).toBeTruthy();
      expect(data.triple).toBeDefined();

      const triple = data.triple!;
      expect(triple.modelName).toBeTruthy();
      expect(triple.metricValue).toBeTruthy();
      expect(triple.conventionalBaselineName).toBeTruthy();
      expect(triple.marginOverConventional).toBeTruthy();
      expect(triple.vramGb).toBeTruthy();
      expect(triple.latency).toBeTruthy();
    }
  });

  it("TC-GEO-04: generateHomepageTakeaway produces multi-use-case frontier summary", () => {
    const data = generateHomepageTakeaway();
    expect(data.title).toBe("Frontier Benchmark Takeaway");
    expect(data.primaryStatement).toContain("AlphaFold 3");
    expect(data.primaryStatement).toContain("PoET-2");
    expect(data.primaryStatement).toContain("Chroma");
    expect(data.secondaryStatement).toContain("conventional baselines");
  });

  it("TC-GEO-05: generateModelTakeaway distinguishes evaluated models from catalog records", () => {
    const af3 = generateModelTakeaway({ id: "alphafold-3", name: "AlphaFold 3" });
    expect(af3.title).toBe("Model Benchmark Takeaway");
    expect(af3.primaryStatement).toContain("AlphaFold 3");
    expect(af3.primaryStatement).toContain("Structure Prediction");
    expect(af3.secondaryStatement).toContain("80 GB VRAM");

    const unknownModel = generateModelTakeaway({ id: "catalog-model-custom-xyz", name: "CustomBioModel" });
    expect(unknownModel.title).toBe("Model Deployment Profile");
    expect(unknownModel.primaryStatement).toContain("CustomBioModel");
  });

  it("TC-GEO-06: Homepage SSR renders <section class='... geo-takeaway'>", () => {
    const html = renderToStaticMarkup(<BenchmarksPage />);
    expect(html).toMatch(/<section[^>]*class="[^"]*geo-takeaway[^"]*"[^>]*data-geo-takeaway="true"/i);
    expect(html).toContain("Frontier Benchmark Takeaway");
    expect(html).toContain("AlphaFold 3");
  });

  it("TC-GEO-07: Use-case page SSR renders dynamic GEO takeaway with verified score and baseline", () => {
    const html = renderToStaticMarkup(<UseCasePage params={{ slug: "protein-variant-effect-prediction" }} />);
    expect(html).toMatch(/<section[^>]*class="[^"]*geo-takeaway[^"]*"[^>]*data-geo-takeaway="true"/i);
    expect(html).toContain("Executive Takeaway");
    expect(html).toContain("PoET-2");
    expect(html).toContain("Spearman Rho");
    expect(html).toContain("BLOSUM62");
    expect(html).toContain("42 ms");
  });

  it("TC-GEO-08: GeoTakeaway formats clean numbers, renders highlights grid, and grounds specialized use cases", () => {
    const struct = generateUseCaseTakeaway({ category: "structure_prediction" });
    expect(struct.triple?.metricValue).toBe("89.5");
    expect(struct.primaryStatement).not.toContain("89.500");

    const homeHtml = renderToStaticMarkup(<GeoTakeaway data={generateHomepageTakeaway()} />);
    expect(homeHtml).toContain("89.5 lDDT");
    expect(homeHtml).toContain("1.20 Å scRMSD");
    expect(homeHtml).not.toContain("89.500");

    const specializedWithTop = generateUseCaseTakeaway({
      pageContext: {
        slug: "brca1-brca2-germline-interpretation",
        title: "Interpret BRCA1/BRCA2 germline variants",
        baselineName: "BayesDel under the ENIGMA specification",
        topToolName: "AlphaMissense",
        topMetricLabel: "AUROC",
        topMetricValue: "0.941",
        comparisonCount: 3,
      },
    });
    expect(specializedWithTop.primaryStatement).toContain("AlphaMissense");
    expect(specializedWithTop.primaryStatement).toContain("BayesDel");
    expect(specializedWithTop.highlights?.some((h) => h.value === "AlphaMissense")).toBe(true);

    const specializedNoTop = generateUseCaseTakeaway({
      pageContext: {
        slug: "custom-specialized-question",
        title: "Custom Specialized Question",
        comparisonCount: 0,
      },
    });
    expect(specializedNoTop.primaryStatement).toContain("0 reviewed comparisons are tracked");
  });
});

// ============================================================================
// Feature 12: LLM Discoverability Enhancement
// ============================================================================
describe("Feature 12: LLM Discoverability Enhancement", () => {
  it("TC-LLM-01: GET /llms.txt returns HTTP 200 with text/markdown", async () => {
    const res = getLlmsTxt();
    expect(res.status).toBe(200);
    const contentType = res.headers.get("Content-Type");
    expect(contentType).toMatch(/text\/(markdown|plain)/);
  });

  it("TC-LLM-02: /llms.txt conforms strictly to llmstxt.org markdown index structure", async () => {
    const text = await getLlmsTxt().text();

    expect(text.startsWith("# Biological model benchmark database")).toBe(true);
    expect(text).toContain("> Reviewed published results for DNA, RNA, protein and cell models");

    expect(text).toMatch(/- \[Zero-Shot Variant Effect Prediction\]\(https:\/\/benchmarks\.rewirebio\.io\/[^)]+\):/);
    expect(text).toMatch(/- \[Protein Structure Prediction\]\(https:\/\/benchmarks\.rewirebio\.io\/[^)]+\):/);
    expect(text).toMatch(/- \[De Novo Protein Design\]\(https:\/\/benchmarks\.rewirebio\.io\/[^)]+\):/);
    expect(text).toMatch(/- \[Full Benchmark Knowledge Base\]\(https:\/\/benchmarks\.rewirebio\.io\/llms-full\.txt\):/);
    expect(text).toMatch(/- \[Autonomous Agent Hub\]\(https:\/\/benchmarks\.rewirebio\.io\/agents\.md\):/);
  });

  it("TC-LLM-03: /llms.txt preserves backward-compatible Claude Code CLI install commands", async () => {
    const text = await getLlmsTxt().text();
    expect(text).toContain("/plugin marketplace add rewire-bio/rewire-benchmarks");
    expect(text).toContain("/plugin install bio-model-benchmarks@rewire-benchmarks");
    expect(text).toContain("claude mcp add rewire-benchmark-graph");
    expect(text).toContain("re-checked against new publications every month");
  });

  it("TC-LLM-04: GET /llms-full.txt returns HTTP 200 with complete markdown ranking tables", async () => {
    const res = getLlmsFullTxt();
    expect(res.status).toBe(200);
    const contentType = res.headers.get("Content-Type");
    expect(contentType).toMatch(/text\/(markdown|plain)/);

    const text = await res.text();
    expect(text).toContain("# Rewire.bio Biological AI Benchmark Database — Companion Full Knowledge Base");
    expect(text).toContain("## Use Case: Structure Prediction");
    expect(text).toContain("## Use Case: Variant Effect Prediction");
    expect(text).toContain("## Use Case: Protein Design");
    expect(text).toContain("## Use Case: Transcriptomics");
    expect(text).toContain("## Use Case: Genomic Grammar");

    expect(text).toContain("| Rank | Model Name | Creator | Capability Index (0-100) |");
    expect(text).toContain("AlphaFold 3");
    expect(text).toContain("Boltz-1");
    expect(text).toContain("PoET-2");
    expect(text).toContain("Chroma");
    expect(text).toContain("Protocol Baselines & Biological Noise Floor");
  });

  it("TC-LLM-05: GET /agents.md returns HTTP 200 with schemas, queries, and constraints", async () => {
    const res = getAgentsMd();
    expect(res.status).toBe(200);
    const contentType = res.headers.get("Content-Type");
    expect(contentType).toMatch(/text\/(markdown|plain)/);

    const text = await res.text();
    expect(text).toContain("# Rewire.bio Autonomous Scientific Agent Protocol Specification");
    expect(text).toContain("Biological Use-Case Categories");
    expect(text).toContain("variant_effect");
    expect(text).toContain("structure_prediction");
    expect(text).toContain('"title": "BiologicalModelRankingRow"');
    expect(text).toContain("/api/trpc/catalogue.useCases");
    expect(text).toContain("/api/trpc/catalogue.list");
    expect(text).toContain("/api/trpc/catalogue.discrepancies");
    expect(text).toContain("/plugin marketplace add rewire-bio/rewire-benchmarks");
  });
});

// ============================================================================
// Feature 13: Sitemap & Robots Configuration Validation
// ============================================================================
describe("Feature 13: Sitemap & Robots Configuration Validation", () => {
  it("TC-ROBOTS-01: robots() defines wildcard rule allowing root and disallowing /api/", () => {
    const config = robots();
    expect(Array.isArray(config.rules)).toBe(true);
    const rules = config.rules as Array<{ userAgent: unknown; allow: unknown; disallow?: unknown }>;
    const wildcardRule = rules.find((r) => r.userAgent === "*");
    expect(wildcardRule).toBeDefined();
    expect(wildcardRule?.allow).toBe("/");
    expect(wildcardRule?.disallow).toEqual(["/api/"]);
  });

  it("TC-ROBOTS-02: robots() defines dedicated rules for all AI bot user-agents", () => {
    const config = robots();
    const rules = config.rules as Array<{ userAgent: unknown; allow: unknown; disallow?: unknown }>;
    const aiRule = rules.find((r) => Array.isArray(r.userAgent));
    expect(aiRule).toBeDefined();
    expect(aiRule?.userAgent).toEqual([...AI_BOT_USER_AGENTS]);
    expect(aiRule?.allow).toContain("/");
    expect(aiRule?.allow).toContain("/use-cases/");
    expect(aiRule?.allow).toContain("/models/");
    expect(aiRule?.allow).toContain("/benchmarks/");
    expect(aiRule?.allow).toContain("/llms.txt");
    expect(aiRule?.allow).toContain("/agents.md");
    expect(aiRule?.disallow).toEqual(["/api/"]);
  });

  it("TC-ROBOTS-03: robots() specifies canonical sitemap URL and host", () => {
    const config = robots();
    expect(config.sitemap).toBe("https://benchmarks.rewirebio.io/sitemap.xml");
    expect(config.host).toBe("https://benchmarks.rewirebio.io");
  });

  it("TC-SITEMAP-01: sitemapEntries() includes all 5 primary biological use-case paths", () => {
    const entries = sitemapEntries();
    const paths = new Set(entries.map((e) => e.path));

    for (const primaryPath of PRIMARY_USE_CASE_PATHS) {
      expect(paths.has(primaryPath)).toBe(true);
    }
  });

  it("TC-SITEMAP-02: sitemapEntries() sets lastModified to pinned release date 2026-11-02", () => {
    const entries = sitemapEntries();
    expect(entries.length).toBeGreaterThan(100);
    for (const entry of entries) {
      expect(entry.lastModified).toBe("2026-11-02");
    }
  });

  it("TC-SITEMAP-03: sitemapChunkXml renders valid <loc> and <lastmod> tags", () => {
    const entries = sitemapEntries();
    const xml = sitemapChunkXml(entries, 0);
    expect(xml).not.toBeNull();
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain("<loc>https://benchmarks.rewirebio.io/</loc>");
    expect(xml).toContain("<lastmod>2026-11-02</lastmod>");
  });

  it("TC-SITEMAP-04: sitemapIndexXml renders sequential chunk paths", () => {
    const entries = sitemapEntries();
    const chunks = sitemapChunkCount(entries);
    const indexXml = sitemapIndexXml(chunks);
    expect(indexXml).toContain("<sitemap><loc>https://benchmarks.rewirebio.io/sitemap/0.xml</loc></sitemap>");
    expect(indexXml).toContain(`<sitemap><loc>https://benchmarks.rewirebio.io/sitemap/${chunks - 1}.xml</loc></sitemap>`);
  });

  it("TC-USECASE-01: resolveUseCaseTargetSlug maps 5 primary category slugs to database records", () => {
    expect(resolveUseCaseTargetSlug("structure-prediction")).toBe("structural-hypotheses-experiments");
    expect(resolveUseCaseTargetSlug("variant-effect")).toBe("protein-variant-effect-prediction");
    expect(resolveUseCaseTargetSlug("protein-design")).toBe("de-novo-binder-design");
    expect(resolveUseCaseTargetSlug("transcriptomics")).toBe("genetic-perturbation-response");
    expect(resolveUseCaseTargetSlug("genomic-grammar")).toBe("plant-promoter-reporters");
    expect(resolveUseCaseTargetSlug("unmapped-slug")).toBe("unmapped-slug");
  });

  it("TC-USECASE-02: generateUseCaseMetadata generates self-referential canonical URLs matching route", () => {
    const categoryMeta = generateUseCaseMetadata({ params: { slug: "structure-prediction" } });
    expect(categoryMeta.alternates?.canonical).toBe(
      "https://benchmarks.rewirebio.io/use-cases/structure-prediction/"
    );
    expect(categoryMeta.title).toContain("Rankings & Protocol Baselines");

    const rawMeta = generateUseCaseMetadata({ params: { slug: "structural-hypotheses-experiments" } });
    expect(rawMeta.alternates?.canonical).toBe(
      "https://benchmarks.rewirebio.io/use-cases/structural-hypotheses-experiments/"
    );
  });
});
