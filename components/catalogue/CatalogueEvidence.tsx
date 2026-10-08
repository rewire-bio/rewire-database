import Link from "next/link";
import type { buildCatalogue } from "@/lib/catalogue-build";
import { CompositionCharts, CoverageChart } from "./CatalogueCharts";
import { researchAreaLabel } from "@/lib/omics-browse";
import { benchmarkCoverage } from "@/scripts/omics/audit-benchmark-evidence";
import styles from "@/app/database/database.module.css";

type Catalogue = Pick<ReturnType<typeof buildCatalogue>["catalogue"], "records">;
export type CatalogueEvidenceSummary = ReturnType<typeof computeSummary>;

// The benchmark coverage pass builds a complete query engine over the release
// (seconds of CPU), so the summary is computed once per immutable catalogue and
// reused by every later render. Keyed by the records array: a changed or new
// catalogue is a new array and recomputes; an unused one is garbage-collected.
const summaries = new WeakMap<Catalogue["records"], CatalogueEvidenceSummary>();
export function catalogueEvidenceSummary(catalogue: Catalogue): CatalogueEvidenceSummary {
  let summary = summaries.get(catalogue.records);
  if (!summary) summaries.set(catalogue.records, (summary = computeSummary(catalogue)));
  return summary;
}

function computeSummary(catalogue: Catalogue) {
  const external = catalogue.records.filter(
    (record) => record.kind === "result" && record.status === "source_checked",
  ).length;
  const own = catalogue.records.filter(
    (record) => record.kind === "result" && record.status === "reproduced",
  ).length;
  const tally = (pick: (r: (typeof catalogue.records)[number]) => string[]) => {
    const counts = new Map<string, number>();
    for (const record of catalogue.records)
      for (const key of pick(record))
        counts.set(key, (counts.get(key) || 0) + 1);
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({ label, value }));
  };
  const kindRows = tally((record) => [record.kind]).map((row) => ({
    ...row,
    label: row.label.replace(/_/g, " "),
  }));
  const areaRows = tally((record) => record.facets.areas || [])
    .slice(0, 10)
    .map((row) => ({ ...row, label: researchAreaLabel(row.label) }));
  const coverage = benchmarkCoverage(catalogue.records);
  const coverageRows = coverage.map((entry) => ({
    label: entry.name,
    value: entry.evaluations,
    muted: entry.evaluations === 0,
  }));
  const covered = coverage.filter((entry) => entry.evaluations > 0).length;
  return { records: catalogue.records.length, external, own, kindRows, areaRows, coverageRows, covered, benchmarks: coverage.length };
}

export function CatalogueEvidence({
  catalogue,
}: {
  catalogue: ReturnType<typeof buildCatalogue>["catalogue"];
}) {
  const { records, external, own, kindRows, areaRows, coverageRows, covered, benchmarks } = catalogueEvidenceSummary(catalogue);

  return (
    <section id="evidence" className={styles.information}>
      <h2>How to read the evidence</h2>
      <details className={styles.section}>
        <summary>Coverage: records and linked evaluations</summary>
        <p>
          {records.toLocaleString()} records across{" "}
          {kindRows.length} record types. These counts describe catalogue
          coverage, not model performance.
        </p>
        <CompositionCharts kinds={kindRows} areas={areaRows} />
        <h3>Benchmark evidence coverage</h3>
        <CoverageChart
          covered={covered}
          total={benchmarks}
          rows={coverageRows}
        />
      </details>
      <p>
        Published evaluations and rewire evaluations are records in the same
        database, with their origin shown beside each result. This release
        includes {external.toLocaleString()} source-checked published results
        and {own.toLocaleString()} results from existing rewire runs.
      </p>
      <p>
        <strong>Source checked does not mean independently reproduced.</strong>{" "}
        Comparisons require compatible data, protocols and metrics. Missing
        details stay visible.
      </p>
      <div className={styles.referenceGrid}>
        <article>
          <h3>Investigate discrepancies</h3>
          <p>
            Check whether the data supports replaying a metric, investigating an
            unexpected result or testing an explanation independently.
          </p>
          <Link href="/investigations/">Readiness and investigations →</Link>
        </article>
        <article>
          <h3>Rewire evaluations</h3>
          <p>
            Read the protocol, coverage and limitations behind our corrected
            splice-variant evaluation.
          </p>
          <Link href="/runs/mfass-v2/">MFASS v2 evaluation →</Link>
        </article>
        <article id="mfass-v1">
          <h3>Correction history</h3>
          <p>
            MFASS v1 is superseded. Its original tables and methods remain
            available as an archived report.
          </p>
          <Link href="/runs/mfass-v1/">Archived MFASS v1 report →</Link>
        </article>
      </div>
      <details className={styles.section}>
        <summary>Collection coverage and remaining gaps</summary>
        <p>
          This is a dated collection, not an exhaustive model census. Models,
          methods, evaluated configurations and pipelines are listed separately.
          Counts describe records, not unique checkpoints or independent
          experiments.
        </p>
        <pre className={styles.pre}>
          {JSON.stringify(catalogue.coverage, null, 2)}
        </pre>
      </details>
    </section>
  );
}
