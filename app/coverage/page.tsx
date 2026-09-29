import type { Metadata } from "next";
import { readFileSync } from "node:fs";
import Link from "next/link";
import { buildCatalogue } from "@/lib/catalogue-build";
import type { benchmarkCoverage } from "@/services/omics/src/benchmark-coverage";
import { kindLabels } from "@/lib/omics-browse";
import styles from "@/app/database/database.module.css";
export const metadata: Metadata = {
  title: "Benchmark result coverage",
  description: "A release-pinned audit of results, source-scoped charts and collection gaps across every benchmark, task, protocol and evaluator.",
  alternates: { canonical: "https://benchmarks.rewire.it/coverage/" },
};
export default function CoveragePage() {
  const { catalogue } = buildCatalogue();
  const audit: ReturnType<typeof benchmarkCoverage> = JSON.parse(readFileSync(`public/omics/coverage/${catalogue.release_id}.json`, "utf8"));
  return <>
    <header className="page-head"><div className="wrap">
      <span className="kick">Collection coverage</span><h1>Benchmark results and remaining gaps</h1>
      <p className="intro">See which pages have checked results and charts, and which still need their published evidence collected.</p>
    </div></header>
    <section className="block first"><div className="wrap">
      <nav className={styles.nav} aria-label="Coverage navigation"><Link href="/">Benchmark database</Link>{Object.keys(audit.summary).map((kind) => <a key={kind} href={`#${kind}`}>{kindLabels[kind as keyof typeof kindLabels]}</a>)}</nav>
      <p>Release {audit.release_id}. Counts include results reached through source-backed membership links. A metric row is not an independent experiment. Charts keep a source, protocol, dataset and metric together.</p>
      <p>Pages without results indicate gaps in this collection. A paper may contain experiments we have not yet transcribed. We do not substitute unrelated results or zero scores for missing evidence.</p>
      <p><a href={`/omics/coverage/${audit.release_id}.json`}>Download the complete audit (JSON)</a></p>
      {Object.entries(audit.summary).map(([kind, counts]) => <section key={kind} id={kind} className={styles.section}>
        <h2>{kindLabels[kind as keyof typeof kindLabels]}</h2>
        <p>{counts.pages} pages · {counts.with_results} with results · {counts.with_charts} with charts.</p>
        <div className={styles.tableScroll} tabIndex={0} role="region" aria-label={`${kind} coverage`}><table className={styles.resultTable}>
          <thead><tr><th scope="col">Page</th><th scope="col">Evaluations / metric rows</th><th scope="col">Charts</th><th scope="col">Collection status</th></tr></thead>
          <tbody>{audit.pages.filter((page) => page.kind === kind).map((page) => <tr key={page.id}>
            <th scope="row"><Link href={page.url}>{page.name}</Link></th>
            <td><Link href={`${page.url}#results`}>{page.evaluations} / {page.metric_rows}</Link></td>
            <td>{page.charts ? <Link href={`${page.url}#charts`}>{page.charts} source-scoped figures</Link> : "Not yet available"}</td>
            <td>{page.state === "historical" ? "Superseded record, retained for history." : page.metric_rows === 0 ? "Published results still to collect." : page.charts ? "Checked result tables available." : "Results available; comparison group not yet validated."}
              {page.gaps.length > 0 && <details><summary>Scope and remaining work</summary><ul>{page.gaps.map((gap, i) => <li key={i}>{gap}</li>)}</ul></details>}
            </td>
          </tr>)}</tbody>
        </table></div>
      </section>)}
    </div></section>
  </>;
}
