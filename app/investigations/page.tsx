import { downloadHref } from "@/lib/downloads";
import type { Metadata } from "next";
import Link from "next/link";
import Breadcrumbs from "@/components/catalogue/Breadcrumbs";
import { socialMetadata } from "@/lib/catalogue-sharing";
import { buildCatalogue } from "@/lib/catalogue-build";
import { InvestigationList } from "@/components/catalogue/ResearchInvestigation";
import { discrepancyHref, investigatedFindings, stateLabel } from "@/lib/discrepancies";
import { safeSourceUrl } from "@/lib/omics";
import styles from "@/components/catalogue/Research.module.css";

const pageMetadata = {
  title: "Discrepancy investigations",
  description: "Reviewed investigations of benchmark discrepancies, including failed explanations, reproducible tests and limits of biological interpretation.",
  alternates: { canonical: "https://benchmarks.rewirebio.io/investigations/" },
};
export const metadata: Metadata = {
  ...pageMetadata,
  ...socialMetadata({
    title: pageMetadata.title,
    description: pageMetadata.description,
    path: pageMetadata.alternates.canonical,
  }),
};

export default function InvestigationsPage() {
  const { catalogue, query } = buildCatalogue();
  const research = query.research();
  const followed = investigatedFindings();
  return <>
    <header className="page-head"><div className="wrap">
      <Breadcrumbs items={[{ name: "Database", path: "/" }, { name: "Investigations", path: "/investigations/" }]} />
      <span className="kick">Evidence and investigation</span>
      <h1>Discrepancy investigations</h1>
      <p className="intro">Examine why benchmark results differ, test possible explanations, and identify which findings need independent evidence.</p>
    </div></header>
    <section className="block first"><div className="wrap">
      <nav className={styles.nav} aria-label="Investigation navigation"><Link href="/">Benchmark database</Link> · <Link href="/?kind=dataset#browse">Dataset readiness</Link> · <Link href="/?kind=evaluation&readiness=analysis#browse">Evaluations ready for investigation</Link> · <Link href="/contested/">Contested results</Link></nav>
      <section className={styles.section}>
        <h2>Reviewed reports</h2>
        <p className={styles.muted}>Release {catalogue.release_id} · {research.investigations.length} reviewed reports</p>
        <InvestigationList reports={research.investigations} />
      </section>
      <section className={styles.section}>
        <h2>Disagreements between studies</h2>
        <p>Each release flags studies that rank models against the order other studies agree on. These automatic leads, and what we are doing about each, are listed under <Link href="/contested/">contested results</Link>.</p>
        {followed.length > 0 && <>
          <p>We have opened an investigation for these:</p>
          <ul>
            {followed.map(({ discrepancy: d, investigation_url }) => <li key={d.id}>
              <Link href={discrepancyHref(d.id)}>{d.label}</Link> · {stateLabel(d.state)}
              {safeSourceUrl(investigation_url) && <> · <a href={safeSourceUrl(investigation_url)}>Investigation</a></>}
            </li>)}
          </ul>
        </>}
      </section>
      <section className={styles.section}>
        <h2>What an investigation establishes</h2>
        <p>A discrepancy can arise from a data error, metric definition, sample population, model limitation or biological context. We check the data and evaluation procedure before interpreting an unexpected score as a biological effect.</p>
        <p>Each report connects its question to exact artifacts, a frozen analysis plan, every attempted explanation and its remaining uncertainty. All current reports are exploratory. Independent biological validation requires a separate study with a hypothesis fixed before examining the validation data.</p>
        <h3>Start with the evidence</h3>
        <p>Dataset and evaluation pages assess four separate capabilities: replay metrics, investigate discrepancies, run locally and validate independently. Missing evidence is listed explicitly. Complete evidence does not imply that the necessary files are installed on your computer.</p>
        <p><Link href="/?kind=dataset#browse">Explore datasets and evidence gaps</Link></p>
        {catalogue.coverage.research_schema_version !== undefined && <p><a href={downloadHref(`/omics/releases/${catalogue.release_id}/research-readiness.json`)}>Download readiness assessments (gzip)</a> · <a href={downloadHref(`/omics/releases/${catalogue.release_id}/research-manifests.json`)}>Artifact manifests (gzip)</a> · <a href={downloadHref(`/omics/releases/${catalogue.release_id}/research-investigations.json`)}>Reviewed reports (gzip)</a></p>}
      </section>
    </div></section>
  </>;
}
