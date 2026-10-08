import { downloadHref } from "@/lib/downloads";
import type { Citation, ResolvedMapping, Review } from "@/services/omics/src/use-cases";
import type { CatalogueRecord } from "@/services/omics/src/catalogue-query";
import { catalogueText } from "@/lib/catalogue-text";
import { displayValue, originLabel, recordHref, safeSourceUrl } from "@/lib/omics";
import { statusLabel, explorerPrintedScore } from "@/lib/omics-browse";
import { formatScore } from "@/lib/score-display";
import { UseCaseRecordLink } from "./UseCaseNavigation";
import styles from "./UseCases.module.css";

export function UseCaseReview({ review }: { review: Review }) {
  return <>
    <p className={styles.muted}>{review.method === "automated_source_review" ? "Automated source review" : "Human domain review"} · {review.reviewed_at.slice(0, 10)} · {review.actor}</p>
    <p className={styles.muted}>{review.note}</p>
  </>;
}

export function UseCaseCitations({ citations, sources, useCasePath }: { citations: Citation[]; sources: CatalogueRecord[]; useCasePath: string }) {
  const byId = new Map(sources.map((source) => [source.id, source]));
  return <ul className={styles.sources}>
    {citations.map((citation, index) => {
      const source = byId.get(citation.source_id);
      const location = source && safeSourceUrl(source.attributes.url);
      const original = source && safeSourceUrl(source.attributes.original_url);
      return <li key={`${citation.source_id}-${index}`}>
        {source ? <UseCaseRecordLink href={recordHref(source)} useCasePath={useCasePath}>{catalogueText(source.name)}</UseCaseRecordLink> : citation.source_id}
        {location && <> · <a href={location}>{original ? "Reviewed source copy" : "Original source"} ↗</a></>}
        {original && <> · <a href={original}>Original repository location ↗</a></>}
        <code>{citation.locator}</code>
      </li>;
    })}
  </ul>;
}

export type ExecutionLink = { href: string; label: string; explanation: string };

const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
function Resources({ evaluation }: { evaluation: CatalogueRecord }) {
  const execution = object(evaluation.attributes.execution);
  const timing = object(evaluation.attributes.timing_seconds);
  const adapter = object(execution.adapter_provenance);
  const measured = typeof execution.inference_and_fit_seconds === "number" || typeof timing.evaluation === "number";
  return <>
    {measured ? <>
      {typeof execution.inference_and_fit_seconds === "number" && <p>Inference and fit section: {formatScore(execution.inference_and_fit_seconds)} s.</p>}
      {typeof timing.evaluation === "number" && <p>Metric evaluation section: {formatScore(timing.evaluation)} s.</p>}
      <p>Device: {displayValue(adapter.device)}. Batch size: {displayValue(execution.batch_size)}.</p>
      <p>These timings describe the recorded sections of this run, not total runtime or a general hardware benchmark. Peak memory is not reported.</p>
    </> : <p>Runtime and memory measurements are not reported in this evaluation. A study budget is not a runtime or memory measurement.</p>}
  </>;
}

const relevanceLabels = {
  direct: "Direct evidence for the stated endpoint",
  proxy: "Proxy evidence: transfer to this question is limited",
  outside_scope: "Outside the assessed scope",
  not_assessed: "Applicability not assessed",
};
const lifecycleLabels = {
  draft: "Draft mapping — not current applicability evidence",
  active: "Current source-reviewed mapping",
  needs_review: "Evidence changed — applicability needs review",
  withdrawn: "Withdrawn mapping",
  superseded: "Superseded mapping",
};

