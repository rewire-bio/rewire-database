import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import UseCaseEvidence, { UseCaseCitations, UseCaseReview, type ExecutionLink } from "@/components/catalogue/UseCaseEvidence";
import UseCaseCollectionPlan from "@/components/catalogue/UseCaseCollectionPlan";
import { UseCaseReturn } from "@/components/catalogue/UseCaseNavigation";
import SectionNavigation from "@/components/catalogue/SectionNavigation";
import { buildUseCases } from "@/lib/use-cases-build";
import { buildCatalogue } from "@/lib/catalogue-build";
import { recordHref } from "@/lib/omics";
import { researchAreaLabel } from "@/lib/omics-browse";
import { socialMetadata } from "@/lib/catalogue-sharing";
import { evidenceSummaryParts, summariseUseCaseEvidence } from "@/lib/use-case-summary";
import { reproductionSchema } from "@/services/omics/src/run-recipe";
import styles from "@/components/catalogue/UseCases.module.css";

type Params = { slug: string };
export function generateStaticParams() { return buildUseCases().entries.map(({ slug }) => ({ slug })); }
export function generateMetadata({ params }: { params: Params }): Metadata {
  const detail = buildUseCases().query.get({ slug: params.slug });
  if (!detail) return {};
  const title = `${detail.use_case.title} | rewire.it`;
  const description = detail.use_case.question;
  const path = `/use-cases/${detail.use_case.slug}/`;
  return { title, description, alternates: { canonical: `https://benchmarks.rewirebio.io${path}` }, ...socialMetadata({ title, description, path }) };
}

