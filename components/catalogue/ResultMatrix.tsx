import Link from "next/link";
import { catalogueText } from "@/lib/catalogue-text";
import { recordHref } from "@/lib/omics";
import { formatScore } from "@/lib/score-display";
import type { ResultMatrix as Matrix } from "@/lib/result-matrix";
import { singularKindLabels } from "@/lib/omics-browse";
import styles from "./UseCases.module.css";

const directionText = { higher: "higher is better", lower: "lower is better", unknown: "direction not stated" } as const;

function Names({ records }: { records: Matrix["shared"] }) {
  return <>{records.map((record, i) => (
    <span key={record.id}>{i > 0 && ", "}<Link href={recordHref(record)}>{catalogueText(record.name)}</Link></span>
  ))}</>;
}

/** A record's results with one row per evaluated configuration and one column
 * per metric. Shared protocol and dataset are named once; per-result coverage,
 * uncertainty and sources are on each result page and in the full table. */
export default function ResultMatrix({ matrix, label }: { matrix: Matrix; label: string }) {
  const lead = matrix.columns[0];
  const kinds = [...new Set(matrix.shared.map((record) => record.kind))];
  return (
    <div>
      {matrix.shared.length > 0 && (
        <p>
          {kinds.map((kind, i) => (
            <span key={kind}>
              {i > 0 && " · "}
              {singularKindLabels[kind]}: <Names records={matrix.shared.filter((record) => record.kind === kind)} />
            </span>
          ))}
        </p>
      )}
      <p className={styles.muted}>
        {lead.direction === "unknown" ? "In source order." : `Sorted by ${lead.label} (${directionText[lead.direction]}).`}
        {matrix.columns.some((column) => column.direction !== "unknown") && " The best value in each column is highlighted."}{" "}
        Decimals are rounded for display; each value links to the printed value and its source.
      </p>
      <div className={styles.tableWrap} tabIndex={0} role="region" aria-label={label}>
        <table className={styles.comparisonTable}>
          <thead>
            <tr>
              <th scope="col">Tested configuration</th>
              {matrix.rows.some((row) => row.context.length > 0) && <th scope="col">Protocol and dataset</th>}
              {matrix.columns.map((column) => <th scope="col" key={column.key}>{column.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((row) => (
              <tr key={row.key}>
                <th scope="row">
                  {row.tested.length ? <Names records={row.tested} /> : "Not reported"}
                  {row.evaluation && (
                    <span className={styles.rowMeta}><Link href={recordHref(row.evaluation)}>Evaluation</Link></span>
                  )}
                </th>
                {matrix.rows.some((item) => item.context.length > 0) && (
                  <td>{row.context.length ? <Names records={row.context} /> : <span className={styles.missing}>Shared</span>}</td>
                )}
                {row.cells.map((cell, i) => (
                  <td key={matrix.columns[i].key} className={cell?.best ? styles.best : undefined}>
                    {cell ? (
                      <Link href={recordHref(cell.result)} title={`Printed value: ${cell.printed}`}>
                        <span className={cell.numeric === null ? styles.missing : styles.value}>{/^[+-]?\d+%?$/.test(cell.printed) ? cell.printed : formatScore(cell.printed)}</span>
                      </Link>
                    ) : (
                      <span className={styles.missing}>Not reported</span>
                    )}
                    {cell?.best && <span className={styles.srOnly}> (best in column)</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
