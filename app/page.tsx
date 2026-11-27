import {
  catalogueWebsiteJsonLd,
  safeJsonLd,
  socialMetadata,
} from "@/lib/catalogue-sharing";
import type { Metadata } from "next";
import Image from "next/image";
import { buildCatalogue } from "@/lib/catalogue-build";
import { homeLeaderboards } from "@/lib/release-leaderboard";
import { UnifiedLeaderboard } from "@/components/catalogue/UnifiedLeaderboard";
import HowToCite from "@/components/catalogue/HowToCite";
import { GeoTakeaway } from "@/components/catalogue/GeoTakeaway";
import { generateHomepageTakeaway } from "@/lib/geo-takeaway";
import Explorer from "./database/Explorer";
import PageHeader from "@/components/PageHeader";
import styles from "./database/database.module.css";
import { CatalogueEvidence } from "@/components/catalogue/CatalogueEvidence";
import { CatalogueDownloads } from "@/components/catalogue/CatalogueDownloads";
import { BROWSE_PAGE_SIZE } from "@/lib/omics-browse";
import AgentConnect from "@/components/AgentConnect";
import { contestedList } from "@/lib/discrepancies";
import { HOME_NOTICE } from "@/lib/home-notice";
import contested from "@/components/catalogue/Contested.module.css";
import { releaseBoardsFile } from "@/lib/use-case-boards";
import { homeReach, reachFromBoardsFile } from "@/lib/model-reach";
import { ModelReachMatrix } from "@/components/catalogue/ModelReach";

const pageMetadata = {
  title: "Independent Benchmarks for Biological Models | rewirebio.io",
  description:
    "Which biological model works best for your task? Published benchmark results ranked per biological use case on one protocol at a time, each linked to its source, with baselines where the same study scores them.",
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

const HOME_PILLARS = [
  {
    src: "/images/pillars/use-case-rankings.png",
    title: "Per-Use-Case Rankings",
    description: "No composite scores; models ranked within one protocol per use case.",
  },
  {
    src: "/images/pillars/protocol-baselines.png",
    title: "Protocol Baselines",
    description: "A baseline appears only where the same study scores it on the same protocol.",
  },
  {
    src: "/images/pillars/pareto-efficiency.png",
    title: "Independence and Coverage",
    description: "Each rank shows who produced the result and how many of the use case's comparisons score the model.",
  },
  {
    src: "/images/pillars/source-evidence.png",
    title: "Source Evidence",
    description: "Every value links to its result record, its source and any open discrepancy.",
  },
] as const;

export default function BenchmarksPage() {
  const { catalogue, query } = buildCatalogue();
  const useCases = (catalogue.coverage.use_cases as { use_cases?: number } | undefined)?.use_cases ?? 0;
  const disagreements = contestedList({})?.totals;

  // The lead use cases that have a ranking in this release, built from the release at render time.
  const boards = homeLeaderboards();
  const fullReach = reachFromBoardsFile(releaseBoardsFile(catalogue.release_id), (id) => query.record(id)?.kind ?? null);
  const topReach = homeReach(fullReach.rows, fullReach.columns, 8);

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
        title="Independent Benchmarks for Biological Models"
        intro="Which biological model works best for your task? Published benchmark results ranked per biological use case, on one protocol at a time, each linked to the source it was taken from."
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

        {/* Value Proposition Pillars */}
        <div className={styles.valueProps}>
          {HOME_PILLARS.map((pillar) => (
            <div key={pillar.title} className={styles.valuePropCard}>
              <Image
                src={pillar.src}
                alt=""
                width={48}
                height={48}
                decoding="async"
                unoptimized
                className={styles.valuePropImg}
              />
              <div>
                <strong className={styles.valuePropTitle}>{pillar.title}</strong>
                <p className={styles.valuePropDesc}>{pillar.description}</p>
              </div>
            </div>
          ))}
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
        {boards.length > 0 && <section className={`${styles.leaderboardSection} headline-leaderboard`} aria-labelledby="leaderboard-heading">
          <div className={styles.sectionHeader}>
            <span className={styles.sectionKicker}>Use-case Leaderboards</span>
            <h2 id="leaderboard-heading">Biological Model Rankings</h2>
            <p className={styles.sectionIntro}>
              Each tab ranks models on one protocol of a use case, from the published results in this release. A tab marked Proxy ranks on a protocol that reviewers judged a proxy for the use case, not a direct test of it. Open a row for its source, review status and baseline.
            </p>
          </div>
          <GeoTakeaway
            data={generateHomepageTakeaway(boards)}
            testId="home-geo-takeaway"
          />
          <UnifiedLeaderboard
            boards={boards}
            release={{ id: catalogue.release_id, released_at: catalogue.released_at }}
            showCategorySwitcher={true}
            showParetoHighlight={true}
          />
          <HowToCite title="Use-case leaderboards" path="/" releaseId={catalogue.release_id} className={`${styles.muted} ${styles.inlineLinks}`} compact />
        </section>}

        {topReach.rows.length > 0 && <section className={styles.leaderboardSection} aria-labelledby="reach-heading">
          <div className={styles.sectionHeader}>
            <span className={styles.sectionKicker}>Cross-task coverage</span>
            <h2 id="reach-heading">Models across use cases</h2>
            <p className={styles.sectionIntro}>
              How the most widely ranked models place across use-case boards. Each bar shows the range of positions from studies in this release, with first on the left.
            </p>
          </div>
          <ModelReachMatrix rows={topReach.rows} columns={topReach.columns} groups={fullReach.groups} />
          <p className={styles.inlineLinks}>
            <a href="/models/reach/">See all {fullReach.rows.length} models across use cases</a>
          </p>
        </section>}

        {/* Database Search & Supporting Content Wrapped in Explorer */}
        <Explorer
          initial={query.list({ kind: "model", limit: BROWSE_PAGE_SIZE })}
          release={query.release()}
        >
          <CatalogueEvidence query={query} compact />

          <section
            className={styles.workflowSection}
            aria-label="Agent integration and database downloads"
          >
            <AgentConnect />
            <CatalogueDownloads
              compact
              releaseId={catalogue.release_id}
              releasedAt={catalogue.released_at}
            />
          </section>
        </Explorer>
      </div>
    </>
  );
}
