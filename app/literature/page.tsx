import type { Metadata } from "next";
import Link from "next/link";
import { getLiterature } from "@/lib/benchmark-literature";
import LiteratureExplorer from "./LiteratureExplorer";
import styles from "./literature.module.css";

export const metadata: Metadata = {
  title: "Published benchmark results | rewire.it",
  description: "Source-linked biological AI benchmark results reported in published papers and preprints, kept separate from independent rewire.it runs.",
  alternates: { canonical: "https://benchmarks.rewire.it/literature/" },
};

export default function LiteraturePage() {
  const { papers, results } = getLiterature();
  return (
    <>
      <header className="page-head">
        <div className="wrap">
          <span className="kick">Published evidence</span>
          <h1>Results from the literature</h1>
          <p className="intro">Numerical benchmark results as their papers report them, with the dataset, metric and source table beside every number.</p>
        </div>
      </header>
      <section className="block first">
        <div className="wrap">
          <nav className={styles.breadcrumb} aria-label="Breadcrumb">
            <Link href="/">Benchmarks</Link><span aria-hidden="true">/</span><span>Literature</span>
          </nav>
          <div className={styles.notice}>
            <strong>Paper-reported results.</strong> These are not rewire.it runs. Scores from different datasets, splits or protocols are not a single leaderboard.
          </div>
          <div className={styles.summary}>
            <p><strong>{papers.length}</strong> verified papers <span aria-hidden="true">·</span> <strong>{results.length}</strong> numerical rows</p>
            {results.length > 0 && <div className={styles.downloads}><a href="/benchmark-literature/results.csv" download>Results CSV &rarr;</a><a href="/benchmark-literature/papers.json" download>Papers JSON &rarr;</a></div>}
          </div>
          <LiteratureExplorer papers={papers} results={results} />
        </div>
      </section>
    </>
  );
}
