import { catalogueWebsiteJsonLd, safeJsonLd, socialMetadata } from "@/lib/catalogue-sharing";
import type { Metadata } from "next";
import Link from "next/link";
import { buildCatalogue } from "@/lib/catalogue-build";
import Explorer from "./database/Explorer";
import PageHeader from "@/components/PageHeader";
import styles from "./database/database.module.css";
import {
  CompositionCharts,
  CoverageChart,
} from "@/components/catalogue/CatalogueCharts";
import { BROWSE_PAGE_SIZE, researchAreaLabel } from "@/lib/omics-browse";
import { benchmarkCoverage } from "@/scripts/omics/audit-benchmark-evidence";

const pageMetadata = {
  title: "Biological model benchmark database",
  description:
    "Explore specialist biological models, benchmarks, datasets, baselines and source-linked results in one database.",
  alternates: { canonical: "https://benchmarks.rewire.it/" },
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
  const release = `/omics/releases/${catalogue.release_id}`;
  const external = catalogue.records.filter(
    (record) => record.kind === "result" && record.status === "source_checked",
  ).length;
  const own = catalogue.records.filter(
    (record) => record.kind === "result" && record.status === "reproduced",
  ).length;
  const tally = (pick: (r: (typeof catalogue.records)[number]) => string[]) => {
    const counts = new Map<string, number>();
    for (const record of catalogue.records)
      for (const key of pick(record))
        counts.set(key, (counts.get(key) || 0) + 1);
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({ label, value }));
  };
  const kindRows = tally((record) => [record.kind]).map((row) => ({
    ...row,
    label: row.label.replace(/_/g, " "),
  }));
  const areaRows = tally((record) => record.facets.areas || [])
    .slice(0, 10)
    .map((row) => ({ ...row, label: researchAreaLabel(row.label) }));
  const coverage = benchmarkCoverage(catalogue.records);
  const coverageRows = coverage.map((entry) => ({
    label: entry.name,
    value: entry.evaluations,
    muted: entry.evaluations === 0,
  }));
  const covered = coverage.filter((entry) => entry.evaluations > 0).length;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(catalogueWebsiteJsonLd) }} />
      <PageHeader
        eyebrow={["Omics and molecular biology", `Release ${catalogue.released_at.slice(0, 10)}`]}
        title="Biological model benchmark database"
        intro="Find biological models, see how they were tested and inspect the evidence behind each result."
      >
        <nav className={styles.journeys} aria-label="Other ways to start">
          <span>Or start from</span>
          <a href="/use-cases/"><strong>A biological question</strong> <span>Use cases</span></a>
          <a href="/models/"><strong>A model you know</strong> <span>Models</span></a>
          <a href="/benchmarks/"><strong>A benchmark</strong> <span>Benchmarks</span></a>
        </nav>
      </PageHeader>
      <div className="wrap content">
          <section
            id="browse"
            className={styles.browse}
            aria-labelledby="browse-heading"
          >
            <h2 id="browse-heading" className="sr-only">Search and browse the database</h2>
            <Explorer
              initial={query.list({ kind: "model", limit: BROWSE_PAGE_SIZE })}
              release={query.release()}
            />
          </section>
          <section id="evidence" className={styles.information}>
            <h2>How to read the evidence</h2>
            <details className={styles.section}>
              <summary>Coverage: records and linked evaluations</summary>
              <p>
                {catalogue.records.length.toLocaleString()} records across{" "}
                {kindRows.length} record types. These counts describe catalogue
                coverage, not model performance.
              </p>
              <CompositionCharts kinds={kindRows} areas={areaRows} />
              <h3>Benchmark evidence coverage</h3>
              <CoverageChart
                covered={covered}
                total={coverage.length}
                rows={coverageRows}
              />
            </details>
            <p>
              Published evaluations and rewire evaluations are records in the
              same database, with their origin shown beside each result. This
              release includes {external.toLocaleString()} source-checked
              published results and {own.toLocaleString()} results from
              existing rewire runs.
            </p>
            <p>
              <strong>
                Source checked does not mean independently reproduced.
              </strong>{" "}
              Comparisons require compatible data, protocols and metrics.
              Missing details stay visible.
            </p>
            <div className={styles.referenceGrid}>
              <article>
                <h3>Investigate discrepancies</h3>
                <p>Check whether the data supports replaying a metric, investigating an unexpected result or testing an explanation independently.</p>
                <Link href="/investigations/">Readiness and investigations →</Link>
              </article>
              <article>
                <h3>Rewire evaluations</h3>
                <p>
                  Read the protocol, coverage and limitations behind our
                  corrected splice-variant evaluation.
                </p>
                <Link href="/runs/mfass-v2/">MFASS v2 evaluation →</Link>
              </article>
              <article id="mfass-v1">
                <h3>Correction history</h3>
                <p>
                  MFASS v1 is superseded. Its original tables and methods remain
                  available as an archived report.
                </p>
                <Link href="/runs/mfass-v1/">Archived MFASS v1 report →</Link>
              </article>
            </div>
            <details className={styles.section}>
              <summary>Collection coverage and remaining gaps</summary>
              <p>
                This is a dated collection, not an exhaustive model census.
                Models, methods, evaluated configurations and pipelines are
                listed separately. Counts describe records, not unique
                checkpoints or independent experiments.
              </p>
              <pre className={styles.pre}>
                {JSON.stringify(catalogue.coverage, null, 2)}
              </pre>
            </details>
          </section>
          <section id="downloads" className={styles.information}>
            <h2>Download the database</h2>
            <p className={styles.muted}>
              Release {catalogue.release_id} ·{" "}
              {catalogue.released_at.slice(0, 10)}
            </p>
            <div className={styles.downloads}>
              <a href={`${release}/records.jsonl`} download>
                JSONL
              </a>
              <a href={`${release}/records.csv`} download>
                CSV
              </a>
              <a href={`${release}/evidence.csv`} download>
                Evidence table (CSV)
              </a>
              <a href={`${release}/evidence.jsonl`} download>
                Evidence table (JSONL)
              </a>
              <a href="/evidence/">Evidence and review methods</a>
              <a href={`${release}/manifest.json`}>
                Checksums and release manifest
              </a>
            </div>
            <details>
              <summary>Original literature downloads</summary>
              <p>
                The original 100-paper collection is retained for citation
                history. These files include six result rows excluded from the
                current omics scope; use the database release above for the
                reviewed collection.
              </p>
              <div className={styles.downloads}>
                <a href="/benchmark-literature/results.csv" download>
                  Original results CSV
                </a>
                <a href="/benchmark-literature/papers.json" download>
                  Original papers JSON
                </a>
              </div>
            </details>
          </section>
      </div>
    </>
  );
}
