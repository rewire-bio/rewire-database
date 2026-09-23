import { recordHref, type OmicsCatalogue } from "@/lib/omics";
import { researchAreaLabel } from "@/lib/omics-browse";
import { indexRecords, indexSummary, modelIndexHref, modelPageCount, MODEL_PAGE_SIZE, type IndexKind } from "@/lib/catalogue-index";
import styles from "./StaticIndex.module.css";

/** Server-rendered anchors keep discovery independent of API calls or JavaScript. */
export default function StaticIndex({ catalogue, kind, page = 1 }: { catalogue: OmicsCatalogue; kind: IndexKind; page?: number }) {
  const all = indexRecords(catalogue.records, kind);
  const benchmarks = kind === "benchmark";
  const pages = benchmarks ? 1 : modelPageCount(catalogue.records);
  const start = benchmarks ? 0 : (page - 1) * MODEL_PAGE_SIZE;
  const records = benchmarks ? all : all.slice(start, start + MODEL_PAGE_SIZE);
  const duplicateNames = new Set(all.filter((record, i) => all.some((other, j) => i !== j && other.name === record.name)).map((record) => record.name));
  const pagination = pages > 1 ? (
    <nav className={styles.pagination} aria-label="Model index pages">
      {page > 1 && <a href={modelIndexHref(page - 1)} rel="prev">Previous</a>}
      {Array.from({ length: pages }, (_, index) => index + 1).map((number) => <a key={number} href={modelIndexHref(number)} aria-label={`Page ${number}`} aria-current={page === number ? "page" : undefined}>{number}</a>)}
      {page < pages && <a href={modelIndexHref(page + 1)} rel="next">Next</a>}
    </nav>
  ) : null;
  return <>
    <header className="page-head"><div className="wrap">
      <nav className="breadcrumb" aria-label="Breadcrumb"><a href="/">Database</a><span aria-hidden="true">/</span><span>{benchmarks ? "Benchmarks" : "Models"}</span></nav>
      <h1>{benchmarks ? "Biological benchmarks" : "Biological models"}</h1>
      <p className="intro">{benchmarks ? "Explore evaluation suites and challenges, what they measure, and the models tested against them." : "Understand model architectures, biological inputs, access requirements and the evidence from linked evaluations."}</p>
      <nav className={styles.shortcuts} aria-label="Catalogue indexes"><a href="/benchmarks/" aria-current={benchmarks ? "page" : undefined}>Benchmarks</a><a href="/models/" aria-current={!benchmarks ? (page === 1 ? "page" : "location") : undefined}>Models</a><a href={`/?kind=${kind}#browse`}>Search and filter {benchmarks ? "benchmarks" : "models"}</a></nav>
    </div></header>
    <section className={`block first ${styles.index}`} aria-label={benchmarks ? "Benchmark profiles" : "Model profiles"}><div className="wrap">
      <p>{all.length} {benchmarks ? "benchmark" : "model"} records in release <a href={`/omics/releases/${catalogue.release_id}/manifest.json`}>{catalogue.release_id}</a>.{!benchmarks && ` Showing ${all.length ? start + 1 : 0}–${Math.min(start + records.length, all.length)}; page ${page} of ${pages}.`}</p>
      <p className={styles.context}>{benchmarks ? <>Broad <a href="/?kind=task#browse">tasks</a>, specific <a href="/?kind=protocol#browse">protocols</a> and <a href="/?kind=evaluator#browse">evaluators</a> have their own records. Follow each benchmark to its procedures and results.</> : <>Evaluated <a href="/?kind=configuration#browse">configurations</a>, <a href="/?kind=method#browse">methods</a> and <a href="/?kind=pipeline#browse">pipelines</a> are listed separately. Names alone do not establish equivalent models or checkpoints.</>}</p>
      {pagination}
      <ul className={styles.records}>{records.map((record) => <li key={record.id}>
        <h2><a href={recordHref(record)}>{record.name}</a></h2>
        {record.facets.areas?.length > 0 && <p className={styles.areas}>{record.facets.areas.map(researchAreaLabel).join(" · ")}</p>}
        <p>{indexSummary(record)}</p>
        {duplicateNames.has(record.name) && <p className={styles.identity}>Record: {record.id}</p>}
      </li>)}</ul>
      {pagination}
      <p className={styles.context}>This index reflects a dated catalogue, not an exhaustive census. Source checking does not mean independent reproduction; compare results only under compatible protocols, datasets and metrics.</p>
    </div></section>
  </>;
}
