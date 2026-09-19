"use client";
import { useId, useState, useEffect } from "react";
import Link from "next/link";
import type { ResolvedComparison } from "@/services/omics/src/published-comparisons";
import { catalogueClient } from "@/lib/catalogue-client";
import type { ResultRow } from "@/services/omics/src/catalogue-query";
import { displayValue, originLabel, recordHref } from "@/lib/omics";
import { testedEntities, singularKindLabels } from "@/lib/omics-browse";
import { Evidence } from "./Profile";
import styles from "@/app/database/database.module.css";

interface ChartRow {
  row: ResultRow;
  note?: string;
}

function TestedEntity({ row }: { row: ResultRow }) {
  return (
    <>
      {testedEntities(row).map((model) => (
        <Link key={model.id} href={recordHref(model)}>
          {model.name}
          <small className={styles.entityType}>
            {" "}
            · {singularKindLabels[model.kind]}
          </small>
        </Link>
      ))}
    </>
  );
}

function Chart({
  rows,
  metric,
  unit,
}: {
  rows: ChartRow[];
  metric: string;
  unit: string;
}) {
  const plotted = rows.filter(
    ({ row }) => row.result.attributes.numeric_value !== null,
  );
  const values = plotted.map(({ row }) =>
    Number(row.result.attributes.numeric_value),
  );
  const low = Math.min(0, ...values);
  const high =
    Math.max(0, ...values) === low ? low + 1 : Math.max(0, ...values);
  const span = high - low || 1;
  const position = (value: number) => 2 + (96 * (value - low)) / span;
  return (
    <>
      <div className={styles.chartAxis} aria-hidden="true">
        {[0, 1, 2, 3, 4].map((tick) => (
          <span key={tick} style={{ left: `${2 + 24 * tick}%` }}>
            {Number((low + (span * tick) / 4).toPrecision(3))}
          </span>
        ))}
      </div>
      <ol className={styles.chartRows}>
        {plotted.map(({ row, note }) => {
          const a = row.result.attributes;
          const value = Number(a.numeric_value);
          return (
            <li key={row.result.id}>
              <div className={styles.chartLabel}>
                <span>
                  <TestedEntity row={row} />{" "}
                  <small>· {originLabel(row.origin)}</small>
                  {note ? (
                    <small className={styles.chartNote}>{note}</small>
                  ) : null}
                </span>
                <Link
                  href={recordHref(row.result)}
                  className={styles.chartValue}
                >
                  {String(a.printed_value)}
                </Link>
              </div>
              <svg
                viewBox="0 0 100 4"
                preserveAspectRatio="none"
                role="img"
                aria-label={`${testedEntities(row)
                  .map((model) => model.name)
                  .join(", ")}: ${String(a.printed_value)} ${unit}; ${metric}${
                  note ? `; ${note}` : ""
                }.`}
              >
                <line
                  x1="2"
                  x2="98"
                  y1="2"
                  y2="2"
                  stroke="var(--line)"
                  strokeWidth="0.35"
                />
                <line
                  x1={position(0)}
                  x2={position(value)}
                  y1="2"
                  y2="2"
                  stroke="var(--accent)"
                  strokeWidth="1.5"
                />
                <line
                  x1={position(value)}
                  x2={position(value)}
                  y1="0.7"
                  y2="3.3"
                  stroke="var(--ink)"
                  strokeWidth="0.45"
                />
              </svg>
            </li>
          );
        })}
      </ol>
    </>
  );
}

