import { downloadHref } from "@/lib/downloads";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import { UseCaseCitations, UseCaseReview } from "@/components/catalogue/UseCaseEvidence";
import UseCaseComparison from "@/components/catalogue/UseCaseComparison";
import UseCaseCollectionPlan from "@/components/catalogue/UseCaseCollectionPlan";
import UseCaseArticles from "@/components/catalogue/UseCaseArticles";
import { relatedUseCaseArticles } from "@/lib/use-case-articles";
import { UseCaseReturn } from "@/components/catalogue/UseCaseNavigation";
import SectionNavigation from "@/components/catalogue/SectionNavigation";
import { fullUseCaseDetail } from "@/lib/use-cases-build";
import { researchAreaLabel } from "@/lib/omics-browse";
import { socialMetadata } from "@/lib/catalogue-sharing";
import { evidenceCountParts, summariseUseCaseEvidence, summaryParagraphs } from "@/lib/use-case-summary";
import { buildCatalogue } from "@/lib/catalogue-build";
import { buildComparisons, heldJudgements, methodTypeLabel, toolsCompared } from "@/lib/use-case-comparisons";
import styles from "@/components/catalogue/UseCases.module.css";

type Params = { slug: string };
export function generateMetadata({ params }: { params: Params }): Metadata {
  const detail = fullUseCaseDetail(params.slug);
  if (!detail) return {};
  const title = `${detail.use_case.title} | rewirebio.io`;
  const description = detail.use_case.question;
  const path = `/use-cases/${detail.use_case.slug}/`;
  return { title, description, alternates: { canonical: `https://benchmarks.rewirebio.io${path}` }, ...socialMetadata({ title, description, path }) };
}

