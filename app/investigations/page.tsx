import type { Metadata } from "next";
import Link from "next/link";
import { buildCatalogue } from "@/lib/catalogue-build";
import { getResearch } from "@/services/omics/src/research";
import { InvestigationList } from "@/components/catalogue/ResearchInvestigation";
import styles from "@/components/catalogue/Research.module.css";

export const metadata: Metadata = {
  title: "Discrepancy investigations",
  description: "Reviewed investigations of benchmark discrepancies, including failed explanations, reproducible tests and limits of biological interpretation.",
  alternates: { canonical: "https://benchmarks.rewirebio.io/investigations/" },
};

export default function InvestigationsPage() {
  const { catalogue } = buildCatalogue();
  const research = getResearch(catalogue);
  return <>
    <header className="page-head"><div className="wrap">
      <span className="kick">Evidence and investigation</span>
      <h1>Discrepancy investigations</h1>
      <p className="intro">Examine why benchmark results differ, test possible explanations, and identify which findings need independent evidence.</p>
    </div></header>
    <section className="block first"><div className="wrap">
      <nav aria-label="Investigation navigation"><Link href="/">Benchmark database</Link> · <Link href="/?kind=dataset#browse">Dataset readiness</Link> · <Link href="/?kind=evaluation&readiness=analysis#browse">Evaluations ready for investigation</Link></nav>
      <section className={styles.section}>
        <h2>Reviewed reports</h2>
        <p className={styles.muted}>Release {catalogue.release_id} · {research.investigations.length} reviewed reports</p>
        <InvestigationList reports={research.investigations} />
      </section>
      <section className={styles.section}>
        <h2>What an investigation establishes</h2>
        <p>A discrepancy can arise from a data error, metric definition, sample population, model limitation or biological context. We check the data and evaluation procedure before interpreting an unexpected score as a biological effect.</p>
        <p>Each report connects its question to exact artifacts, a frozen analysis plan, every attempted explanation and its remaining uncertainty. All current reports are exploratory. Independent biological validation requires a separate study with a hypothesis fixed before examining the validation data.</p>
        <h3>Start with the evidence</h3>
        <p>Dataset and evaluation pages assess four separate capabilities: replay metrics, investigate discrepancies, run locally and validate independently. Missing evidence is listed explicitly. Complete evidence does not imply that the necessary files are installed on your computer.</p>
        <p><Link href="/?kind=dataset#browse">Explore datasets and evidence gaps</Link></p>
        {catalogue.research && <p><a href={`/omics/releases/${catalogue.release_id}/research-readiness.json`}>Download readiness assessments</a> · <a href={`/omics/releases/${catalogue.release_id}/research-manifests.json`}>Artifact manifests</a> · <a href={`/omics/releases/${catalogue.release_id}/research-investigations.json`}>Reviewed reports</a></p>}
      </section>
    </div></section>
  </>;
}
