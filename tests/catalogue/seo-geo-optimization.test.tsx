import React from "react";
import { describe, expect, it, vi } from "vitest";

import { renderToStaticMarkup } from "react-dom/server";
import lock from "../../benchmark-data.lock.json";
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
import { allUseCaseLeaderboards, homeLeaderboards } from "../../lib/release-leaderboard";
import { telemetryFromRecord } from "../../lib/operational-telemetry";
import { EMPTY_BOARD, RUNTIME_BOARD, VARIANT_BOARD } from "./fixtures/leaderboards";

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
  it("TC-SEO-01: generateLeaderboardItemListJsonLd produces valid @type: ItemList with the rows' ranks", () => {
    const jsonLd = generateLeaderboardItemListJsonLd({
      name: "Test Leaderboard",
      description: "Evaluation rankings",
      url: "https://benchmarks.rewirebio.io/use-cases/fixture/",
      rows: [
        { model_id: "alpha", model_name: "Alpha", model_href: "/database/model/alpha/", rank: 1, telemetry: { min_vram_gb: 16, open_weights: true, license: "MIT" } },
        { model_id: "beta", model_name: "Beta", rank: 1, telemetry: null },
        { model_id: "gamma", model_name: "Gamma", model_href: "/database/method/gamma/" },
      ],
    });

    expect(jsonLd["@context"]).toBe("https://schema.org");
    expect(jsonLd["@type"]).toBe("ItemList");
    expect(jsonLd.name).toBe("Test Leaderboard");
    expect(jsonLd.url).toBe("https://benchmarks.rewirebio.io/use-cases/fixture/");
    expect(jsonLd.numberOfItems).toBe(3);
    expect(jsonLd.itemListElement.map((i) => i.position)).toEqual([1, 1, 3]);
    expect(jsonLd.itemListElement[0].url).toBe("https://benchmarks.rewirebio.io/database/model/alpha/");
    expect(jsonLd.itemListElement[1].url).toBe("https://benchmarks.rewirebio.io/database/configuration/beta/");
    expect(jsonLd.itemListElement[2].url).toBe("https://benchmarks.rewirebio.io/database/method/gamma/");
  });

  it("TC-SEO-02: generateLeaderboardItemListJsonLd nests SoftwareApplication with recorded properties and the result link", () => {
    const jsonLd = generateLeaderboardItemListJsonLd({
      name: "Fixture",
      description: "Rankings",
      rows: [
        {
          model_id: "alpha", model_name: "Alpha", model_href: "/database/model/alpha/", rank: 1,
          primary_metric_name: "AUROC", display_value: "0.91", source_record_id: "result-1",
          telemetry: { min_vram_gb: 80, open_weights: false, license: "Non-commercial" },
        },
        { model_id: "beta", model_name: "Beta", rank: 2, telemetry: { min_vram_gb: null, open_weights: null, license: null } },
      ],
    });

    const app = jsonLd.itemListElement[0].item;
    expect(app["@type"]).toBe("SoftwareApplication");
    expect(app.memoryRequirements).toBe("80 GB VRAM");
    expect(app.license).toBe("Non-commercial");
    expect(app.offers).toBeUndefined();
    expect(app.author).toBeUndefined();
    expect(app.description).toBe("AUROC: 0.91 (result https://benchmarks.rewirebio.io/database/result/result-1/)");
    const bare = jsonLd.itemListElement[1].item;
    expect(bare.memoryRequirements).toBeUndefined();
    expect(bare.license).toBeUndefined();
    expect(bare.description).toBeUndefined();
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
        open_weights: true,
        license: "https://opensource.org/licenses/MIT",
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
        boards={[VARIANT_BOARD]}
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
        boards={[VARIANT_BOARD]}
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

  it("TC-GEO-03: generateUseCaseTakeaway names the protocol, metric and source, never an overall #1", () => {
    const data = generateUseCaseTakeaway({ leaderboard: VARIANT_BOARD });
    expect(data.title).toBe("Executive Takeaway");
    expect(data.primaryStatement).toBe(
      'For "Fixture variant effect", on Fixture DMS substitutions, All assays (Spearman), Alpha scored 0.600, reported by Fixture study of variant effect predictors.',
    );
    expect(data.primaryStatement).not.toMatch(/ranks #|#1/);
    expect(data.secondaryStatement).toContain("Fixture alignment baseline, scored 0.400 on the same protocol");
    expect(data.triple).toMatchObject({ modelName: "Alpha", metricValue: "0.600", sourceRecordId: "fixture-result-alpha", reviewStatus: "reproduced" });

    const proxy = generateUseCaseTakeaway({ leaderboard: RUNTIME_BOARD });
    expect(proxy.secondaryStatement).toContain("No baseline method is scored on this protocol.");
    expect(proxy.secondaryStatement).toContain("proxy");

    const empty = generateUseCaseTakeaway({ leaderboard: EMPTY_BOARD });
    expect(empty.primaryStatement).toContain("No ranking");
    expect(empty.triple).toBeUndefined();
  });

  it("TC-GEO-04: generateHomepageTakeaway summarises each ranked use case with its protocol and source", () => {
    const data = generateHomepageTakeaway([VARIANT_BOARD, EMPTY_BOARD, RUNTIME_BOARD]);
    expect(data.title).toBe("Benchmark Takeaway");
    expect(data.primaryStatement).toContain("on Fixture DMS substitutions, All assays (Spearman), Alpha scored 0.600");
    expect(data.primaryStatement).toContain("on Fixture pipeline runtimes, Read mapping (Runtime), Fast pipeline scored 14 min");
    expect(data.highlights).toHaveLength(2);
    expect(generateHomepageTakeaway([EMPTY_BOARD]).primaryStatement).toBe("No use case has a ranking in this release yet.");
  });

  it("TC-GEO-05: generateModelTakeaway reports a model's ranked results, or says it has none", () => {
    const ranked = generateModelTakeaway(
      { id: "alpha", name: "Alpha" },
      [{ board: VARIANT_BOARD, row: VARIANT_BOARD.rows[0] }, { board: RUNTIME_BOARD, row: RUNTIME_BOARD.rows[0] }],
      telemetryFromRecord({ attributes: { profile: { facts: [{ label: "Parameters", value: "650M", status: "source_checked" }] } } }),
    );
    expect(ranked.title).toBe("Model Benchmark Takeaway");
    expect(ranked.primaryStatement).toContain("On Fixture DMS substitutions, All assays (Spearman), Alpha scored 0.600, reported by Fixture study");
    expect(ranked.primaryStatement).toContain("position 1 of 4 on this protocol");
    expect(ranked.primaryStatement).toContain("1 other use case: Fixture runtime");
    expect(ranked.secondaryStatement).toBe("Recorded parameters: 650M. Licence: Not recorded.");

    const unranked = generateModelTakeaway({ id: "x", name: "CustomBioModel" }, [], telemetryFromRecord(null));
    expect(unranked.title).toBe("Model Deployment Profile");
    expect(unranked.primaryStatement).toBe("CustomBioModel has no ranked result on a use-case protocol in this release.");
  });

  it("TC-GEO-06: Homepage SSR renders the takeaway from the release's leaderboards", () => {
    const html = renderToStaticMarkup(<BenchmarksPage />);
    expect(html).toMatch(/<section[^>]*class="[^"]*geo-takeaway[^"]*"[^>]*data-geo-takeaway="true"/i);
    expect(html).toContain("Benchmark Takeaway");
    const [first] = homeLeaderboards();
    expect(html).toContain(first.use_case_title);
  });

  it("TC-GEO-07: Use-case page SSR renders the takeaway and ranking from the release", () => {
    const board = allUseCaseLeaderboards().find((b) => b.use_case_slug === "protein-variant-effect-prediction")!;
    const html = renderToStaticMarkup(<UseCasePage params={{ slug: "protein-variant-effect-prediction" }} />);
    expect(html).toMatch(/<section[^>]*class="[^"]*geo-takeaway[^"]*"[^>]*data-geo-takeaway="true"/i);
    expect(html).toContain("Executive Takeaway");
    expect(html).toContain('data-testid="use-case-leaderboard"');
    expect(html).toContain(board.protocol!.metric_label);
    expect(html).toContain(`/database/result/${encodeURIComponent(board.rows[0].source_record_id)}/`);
    expect(html).not.toContain("ranks #1");
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

  it("TC-LLM-02: /llms.txt conforms to the llmstxt.org index structure and lists the ranked use cases", async () => {
    const text = await getLlmsTxt().text();
    expect(text.startsWith("# Biological model benchmark database")).toBe(true);
    expect(text).toContain("> Reviewed published results for DNA, RNA, protein and cell models");
    for (const board of allUseCaseLeaderboards().filter((b) => b.rows.length))
      expect(text).toContain(`- [${board.use_case_title}](https://benchmarks.rewirebio.io${board.use_case_href}):`);
    expect(text).toMatch(/- \[Full Benchmark Knowledge Base\]\(https:\/\/benchmarks\.rewirebio\.io\/llms-full\.txt\):/);
    expect(text).toMatch(/- \[Autonomous Agent Hub\]\(https:\/\/benchmarks\.rewirebio\.io\/agents\.md\):/);
    expect(text).toContain("## Key Benchmark Quick Facts");
    expect(text).not.toContain("ranks #1");
  });

  it("TC-LLM-03: /llms.txt preserves backward-compatible Claude Code CLI install commands", async () => {
    const text = await getLlmsTxt().text();
    expect(text).toContain("/plugin marketplace add rewire-bio/rewire-benchmarks");
    expect(text).toContain("/plugin install bio-model-benchmarks@rewire-benchmarks");
    expect(text).toContain("claude mcp add rewire-benchmark-graph");
    expect(text).not.toContain("re-checked against new publications every month");
  });

  it("TC-LLM-04: GET /llms-full.txt returns one ranking table per use case, each value linked to its result", async () => {
    const res = getLlmsFullTxt();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/text\/(markdown|plain)/);
    const text = await res.text();
    expect(text).toContain("# Rewire.bio Biological AI Benchmark Database: Full Knowledge Base");
    const boards = allUseCaseLeaderboards();
    for (const board of boards) expect(text).toContain(`## Use Case: ${board.use_case_title}`);
    expect(text).toContain("| Rank | Model |");
    const ranked = boards.find((b) => b.rows.length)!;
    expect(text).toContain(`https://benchmarks.rewirebio.io/database/result/${encodeURIComponent(ranked.rows[0].source_record_id)}/`);
    expect(text).not.toContain("Capability Index");
    expect(text).not.toContain("Noise Floor");
  });

  it("TC-LLM-05: GET /agents.md returns HTTP 200 with schemas, queries, and constraints", async () => {
    const res = getAgentsMd();
    expect(res.status).toBe(200);
    const contentType = res.headers.get("Content-Type");
    expect(contentType).toMatch(/text\/(markdown|plain)/);

    const text = await res.text();
    expect(text).toContain("# Rewire.bio Autonomous Scientific Agent Protocol Specification");
    expect(text).toContain("## 2. Use-case leaderboards");
    expect(text).toContain("`protein-variant-effect-prediction`");
    expect(text).not.toContain("Recommended: PoET-2");
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

  it("TC-SITEMAP-02: sitemapEntries() sets lastModified to the pinned release date", () => {
    const releaseDate = lock.release_id.slice(0, 10);
    const entries = sitemapEntries();
    expect(entries.length).toBeGreaterThan(100);
    for (const entry of entries) {
      expect(entry.lastModified).toBe(releaseDate);
    }
  });

  it("TC-SITEMAP-03: sitemapChunkXml renders valid <loc> and <lastmod> tags", () => {
    const entries = sitemapEntries();
    const xml = sitemapChunkXml(entries, 0);
    expect(xml).not.toBeNull();
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain("<loc>https://benchmarks.rewirebio.io/</loc>");
    expect(xml).toContain(`<lastmod>${lock.release_id.slice(0, 10)}</lastmod>`);
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
