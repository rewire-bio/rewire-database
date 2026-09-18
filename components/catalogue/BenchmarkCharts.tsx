"use client";
import { useId, useState, type ReactNode } from "react";
import Link from "next/link";
import type { ResolvedComparison } from "@/services/omics/src/published-comparisons";
import type { AggregateComparison } from "@/services/omics/src/aggregate-comparisons";
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

export function PooledFigure({ group }: { group: AggregateComparison }) {
  const rows: ChartRow[] = group.rows.map(({ row, panel }) => ({
    row,
    note: `${panel.protocol.name} · ${panel.dataset.name}`,
  }));
  const omitted = rows.filter(
    ({ row }) => row.result.attributes.numeric_value === null,
  ).length;
  const dates = [...new Set(group.panels.map((panel) => panel.review.date))]
    .sort()
    .join(", ");
  return (
    <figure className={styles.comparisonFigure}>
      <figcaption>
        <h3>
          {group.metric}: {group.panels.length} source tables pooled
        </h3>
        <p>
          {group.metric} ({group.unit}) ·{" "}
          {group.direction === "higher" ? "Higher" : "Lower"} values are better
          for this metric. Ranked by printed value.
        </p>
        <p className={styles.pooledWarning}>
          {group.divergent.length
            ? `These rows do not hold the following constant: ${group.divergent.join(", ")}. Read each row with its own protocol and dataset. A position in this order is not evidence that one entity is better.`
            : "These rows come from separate source tables. A position in this order is not evidence that one entity is better."}
        </p>
        <p>
          {group.protocols.map((protocol, index) => (
            <span key={protocol.id}>
              {index ? " · " : ""}
              <Link href={recordHref(protocol)}>{protocol.name}</Link>
            </span>
          ))}
        </p>
      </figcaption>
      <Chart rows={rows} metric={group.metric} unit={group.unit} />
      <p className={styles.muted}>
        {omitted > 0
          ? `${omitted} unavailable values are omitted from the plot and retained in the table. `
          : ""}
        Plotted marks show point estimates; uncertainty, where reported, is
        retained in the printed values and table. Differences do not establish
        statistical significance.
      </p>
      <details>
        <summary>Values, uncertainty and evidence</summary>
        <ValueTable
          rows={rows}
          unit={group.unit}
          caption={`${group.metric}: pooled source values, each row with its own protocol and dataset`}
          sourceColumn
        />
      </details>
      <Caveats caveats={group.caveats} date={dates} />
    </figure>
  );
}

export default function BenchmarkCharts({
  panels,
  aggregates = [],
}: {
  panels: ResolvedComparison[];
  aggregates?: AggregateComparison[];
}) {
  const id = useId();
  const [selected, setSelected] = useState(panels[0]?.id || "");
  const [pooledId, setPooledId] = useState(aggregates[0]?.id || "");
  const [pooled, setPooled] = useState(false);
  if (!panels.length) return null;
  const panel = panels.find((item) => item.id === selected) || panels[0];
  const group =
    aggregates.find((item) => item.id === pooledId) || aggregates[0];
  const showPooled = pooled && group !== undefined;
  const control: ReactNode = aggregates.length ? (
    <fieldset className={styles.chartModes}>
      <legend>View</legend>
      <label>
        <input
          type="radio"
          name={`${id}-mode`}
          checked={!showPooled}
          onChange={() => setPooled(false)}
        />{" "}
        By source table
      </label>
      <label>
        <input
          type="radio"
          name={`${id}-mode`}
          checked={showPooled}
          onChange={() => setPooled(true)}
        />{" "}
        Pooled by metric
      </label>
    </fieldset>
  ) : null;
  return (
    <section
      id="charts"
      className={styles.section}
      aria-labelledby={`${id}-title`}
    >
      <h2 id={`${id}-title`}>Published comparisons</h2>
      <p>
        Explore the results reported under one evaluation protocol. Each figure
        keeps its source, dataset and metric together; it is not a ranking
        across studies. The pooled view gathers every source table that reports
        the same metric and names what it does not hold constant.
      </p>
      {control}
      {showPooled ? (
        <>
          <label htmlFor={`${id}-pooled`}>Pooled metric</label>
          <select
            id={`${id}-pooled`}
            className={styles.chartSelect}
            value={group.id}
            onChange={(event) => setPooledId(event.target.value)}
          >
            {aggregates.map((item) => (
              <option key={item.id} value={item.id}>
                {item.metric} · {item.panels.length} source tables
              </option>
            ))}
          </select>
          <PooledFigure group={group} />
        </>
      ) : (
        <>
          <label htmlFor={`${id}-select`}>Comparison and metric</label>
          <select
            id={`${id}-select`}
            className={styles.chartSelect}
            value={panel.id}
            onChange={(event) => setSelected(event.target.value)}
          >
            {panels.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title} · {item.metric}
              </option>
            ))}
          </select>
          <PanelFigure panel={panel} />
        </>
      )}
    </section>
  );
}
