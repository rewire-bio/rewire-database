import {
  catalogueWebsiteJsonLd,
  safeJsonLd,
  socialMetadata,
} from "@/lib/catalogue-sharing";
import type { Metadata } from "next";
import { buildCatalogue } from "@/lib/catalogue-build";
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
  title: "Biological model benchmark database",
  description:
    "Which biological model works best for your task? Published and reproduced benchmark results, linked to their sources and organised by biological question.",
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
  // The release's count, not the use-case evidence itself, which is large to load.
  const useCases = (catalogue.coverage.use_cases as { use_cases?: number } | undefined)?.use_cases ?? 0;
  const disagreements = contestedList({})?.totals;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(catalogueWebsiteJsonLd) }}
      />
      <PageHeader
        eyebrow={[
          "Omics and molecular biology",
          `Release ${catalogue.released_at.slice(0, 10)}`,
        ]}
        title="Biological model benchmark database"
        intro="Which biological model works best for your task? Published and reproduced results, linked to their sources and organised by biological question."
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
        {/* Shown from the first release with discrepancy data (contract 3.3). */}
        {disagreements && <div className={contested.notice}>
          {HOME_NOTICE && <p><strong>New.</strong> {HOME_NOTICE.text} <a href={HOME_NOTICE.href}>{HOME_NOTICE.link}</a></p>}
          <p>
            <a href="/contested/?status=open">{disagreements.open} open {disagreements.open === 1 ? "disagreement" : "disagreements"} between studies</a>
            {disagreements.settled > 0 && <>, {disagreements.settled} settled</>} in this release.
          </p>
        </div>}
      </PageHeader>
      <div className="wrap content">
        <Explorer
          initial={query.list({ kind: "model", limit: BROWSE_PAGE_SIZE })}
          release={query.release()}
        >
          <section
            className={styles.purposeSection}
            aria-labelledby="purpose-heading"
          >
            <div className={styles.sectionHeader}>
              <span className={styles.sectionKicker}>Purpose and scope</span>
              <h2 id="purpose-heading">What this database is for</h2>
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
                  This database brings those results together. Every value links to
                  the paper, table or run it came from. Results are organised around
                  use cases, so you can start from the biological question you are
                  trying to answer rather than from a model name. Results measured
                  under different protocols are kept apart instead of being merged
                  into one ranking, and where the evidence for a use case is thin or
                  missing, the page says so. Where published results leave a gap
                  that matters, we run the benchmark ourselves and publish the code.
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
