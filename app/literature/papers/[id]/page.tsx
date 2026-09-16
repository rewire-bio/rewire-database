import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLiterature } from "@/lib/benchmark-literature";
import styles from "../../literature.module.css";

function originLabel(origin: "author_reported" | "independent_paper" | "paper_compilation"): string {
  if (origin === "author_reported") return "Author's model";
  if (origin === "paper_compilation") return "Compiled from another paper";
  return "Independent paper evaluation";
}

function displayUnit(unit: string): string {
  if (["unitless", "fraction", "count"].includes(unit)) return "";
  return unit === "percent" ? "%" : unit;
}

function scoreText(value: string, unit: string): string {
  const shown = displayUnit(unit);
  return `${value}${shown === "%" ? "%" : shown ? ` ${shown}` : ""}`;
}

function versionSuffix(version: string): string {
  return version && !/^not stated/i.test(version) ? ` (${version})` : "";
}

export function generateStaticParams() {
  return getLiterature().papers.map((paper) => ({ id: paper.id }));
}

export function generateMetadata({ params }: { params: { id: string } }): Metadata {
  const paper = getLiterature().papers.find((item) => item.id === params.id);
  if (!paper) return { title: "Paper result | rewire.it" };
  return {
    title: `${paper.title} | Published benchmark results | rewire.it`,
    description: `Paper-reported biological AI benchmark results from ${paper.title}, with source locations and protocol details.`,
    alternates: { canonical: `https://benchmarks.rewire.it/literature/papers/${paper.id}/` },
  };
}

export default function PaperResultsPage({ params }: { params: { id: string } }) {
  const { papers, results } = getLiterature();
  const paper = papers.find((item) => item.id === params.id);
  if (!paper) notFound();
  const rows = results.filter((item) => item.paper_id === paper.id).sort((a, b) => a.task.localeCompare(b.task) || a.model.localeCompare(b.model));
  return <>
    <header className="page-head"><div className="wrap"><span className="kick">Paper-reported evidence</span><h1>{paper.title}</h1><p className="intro">{paper.year} · {paper.publication_status === "peer_reviewed" ? "Peer-reviewed" : "Preprint"} · {paper.version}</p></div></header>
    <section className="block first"><div className="wrap">
      <nav className={styles.breadcrumb} aria-label="Breadcrumb"><Link href="/">Benchmarks</Link><span aria-hidden="true">/</span><Link href="/literature/">Literature</Link><span aria-hidden="true">/</span><span>Paper</span></nav>
      <div className={styles.notice}><strong>Paper-reported results.</strong> The values below come from this source, not an independent rewire.it run.</div>
      <p className={styles.summary}><a href={paper.source_url} target="_blank" rel="noreferrer">Open primary paper &rarr;</a>{paper.doi && <span>DOI: {paper.doi}</span>}{paper.arxiv_id && <span>arXiv: {paper.arxiv_id}</span>}</p>
      {paper.notes && <p className={styles.protocol}>{paper.notes}</p>}
      <p className={styles.count}>{rows.length} verified numerical rows · source checked {paper.retrieved_utc.slice(0, 10)}</p>
      <div className={styles.results}>
        {rows.map((row) => <article key={row.id} className={styles.result}>
          <div className={styles.resultTop}><span className={styles.badge}>Paper-reported</span><span>{originLabel(row.evaluation_origin)}</span></div>
          <h2>{row.model}{versionSuffix(row.model_version)}</h2>
          <p className={styles.identity}>{row.task}</p>
          <dl className={styles.fields}>
            <div><dt>Reported score</dt><dd className={styles.score}>{scoreText(row.value, row.unit)}{row.uncertainty ? <small>{row.uncertainty}</small> : null}</dd></div>
            <div><dt>Metric</dt><dd>{row.metric}</dd></div>
            <div><dt>Dataset / split</dt><dd>{row.dataset}{row.dataset_version ? ` ${row.dataset_version}` : ""}{row.split ? ` · ${row.split}` : ""}</dd></div>
          </dl>
          <p className={styles.protocol}>{row.protocol || "Protocol detail not reported in the source table."}</p>
          <div className={styles.source}><span>{row.source_locator}</span><a href={row.source_url} target="_blank" rel="noreferrer">Verify at source &rarr;</a></div>
        </article>)}
      </div>
    </div></section>
  </>;
}
