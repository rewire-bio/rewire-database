import Breadcrumbs from "@/components/catalogue/Breadcrumbs";
import { socialMetadata } from "@/lib/catalogue-sharing";
import type { Metadata } from "next";
import Link from "next/link";
import run from "@/data/benchmark-runs/mfass-v2.json";
import styles from "./run.module.css";

const pageMetadata = {
  title: "MFASS v2: corrected baseline and DNABERT-2 | rewire.it",
  description: "A complete local MFASS run with a corrected baseline, a frozen DNABERT-2 pair-embedding protocol, full coverage and group-resampled comparisons.",
  alternates: { canonical: "https://benchmarks.rewire.it/runs/mfass-v2/" },
};
export const metadata: Metadata = {
  ...pageMetadata,
  ...socialMetadata({
    title: pageMetadata.title,
    description: pageMetadata.description,
    path: pageMetadata.alternates.canonical,
  }),
};

function fixed(value: number, digits = 3): string {
  return value.toFixed(digits);
}

function interval(metric: { delta: number; ci95: number[] }): string {
  return `${fixed(metric.delta)} [${fixed(metric.ci95[0])}, ${fixed(metric.ci95[1])}]`;
}

export default function MfassV2Page() {
  return <>
    <header className="page-head"><div className="wrap">
      <Breadcrumbs items={[{ name: "Database", path: "/" }, { name: "Rewire evaluations", path: "/?kind=result&origin=rewire#browse" }, { name: "MFASS v2", path: "/runs/mfass-v2/" }]} />
      <span className="kick">Independent rewire.it run</span>
      <h1>{run.label}</h1>
      <p className="intro">A corrected baseline and one zero-cost local DNABERT-2 protocol on MFASS. The held-out ranking result is complete.</p>
    </div></header>
    <section className="block first"><div className="wrap prose-brief">
      <div className={styles.notice}><strong>Corrected result.</strong> {run.correction}</div>
      <p>MFASS tests exon recognition in a minigene assay. Of {run.cohort_variants.toLocaleString()} variants, {run.test_variants.toLocaleString()} were held out in {run.independent_test_groups} exon/gene groups; {run.test_positives} were splice-disrupting. The review capacity is {run.review_capacity} variants. <a href={run.assay_source_url} target="_blank" rel="noreferrer">Read the assay paper &rarr;</a></p>
      <h2 className="sec-head">Held-out results</h2>
      <div className={styles.tableScroll}><table><thead><tr><th>Method</th><th>P@100</th><th>AP</th><th>AUROC</th><th>Coverage</th></tr></thead><tbody>
        {run.methods.map((method) => <tr key={method.id}><td><a href={`${run.benchmark_repo_url}/blob/${run.source_revision}/${method.result_file}`}><strong>{method.name}</strong></a></td><td>{fixed(method.precision_at_100)}</td><td>{fixed(method.average_precision)}</td><td>{fixed(method.auroc)}</td><td>{method.coverage}</td></tr>)}
      </tbody></table></div>
      <p>P@100 is the fraction of confirmed disruptions among the first 100 variants; AP is average precision across the ranking; AUROC is the area under the receiver operating characteristic curve.</p>
      <p>The corrected baseline found 61 confirmed disruptions in its first 100. This frozen DNABERT-2 pair-embedding and fixed head found 3; both scored every held-out variant. The unchanged SpliceAI and Pangolin specialist runs use genomic context and have incomplete coverage, so their point metrics are on their scored subsets.</p>
      <h2 className="sec-head">Paired difference</h2>
      <p>Each candidate minus the corrected baseline, on variants both scored. Intervals are 95% group-bootstrap intervals from {run.dnabert_minus_baseline.group_bootstrap_draws.toLocaleString()} draws over whole exon/gene groups.</p>
      <div className={styles.tableScroll}><table><thead><tr><th>Candidate</th><th>Common variants</th><th>P@100 [95% interval]</th><th>AP [95% interval]</th><th>AUROC [95% interval]</th></tr></thead><tbody>
        {run.specialist_comparisons.map((comparison) => <tr key={comparison.name}><td>{comparison.name}</td><td>{comparison.common_variants.toLocaleString()}</td><td>{interval(comparison.precision_at_100)}</td><td>{interval(comparison.average_precision)}</td><td>{interval(comparison.auroc)}</td></tr>)}
        <tr><td>DNABERT-2 minus baseline</td><td>{run.dnabert_minus_baseline.common_variants.toLocaleString()}</td><td>{interval(run.dnabert_minus_baseline.precision_at_100)}</td><td>{interval(run.dnabert_minus_baseline.average_precision)}</td><td>{interval(run.dnabert_minus_baseline.auroc)}</td></tr>
      </tbody></table></div>
      <p>After the correction, SpliceAI&apos;s paired AUROC interval crosses zero; the earlier v1 claim of clear separation is withdrawn. Pangolin still separates from the baseline on AP and AUROC, while P@100 is uncertain. The tested DNABERT-2 protocol falls below the baseline on all three measures.</p>
      <h2 className="sec-head">Protocol and limits</h2>
      <p>{run.methods[0].protocol}</p>
      <p>{run.methods[1].protocol} The model checkpoint is pinned to revision <code>{run.local_run.checkpoint_revision.slice(0, 12)}</code>. The full run took {Math.round(run.local_run.dnabert_end_to_end_seconds / 60)} minutes using {run.local_run.machine}; no paid compute was used.</p>
      <p>The baseline and DNABERT-2 head are supervised on {run.train_variants.toLocaleString()} MFASS training variants, while the specialists are zero-shot on the assay. MFASS measures a functional reporter assay rather than patient RNA or clinical pathogenicity. Exact sequence and exon overlap with DNABERT-2 pretraining has not been checked. SpliceAI and Pangolin use different annotation releases, so their gap cannot be attributed to models alone. This one fixed embedding/head protocol does not establish DNABERT-2&apos;s best achievable result.</p>
      <p><a className="btn btn-primary" href={`https://github.com/rewire-bio/rewire-benchmarks/tree/${run.source_revision}/benchmarks/mfass`}>Reproduce this run <span className="arr">&rarr;</span></a></p>
      <p className={styles.back}><Link href="/runs/mfass-v1/">View the preserved v1 report &rarr;</Link></p>
    </div></section>
  </>;
}