export default function UseCasePage({ params }: { params: Params }) {
  const detail = buildUseCases().query.get({ slug: params.slug });
  if (!detail) notFound();
  const entry = detail.use_case;
  const path = `/use-cases/${entry.slug}/`;
  const executionLinks: Record<string, ExecutionLink> = {};
  const { query } = buildCatalogue();
  for (const mapping of detail.mappings) for (const { evaluation } of mapping.evaluations) {
    const parsed = reproductionSchema.safeParse(evaluation.attributes.reproduction);
    if (!parsed.success) continue;
    const owner = query.get({ id: parsed.data.recipe_owner_id, include_comparisons: false })?.record;
    if (owner) executionLinks[evaluation.id] = {
      href: `${recordHref(owner)}?recipe=${encodeURIComponent(parsed.data.recipe_id)}#run-recipes`,
      label: parsed.data.applicability === "rescore_predictions" ? "Recipe: recompute metrics from existing predictions" : "Recipe: generate and evaluate predictions",
      explanation: parsed.data.explanation,
    };
  }
  const clinical = entry.contexts.includes("clinical_research");
  const summary = summariseUseCaseEvidence(detail.mappings, entry.evidence_gaps.length);
  // Navigation labels are the section headings, so the two cannot drift apart.
  const sections = [
    ...(entry.collection_plan ? [{ id: "collection-plan", label: "Evidence collection plan" }] : []),
    { id: "question", label: "Question and applicability" },
    { id: "inputs", label: "Inputs and expected output" },
    ...(clinical ? [{ id: "clinical-scope", label: "Clinical research scope" }] : []),
    { id: "evidence", label: "Evaluated evidence" },
    { id: "gaps", label: "Limitations and missing evidence" },
    { id: "sources", label: "Sources and review" },
  ];
  const heading = (id: string) => sections.find((section) => section.id === id)!.label;
  return <>
    <PageHeader
      breadcrumbs={[{ name: "Database", path: "/" }, { name: "Use cases", path: "/use-cases/" }, { name: entry.title, path }]}
      breadcrumbLinks={{ "/use-cases/": <UseCaseReturn label="Use cases" /> }}
      eyebrow={["Use case", researchAreaLabel(entry.area), clinical ? "Research and clinical research" : "Research only"]}
      title={entry.title}
      intro={entry.question}
    >
      <p className={styles.summary}><span className={styles.summaryLabel}>In this release</span> {evidenceSummaryParts(summary).join(" · ")}</p>
    </PageHeader>
    <div className="wrap">
      <SectionNavigation sections={sections} />
      <div className={`content ${styles.detail}`}>
        {entry.collection_plan && <UseCaseCollectionPlan plan={entry.collection_plan} />}
        <section id="question" className={styles.section}>
          <h2>{heading("question")}</h2>
          <p className={styles.lead}>{entry.decision}</p>
          <dl className={styles.facts}>
            <div><dt>Who this is for</dt><dd><ul>{entry.intended_users.map((user) => <li key={user}>{user}</li>)}</ul></dd></div>
            <div id={clinical ? undefined : "clinical-scope"}><dt>Research setting</dt><dd>
              {clinical ? <p>Research and clinical research. See <a href="#clinical-scope">{heading("clinical-scope")}</a> for what the evidence does not establish.</p>
                : <><p>Research</p><p className={styles.muted}>{entry.clinical_scope}</p></>}
            </dd></div>
            <div className={styles.wide}><dt>Biological setting</dt><dd>{entry.setting}</dd></div>
          </dl>
          {entry.exclusions.length > 0 && <><h3>Outside this use case</h3><ul>{entry.exclusions.map((exclusion) => <li key={exclusion}>{exclusion}</li>)}</ul></>}
        </section>
        <section id="inputs" className={styles.section}>
          <h2>{heading("inputs")}</h2>
          <h3>Inputs you need</h3>
          <ul>{entry.inputs.map((input) => <li key={input}>{input}</li>)}</ul>
          <h3>Expected output</h3>
          <p>{entry.output}</p>
        </section>
        {clinical && <section id="clinical-scope" className={styles.section}>
          <h2>{heading("clinical-scope")}</h2>
          <div className={styles.notice}><p>{entry.clinical_scope}</p></div>
        </section>}
        <section id="evidence" className={styles.section}>
          <h2>{heading("evidence")}</h2>
          <p>Evidence is grouped by its protocol. Relevance refers to the stated endpoint and context; it is separate from clinical validation and from the review method. Limits specific to each evaluation are listed with it.</p>
          {detail.mappings.length ? detail.mappings.map((mapping) => <UseCaseEvidence key={mapping.id} mapping={mapping} useCasePath={path} executionLinks={executionLinks} />) : <div className={styles.notice}><p>No model comparison has been collected for this question yet.</p><p>Relevant methods and studies may exist outside this collection.</p>{entry.collection_plan && <p><a href="#collection-plan">View the evidence plan and next collection task</a></p>}</div>}
        </section>
        <section id="gaps" className={styles.section}>
          <h2>{heading("gaps")}</h2>
          <p>These gaps apply to the question as a whole. Absence of evidence is not a zero score.</p>
          {entry.evidence_gaps.length ? <ul>{entry.evidence_gaps.map((gap) => <li key={gap}>{gap}</li>)}</ul> : <p>No additional gaps are recorded. This does not establish complete validation.</p>}
          {entry.planned_work.length > 0 && <><h3>Planned work</h3><p>These plans do not contribute measured results or evaluated winners above.</p>
            {entry.planned_work.map((work) => <article key={work.url} className={styles.mapping}><h4><a href={work.url}>{work.title} ↗</a></h4><p><strong>{work.status === "blocked" ? "Execution blocked" : "Planned"}</strong> · {work.reason}</p></article>)}
          </>}
          <p><a href="/contribute/">Contribute evidence or propose a correction</a></p>
        </section>
        <section id="sources" className={styles.section}>
          <h2>{heading("sources")}</h2><UseCaseReview review={entry.review} />
          <UseCaseCitations citations={entry.citations} sources={detail.sources} useCasePath={path} />
          <details><summary>Release provenance and downloads</summary>
            <p>Release <code>{detail.release_id}</code></p><p>Use-case input digest <code>{detail.input_sha256}</code></p>
            <p><a href={`/omics/releases/${detail.release_id}/use-cases.json`} download>Download questions, collection plans and review metadata (JSON)</a> · <a href={`/omics/releases/${detail.release_id}/manifest.json`}>Verify release checksums</a></p>
            <p>Question <code>{entry.id}</code>. Any numerical results on this page come from this release&apos;s existing evaluation records.</p>
          </details>
        </section>
      </div>
    </div>
  </>;
}
