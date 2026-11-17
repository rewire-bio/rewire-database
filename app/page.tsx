import {
  catalogueWebsiteJsonLd,
  safeJsonLd,
  socialMetadata,
} from "@/lib/catalogue-sharing";
import type { Metadata } from "next";
import { buildCatalogue } from "@/lib/catalogue-build";
import { getUseCaseLeaderboard } from "@/lib/use-case-leaderboard";
import { UnifiedLeaderboard } from "@/components/catalogue/UnifiedLeaderboard";
import { GeoTakeaway } from "@/components/catalogue/GeoTakeaway";
import { generateHomepageTakeaway } from "@/lib/geo-takeaway";
import Explorer from "./database/Explorer";
import PageHeader from "@/components/PageHeader";
import styles from "./database/database.module.css";
import { CatalogueEvidence } from "@/components/catalogue/CatalogueEvidence";
import { CatalogueDownloads } from "@/components/catalogue/CatalogueDownloads";
import { BROWSE_PAGE_SIZE } from "@/lib/omics-browse";
import RefreshStatus from "@/components/RefreshStatus";
import AgentConnect from "@/components/AgentConnect";
import { readRefresh } from "@/lib/refresh-build";
import { contestedList } from "@/lib/discrepancies";
import { HOME_NOTICE } from "@/lib/home-notice";
import contested from "@/components/catalogue/Contested.module.css";

const pageMetadata = {
  title: "The Artificial Analysis of Biological Models",
  description:
    "Which biological model works best for your task? Independent benchmark comparisons across biological use cases against protocol baselines and experimental assay noise ceilings with operational latency, memory, and cost telemetry.",
  alternates: { canonical: "https://benchmarks.rewirebio.io/" },
};
export const metadata: Metadata = {
  ...pageMetadata,
  ...socialMetadata({
    title: pageMetadata.title,
    description: pageMetadata.description,
    path: pageMetadata.alternates.canonical,
  }),
};

