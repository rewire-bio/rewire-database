import Link from "next/link";
import { recordHref } from "@/lib/omics";
import { methodTypeLabel, originLabel, type Comparison } from "@/lib/use-case-comparisons";
import styles from "./UseCases.module.css";

const directionText = { higher: "higher is better", lower: "lower is better", unknown: "direction not stated" } as const;

/** One comparison table: tools as rows; strata (in order) or metrics as columns. The best value
 * in each column is marked only within this table, never against another study. */
export default function UseCaseComparison({ comparison, useCasePath }: { comparison: Comparison; useCasePath: string }) {
  const { headline, layout } = comparison;
  const returnTo = `?return_to=${encodeURIComponent(useCasePath)}`;
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
        {layout === "strata"
          ? <>{headline.label} ({directionText[headline.direction]}), with the other metrics below each value.</>
          : <>Sorted by {headline.label} ({directionText[headline.direction]}).</>}
        {" "}The best value in each column is highlighted.
      </p>
      <div className={styles.tableWrap} tabIndex={0} role="region" aria-label={comparison.title}>
        <table className={styles.comparisonTable}>
          <thead>
            <tr>
              <th scope="col">Tool</th>
              {comparison.columns.map((column) => <th scope="col" key={column.label}>{column.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {comparison.rows.map((row) => (
              <tr key={row.id}>
                <th scope="row">
                  <Link href={`/database/configuration/${encodeURIComponent(row.id)}/${returnTo}`}>{row.name}</Link>
                  {row.methodTypes.length > 0 && <span className={styles.rowMeta}>{row.methodTypes.map(methodTypeLabel).join(", ")}</span>}
                </th>
                {row.cells.map((cell, i) => (
                  <td key={comparison.columns[i].label} className={cell.best ? styles.best : undefined}>
                    {cell.printed === null
                      ? <span className={styles.missing}>Not reported</span>
                      : cell.numeric === null
                        ? <span className={styles.missing}>{cell.printed}</span>
                        : <span className={styles.value}>{cell.printed}</span>}
                    {cell.best && <span className={styles.srOnly}> (best in column)</span>}
                    {cell.secondary.length > 0 && (
                      <span className={styles.secondary}>{cell.secondary.map((s) => `${s.label} ${s.printed}`).join(" · ")}</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(comparison.limitations.length > 0 || comparison.protocols.length > 0) && (
        <details className={styles.caveats}>
          <summary>Caveats and method</summary>
          {comparison.limitations.length > 0 && <ul>{comparison.limitations.map((l) => <li key={l}>{l}</li>)}</ul>}
          <p>
            Protocol{comparison.protocols.length > 1 ? "s" : ""}:{" "}
            {comparison.protocols.map((p, i) => (
              <span key={p.id}>{i > 0 && ", "}<Link href={`${recordHref(p)}${returnTo}`}>{p.name}</Link></span>
            ))}
          </p>
        </details>
      )}
    </article>
  );
}
