"use client";
import React, { useState } from "react";
import Link from "next/link";
import { recordHref } from "@/lib/omics";
import { isIndependentOrigin, originDescription } from "@/lib/result-origin";
import {
  isBaselineRow,
  methodTypeLabel,
  originLabel,
  type Comparison,
  type ComparisonCell,
  type ComparisonRow,
  type ShownValue,
} from "@/lib/use-case-comparisons";
import {
  contestingFindings,
  discrepancyHref,
  type DiscrepancySummary,
  type ResultContest,
} from "@/lib/discrepancy-helpers";
import DerivedMark from "./DerivedMark";
import styles from "./UseCases.module.css";

const directionText = {
  higher: "higher is better",
  lower: "lower is better",
  unknown: "direction not stated",
} as const;

/** Tables longer than this show their top rows, with the rest behind a disclosure. */
const LONG_TABLE = 15;
const SHOWN_ROWS = 10;

const Value = ({ value }: { value: ShownValue }) => (
  <>
    <span className={value.missing ? styles.missing : styles.value} title={value.title}>
      {value.text}
    </span>
    <DerivedMark derived={!!value.derived} />
  </>
);

/**
 * Clean cell content: Strictly renders single primary value + qualifier/best mark.
 * Embedded disclosures (<details className="moreValues">) and secondary stacks
 * have been eliminated and moved to expandable drawer rows.
 */
function CellContent({ cell }: { cell: ComparisonCell }) {
  return (
    <>
      <Value value={cell.shown} />
      {cell.best && <span className={styles.srOnly}> (best in column)</span>}
      {cell.qualifier && <span className={styles.cellQualifier}>{cell.qualifier}</span>}
    </>
  );
}

/** Links a row to the unsettled discrepancies between studies in which its results are the
 * disagreeing study's. It flags the results for checking; it does not say which study is right. */
function Contested({ found }: { found: DiscrepancySummary[] }) {
  if (!found.length) return null;
  return (
    <Link
      href={found.length === 1 ? discrepancyHref(found[0].id) : "/contested/"}
      className={styles.contestedBadge}
      title={found.map((d) => d.summary).join("\n")}
    >
      Contested{found.length > 1 && ` (${found.length})`}
      <span className="sr-only">: other studies disagree with this study&apos;s ranking of this tool</span>
    </Link>
  );
}

function Tool({
  row,
  href,
  baseline,
  contested = [],
  sweepCount,
}: {
  row: ComparisonRow;
  href: string;
  baseline: boolean;
  contested?: DiscrepancySummary[];
  sweepCount?: number;
}) {
  return (
    <>
      <Link href={href}>{row.name}</Link>
      {baseline && <span className={styles.baselineBadge}>Baseline</span>}
      <Contested found={contested} />
      {sweepCount !== undefined && sweepCount > 1 && (
        <span className={styles.sweepBadge} title={`${sweepCount} parameter configurations evaluated`}>
          {sweepCount} sweeps
        </span>
      )}
      {row.detail && <span className={styles.rowDetail}>{row.detail}</span>}
      {row.methodTypes.length > 0 && (
        <span className={styles.rowMeta}>{row.methodTypes.map(methodTypeLabel).join(", ")}</span>
      )}
    </>
  );
}

type ClusteredToolRow = {
  id: string;
  primary: ComparisonRow;
  sweeps: ComparisonRow[];
};