function ValueTable({
  rows,
  unit,
  caption,
  sourceColumn,
}: {
  rows: ChartRow[];
  unit: string;
  caption: string;
  sourceColumn?: boolean;
}) {
  return (
    <div
      className={styles.tableScroll}
      tabIndex={0}
      role="region"
      aria-label="Comparison values"
    >
      <table className={styles.resultTable}>
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Tested entity</th>
            {sourceColumn ? <th scope="col">Protocol and dataset</th> : null}
            <th scope="col">Printed value</th>
            <th scope="col">Uncertainty</th>
            <th scope="col">Evidence</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ row, note }) => (
            <tr key={row.result.id}>
              <th scope="row">
                <TestedEntity row={row} />
              </th>
              {sourceColumn ? <td>{note}</td> : null}
              <td>
                <Link href={recordHref(row.result)}>
                  {String(row.result.attributes.printed_value)}
                </Link>{" "}
                {unit}
              </td>
              <td>{displayValue(row.result.attributes.uncertainty)}</td>
              <td>
                {originLabel(row.origin)} ·{" "}
                {row.result.status.replace(/_/g, " ")}
                <Evidence
                  ids={row.result.source_ids}
                  locator={String(row.result.attributes.source_locator)}
                  sources={row.sources}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Caveats({ caveats, date }: { caveats: string[]; date: string }) {
  return (
    <details>
      <summary>Scope and limitations</summary>
      <ul>
        {caveats.map((caveat, i) => (
          <li key={i}>{caveat}</li>
        ))}
      </ul>
      <p>
        Source transcription and grouping reviewed by automated source review on{" "}
        {date}. These experiments were not independently reproduced by rewire.
      </p>
    </details>
  );
}

function PanelFigure({ panel }: { panel: ResolvedComparison }) {
  const rows: ChartRow[] = panel.rows.map((row) => ({ row }));
  const omitted = panel.rows.filter(
    (row) => row.result.attributes.numeric_value === null,
  ).length;
  return (
    <figure className={styles.comparisonFigure}>
      <figcaption>
        <h3>{panel.title}</h3>
        <p>
          {panel.metric} ({panel.unit}) ·{" "}
          {panel.direction === "higher" ? "Higher" : "Lower"} values are better
          for this metric.
        </p>
        <p>{panel.context}</p>
        <p>
          <Link href={recordHref(panel.protocol)}>Evaluation protocol</Link> ·{" "}
          <Link href={recordHref(panel.dataset)}>{panel.dataset.name}</Link>
        </p>
      </figcaption>
      <Chart rows={rows} metric={panel.metric} unit={panel.unit} />
      <p className={styles.muted}>
        Source order is preserved.{" "}
        {omitted > 0
          ? `${omitted} unavailable values are omitted from the plot and retained in the table. `
          : ""}
        Plotted marks show point estimates; uncertainty, where reported, is
        retained in the printed values and table. Differences do not establish
        statistical significance.
      </p>
      <Evidence
        ids={panel.source_ids}
        locator={panel.source_locator}
        sources={panel.sources}
      />
      <details>
        <summary>Values, uncertainty and evidence</summary>
        <ValueTable
          rows={rows}
          unit={panel.unit}
          caption={`${panel.metric}: original source values`}
        />
      </details>
      <Caveats caveats={panel.caveats} date={panel.review.date} />
    </figure>
  );
}

export default function BenchmarkCharts({ panels, recordId, releaseId, options }: {
  panels: ResolvedComparison[];
  recordId?: string;
  releaseId?: string;
  options?: { id: string; title: string; metric: string }[];
}) {
  const id = useId();
  const choices = options || panels;
  const [selected, setSelected] = useState(panels[0]?.id || "");
  const [panel, setPanel] = useState(panels[0]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    const local = panels.find(item => item.id === selected);
    setError("");
    if (local) { setPanel(local); setLoading(false); return; }
    if (!recordId || !releaseId) return;
    setLoading(true);
    catalogueClient(releaseId).comparison({ id: recordId, panel_id: selected })
      .then(value => { if (active) {
        if (!value.panel) throw new Error("Comparison unavailable");
        setPanel(value.panel);
      } })
      .catch(() => { if (active) setError("The selected comparison could not be loaded. The previous figure is retained."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selected, panels, recordId, releaseId, retry]);
  if (!panel) return null;
  return <section id="charts" className={styles.section} aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`}>Published comparisons</h2>
    <p>Each figure keeps its source, protocol, dataset and metric together. Results from different protocols are shown separately, without a pooled ranking.</p>
    <label htmlFor={`${id}-select`}>Comparison and metric</label>
    <select id={`${id}-select`} className={styles.chartSelect} value={selected}
      onChange={event => setSelected(event.target.value)}>
      {choices.map(item => <option key={item.id} value={item.id}>{item.title} · {item.metric}</option>)}
    </select>
    <div aria-live="polite">{loading && <p>Loading comparison…</p>}{error && <p role="alert">{error} <button onClick={() => setRetry(retry + 1)}>Retry</button></p>}</div>
    <div aria-busy={loading}><PanelFigure panel={panel} /></div>
  </section>;
}