export default function BenchmarksPage() {
  const { catalogue, query } = buildCatalogue();
  const useCases = (catalogue.coverage.use_cases as { use_cases?: number } | undefined)?.use_cases ?? 0;
  const disagreements = contestedList({})?.totals;

  // Precompute multi-category rows for instantaneous SSR and client switching
  const precomputedRows = [
    ...getUseCaseLeaderboard(undefined, { category: "structure_prediction" }).rows,
    ...getUseCaseLeaderboard(undefined, { category: "variant_effect" }).rows,
    ...getUseCaseLeaderboard(undefined, { category: "protein_design" }).rows,
    ...getUseCaseLeaderboard(undefined, { category: "transcriptomics" }).rows,
    ...getUseCaseLeaderboard(undefined, { category: "genomic_grammar" }).rows,
  ];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(catalogueWebsiteJsonLd) }}
      />
      <PageHeader
        eyebrow={[
          "The Independent Standard for Biological AI",
          `Release ${catalogue.released_at.slice(0, 10)}`,
        ]}
        title="The Artificial Analysis of Biological Models"
        intro="Which biological model works best for your task? Independent, reproducible capability rankings across biological use cases against protocol baselines and experimental assay noise ceilings with operational latency, memory, and cost telemetry."
      >
        <nav className={styles.journeys} aria-label="Ways to start">
          {useCases > 0 && (
            <a className={styles.primaryJourney} href="/use-cases/">
              <strong>Start from a biological question</strong>{" "}
              <span>{useCases} {useCases === 1 ? "use case" : "use cases"}</span>
            </a>
          )}
          <span className={styles.journeyJoiner}>
            {useCases > 0 ? "or from" : "Or start from"}
          </span>
          <a href="/models/">
            <strong>A model you know</strong> <span>Models</span>
          </a>
          <a href="/benchmarks/">
            <strong>A benchmark</strong> <span>Benchmarks</span>
          </a>
        </nav>

        {/* Prominent Biological Use-Case Quick Selector */}
        <nav className={styles.useCaseNav} aria-label="Biological use cases">
          <a className={styles.useCasePill} href="/use-cases/structure-prediction">Structure Prediction</a>
          <a className={styles.useCasePill} href="/use-cases/variant-effect">Variant Effect</a>
          <a className={styles.useCasePill} href="/use-cases/protein-design">Protein Design</a>
          <a className={styles.useCasePill} href="/use-cases/transcriptomics">Transcriptomics</a>
          <a className={styles.useCasePill} href="/use-cases/genomic-grammar">Genomic Grammar</a>
        </nav>

        {/* Value Proposition Badges */}
        <div className={styles.valueProps}>
          <div className={styles.valuePropItem}>
            <span className={styles.valuePropBullet}>⚡</span>
            <span><strong>Per-Use-Case Rankings:</strong> No monolithic scores; models ranked strictly by biological domain.</span>
          </div>
          <div className={styles.valuePropItem}>
            <span className={styles.valuePropBullet}>🎯</span>
            <span><strong>Protocol Baselines:</strong> Anchored against pre-ML conventional baselines and assay noise ceilings.</span>
          </div>
          <div className={styles.valuePropItem}>
            <span className={styles.valuePropBullet}>📊</span>
            <span><strong>Pareto Efficiency:</strong> Capability index vs. latency, GPU memory (VRAM), and execution cost.</span>
          </div>
          <div className={styles.valuePropItem}>
            <span className={styles.valuePropBullet}>🔬</span>
            <span><strong>Source Evidence:</strong> Transparent distinction between open weights and proprietary APIs.</span>
          </div>
        </div>

        {/* Discrepancy Notice */}
        {disagreements && <div className={contested.notice}>
          {HOME_NOTICE && <p><strong>New.</strong> {HOME_NOTICE.text} <a href={HOME_NOTICE.href}>{HOME_NOTICE.link}</a></p>}
          <p>
            <a href="/contested/?status=open">{disagreements.open} open {disagreements.open === 1 ? "disagreement" : "disagreements"} between studies</a>
            {disagreements.settled > 0 && <>, {disagreements.settled} settled</>} in this release.
          </p>
        </div>}
      </PageHeader>

      <div className="wrap content">
        {/* Above-the-fold Unified Leaderboard */}
        <section className={`${styles.leaderboardSection} headline-leaderboard`} aria-labelledby="leaderboard-heading">
          <div className={styles.sectionHeader}>
            <span className={styles.sectionKicker}>Frontier Leaderboard</span>
            <h2 id="leaderboard-heading">Biological Foundation Model Rankings</h2>
            <p className={styles.sectionIntro}>
              Compare top-ranked biological AI models across key use cases. Switch categories to view task-specific capability indexes, primary metrics, margins over conventional baselines, and operational telemetry.
            </p>
          </div>
          <GeoTakeaway
            data={generateHomepageTakeaway()}
            testId="home-geo-takeaway"
          />
          <UnifiedLeaderboard
            showCategorySwitcher={true}
            showParetoHighlight={true}
            initialCategory="structure_prediction"
            rows={precomputedRows}
          />
        </section>

        {/* Database Search & Supporting Content Wrapped in Explorer */}
        <Explorer
          initial={query.list({ kind: "model", limit: BROWSE_PAGE_SIZE })}
          release={query.release()}
        >
          {/* Purpose and Methodology */}
          <section
            className={styles.purposeSection}
            aria-labelledby="purpose-heading"
          >
            <div className={styles.sectionHeader}>
              <span className={styles.sectionKicker}>Purpose and scope</span>
              <h2 id="purpose-heading">What this platform is for</h2>
            </div>
            <div className={styles.purposeGrid}>
              <article className={styles.purposeCard}>
                <span className={styles.purposeIndex}>01 · The problem</span>
                <h3>Why comparisons break</h3>
                <p>
                  Choosing a biological model for a task is harder than it should
                  be. Results are scattered across papers, preprints and benchmark
                  suites. Each uses its own datasets, splits and metrics, so numbers
                  from two papers often cannot be compared, and new models appear
                  faster than anyone can read about them.
                </p>
              </article>
              <article className={styles.purposeCard}>
                <span className={styles.purposeIndex}>02 · Methodology</span>
                <h3>Organised by biological question</h3>
                <p>
                  This platform brings those results together. Every value links to
                  the paper, table or run it came from. Results are organised around
                  use cases, so you can start from the biological question you are
                  trying to answer rather than from a model name. Results measured
                  under different protocols are kept apart instead of being merged
                  into one ranking, and calibrated against pre-ML conventional baselines.
                </p>
              </article>
              <article className={styles.purposeCard}>
                <span className={styles.purposeIndex}>03 · Standard</span>
                <h3>Open, current and correctable</h3>
                <p>
                  The goal is a trusted, current reference for how biological models
                  perform on each task: kept up to date as the field moves, open to
                  researchers and their AI agents, and correctable by anyone who
                  brings better evidence.
                </p>
              </article>
            </div>
          </section>

          <CatalogueEvidence query={query} />

          <section
            className={styles.workflowSection}
            aria-label="Agent integration, freshness and downloads"
          >
            <AgentConnect />
            <div className={styles.homeMetaGrid}>
              <RefreshStatus
                compact
                data={readRefresh(undefined, catalogue.release_id)}
              />
              <CatalogueDownloads
                releaseId={catalogue.release_id}
                releasedAt={catalogue.released_at}
              />
            </div>
          </section>
        </Explorer>
      </div>
    </>
  );
}