export default function UseCaseComparison({
  comparison,
  useCasePath,
  baselineIds = [],
  contested = {},
  expandedRowId,
}: {
  comparison: Comparison;
  useCasePath: string;
  baselineIds?: string[];
  /** The discrepancies each result takes part in (lib/discrepancies contestedResults). */
  contested?: Record<string, ResultContest[]>;
  expandedRowId?: string;
}) {
  const [expandedRowIds, setExpandedRowIds] = useState<Set<string>>(
    () => new Set(expandedRowId ? [expandedRowId] : []),
  );

  const toggleRow = (id: string) => {
    setExpandedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const baselines = new Set(baselineIds);
  const flags = (r: ComparisonRow) => contestingFindings(r.resultIds ?? [], contested);
  const { headline, layout, rows, columns } = comparison;
  const returnTo = `?return_to=${encodeURIComponent(useCasePath)}`;
  const href = (row: ComparisonRow) => `/database/configuration/${encodeURIComponent(row.id)}/${returnTo}`;

  // Single reported result layout
  const single = rows.length === 1;

  // Cluster hyperparameter sweeps by tool identity (r.parentId ?? r.name)
  const clusteredMap = new Map<string, ClusteredToolRow>();
  const clusteredList: ClusteredToolRow[] = [];

  for (const r of rows) {
    const key = r.parentId ?? r.name;
    const existing = clusteredMap.get(key);
    if (!existing) {
      const entry: ClusteredToolRow = {
        id: r.id,
        primary: r,
        sweeps: [r],
      };
      clusteredMap.set(key, entry);
      clusteredList.push(entry);
    } else {
      existing.sweeps.push(r);
      const currentBestCount = existing.primary.cells.filter((c) => c.best).length;
      const newBestCount = r.cells.filter((c) => c.best).length;
      if (newBestCount > currentBestCount) {
        existing.primary = r;
        existing.id = r.id;
      }
    }
  }

  const long = clusteredList.length > LONG_TABLE;
  const hasNonBaseline = single || rows.some((r) => !isBaselineRow(r, baselines));
  const highlighted = rows.some((row) => row.cells.some((cell) => cell.best));

  const renderRowItem = (item: ClusteredToolRow) => {
    const r = item.primary;
    const sweeps = item.sweeps;
    const isExpanded = expandedRowIds.has(r.id) || expandedRowId === r.id;
    const secondaryMetrics = r.cells.flatMap((c) => c.secondary);

    return (
      <React.Fragment key={r.id}>
        <tr>
          <th scope="row">
            <div style={{ display: "flex", alignItems: "flex-start", gap: "6px" }}>
              <button
                type="button"
                className={styles.toggleButton}
                aria-expanded={isExpanded}
                aria-controls={`drawer-${r.id}`}
                data-drawer-trigger="true"
                aria-label={`Toggle details for ${r.name}`}
                onClick={() => toggleRow(r.id)}
              >
                <span
                  className={styles.chevronIcon}
                  style={{
                    transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                  }}
                >
                  ▶
                </span>
              </button>
              <div>
                <Tool
                  row={r}
                  href={href(r)}
                  baseline={hasNonBaseline && isBaselineRow(r, baselines)}
                  contested={flags(r)}
                  sweepCount={sweeps.length > 1 ? sweeps.length : undefined}
                />
              </div>
            </div>
          </th>
          {r.cells.map((cell, i) => (
            <td key={columns[i]?.label ?? i} className={cell.best ? styles.best : undefined}>
              <CellContent cell={cell} />
            </td>
          ))}
        </tr>

        {/* Expandable Drawer Row */}
        {isExpanded && (
          <tr
            id={`drawer-${r.id}`}
            className={`${styles.drawerRow} drawer-row metric-details`}
            data-drawer-for={r.id}
          >
            <td colSpan={columns.length + 1} className={styles.drawerCell}>
              <div className={styles.drawerGrid}>
                {/* Secondary Metrics */}
                {secondaryMetrics.length > 0 && (
                  <div className={styles.drawerCard}>
                    <h4>Secondary Metrics</h4>
                    <dl className={styles.drawerDl}>
                      {secondaryMetrics.map((s, idx) => (
                        <React.Fragment key={idx}>
                          <dt title={s.title}>{s.label}:</dt>
                          <dd className={styles.nowrap}>{s.text}</dd>
                        </React.Fragment>
                      ))}
                    </dl>
                  </div>
                )}

                {/* Protocol & Study Evidence */}
                <div className={styles.drawerCard}>
                  <h4>Protocol & Study Evidence</h4>
                  <p>
                    <strong>Evaluation:</strong> {comparison.title}
                  </p>
                  {comparison.protocols.length > 0 && (
                    <p>
                      <strong>Protocol{comparison.protocols.length > 1 ? "s" : ""}:</strong>{" "}
                      {comparison.protocols.map((p, i) => (
                        <span key={p.id}>
                          {i > 0 && ", "}
                          <Link href={`${recordHref(p)}${returnTo}`}>{p.name}</Link>
                        </span>
                      ))}
                    </p>
                  )}
                  <p>
                    <strong>Relevance:</strong>{" "}
                    {comparison.relevance === "direct" ? "Direct evidence" : "Proxy evidence"}
                  </p>
                  {flags(r).length > 0 && (
                    <p style={{ color: "var(--accent-ink)", fontWeight: 500 }}>
                      Contested by {flags(r).length} study findings.
                    </p>
                  )}
                </div>

                {/* Parameter Sweeps (when clustered) */}
                {sweeps.length > 1 && (
                  <div className={styles.drawerCard}>
                    <h4>Parameter Sweeps ({sweeps.length} configurations)</h4>
                    <table className={styles.sweepTable}>
                      <thead>
                        <tr>
                          <th scope="col">Configuration / Threshold</th>
                          {columns.slice(0, 3).map((col) => (
                            <th scope="col" key={col.label}>
                              {col.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sweeps.map((sweep) => (
                          <tr key={sweep.id}>
                            <td>{sweep.detail || sweep.name}</td>
                            {columns.slice(0, 3).map((col, idx) => (
                              <td key={col.label}>{sweep.cells[idx]?.shown?.text || "—"}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </td>
          </tr>
        )}
      </React.Fragment>
    );
  };

  return (
    <article
      className={styles.comparison}
      id={`comparison-${comparison.id}`}
      aria-labelledby={`comparison-${comparison.id}-title`}
    >
      <div className={styles.comparisonHead}>
        <h3 id={`comparison-${comparison.id}-title`}>{comparison.title}</h3>
        <span
          className={
            comparison.relevance === "direct" ? styles.badgeIndependent : styles.badgeAuthor
          }
        >
          {comparison.relevance === "direct" ? "Direct evidence" : "Proxy evidence"}
        </span>
        {comparison.origins.map((origin) => (
          <span
            key={origin}
            className={
              isIndependentOrigin(origin) ? styles.badgeIndependent : styles.badgeAuthor
            }
            data-origin={origin}
            title={originDescription(origin)}
          >
            {originLabel(origin)}
            <span className={styles.srOnly}>: {originDescription(origin)}</span>
          </span>
        ))}
      </div>
      {comparison.endpoint && <p>{comparison.endpoint}</p>}
      <p className={styles.muted}>
        {single ? (
          <>
            Single reported result
            {layout === "strata" && (
              <>
                : {headline.label} ({directionText[headline.direction]}), with the other metrics below
                each value
              </>
            )}
            .
          </>
        ) : layout === "strata" ? (
          <>{headline.label} ({directionText[headline.direction]}), with the other metrics below each value.</>
        ) : (
          <>Sorted by {headline.label} ({directionText[headline.direction]}).</>
        )}
        {long && <> Showing the top {SHOWN_ROWS} of {clusteredList.length} rows.</>}
        {highlighted && <> The best value in each column is highlighted.</>}
      </p>

      {single ? (
        <div className={styles.singleResult}>
          <p className={styles.singleTool}>
            <Tool
              row={rows[0]}
              href={href(rows[0])}
              baseline={isBaselineRow(rows[0], baselines)}
              contested={flags(rows[0])}
            />
          </p>
          <dl className={styles.metricList}>
            {columns.map((column, i) => (
              <div key={column.label}>
                <dt>{column.label}</dt>
                <dd>
                  <CellContent cell={rows[0].cells[i]} />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : (
        <>
          <div className={styles.tableWrap} tabIndex={0} role="region" aria-label={comparison.title}>
            <table className={styles.comparisonTable}>
              <thead>
                <tr>
                  <th scope="col">Tool</th>
                  {columns.map((column) => (
                    <th scope="col" key={column.label}>
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(long ? clusteredList.slice(0, SHOWN_ROWS) : clusteredList).map(renderRowItem)}
              </tbody>
              {long && (
                <tbody className={styles.extraRows}>
                  {clusteredList.slice(SHOWN_ROWS).map(renderRowItem)}
                </tbody>
              )}
            </table>
          </div>
          {long && (
            <details className={styles.showAll}>
              <summary>
                <span className={styles.showMore}>Show all {clusteredList.length} rows</span>
                <span className={styles.showFewer}>Show the top {SHOWN_ROWS} rows only</span>
              </summary>
            </details>
          )}
        </>
      )}

      {comparison.legend.length > 0 && (
        <p className={styles.legend}>{comparison.legend.join(" ")}</p>
      )}
      {(comparison.limitations.length > 0 ||
        comparison.protocols.length > 0 ||
        comparison.columnEndpoints.length > 0) && (
        <details className={styles.caveats}>
          <summary>Caveats and method</summary>
          {comparison.columnEndpoints.length > 0 && (
            <>
              <p>What each column measures:</p>
              <ul>
                {comparison.columnEndpoints.map((c) => (
                  <li key={c.label}>
                    <strong>{c.label}</strong>: {c.endpoint}
                  </li>
                ))}
              </ul>
            </>
          )}
          {comparison.limitations.length > 0 && (
            <ul>
              {comparison.limitations.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          )}
          {comparison.protocols.length > 0 && (
            <p>
              Protocol{comparison.protocols.length > 1 ? "s" : ""}:{" "}
              {comparison.protocols.map((p, i) => (
                <span key={p.id}>
                  {i > 0 && ", "}
                  <Link href={`${recordHref(p)}${returnTo}`}>{p.name}</Link>
                </span>
              ))}
            </p>
          )}
        </details>
      )}
    </article>
  );
}
