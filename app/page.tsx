import type { Metadata } from "next";
import Link from "next/link";
import { buildCatalogue } from "@/lib/catalogue-build";
import Explorer from "./database/Explorer";
import styles from "./database/database.module.css";

export const metadata: Metadata = {
  title: "Biological model benchmark database",
  description:
    "Explore specialist biological models, benchmarks, datasets, baselines and source-linked results in one database.",
  alternates: { canonical: "https://benchmarks.rewire.it/" },
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
  return (
    <>
      <header className="page-head">
        <div className="wrap">
          <span className="kick">Omics and molecular biology</span>
          <h1>Biological model benchmark database</h1>
          <p className="intro">
            Find models, understand how they are tested, and inspect the
            evidence behind their results.
          </p>
        </div>
      </header>
      <section className="block first">
        <div className="wrap">
          <nav className={styles.nav} aria-label="Database navigation">
            <a href="#browse">Browse records</a>
            <a href="#evidence">About the evidence</a>
            <a href="#downloads">Downloads</a>
            <a href="/contribute/">Contribute evidence</a>
          </nav>
          <section
            id="browse"
            className={styles.browse}
            aria-label="Browse benchmark database"
          >
            <Explorer
              initial={query.list({ kind: "model", limit: 20 })}
              release={query.release()}
            />
          </section>
          <section id="evidence" className={styles.information}>
            <h2>About the evidence</h2>
            <p>
              Published evaluations and rewire evaluations are records in the
              same database, with their origin shown beside each result. This
              release includes {external} source-checked literature result rows
              and {own} metric rows from existing rewire runs.
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
                Model records include families and paper-specific methods;
                counts do not represent unique checkpoints.
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
      </section>
    </>
  );
}
