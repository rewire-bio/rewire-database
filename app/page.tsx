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
import { readRefresh } from "@/lib/refresh-build";

const pageMetadata = {
  title: "Biological model benchmark database",
  description:
    "Explore specialist biological models, benchmarks, datasets, baselines and source-linked results in one database.",
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
        intro="Find biological models, see how they were tested and inspect the evidence behind each result."
      >
        <nav className={styles.journeys} aria-label="Other ways to start">
          <span>Or start from</span>
          <a href="/use-cases/">
            <strong>A biological question</strong> <span>Use cases</span>
          </a>
          <a href="/models/">
            <strong>A model you know</strong> <span>Models</span>
          </a>
          <a href="/benchmarks/">
            <strong>A benchmark</strong> <span>Benchmarks</span>
          </a>
        </nav>
      </PageHeader>
      <div className="wrap content">
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
          data={readRefresh(process.cwd(), catalogue.release_id)}
        />
        <CatalogueEvidence catalogue={catalogue} />
        <CatalogueDownloads
          releaseId={catalogue.release_id}
          releasedAt={catalogue.released_at}
        />
      </div>
    </>
  );
}
