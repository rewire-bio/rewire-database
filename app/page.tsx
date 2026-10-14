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

const pageMetadata = {
  title: "Biological model benchmark database",
  description:
    "An up-to-date, source-linked record of how biological models perform on specific biological tasks, consolidated from published benchmarks and papers.",
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
        intro="An up-to-date record of which biological models perform best on which tasks, with the evidence behind every result."
      >
        <nav className={styles.journeys} aria-label="Ways to start">
          {useCases > 0 && (
            <a className={styles.primaryJourney} href="/use-cases/">
              <strong>Start from a biological question</strong>{" "}
              <span>{useCases} {useCases === 1 ? "use case" : "use cases"}</span>
            </a>
          )}
          <span>{useCases > 0 ? "or from" : "Or start from"}</span>
          <a href="/models/">
            <strong>A model you know</strong> <span>Models</span>
          </a>
          <a href="/benchmarks/">
            <strong>A benchmark</strong> <span>Benchmarks</span>
          </a>
        </nav>
      </PageHeader>
      <div className="wrap content">
        <section className={styles.section} aria-labelledby="purpose-heading">
          <h2 id="purpose-heading">Why this database exists</h2>
          <p>
            There are now many biological models, built for many different
            tasks. The evidence on how well they work is spread across
            academic papers, preprints and benchmark suites, each with its own
            datasets, metrics and protocols. Working out the best model for a
            given use case means finding and reconciling all of it.
          </p>
          <p>
            The field also moves quickly. New models and benchmarks appear
            every month, so a comparison made last year may already be out of
            date.
          </p>
          <p>
            Rewire collects these results, records the source behind every
            value and links models, benchmarks, datasets and use cases into
            one view. Each use case shows when its evidence was last checked,
            and we plan to check for new results every month. The aim is an
            authoritative, current reference for how biological models score
            on each biological task.
          </p>
        </section>
        <AgentConnect />
        <section
          id="browse"
          className={styles.browse}
          aria-labelledby="browse-heading"
        >
          <h2 id="browse-heading" className="sr-only">
            Search and browse the database
          </h2>
          <Explorer
            initial={query.list({ kind: "model", limit: BROWSE_PAGE_SIZE })}
            release={query.release()}
          />
        </section>
        <RefreshStatus
          compact
          data={readRefresh(undefined, catalogue.release_id)}
        />
        <CatalogueEvidence query={query} />
        <CatalogueDownloads
          releaseId={catalogue.release_id}
          releasedAt={catalogue.released_at}
        />
      </div>
    </>
  );
}