export default function UseCaseEvidence({ mapping, useCasePath, executionLinks }: {
  mapping: ResolvedMapping;
  useCasePath: string;
  executionLinks: Record<string, ExecutionLink>;
}) {
  const active = mapping.lifecycle === "active";
  const supportsEvidence = active && (mapping.relevance === "direct" || mapping.relevance === "proxy");
  const title = mapping.protocol ? catalogueText(mapping.protocol.name) : lifecycleLabels[mapping.lifecycle];
  const protocolInstructions = mapping.protocol && safeSourceUrl(mapping.protocol.attributes.reproduction_url);
  return <article className={styles.mapping} id={`mapping-${mapping.id}`}>
    <h3>{title}</h3>
    <p className={styles.muted}>{lifecycleLabels[mapping.lifecycle]}</p>
    {!active ? <div className={styles.notice}>
      <p>{mapping.reason}</p>
      <p>This mapping does not support a current applicability claim or a result comparison.</p>
      {mapping.prior_release_id && <p><a href={downloadHref(`/omics/releases/${mapping.prior_release_id}/use-cases.json`)}>Inspect the previous release&apos;s mapping evidence (gzip)</a></p>}
    </div> : <>
      <p><strong>{mapping.relevance && relevanceLabels[mapping.relevance]}</strong></p>
      <p>{mapping.rationale}</p>
      <dl className={styles.fields}>
        <dt>Assessed endpoint</dt><dd>{mapping.endpoint}</dd>
        <dt>Evaluation protocol</dt><dd>{mapping.protocol && <UseCaseRecordLink href={recordHref(mapping.protocol)} useCasePath={useCasePath}>{catalogueText(mapping.protocol.name)}</UseCaseRecordLink>}</dd>
        <dt>Computational task</dt><dd>{mapping.task ? <><UseCaseRecordLink href={recordHref(mapping.task)} useCasePath={useCasePath}>{catalogueText(mapping.task.name)}</UseCaseRecordLink> <span className={styles.muted}>({statusLabel(mapping.task.status)})</span></> : "A reviewed task relationship is not recorded for this protocol."}</dd>
        <dt>Input and population constraints</dt><dd><ul>{mapping.constraints.map((constraint) => <li key={constraint}>{constraint}</li>)}</ul></dd>
      </dl>
      {mapping.limitations.length > 0 && <><h4>Limits on interpretation</h4><ul>{mapping.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul></>}
      {mapping.review && <UseCaseReview review={mapping.review} />}
    </>}

    {supportsEvidence && mapping.evaluations.length > 0 ? <>
      <h4>Evaluated configurations</h4>
      <p>Each configuration below belongs to this protocol. Inspect its inputs, population and scoring conditions before comparing it with another evaluation.</p>
      {mapping.evaluations.map(({ evaluation, configurations, results }) => {
        const comparison = (evaluation.attributes.comparison || {}) as Record<string, unknown>;
        const execution = executionLinks[evaluation.id];
        const uncertaintyNotes = [...new Set(results.flatMap((row) => {
          const note = object(row.result.attributes.missing_metadata).uncertainty;
          return row.result.attributes.uncertainty == null && typeof note === "string" ? [note] : [];
        }))];
        return <section key={evaluation.id} className={styles.evaluation} aria-label={catalogueText(evaluation.name)}>
          <h5>{configurations.map((configuration, index) => <span key={configuration.id}>{index > 0 && "; "}<UseCaseRecordLink href={recordHref(configuration)} useCasePath={useCasePath}>{catalogueText(configuration.name)}</UseCaseRecordLink></span>)}</h5>
          <p className={styles.muted}>{originLabel(evaluation.attributes.origin)} · {statusLabel(evaluation.status)}</p>
          <p>{catalogueText(evaluation.description)}</p>
          <details className={styles.disclosure}>
            <summary>Inspect results, conditions and reproduction ({results.length} recorded {results.length === 1 ? "result" : "results"})</summary>
            <dl className={styles.fields}>
              <dt>Population and split</dt><dd>{displayValue(comparison.population)} · {displayValue(comparison.split)}</dd>
              <dt>Inputs and adaptation</dt><dd>{displayValue(comparison.inputs)} · {displayValue(comparison.adaptation)}</dd>
              <dt>Evaluation budget</dt><dd>{displayValue(comparison.budget)}</dd>
              <dt>Runtime and memory</dt><dd><Resources evaluation={evaluation} /></dd>
            </dl>
            {results.length ? <div className={styles.tableWrap} tabIndex={0} role="region" aria-label={`Results for ${catalogueText(evaluation.name)}`}>
              <table className={styles.table}>
                <caption>Recorded results for this configuration</caption>
                <thead><tr><th scope="col">Metric</th><th scope="col">Value</th><th scope="col">Coverage</th><th scope="col">Uncertainty and source</th></tr></thead>
                <tbody>{results.map((row) => <tr key={row.result.id}>
                  <th scope="row"><UseCaseRecordLink href={recordHref(row.result)} useCasePath={useCasePath}>{displayValue(row.result.attributes.metric)}</UseCaseRecordLink></th>
                  <td><span className={styles.score}>{explorerPrintedScore(row.result.attributes.printed_value, row.result.attributes.unit)}</span><p className={styles.muted}>{displayValue(row.result.attributes.unit)} · {displayValue(row.result.attributes.metric_direction)}</p></td>
                  <td>{row.result.attributes.coverage ? displayValue(row.result.attributes.coverage) : `${displayValue(row.result.attributes.scored_count)} scored / ${displayValue(row.result.attributes.eligible_count)} eligible`}</td>
                  <td><p>{displayValue(row.result.attributes.uncertainty)}</p><details><summary>Result provenance</summary><UseCaseCitations citations={row.result.source_ids.map((source_id) => ({ source_id, locator: String(row.result.attributes.source_locator || "See the source record for the evidence location") }))} sources={row.sources} useCasePath={useCasePath} /></details></td>
                </tr>)}</tbody>
              </table>
            </div> : <p>No eligible result rows are recorded for this evaluation. Missing results are not zero scores.</p>}
            {uncertaintyNotes.map((note) => <p className={styles.muted} key={note}>Uncertainty: {note}</p>)}
            <p><UseCaseRecordLink href={`${recordHref(evaluation)}#reproduction`} useCasePath={useCasePath}>Evaluation methods, evidence and reproduction</UseCaseRecordLink></p>
            {execution ? <><p><UseCaseRecordLink href={execution.href} useCasePath={useCasePath}>{execution.label}</UseCaseRecordLink></p><p className={styles.muted}>{execution.explanation}</p></> : <p className={styles.muted}>No execution recipe has been verified for this exact configuration and evaluation. Inspect its methods and original run documentation before attempting reproduction.</p>}
          </details>
        </section>;
      })}
      {mapping.protocol && <p><UseCaseRecordLink href={`${recordHref(mapping.protocol)}#results`} useCasePath={useCasePath}>Open the protocol&apos;s results and comparison checks →</UseCaseRecordLink></p>}
      {protocolInstructions && <p><a href={protocolInstructions}>Original execution documentation ↗</a></p>}
    </> : active && <p>{mapping.relevance === "not_assessed" ? "Applicability has not been assessed." : mapping.relevance === "outside_scope" ? "No applicable results are presented for this scope." : "No relevant evaluation is recorded for this mapping."} Absence of evidence is not a zero score or proof that a method is unsuitable.</p>}
    <details><summary>Mapping sources and review metadata</summary>
      {mapping.citations.length > 0 && <UseCaseCitations citations={mapping.citations} sources={mapping.sources} useCasePath={useCasePath} />}
      {!active && mapping.review && <UseCaseReview review={mapping.review} />}
      <p>Mapping <code>{mapping.id}</code> · revision {mapping.revision}</p>
      <p>{mapping.reason}</p>
      {mapping.supersedes_id && <p>Supersedes <code>{mapping.supersedes_id}</code></p>}
      {mapping.evidence_sha256 && <p>Reviewed evidence fingerprint <code>{mapping.evidence_sha256}</code></p>}
    </details>
  </article>;
}
