import styles from "./CatalogueCoverage.module.css";

type Row = { label: string; value: number; muted?: boolean };

/** Counts describe catalogue coverage, never model performance. */
export function CountRows({ rows, title }: { rows: Row[]; title: string }) {
  const ordered = [...rows].sort(
    (a, b) => b.value - a.value || a.label.localeCompare(b.label),
  );
  const maximum = Math.max(0, ...ordered.map((row) => row.value));
  return (
    <ul className={styles.rows} aria-label={title}>
      {ordered.map((row) => (
        <li key={row.label}>
          <span className={styles.label}>{row.label}</span>
          <span className={styles.count}>{row.value.toLocaleString()}</span>
          <span className={styles.track} aria-hidden="true">
            <span
              style={{ width: `${maximum ? (row.value / maximum) * 100 : 0}%` }}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}

export function CompositionCharts({
  kinds,
  areas,
}: {
  kinds: Row[];
  areas: Row[];
}) {
  return (
    <div className={styles.grid}>
      <section>
        <h3>Records by kind</h3>
        <CountRows rows={kinds} title="Record count by kind" />
      </section>
      <section>
        <h3>Records by research area</h3>
        <CountRows rows={areas} title="Record count by research area" />
      </section>
    </div>
  );
}

export function CoverageChart({
  covered,
  total,
  rows,
}: {
  covered: number;
  total: number;
  rows: Row[];
}) {
  return (
    <section>
      <p>
        <strong>
          {covered} of {total} benchmarks
        </strong>{" "}
        have linked evaluations in this release. Zero means no evaluation is
        linked here, not that the benchmark has never been used.
      </p>
      <CountRows rows={rows} title="Linked evaluations per benchmark" />
    </section>
  );
}
