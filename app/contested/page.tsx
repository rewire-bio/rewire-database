import type { Metadata } from "next";
import Link from "next/link";
import { buildCatalogue } from "@/lib/catalogue-build";
import { recordHref } from "@/lib/omics";
import { openDiscrepancies, discrepancies, reviewStateLabel, scopeLabel, type Discrepancy } from "@/lib/discrepancies";
import styles from "@/components/catalogue/Contested.module.css";

export const metadata: Metadata = {
  title: "Contested results",
  description: "Results where one study disagrees with what other studies report for the same models, derived automatically and listed as leads to investigate.",
  alternates: { canonical: "https://benchmarks.rewirebio.io/contested/" },
};

const SEVERITIES = [{ key: "high", heading: "High" }, { key: "medium", heading: "Medium" }, { key: "low", heading: "Low" }] as const;

type Lookup = (id: string) => { name: string; href: string } | null;

function Records({ ids, lookup }: { ids: string[]; lookup: Lookup }) {
  return <>{ids.map((id, i) => {
    const record = lookup(id);
    return <span key={id}>{i > 0 && ", "}{record ? <Link href={record.href}>{record.name}</Link> : <code>{id}</code>}</span>;
  })}</>;
}

function Entry({ d, lookup }: { d: Discrepancy; lookup: Lookup }) {
  const r = d.resolution;
  return <article id={d.id} className={styles.entry}>
    <h3>{d.label}</h3>
    <ul className={styles.badges} aria-label="About this discrepancy">
      <li className={d.severity === "high" ? styles.high : undefined}>{d.severity[0].toUpperCase() + d.severity.slice(1)} severity</li>
      <li>{reviewStateLabel(d.review_state)}</li>
      <li>{scopeLabel(d.scope)}</li>
      {d.identity_basis !== "reviewed" && <li>Model identity not reviewed</li>}
    </ul>
    <p>{d.summary}</p>
    <dl className={styles.facts}>
      <dt>Models</dt><dd><Records ids={d.systems} lookup={lookup} /></dd>
      <dt>Disagreeing study</dt><dd><Records ids={d.outlier_sources} lookup={lookup} /></dd>
      <dt>Other studies</dt><dd>{d.consensus_sources.length > 3
        ? <details><summary>{d.consensus_sources.length} studies</summary><Records ids={d.consensus_sources} lookup={lookup} /></details>
        : <Records ids={d.consensus_sources} lookup={lookup} />}</dd>
      <dt>Results flagged</dt><dd>{d.outlier_results.length} in the disagreeing study, against {d.consensus_results.length} elsewhere</dd>
    </dl>
    {(r.rationale || r.awaiting || r.report_url || r.investigation_url) && <div className={styles.resolution}>
      {r.rationale && <p>{r.rationale}</p>}
      {r.upstream_response && <p>{r.upstream_response}</p>}
      {r.awaiting && <p>Waiting for: {r.awaiting}{r.expected_by && <> Expected by {r.expected_by}.</>}{r.next_check && <> Next check {r.next_check}.</>}</p>}
      {(r.report_url || r.investigation_url) && <p>
        {r.report_url && <a href={r.report_url}>Report to the authors{r.reported_on && ` (${r.reported_on})`} ↗</a>}
        {r.report_url && r.investigation_url && " · "}
        {r.investigation_url && <a href={r.investigation_url}>Our investigation ↗</a>}
      </p>}
    </div>}
  </article>;
}

export default function ContestedPage() {
  const { catalogue, query } = buildCatalogue();
  const file = discrepancies();
  const open = openDiscrepancies(file);
  const lookup: Lookup = (id) => {
    const record = query.record(id);
    return record ? { name: record.name, href: recordHref(record) } : null;
  };
  const strong = file?.rules.strong_consensus as { min_comparisons: number; min_consistency: number } | undefined;
  const counts = SEVERITIES.map((s) => open.filter((d) => d.severity === s.key).length);
  return <>
    <header className="page-head"><div className="wrap">
      <span className="kick">Evidence and investigation</span>
      <h1>Contested results</h1>
      <p className="intro">Results where one study disagrees with what other studies report for the same models. Each one is a lead to investigate, not a finding that the study is wrong.</p>
    </div></header>
    <section className="block first"><div className="wrap content">
      <nav aria-label="Contested results navigation"><Link href="/">Benchmark database</Link> · <Link href="/investigations/">Reviewed investigations</Link></nav>
      <section className={styles.section}>
        <h2>How these are found</h2>
        <p>Each release, a check compares every pair of models that two or more studies measure. It lists a study when it reverses the order that the other studies agree on. Studies split into many files, such as a paper and its supplement, count as one study.</p>
        <p>Severity starts at high. It drops one step when the studies measured the models on different tasks, and one step when a model in one study was matched to the same model in another by name rather than by a reviewed link. {strong && <> It rises one step when the other studies agree in at least {strong.min_comparisons} comparisons, {Math.round(strong.min_consistency * 100)}% of the time.</>}</p>
        <p>The check runs on the data alone. Different tasks, populations or metrics can explain a reversal, and most low-severity entries will turn out that way. An entry stays here until a reviewer records it as explained, a confirmed error or not a real disagreement. Result tables on use-case pages mark the rows these entries rest on.</p>
        <p className={styles.muted}>Release {catalogue.release_id}{file ? ` · ${open.length} open of ${file.discrepancies.length}` : ""}</p>
      </section>
      {!file && <section className={styles.section}><p>The check has not been published for this release yet. It runs after each release and appears here when it finishes.</p></section>}
      {file && !open.length && <section className={styles.section}><p>No open discrepancies in this release.</p></section>}
      {SEVERITIES.map((s, i) => counts[i] > 0 && <section key={s.key} className={styles.section} aria-labelledby={`severity-${s.key}`}>
        <h2 id={`severity-${s.key}`}>{s.heading} ({counts[i]})</h2>
        {open.filter((d) => d.severity === s.key).map((d) => <Entry key={d.id} d={d} lookup={lookup} />)}
      </section>)}
    </div></section>
  </>;
}
