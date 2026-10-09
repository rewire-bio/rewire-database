import Link from "next/link";
import { Fragment } from "react";
import type { ResearchInvestigation as Investigation } from "@/shared/omics/research";
import { isReviewedInvestigation } from "@/shared/omics/research";
import { recordHref, safeSourceUrl, type OmicsRecord } from "@/lib/omics";
import { researchDate, researchOutcomeLabel } from "./ResearchLabels";
import styles from "./Research.module.css";

export const investigationHref = (id: string) => `/investigations/${id}/`;

export function InvestigationClaim() {
  return <p className={styles.notice}>Exploratory investigation: the data was used to develop or inspect the explanation. Human review checks the evidence and interpretation; it does not establish independent biological validation.</p>;
}

export function InvestigationList({ reports }: { reports: Investigation[] }) {
  const reviewed = reports.filter((report) => isReviewedInvestigation(report) && report.claim_level === "exploratory");
  if (!reviewed.length) return <p>No reviewed investigations are available in this release. Completed and staged runs become public only after their evidence and interpretation have been reviewed.</p>;
  return <div className={styles.grid}>{reviewed.map((report) => (
    <article key={report.id} className={styles.card}>
      <span className={styles.status}>Exploratory · {report.status}</span>
      <h3><Link href={investigationHref(report.id)}>{report.title}</Link></h3>
      <p>{report.question}</p>
      <p>{researchOutcomeLabel(report.outcome)}</p>
      <p className={styles.muted}>Reviewed {researchDate(report.review.reviewed_at)} · {report.attempts.length} recorded {report.attempts.length === 1 ? "attempt" : "attempts"}</p>
    </article>
  ))}</div>;
}

function EvidenceValue({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === "") return <>Not recorded</>;
  if (Array.isArray(value)) return value.length ? <ul className={styles.list}>{value.map((item, i) => <li key={i}><EvidenceValue value={item} /></li>)}</ul> : <>None recorded</>;
  if (typeof value === "object") return <dl className={styles.details}>{Object.entries(value).map(([key, item]) => <Fragment key={key}><dt>{key.replace(/_/g, " ")}</dt><dd><EvidenceValue value={item} /></dd></Fragment>)}</dl>;
  return <>{String(value)}</>;
}

