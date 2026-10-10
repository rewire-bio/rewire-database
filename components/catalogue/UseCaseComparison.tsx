import Link from "next/link";
import { recordHref } from "@/lib/omics";
import { methodTypeLabel, originLabel, type Comparison, type ComparisonCell, type ComparisonRow, type ShownValue } from "@/lib/use-case-comparisons";
import styles from "./UseCases.module.css";

const directionText = { higher: "higher is better", lower: "lower is better", unknown: "direction not stated" } as const;
/** Tables longer than this show their top rows, with the rest behind a disclosure. */
const LONG_TABLE = 15;
const SHOWN_ROWS = 10;

const Value = ({ value }: { value: ShownValue }) =>
  <span className={value.missing ? styles.missing : styles.value} title={value.title}>{value.text}</span>;

/** Cells with more secondary values than this show the first few and fold the rest. */
const SECONDARY_SHOWN = 4;

function CellContent({ cell }: { cell: ComparisonCell }) {
  const item = (s: ComparisonCell["secondary"][number], i: number) =>
    <span key={i} className={styles.secondaryItem} title={s.title}>{s.label} <span className={styles.nowrap}>{s.text}</span></span>;
  const folded = cell.secondary.length > SECONDARY_SHOWN + 1;
  return <>
    <Value value={cell.shown} />
    {cell.best && <span className={styles.srOnly}> (best in column)</span>}
    {cell.qualifier && <span className={styles.cellQualifier}>{cell.qualifier}</span>}
    {cell.secondary.length > 0 && <span className={styles.secondary}>
      {(folded ? cell.secondary.slice(0, SECONDARY_SHOWN) : cell.secondary).map(item)}
      {folded && <details className={styles.moreValues}>
        <summary>{cell.secondary.length - SECONDARY_SHOWN} more values</summary>
        {cell.secondary.slice(SECONDARY_SHOWN).map((s, i) => item(s, i + SECONDARY_SHOWN))}
      </details>}
    </span>}
  </>;
}

function Tool({ row, href }: { row: ComparisonRow; href: string }) {
  return <>
    <Link href={href}>{row.name}</Link>
    {row.detail && <span className={styles.rowDetail}>{row.detail}</span>}
    {row.methodTypes.length > 0 && <span className={styles.rowMeta}>{row.methodTypes.map(methodTypeLabel).join(", ")}</span>}
  </>;
}

/** One comparison table: tools as rows; strata (in order) or metrics as columns. The best value
 * in each column is marked only within this table, never against another study. A single row is
 * shown as a list of metrics, since there is nothing to compare across rows. */
export default function UseCaseComparison({ comparison, useCasePath }: { comparison: Comparison; useCasePath: string }) {
  const { headline, layout, rows, columns } = comparison;
  const returnTo = `?return_to=${encodeURIComponent(useCasePath)}`;
  const href = (row: ComparisonRow) => `/database/configuration/${encodeURIComponent(row.id)}/${returnTo}`;
  const single = rows.length === 1;
  const long = rows.length > LONG_TABLE;
  const highlighted = rows.some((row) => row.cells.some((cell) => cell.best));
  const row = (r: ComparisonRow) => (
    <tr key={r.id}>
      <th scope="row"><Tool row={r} href={href(r)} /></th>
      {r.cells.map((cell, i) => <td key={columns[i].label} className={cell.best ? styles.best : undefined}><CellContent cell={cell} /></td>)}
    </tr>
  );
  return (
    <article className={styles.comparison} id={`comparison-${comparison.id}`} aria-labelledby={`comparison-${comparison.id}-title`}>
      <div className={styles.comparisonHead}>
        <h3 id={`comparison-${comparison.id}-title`}>{comparison.title}</h3>
        <span className={comparison.relevance === "direct" ? styles.badgeIndependent : styles.badgeAuthor}>{comparison.relevance === "direct" ? "Direct evidence" : "Proxy evidence"}</span>
        {comparison.origins.map((origin) => (
          <span key={origin} className={origin === "author_reported" ? styles.badgeAuthor : styles.badgeIndependent}>{originLabel(origin)}</span>
        ))}
      </div>
      {comparison.endpoint && <p>{comparison.endpoint}</p>}
      <p className={styles.muted}>
        {single
          ? <>Single reported result{layout === "strata" && <>: {headline.label} ({directionText[headline.direction]}), with the other metrics below each value</>}.</>
          : layout === "strata"
            ? <>{headline.label} ({directionText[headline.direction]}), with the other metrics below each value.</>
            : <>Sorted by {headline.label} ({directionText[headline.direction]}).</>}
        {long && <> Showing the top {SHOWN_ROWS} of {rows.length} rows.</>}
        {highlighted && <> The best value in each column is highlighted.</>}
      </p>
      {single
        ? <div className={styles.singleResult}>
          <p className={styles.singleTool}><Tool row={rows[0]} href={href(rows[0])} /></p>
          <dl className={styles.metricList}>
            {columns.map((column, i) => <div key={column.label}><dt>{column.label}</dt><dd><CellContent cell={rows[0].cells[i]} /></dd></div>)}
          </dl>
        </div>
        : <>
          {columns.length > 1 && <p className={`${styles.scrollHint} ${columns.length >= 6 ? styles.scrollHintWide : ""}`}>Scroll sideways to see all {columns.length} columns.</p>}
          <div className={styles.tableWrap} tabIndex={0} role="region" aria-label={comparison.title}>
            <table className={styles.comparisonTable}>
              <thead>
                <tr>
                  <th scope="col">Tool</th>
                  {columns.map((column) => <th scope="col" key={column.label}>{column.label}</th>)}
                </tr>
              </thead>
              <tbody>{(long ? rows.slice(0, SHOWN_ROWS) : rows).map(row)}</tbody>
              {long && <tbody className={styles.extraRows}>{rows.slice(SHOWN_ROWS).map(row)}</tbody>}
            </table>
          </div>
          {long && <details className={styles.showAll}><summary><span className={styles.showMore}>Show all {rows.length} rows</span><span className={styles.showFewer}>Show the top {SHOWN_ROWS} rows only</span></summary></details>}
        </>}
      {comparison.legend.length > 0 && <p className={styles.legend}>{comparison.legend.join(" ")}</p>}
      {(comparison.limitations.length > 0 || comparison.protocols.length > 0 || comparison.columnEndpoints.length > 0) && (
        <details className={styles.caveats}>
          <summary>Caveats and method</summary>
          {comparison.columnEndpoints.length > 0 && <>
            <p>What each column measures:</p>
            <ul>{comparison.columnEndpoints.map((c) => <li key={c.label}><strong>{c.label}</strong>: {c.endpoint}</li>)}</ul>
          </>}
          {comparison.limitations.length > 0 && <ul>{comparison.limitations.map((l) => <li key={l}>{l}</li>)}</ul>}
          {comparison.protocols.length > 0 && <p>
            Protocol{comparison.protocols.length > 1 ? "s" : ""}:{" "}
            {comparison.protocols.map((p, i) => (
              <span key={p.id}>{i > 0 && ", "}<Link href={`${recordHref(p)}${returnTo}`}>{p.name}</Link></span>
            ))}
          </p>}
        </details>
      )}
    </article>
  );
}
