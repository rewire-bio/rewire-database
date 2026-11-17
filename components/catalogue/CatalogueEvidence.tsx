import Link from "next/link";
import { Fragment } from "react";
import type { PreparedQuery } from "@/lib/catalogue-build";
import { CompositionCharts, CoverageChart } from "./CatalogueCharts";
import { displayValue } from "@/lib/omics";
import { kindLabels, researchAreaLabel } from "@/lib/omics-browse";
import styles from "@/app/database/database.module.css";

type SummarySource = Pick<PreparedQuery, "homeSummary" | "release">;
export type CatalogueEvidenceSummary = ReturnType<typeof formatSummary>;

// The producer computes the counts and benchmark coverage once per release;
// this only formats labels. Cached per prepared release handle.
const summaries = new WeakMap<SummarySource, CatalogueEvidenceSummary>();
export function catalogueEvidenceSummary(source: SummarySource): CatalogueEvidenceSummary {
  let summary = summaries.get(source);
  if (!summary) summaries.set(source, (summary = formatSummary(source.homeSummary())));
  return summary;
}

function formatSummary(raw: ReturnType<SummarySource["homeSummary"]>) {
  return {
    records: raw.records,
    external: raw.external,
    own: raw.own,
    kindRows: raw.kinds.map((row) => ({
      ...row,
      label: kindLabels[row.label as keyof typeof kindLabels] || row.label.replace(/_/g, " "),
    })),
    areaRows: raw.areas.map((row) => ({ ...row, label: researchAreaLabel(row.label) })),
    coverageRows: raw.coverage.map((entry) => ({
      label: entry.name,
      value: entry.evaluations,
      muted: entry.evaluations === 0,
    })),
    covered: raw.covered,
    benchmarks: raw.benchmarks,
  };
}

export function CatalogueEvidence({
  query,
  compact = false,
}: {
  query: SummarySource;
  compact?: boolean;
}) {
  const { records, external, own, kindRows, areaRows, coverageRows, covered, benchmarks } = catalogueEvidenceSummary(query);

  const referenceCards = (
    <div className={styles.referenceGrid}>
      <article>
        <h3>Investigate discrepancies</h3>
        <p>
          {compact
            ? "Check replay readiness, inspect contested claims across studies, or test an explanation independently."
            : "Check whether the data supports replaying a metric, investigating an unexpected result or testing an explanation independently."}
        </p>
        <Link href="/investigations/">Readiness and investigations →</Link>
      </article>
      <article>
        <h3>Rewire evaluations</h3>
        <p>
          {compact
            ? "Read the protocol, held-out splits, and limitations behind our reproduced splice-variant evaluation."
            : "Read the protocol, coverage and limitations behind our corrected splice-variant evaluation."}
        </p>
        <Link href="/runs/mfass-v2/">MFASS v2 evaluation →</Link>
      </article>
      <article id="mfass-v1">
        <h3>Correction history</h3>
        <p>
          {compact
            ? "MFASS v1 is superseded. Original tables and methods remain preserved as an archived report."
            : "MFASS v1 is superseded. Its original tables and methods remain available as an archived report."}
        </p>
        <Link href="/runs/mfass-v1/">Archived MFASS v1 report →</Link>
      </article>
    </div>
  );

  return (
    <section id="evidence" className={styles.information}>
      {compact ? (
        <div className={styles.sectionHeader}>
          <span className={styles.sectionKicker}>Verification and provenance</span>
          <h2>Audit the evidence</h2>
          <p className={styles.sectionIntro}>
            Every score links to its source paper, protocol, and evaluation split (
            {external.toLocaleString()} source-checked published results and{" "}
            {own.toLocaleString()} results from Rewire runs — source-checked does not mean
            independently reproduced).{" "}
            <span className={styles.inlineLinks}>
              <Link href="/evidence/">Evidence methodology</Link>
              {" · "}
              <Link href="/coverage/">Collection coverage</Link>
            </span>
          </p>
        </div>
      ) : (
        <>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionKicker}>Verification and provenance</span>
            <h2>How to read the evidence</h2>
          </div>
          <div className={styles.evidenceLead}>
            <p>
              Published evaluations and rewire evaluations are records in the same
              database, with their origin shown beside each result. This release
              includes {external.toLocaleString()} source-checked published results
              and {own.toLocaleString()} results from existing rewire runs.
            </p>
            <p className={styles.evidenceCallout}>
              <strong>Source checked does not mean independently reproduced.</strong>{" "}
              Comparisons require compatible data, protocols and metrics. Missing
              details stay visible.
            </p>
          </div>
        </>
      )}
      {referenceCards}
      {!compact && (
        <div className={styles.coveragePanels}>
          <div className={styles.coveragePanel}>
            <h3>Coverage: records and linked evaluations</h3>
            <p>
              {records.toLocaleString()} records across{" "}
              {kindRows.length} record types. These counts describe catalogue
              coverage, not model performance.
            </p>
            <CompositionCharts kinds={kindRows} areas={areaRows} />
            <h4>Benchmark evidence coverage</h4>
            <CoverageChart
              covered={covered}
              total={benchmarks}
              rows={coverageRows}
            />
          </div>
          <div className={styles.coveragePanel}>
            <h3>Collection coverage and remaining gaps</h3>
            <p>
              This is a dated collection, not an exhaustive model census. Models,
              methods, evaluated configurations and pipelines are listed separately.
              Counts describe records, not unique checkpoints or independent
              experiments.
            </p>
            <dl className={styles.details}>
              {Object.entries(query.release().coverage ?? {}).map(([key, value]) => (
                <Fragment key={key}>
                  <dt>{key.replace(/_/g, " ")}</dt>
                  <dd>{displayValue(value)}</dd>
                </Fragment>
              ))}
            </dl>
          </div>
        </div>
      )}
    </section>
  );
}
