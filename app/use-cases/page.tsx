import type { Metadata } from "next";
import Breadcrumbs from "@/components/catalogue/Breadcrumbs";
import UseCaseExplorer from "@/components/catalogue/UseCaseExplorer";
import { buildUseCases } from "@/lib/use-cases-build";
import { socialMetadata } from "@/lib/catalogue-sharing";
import styles from "@/components/catalogue/UseCases.module.css";

const title = "Biological research use cases | rewire.it";
const description = "Research and clinical research questions guide evidence gathering. Explore collection plans, reviewed model comparisons and the limits of their evidence.";
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
      <p className="intro">Start with your biological question and inputs. Explore the evidence we plan to gather, the comparisons already collected and what they can establish for your decision.</p>
    </div></header>
    <section className="block first"><div className="wrap">
      <div className={styles.section}><UseCaseExplorer initial={initial} /></div>
      <aside className={`${styles.section} ${styles.notice}`}>
        <h2>Research relevance and clinical evidence</h2>
        <p>Each question states its setting, endpoint and transfer limitations. A relevant assay result does not by itself establish clinical performance. Clinical research pages explain which patient or workflow questions the available evidence leaves unanswered.</p>
      </aside>
      <section className={styles.section}>
        <h2>About this collection</h2>
        <p>User questions lead evidence gathering. A question can enter this collection before model comparisons have been collected: its plan states what to compare, how to validate it and what to collect next.</p>
        <p>Where reviewed evidence is available, inspect the exact configurations, evaluation protocols and source-linked results. Incompatible protocols remain separate. Review method, research or clinical research scope, and missing evidence stay visible.</p>
        <p><a href="/contribute/">Contribute evidence or a correction</a> · <a href="/evidence/">Evidence and review methods</a></p>
        <details><summary>Release and downloads</summary>
          <p>Release <code>{initial.release_id}</code></p>
          {initial.input_sha256 && <><p>Use-case input digest <code>{initial.input_sha256}</code></p><p><a href={`/omics/releases/${initial.release_id}/use-cases.json`} download>Download questions, collection plans and applicability mappings (JSON)</a></p></>}
          <p><a href={`/omics/releases/${initial.release_id}/manifest.json`}>Release checksums</a></p>
        </details>
      </section>
    </div></section>
  </>;
}
