"use client";
import { useId, useState } from "react";
import Link from "next/link";
import type { ResolvedComparison } from "@/services/omics/src/published-comparisons";
import { displayValue, originLabel, recordHref } from "@/lib/omics";
import { testedEntities, singularKindLabels } from "@/lib/omics-browse";
import { Evidence } from "./Profile";
import styles from "@/app/database/database.module.css";

export default function BenchmarkCharts({
  panels,
}: {
  panels: ResolvedComparison[];
}) {
  const id = useId();
  const [selected, setSelected] = useState(panels[0]?.id || "");
  if (!panels.length) return null;
  const panel = panels.find((item) => item.id === selected) || panels[0];
  const plotted = panel.rows.filter(
    (row) => row.result.attributes.numeric_value !== null,
  );
  const values = plotted.map((row) =>
    Number(row.result.attributes.numeric_value),
  );
  const low = Math.min(0, ...values);
  const high =
    Math.max(0, ...values) === low ? low + 1 : Math.max(0, ...values);
  const span = high - low || 1;
  const position = (value: number) => 2 + (96 * (value - low)) / span;
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
        across studies.
      </p>
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
      <figure className={styles.comparisonFigure}>
        <figcaption>
          <h3>{panel.title}</h3>
          <p>
            {panel.metric} ({panel.unit}) ·{" "}
            {panel.direction === "higher" ? "Higher" : "Lower"} values are
            better for this metric.
          </p>
          <p>{panel.context}</p>
          <p>
            <Link href={recordHref(panel.protocol)}>Evaluation protocol</Link> ·{" "}
            <Link href={recordHref(panel.dataset)}>{panel.dataset.name}</Link>
          </p>
        </figcaption>
        <div className={styles.chartAxis} aria-hidden="true">
          {[0, 1, 2, 3, 4].map((tick) => (
            <span key={tick} style={{ left: `${2 + 24 * tick}%` }}>
              {Number((low + (span * tick) / 4).toPrecision(3))}
            </span>
          ))}
        </div>
        <ol className={styles.chartRows}>
          {plotted.map((row) => {
            const a = row.result.attributes;
            const value = Number(a.numeric_value);
            return (
              <li key={row.result.id}>
                <div className={styles.chartLabel}>
                  <span>
                    {testedEntities(row).map((model) => (
                      <Link key={model.id} href={recordHref(model)}>
                        {model.name}
                        <small className={styles.entityType}>
                          {" "}
                          · {singularKindLabels[model.kind]}
                        </small>
                      </Link>
                    ))}{" "}
                    <small>· {originLabel(row.origin)}</small>
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
                    .join(
                      ", ",
                    )}: ${String(a.printed_value)} ${panel.unit}; ${panel.metric}.`}
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
        <p className={styles.muted}>
          Source order is preserved.{" "}
          {panel.rows.length - plotted.length > 0
            ? `${panel.rows.length - plotted.length} unavailable values are omitted from the plot and retained in the table. `
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
          <div
            className={styles.tableScroll}
            tabIndex={0}
            role="region"
            aria-label="Comparison values"
          >
            <table className={styles.resultTable}>
              <caption>{panel.metric}: original source values</caption>
              <thead>
                <tr>
                  <th scope="col">Tested entity</th>
                  <th scope="col">Printed value</th>
                  <th scope="col">Uncertainty</th>
                  <th scope="col">Evidence</th>
                </tr>
              </thead>
              <tbody>
                {panel.rows.map((row) => (
                  <tr key={row.result.id}>
                    <th scope="row">
                      {testedEntities(row).map((model) => (
                        <Link key={model.id} href={recordHref(model)}>
                          {model.name}
                          <small className={styles.entityType}>
                            {" "}
                            · {singularKindLabels[model.kind]}
                          </small>
                        </Link>
                      ))}
                    </th>
                    <td>
                      <Link href={recordHref(row.result)}>
                        {String(row.result.attributes.printed_value)}
                      </Link>{" "}
                      {panel.unit}
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
        </details>
        <details>
          <summary>Scope and limitations</summary>
          <ul>
            {panel.caveats.map((caveat, i) => (
              <li key={i}>{caveat}</li>
            ))}
          </ul>
          <p>
            Source transcription and grouping reviewed by automated source
            review on {panel.review.date}. These experiments were not
            independently reproduced by rewire.
          </p>
        </details>
      </figure>
    </section>
  );
}