export default function ResearchInvestigation({ report, records = [] }: { report: Investigation; records?: OmicsRecord[] }) {
  // Defence in depth: staged and rejected reports cannot render on a public route.
  if (!isReviewedInvestigation(report) || report.claim_level !== "exploratory") return null;
  const questionDesign = report.specs.find(spec => spec.question_design)?.question_design || report.question_design_artifact?.design;
  return (
    <>
      <InvestigationClaim />
      <section className={styles.section} aria-labelledby="question-title">
        <h2 id="question-title">Question and discrepancy</h2>
        <p>{report.question}</p>
        <h3>Outcome</h3><p>{researchOutcomeLabel(report.outcome)}</p>
        <p className={styles.muted}>Execution: {report.status} · Evidence release {report.catalogue_release_id}</p>
        {records.length > 0 && <ul className={styles.list}>{records.map((record) => <li key={record.id}><Link href={recordHref(record)}>{record.name}</Link> · {record.kind.replace(/_/g, " ")}</li>)}</ul>}
      </section>
      {questionDesign && <section className={styles.section} aria-labelledby="question-design-title">
        <h2 id="question-design-title">Research question selection</h2>
        <p>Candidate questions and the evidence that would support or contradict them were recorded before planning the tests. Novelty has not been verified; independent validation below is proposed work.</p>
        <p>{questionDesign.selected_candidate_id === null ? "No candidate could be tested with the available evidence and operations." : "Selection rationale:"} {questionDesign.selection_reason}</p>
        {questionDesign.candidates.map(candidate => <details key={candidate.id} className={styles.disclosure} open={candidate.id === questionDesign.selected_candidate_id}>
          <summary>{candidate.id === questionDesign.selected_candidate_id ? "Selected question" : "Alternative question"}: {candidate.question}</summary>
          <dl className={styles.details}>
            <dt>Population</dt><dd>{candidate.population}</dd>
            <dt>Comparison</dt><dd>{candidate.comparison}</dd>
            <dt>Outcome</dt><dd>{candidate.outcome}</dd>
            <dt>Hypothesis</dt><dd>{candidate.hypothesis}</dd>
            <dt>Competing explanation</dt><dd>{candidate.alternative_explanation}</dd>
            <dt>Supporting result</dt><dd>{candidate.supporting_result}</dd>
            <dt>Contradicting result</dt><dd>{candidate.contradicting_result}</dd>
            <dt>Confounders</dt><dd><EvidenceValue value={candidate.confounders} /></dd>
            <dt>Scientific value</dt><dd>{candidate.why_interesting}</dd>
            <dt>Missing evidence</dt><dd><EvidenceValue value={candidate.missing_evidence} /></dd>
            <dt>Independent validation needed</dt><dd>{candidate.validation_needed}</dd>
            {candidate.decisive_test && <><dt>Decisive test</dt><dd>{candidate.decisive_test.expected_observation}</dd></>}
            {candidate.blocker && <><dt>Blocker</dt><dd>{candidate.blocker}</dd></>}
          </dl>
        </details>)}
      </section>}
      <section className={styles.section} aria-labelledby="plan-title">
        <h2 id="plan-title">Frozen test plans</h2>
        <p>The plan checksum identifies the registered analysis. Hypotheses, test choices and stopping rules were saved before execution.</p>
        <p className={styles.muted}>Plan SHA-256: <code>{report.plan_sha256}</code></p>
        {report.specs.map((spec) => <article key={spec.id} className={styles.artifact}>
          <h3>{spec.round === 0 ? "Initial plan" : `Follow-up plan ${spec.round}`}</h3>
          <p className={styles.muted}>Frozen {researchDate(spec.created_at)} · {spec.id}</p>
          {spec.plan.hypotheses.map((hypothesis) => <div key={hypothesis.id} className={styles.card}>
            <h3>{hypothesis.explanation}</h3>
            <ul className={styles.list}>{hypothesis.tests.map((test) => <li key={test.id}>
              <strong>{test.kind.replace(/_/g, " ")}</strong>: {test.expected_observation}
              <span className={styles.muted}> · Test {test.id}{test.metric ? ` · ${test.metric}` : ""}{test.field ? ` · ${test.field}` : ""}</span>
            </li>)}</ul>
          </div>)}
          <p>Stopping rule: {spec.plan.stopping_rule}</p>
          <p>Inference: {spec.plan.multiple_testing.replace(/_/g, " ")}. Data exposure: {spec.exposure.previously_exposed ? "previously examined" : "recorded for exploration"}.</p>
        </article>)}
        {!report.specs.length && <p>No frozen specification is included in this report.</p>}
      </section>
      <section className={styles.section} aria-labelledby="attempts-title">
        <h2 id="attempts-title">All attempts and explanations</h2>
        <p>Every exported attempt is retained below, including unsuccessful and inconclusive tests. Execution status describes whether a test ran; the receipt and findings describe whether an explanation survived.</p>
        {!report.attempts.length && <p>No executed attempts are recorded. This report cannot establish a tested explanation.</p>}
        {report.attempts.map((attempt, i) => (
          <article key={i} className={styles.artifact}>
            <h3>Attempt {i + 1}: {attempt.operation.kind.replace(/_/g, " ")}</h3>
            <p><strong>{attempt.status}</strong> · Test {attempt.operation.id}</p>
            <p>Expected observation: {attempt.operation.expected_observation}</p>
            {attempt.error && <p>{attempt.error}</p>}
            {attempt.receipt && <><h3>Observation and numerical evidence</h3><EvidenceValue value={attempt.receipt.numerical} />
              {attempt.receipt.limitations.length > 0 && <ul className={styles.list}>{attempt.receipt.limitations.map((limitation, i) => <li key={i}>{limitation}</li>)}</ul>}
            </>}
            <details className={styles.disclosure}><summary>Complete execution receipt</summary><EvidenceValue value={attempt} /></details>
          </article>
        ))}
      </section>
      <section className={styles.section} aria-labelledby="findings-title">
        <h2 id="findings-title">Findings</h2>
        {report.findings.length ? <ul className={styles.list}>{report.findings.map((finding, i) => <li key={i}>{finding}</li>)}</ul> : <p>No supported finding is recorded.</p>}
        <h3>Limitations and remaining uncertainty</h3>
        {report.limitations.length ? <ul className={styles.list}>{report.limitations.map((limitation, i) => <li key={i}>{limitation}</li>)}</ul> : <p>No limitations are recorded in this report.</p>}
      </section>
      <section className={styles.section} aria-labelledby="reproduction-title">
        <h2 id="reproduction-title">Reproduction and review</h2>
        <p>Compare the recorded file checksums before replaying a test. Artifact links describe the reviewed evidence; restricted or locally resolved files may not be downloadable here.</p>
        {!report.artifacts.length && <p>No public reproduction artifact is attached.</p>}
        {report.artifacts.map((artifact) => (
          <div key={artifact.id} className={styles.artifact}>
            <h3>{artifact.id}</h3><p>{artifact.role.replace(/_/g, " ")} · {artifact.format}</p>
            {safeSourceUrl(artifact.uri) ? <p><a href={safeSourceUrl(artifact.uri)}>Read artifact</a></p> : <p>No public download is attached.</p>}
            <p className={styles.muted}>File SHA-256: <code>{artifact.sha256}</code></p>
            {artifact.semantic_sha256 && <p className={styles.muted}>Semantic SHA-256: <code>{artifact.semantic_sha256}</code></p>}
          </div>
        ))}
        <p>Reviewed by {report.review.reviewer_label} on {researchDate(report.review.reviewed_at)}. Review method: {report.review.method.replace(/_/g, " ")}.</p>
        <p className={styles.muted}>Created {researchDate(report.created_at)} · Manifest {report.manifest_id}</p>
        {report.execution && <details className={styles.disclosure}><summary>Code and model lineage</summary><EvidenceValue value={report.execution} /></details>}
      </section>
    </>
  );
}