export default function UseCasePage({ params }: { params: Params }) {
  const detail = fullUseCaseDetail(params.slug);
  if (!detail) notFound();
  const entry = detail.use_case;
  const path = `/use-cases/${entry.slug}/`;
  const clinical = entry.contexts.includes("clinical_research");
  const summary = summariseUseCaseEvidence(detail.mappings, entry.evidence_gaps.length);
  const comparisons = buildComparisons(detail.mappings);
  const held = heldJudgements(detail.mappings);
  const { query } = buildCatalogue();
  const tools = toolsCompared(comparisons, (id) => query.record?.(id) ?? null);
  const configurations = new Set(comparisons.flatMap((c) => c.rows.map((r) => r.id))).size;
  // A plain-language summary of the evidence, reviewed like any other claim (older releases have none).
  const evidenceSummary = (entry as typeof entry & { summary?: { text: string; status: "reviewed" | "draft" } }).summary;
  const sections = [
    ...(evidenceSummary ? [{ id: "summary", label: "What the evidence shows" }] : []),
    ...(tools.length ? [{ id: "tools", label: "Tools compared" }] : []),
    { id: "evidence", label: "Comparisons" },
    ...(held.length ? [{ id: "held", label: "Held for review" }] : []),
    { id: "gaps", label: "Not covered yet" },
    // With no comparison yet, the collection plan is the main content, so it gets its own section.
    ...(entry.collection_plan && !comparisons.length ? [{ id: "collection-plan", label: "Evidence collection plan" }] : []),
    { id: "details", label: "Question, sources and review" },
  ];
  // After the summary, so the answer comes first on a phone; the index shows the same inputs as a list.
  const cards = <dl className={styles.cardsRow}>
    <div><dt>You bring</dt><dd><ul className={styles.bringList}>{entry.inputs.map((input) => <li key={input}>{input}</li>)}</ul></dd></div>
    <div><dt>You want</dt><dd>{entry.output}</dd></div>
    <div><dt>Evidence in this release</dt><dd>
      {/* The same counts as the index cards, plus configurations when tools have several. */}
      {[...evidenceCountParts(summary), ...(configurations > tools.length ? [`${configurations} configurations`] : [])].join(" · ")}
    </dd></div>
  </dl>;
  const heading = (id: string) => sections.find((section) => section.id === id)!.label;
  return <>
    <PageHeader
      breadcrumbs={[{ name: "Database", path: "/" }, { name: "Use cases", path: "/use-cases/" }, { name: entry.title, path }]}
      breadcrumbLinks={{ "/use-cases/": <UseCaseReturn label="Use cases" /> }}
      eyebrow={["Use case", researchAreaLabel(entry.area), clinical ? "Research and clinical research" : "Research only"]}
      title={entry.title}
      intro={entry.question}
    />
    <div className="wrap">
      <SectionNavigation sections={sections} />
      <div className={`content ${styles.detail}`}>
        {evidenceSummary && <section id="summary" className={styles.section}>
          <h2>{heading("summary")} {evidenceSummary.status === "draft" && <span className={styles.draftBadge}>Draft summary, pending review</span>}</h2>
          <div className={styles.summaryBox}>{summaryParagraphs(evidenceSummary.text).map((paragraph, i) => <p key={i} className={i === 0 ? styles.summaryLead : undefined}>{paragraph}</p>)}</div>
        </section>}
        {cards}
        {tools.length > 0 && <section id="tools" className={styles.section}>
          <h2>{heading("tools")}</h2>
          <ul className={styles.toolList}>
            {tools.map((tool) => <li key={tool.id}>
              <a href={`${tool.href}?return_to=${encodeURIComponent(path)}`}>{tool.name}</a>
              <span className={styles.srOnly}>, </span>
              <span className={styles.toolMeta}>
                {tool.methodTypes.length ? tool.methodTypes.map(methodTypeLabel).join(", ") : "type not recorded"}
                {tool.configurations > 1 && `, ${tool.configurations} configurations`}
              </span>
            </li>)}
          </ul>
        </section>}
        <section id="evidence" className={styles.section}>
          <h2>{heading("evidence")}</h2>
          <p>Each table is one study or protocol with its own truth set and scoring. Compare tools within a table, not across tables.</p>
          {comparisons.length
            ? comparisons.map((comparison) => <UseCaseComparison key={comparison.id} comparison={comparison} useCasePath={path} />)
            : <div className={styles.notice}><p>No model comparison has been collected for this question yet.</p><p>Relevant methods and studies may exist outside this collection.</p></div>}
        </section>
        {held.length > 0 && <section id="held" className={styles.section}>
          <h2>{heading("held")}</h2>
          <p>Recorded but not shown as evidence until the reason below is resolved.</p>
          <div className={styles.heldGrid}>
            {held.map((h) => <article key={h.id}><h3>{h.title}</h3><p className={styles.muted}>{h.reason}</p></article>)}
          </div>
        </section>}
        <section id="gaps" className={styles.section}>
          <h2>{heading("gaps")}</h2>
          {entry.evidence_gaps.length ? <ul>{entry.evidence_gaps.map((gap) => <li key={gap}>{gap}</li>)}</ul> : <p>No gaps are recorded. This does not establish complete validation.</p>}
          {entry.planned_work.length > 0 && <ul>{entry.planned_work.map((work) => <li key={work.url}><a href={work.url}>{work.title} ↗</a> ({work.status === "blocked" ? "blocked" : "planned"})</li>)}</ul>}
          <p><a href="/contribute/">Contribute evidence or propose a correction</a></p>
        </section>
        {entry.collection_plan && !comparisons.length && <UseCaseCollectionPlan plan={entry.collection_plan} summary={summary} />}
        <section id="details" className={styles.section}>
          <h2>{heading("details")}</h2>
          <details>
            <summary>Who this is for, setting and exclusions</summary>
            <p className={styles.lead}>{entry.decision}</p>
            <dl className={styles.facts}>
              <div><dt>Who this is for</dt><dd><ul>{entry.intended_users.map((user) => <li key={user}>{user}</li>)}</ul></dd></div>
              <div><dt>Biological setting</dt><dd>{entry.setting}</dd></div>
              <div id="clinical-scope" className={styles.wide}><dt>{clinical ? "Clinical research scope" : "Research setting"}</dt><dd>{entry.clinical_scope}</dd></div>
            </dl>
            {entry.exclusions.length > 0 && <><h3>Outside this use case</h3><ul>{entry.exclusions.map((exclusion) => <li key={exclusion}>{exclusion}</li>)}</ul></>}
          </details>
          {entry.collection_plan && comparisons.length > 0 && <details><summary>Evidence collection plan</summary><UseCaseCollectionPlan plan={entry.collection_plan} summary={summary} /></details>}
          {relatedUseCaseArticles(entry.slug).length > 0 && <details><summary>Related articles</summary><UseCaseArticles slug={entry.slug} /></details>}
          <details>
            <summary>Sources, review and downloads</summary>
            <UseCaseReview review={entry.review} />
            <UseCaseCitations citations={entry.citations} sources={detail.sources} useCasePath={path} />
            <p>Release <code>{detail.release_id}</code> · question <code>{entry.id}</code></p>
            <p>Use-case input digest <code>{detail.input_sha256}</code></p>
            <p><a href={downloadHref(`/omics/releases/${detail.release_id}/use-cases.json`)}>Download questions and review metadata (JSON) (gzip)</a> · <a href={downloadHref(`/omics/releases/${detail.release_id}/manifest.json`)}>Verify release checksums (gzip)</a></p>
          </details>
        </section>
      </div>
    </div>
  </>;
}
