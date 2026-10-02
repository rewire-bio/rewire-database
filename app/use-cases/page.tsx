import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import UseCaseExplorer from "@/components/catalogue/UseCaseExplorer";
import { buildUseCases } from "@/lib/use-cases-build";
import { socialMetadata } from "@/lib/catalogue-sharing";
import { researchAreaLabel } from "@/lib/omics-browse";
import { evidenceSummaryParts, summariseUseCaseEvidence, type EvidenceSummary } from "@/lib/use-case-summary";
import styles from "@/components/catalogue/UseCases.module.css";

const title = "Biological research use cases | rewire.it";
const description = "Research and clinical research questions guide evidence gathering. Explore collection plans, reviewed model comparisons and the limits of their evidence.";
export const metadata: Metadata = {
  title, description,
  alternates: { canonical: "https://benchmarks.rewirebio.io/use-cases/" },
  ...socialMetadata({ title, description, path: "/use-cases/" }),
};

const EXAMPLE_SLUG = "genetic-perturbation-response";

export default function UseCasesPage() {
  const { query, entries } = buildUseCases();
  const initial = query.list({ limit: 10 });
  const summaries: Record<string, EvidenceSummary> = {};
  const areaCounts: Record<string, number> = {};
  for (const entry of entries) {
    const detail = query.get({ slug: entry.slug });
    if (detail) summaries[entry.slug] = summariseUseCaseEvidence(detail.mappings, entry.evidence_gaps.length);
    areaCounts[entry.area] = (areaCounts[entry.area] || 0) + 1;
  }
  const example = entries.find((entry) => entry.slug === EXAMPLE_SLUG) || entries[0];
  return <>
    <PageHeader
      breadcrumbs={[{ name: "Database", path: "/" }, { name: "Use cases", path: "/use-cases/" }]}
      eyebrow={["Use cases", `${entries.length} ${entries.length === 1 ? "question" : "questions"} in this release`]}
      title="Start from a biological question"
      intro="A use case starts with a research question and your data, then explains the evidence we plan to gather, any model comparisons already collected and what they can establish for your decision."
    >
      <a className={styles.jump} href="#browse-heading">Browse all {entries.length} use cases</a>
    </PageHeader>
    <div className="wrap content">
      <section id="how-it-works" className={styles.section} aria-labelledby="how-it-works-heading">
        <h2 id="how-it-works-heading">What a use case shows</h2>
        <div className={styles.explainer}>
          <ol className={styles.steps}>
            <li><strong>Question and inputs</strong><span>The biological question, who it is for and the data you would start with.</span></li>
            <li><strong>Relevant evaluations</strong><span>Benchmark protocols whose endpoint matches the question directly or only as a proxy.</span></li>
            <li><strong>Tested models and results</strong><span>The exact model configurations and controls evaluated, with the recorded scores and their sources.</span></li>
            <li><strong>Limits and missing evidence</strong><span>What does not transfer to your setting, what has not been measured and how the page was reviewed.</span></li>
          </ol>
          {example && <aside className={styles.example} aria-labelledby="example-heading">
            <p className={styles.tag}>Example · {researchAreaLabel(example.area)}</p>
            <h3 id="example-heading"><a href={`/use-cases/${example.slug}/`}>{example.title}</a></h3>
            <dl>
              <dt>Question</dt><dd>{example.question}</dd>
              <dt>You bring</dt><dd>{example.inputs[0]}</dd>
              {summaries[example.slug] && <><dt>Evidence</dt><dd>{evidenceSummaryParts(summaries[example.slug]).slice(0, 3).join(" · ")}</dd></>}
              {example.evidence_gaps.length > 0 && <><dt>A recorded limit</dt><dd>{example.evidence_gaps.at(-1)}</dd></>}
            </dl>
          </aside>}
        </div>
        <h3>Use cases, benchmarks or models?</h3>
        <dl className={styles.compare}>
          <div><dt>Use cases (this page)</dt><dd>You have a research question and data, and want to know which evaluations and models are relevant.</dd></div>
          <div><dt><a href="/benchmarks/">Benchmarks</a></dt><dd>You want one benchmark&apos;s tasks, protocols, datasets and published results.</dd></div>
          <div><dt><a href="/models/">Models</a></dt><dd>You already know a model and want its evaluations, configurations and how to run it.</dd></div>
        </dl>
        <h3>Research relevance and clinical evidence</h3>
        <p className={styles.muted}>Each question states its setting, endpoint and transfer limitations. A relevant assay result does not by itself establish clinical performance. Clinical research pages explain which patient or workflow questions the available evidence leaves unanswered.</p>
      </section>
      <section className={styles.section} aria-labelledby="browse-heading">
        <h2 id="browse-heading">Browse use cases</h2>
        <UseCaseExplorer initial={initial} summaries={summaries} areaCounts={areaCounts} />
      </section>
      <section className={styles.section} aria-labelledby="about-heading">
        <h2 id="about-heading">About this collection</h2>
        <p>User questions lead evidence gathering. A question can enter this collection before model comparisons have been collected: its plan states what to compare, how to validate it and what to collect next.</p>
        <p>Where reviewed evidence is available, inspect the exact configurations, evaluation protocols and source-linked results. Incompatible protocols remain separate. Review method, research or clinical research scope, and missing evidence stay visible.</p>
        <p><a href="/contribute/">Contribute evidence or a correction</a> · <a href="/evidence/">Evidence and review methods</a></p>
        <details><summary>Release and downloads</summary>
          <p>Release <code>{initial.release_id}</code></p>
          {initial.input_sha256 && <><p>Use-case input digest <code>{initial.input_sha256}</code></p><p><a href={`/omics/releases/${initial.release_id}/use-cases.json`} download>Download questions, collection plans and applicability mappings (JSON)</a></p></>}
          <p><a href={`/omics/releases/${initial.release_id}/manifest.json`}>Release checksums</a></p>
        </details>
      </section>
    </div>
  </>;
}
