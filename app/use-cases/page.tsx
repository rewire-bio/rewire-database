import type { Metadata } from "next";
import Breadcrumbs from "@/components/catalogue/Breadcrumbs";
import UseCaseExplorer from "@/components/catalogue/UseCaseExplorer";
import { buildUseCases } from "@/lib/use-cases-build";
import { socialMetadata } from "@/lib/catalogue-sharing";
import styles from "@/components/catalogue/UseCases.module.css";

const title = "Biological research use cases | rewire.it";
const description = "Start with a biological question. Find relevant benchmarks, evaluated model configurations, execution methods and the limits of their evidence.";
export const metadata: Metadata = {
  title, description,
  alternates: { canonical: "https://benchmarks.rewire.it/use-cases/" },
  ...socialMetadata({ title, description, path: "/use-cases/" }),
};

export default function UseCasesPage() {
  const { query } = buildUseCases();
  const initial = query.list({ limit: 10 });
  return <>
    <header className="page-head"><div className="wrap">
      <Breadcrumbs items={[{ name: "Database", path: "/" }, { name: "Use cases", path: "/use-cases/" }]} />
      <span className="kick">Questions, methods and evidence</span>
      <h1>What are you trying to find out?</h1>
      <p className="intro">Start with your biological question and inputs. Inspect the evaluations that inform it, the exact configurations tested and the evidence still missing.</p>
    </div></header>
    <section className="block first"><div className="wrap">
      <div className={styles.section}><UseCaseExplorer initial={initial} /></div>
      <aside className={`${styles.section} ${styles.notice}`}>
        <h2>Research relevance and clinical evidence</h2>
        <p>Each question states its setting, endpoint and transfer limitations. A relevant assay result does not by itself establish clinical performance. Clinical research pages explain which patient or workflow questions the available evidence leaves unanswered.</p>
      </aside>
      <section className={styles.section}>
        <h2>About this collection</h2>
        <p>Use cases connect a research decision to existing tasks, evaluation protocols and source-linked results. They do not combine incompatible protocols into one ranking. Review method and missing evidence remain visible on every page.</p>
        <p><a href="/contribute/">Contribute evidence or a correction</a> · <a href="/evidence/">Evidence and review methods</a></p>
        <details><summary>Release and downloads</summary>
          <p>Release <code>{initial.release_id}</code></p>
          {initial.input_sha256 && <><p>Use-case input digest <code>{initial.input_sha256}</code></p><p><a href={`/omics/releases/${initial.release_id}/use-cases.json`} download>Download use cases and applicability mappings (JSON)</a></p></>}
          <p><a href={`/omics/releases/${initial.release_id}/manifest.json`}>Release checksums</a></p>
        </details>
      </section>
    </div></section>
  </>;
}
