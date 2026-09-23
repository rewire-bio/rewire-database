"use client";
import { useId, useState, useEffect, useMemo } from "react";
import Link from "next/link";
import type { ResolvedComparison } from "@/services/omics/src/published-comparisons";
import {
  unpackComparisons,
  type PackedComparisons,
} from "@/lib/comparison-transport";
import { catalogueClient, type ResultsPage } from "@/lib/catalogue-client";
import { displayValue, originLabel, recordHref } from "@/lib/omics";
import { testedEntities, singularKindLabels } from "@/lib/omics-browse";
import { Evidence } from "./Profile";
import Results from "./Results";
import { useResultsLocation } from "./useResultsLocation";
import {
  comparisonRange,
  numericScore,
  scoreInterval,
} from "./comparison-utils";
import styles from "@/app/database/database.module.css";
import ux from "./comparison.module.css";

type Option = {
  id: string;
  title: string;
  metric: string;
  protocol?: {
    id: string;
    name: string;
    kind?: keyof typeof singularKindLabels;
  };
  dataset?: {
    id: string;
    name: string;
    kind?: keyof typeof singularKindLabels;
  };
  context?: string;
  source_ids?: string[];
  sources?: { id: string; name: string }[];
};
type Props = {
  panels: ResolvedComparison[] | PackedComparisons;
  recordId?: string;
  releaseId?: string;
  options?: Option[];
  initialResults?: ResultsPage;
  resultSummary?: Pick<ResultsPage, "total" | "evaluation_count">;
};
const defaults = {
  mode: "comparisons",
  panel: "",
  view: "chart",
  search: "",
  order: "source",
  all: "",
  zoom: "",
  scope_search: "",
};
function testedName(row: ResolvedComparison["rows"][number]) {
  return testedEntities(row)
    .map((record) => record.name)
    .join(", ");
}
function Entity({ row }: { row: ResolvedComparison["rows"][number] }) {
  return (
    <>
      {testedEntities(row).map((record, index) => (
        <span key={record.id}>
          {index > 0 ? ", " : ""}
          <Link href={recordHref(record)}>{record.name}</Link>
        </span>
      ))}
    </>
  );
}
function scopeKey(option: Option) {
  return option.protocol && option.dataset
    ? `${option.protocol.id}::${option.dataset.id}`
    : option.id;
}
function panelScope(option: Option) {
  return option.protocol && option.dataset
    ? `${option.protocol.kind ? singularKindLabels[option.protocol.kind] + ": " : ""}${option.protocol.name} · ${option.dataset.name}`
    : option.title;
}

/** Search scopes and metric choices together; selecting a scope must select a matching panel. */
export function comparisonChoices(
  choices: Option[],
  search: string,
  selected: string,
) {
  const currentOption = choices.find((option) => option.id === selected);
  const selectedScope = currentOption ? scopeKey(currentOption) : "";
  const needle = search.trim().toLowerCase();
  const scopeOptions = choices.filter((option) =>
    `${panelScope(option)} ${option.title} ${option.metric} ${option.context || ""} ${(option.sources || []).map((source) => source.name).join(" ")}`
      .toLowerCase()
      .includes(needle),
  );
  const scopesById = new Map<
    string,
    { id: string; name: string; firstPanelId: string }
  >();
  for (const option of scopeOptions) {
    const key = scopeKey(option);
    if (!scopesById.has(key))
      scopesById.set(key, {
        id: key,
        name: panelScope(option),
        firstPanelId: option.id,
      });
  }
  return {
    currentOption,
    selectedScope,
    scopeOptions,
    scopes: [...scopesById.values()],
    metricOptions: scopeOptions.filter(
      (option) => scopeKey(option) === selectedScope,
    ),
  };
}

export function ComparisonWorkspace({
  panels: transportedPanels,
  recordId,
  releaseId,
  options,
  initialResults,
  resultSummary,
}: Props) {
  const panels = useMemo(
    () =>
      Array.isArray(transportedPanels)
        ? transportedPanels
        : unpackComparisons(transportedPanels),
    [transportedPanels],
  );
  const heading = useId();
  const choices = options || panels;
  const { state, update, ready } = useResultsLocation(defaults);
  const selected = state.panel || choices[0]?.id || "";
  const [panel, setPanel] = useState(panels[0]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const mode = choices.length ? state.mode : "all";
  const summary = resultSummary || initialResults;
  const [allResults, setAllResults] = useState(initialResults);
  const [resultsError, setResultsError] = useState(false);
  const [resultsRetry, setResultsRetry] = useState(0);
  useEffect(() => {
    if (!ready || mode !== "all" || allResults || !recordId || !releaseId)
      return;
    let active = true;
    setResultsError(false);
    catalogueClient(releaseId)
      .results({ id: recordId, limit: 25 })
      .then((page) => {
        if (active) setAllResults(page);
      })
      .catch(() => {
        if (active) setResultsError(true);
      });
    return () => {
      active = false;
    };
  }, [ready, mode, allResults, recordId, releaseId, resultsRetry]);
  useEffect(() => {
    if (!ready || !selected) return;
    let active = true;
    const local = panels.find((item) => item.id === selected);
    setError("");
    if (local) {
      setPanel(local);
      setLoading(false);
      return;
    }
    if (!recordId || !releaseId) {
      setError("This comparison is unavailable. Select another comparison.");
      return;
    }
    setLoading(true);
    catalogueClient(releaseId)
      .comparison({ id: recordId, panel_id: selected })
      .then((value) => {
        if (active) {
          if (!value.panel) throw new Error("Comparison unavailable");
          setPanel(value.panel);
        }
      })
      .catch(() => {
        if (active)
          setError(
            "The selected comparison could not be loaded. The last successful comparison is retained and labelled below.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selected, panels, recordId, releaseId, retry, ready]);
  const { currentOption, selectedScope, scopeOptions, scopes, metricOptions } =
    comparisonChoices(choices, state.scope_search, selected);
  const rows = useMemo(() => {
    const filtered = (panel?.rows || []).filter((row) =>
      `${testedName(row)} ${originLabel(row.origin)}`
        .toLowerCase()
        .includes(state.search.toLowerCase()),
    );
    if (state.order === "name")
      filtered.sort((a, b) => testedName(a).localeCompare(testedName(b)));
    if (state.order === "score")
      filtered.sort((a, b) => {
        const av = numericScore(a.result.attributes.numeric_value),
          bv = numericScore(b.result.attributes.numeric_value);
        if (av === null) return bv === null ? 0 : 1;
        if (bv === null) return -1;
        return panel?.direction === "lower" ? av - bv : bv - av;
      });
    return filtered;
  }, [panel, state.search, state.order]);
  const visible = state.all === "1" ? rows : rows.slice(0, 12);
  const [low, high] = panel
    ? comparisonRange(panel.rows, panel.metric, panel.unit, state.zoom === "1")
    : [0, 1];
  const position = (value: number) => 3 + (94 * (value - low)) / (high - low);
  return (
    <section id="results" className={styles.section} aria-labelledby={heading}>
      <span id="charts" className={ux.anchor} />
      <h2 id={heading}>Results</h2>
      {choices.length > 0 && summary && (
        <div
          className={ux.switches}
          role="group"
          aria-label="Result collection"
        >
          <button
            aria-pressed={mode === "comparisons"}
            onClick={() => update({ mode: "comparisons" })}
          >
            Published comparisons
          </button>
          <button
            aria-pressed={mode === "all"}
            onClick={() => update({ mode: "all" })}
          >
            All evaluations ({summary.evaluation_count})
          </button>
        </div>
      )}
      {mode === "all" && summary && recordId ? (
        <>
          {!choices.length && summary.total > 0 && (
            <p>
              Results are available, but no reviewed comparison panel is linked
              in this release.
            </p>
          )}
          {allResults ? (
            <Results
              id={recordId}
              initial={allResults}
              title="All evaluations"
              embedded
            />
          ) : resultsError ? (
            <p role="alert">
              All evaluations could not be loaded. The published comparison
              remains available.{" "}
              <button onClick={() => setResultsRetry((value) => value + 1)}>
                Retry evaluations
              </button>
            </p>
          ) : (
            <p role="status">Loading all evaluations…</p>
          )}
        </>
      ) : (
        <>
          <p className={styles.muted}>
            Each comparison retains its reviewed evaluation scope, dataset and
            metric. Results are shown without a pooled ranking.
          </p>
          {choices.length > 12 && (
            <label className={ux.search}>
              Find a protocol, dataset or metric
              <input
                type="search"
                value={state.scope_search}
                onChange={(event) =>
                  update({ scope_search: event.target.value })
                }
                placeholder="Search comparison choices"
              />
            </label>
          )}
          {!!choices.length && (
            <div className={ux.selectors}>
              <label>
                Evaluation scope and dataset
                <select
                  value={selectedScope}
                  onChange={(event) => {
                    const next = scopes.find(
                      (scope) => scope.id === event.target.value,
                    );
                    if (next) update({ panel: next.firstPanelId, all: "" });
                  }}
                >
                  {!scopes.some((scope) => scope.id === selectedScope) &&
                    selectedScope && (
                      <option value={selectedScope}>
                        {currentOption
                          ? panelScope(currentOption)
                          : selectedScope}{" "}
                        (current)
                      </option>
                    )}
                  {scopes.map((scope) => (
                    <option key={scope.id} value={scope.id}>
                      {scope.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Metric and reported setup
                <select
                  value={selected}
                  onChange={(event) =>
                    update({ panel: event.target.value, all: "" })
                  }
                >
                  {currentOption &&
                    !metricOptions.some((option) => option.id === selected) && (
                      <option value={selected}>
                        {currentOption.metric} · {currentOption.title} (current,
                        outside search)
                      </option>
                    )}
                  {metricOptions.map((option) => (
                    <option value={option.id} key={option.id}>
                      {option.metric} · {option.title}
                      {option.context ? ` · ${option.context}` : ""}
                      {option.sources?.length
                        ? ` · ${option.sources.map((source) => source.name).join(", ")}`
                        : ""}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {state.scope_search && (
            <p className={styles.muted}>
              {scopeOptions.length} matching comparison choices.{" "}
              <button onClick={() => update({ scope_search: "" })}>
                Clear search
              </button>
            </p>
          )}
          <div aria-live="polite">
            {loading && <p>Loading comparison…</p>}
            {error && (
              <p role="alert">
                {error}{" "}
                <button onClick={() => setRetry(retry + 1)}>Retry</button>
              </p>
            )}
          </div>
          {panel ? (
            <div aria-busy={loading}>
              <header className={ux.panelHeader}>
                <h3>{panel.title}</h3>
                <p>
                  {panel.metric} ({panel.unit}) ·{" "}
                  {panel.direction === "higher" ? "Higher" : "Lower"} values are
                  better.
                </p>
                <p>{panel.context}</p>
                <p>
                  <Link href={recordHref(panel.protocol)}>
                    {panel.protocol.name}
                  </Link>{" "}
                  ·{" "}
                  <Link href={recordHref(panel.dataset)}>
                    {panel.dataset.name}
                  </Link>
                </p>
                <p>
                  Evidence origin:{" "}
                  {[
                    ...new Set(
                      panel.rows.map((row) => originLabel(row.origin)),
                    ),
                  ].join(", ")}
                  . Numerical source review does not establish independent
                  reproduction.
                </p>
                <Evidence
                  ids={panel.source_ids}
                  locator={panel.source_locator}
                  sources={panel.sources}
                />
                <p className={styles.muted}>{panel.caveats[0]}</p>
                <details>
                  <summary>
                    All comparison limitations ({panel.caveats.length})
                  </summary>
                  <ul>
                    {panel.caveats.map((caveat, index) => (
                      <li key={index}>{caveat}</li>
                    ))}
                  </ul>
                  <p>Automated source review: {panel.review.date}.</p>
                </details>
              </header>
              {(error || loading) && (
                <p>
                  <strong>Displayed comparison:</strong> {panel.title} ·{" "}
                  {panel.metric}
                </p>
              )}
              <div className={ux.toolbar}>
                <label>
                  Find a tested model or method
                  <input
                    type="search"
                    value={state.search}
                    onChange={(event) =>
                      update({ search: event.target.value, all: "" })
                    }
                  />
                </label>
                <label>
                  Order
                  <select
                    value={state.order}
                    onChange={(event) => update({ order: event.target.value })}
                  >
                    <option value="source">Source order</option>
                    <option value="name">Name</option>
                    <option value="score">Score, best first</option>
                  </select>
                </label>
                <div
                  className={ux.switches}
                  role="group"
                  aria-label="Comparison display"
                >
                  <button
                    aria-pressed={state.view !== "table"}
                    onClick={() => update({ view: "chart" })}
                  >
                    Chart
                  </button>
                  <button
                    aria-pressed={state.view === "table"}
                    onClick={() => update({ view: "table" })}
                  >
                    Table
                  </button>
                </div>
              </div>
              <p className={styles.muted}>
                {panel.rows.filter(
                  (row) =>
                    numericScore(row.result.attributes.numeric_value) === null,
                ).length || "No"}{" "}
                unavailable values; missing scores remain labelled and are never
                plotted as zero.
              </p>
              <p aria-live="polite">
                Showing {visible.length} of {rows.length} matching rows
                {state.search
                  ? ` (${panel.rows.length} in this comparison)`
                  : ""}
                . {state.order === "source" && "Source order is preserved."}
              </p>
              {!rows.length ? (
                <p>
                  No rows match your search.{" "}
                  <button onClick={() => update({ search: "", all: "" })}>
                    Reset search
                  </button>
                </p>
              ) : state.view === "table" ? (
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
                        <th scope="col">Tested configuration</th>
                        <th scope="col">Printed value ({panel.unit})</th>
                        <th scope="col">Uncertainty</th>
                        <th scope="col">Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((row) => (
                        <tr key={row.result.id}>
                          <th scope="row">
                            <Entity row={row} />
                          </th>
                          <td>
                            <Link href={recordHref(row.result)}>
                              {String(row.result.attributes.printed_value)}
                            </Link>
                          </td>
                          <td>
                            {displayValue(row.result.attributes.uncertainty)}
                          </td>
                          <td>
                            {originLabel(row.origin)} ·{" "}
                            {row.review_status.replace(/_/g, " ")}
                            <Evidence
                              ids={row.result.source_ids}
                              locator={String(
                                row.result.attributes.source_locator,
                              )}
                              sources={row.sources}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <>
                  <label className={ux.zoom}>
                    <input
                      type="checkbox"
                      checked={state.zoom === "1"}
                      onChange={(event) =>
                        update({ zoom: event.target.checked ? "1" : "" })
                      }
                    />{" "}
                    Zoom to observed range
                  </label>
                  <div
                    className={ux.plot}
                    role="region"
                    tabIndex={0}
                    aria-label={`${panel.metric} dot plot; use Table for the same rows as a table`}
                  >
                    <div className={ux.axisRow}>
                      <span>Tested configuration</span>
                      <div className={ux.axis}>
                        {[0, 1, 2, 3, 4].map((tick) => (
                          <span
                            key={tick}
                            style={{ left: `${3 + 23.5 * tick}%` }}
                          >
                            {Number(
                              (low + ((high - low) * tick) / 4).toPrecision(3),
                            )}
                          </span>
                        ))}
                      </div>
                      <span>Reported score</span>
                    </div>
                    <ol className={ux.rows}>
                      {visible.map((row) => {
                        const value = numericScore(
                          row.result.attributes.numeric_value,
                        );
                        const interval = scoreInterval(row);
                        return (
                          <li key={row.result.id} className={ux.plotRow}>
                            <span className={ux.modelLabel}>
                              <Entity row={row} />
                            </span>
                            <div
                              className={ux.track}
                              role={value === null ? undefined : "img"}
                              aria-label={`${testedName(row)}: ${String(row.result.attributes.printed_value)} ${panel.unit}${interval ? `; ${interval.label} ${interval.low} to ${interval.high}` : "; no supported uncertainty interval plotted"}`}
                            >
                              {value !== null ? (
                                <>
                                  {interval && (
                                    <span
                                      className={ux.interval}
                                      title={interval.label}
                                      style={{
                                        left: `${position(interval.low)}%`,
                                        width: `${position(interval.high) - position(interval.low)}%`,
                                      }}
                                    />
                                  )}
                                  <span
                                    className={ux.dot}
                                    style={{ left: `${position(value)}%` }}
                                  />
                                </>
                              ) : (
                                <span className={ux.unavailable}>
                                  Not available
                                </span>
                              )}
                            </div>
                            <Link
                              className={ux.value}
                              href={recordHref(row.result)}
                            >
                              {String(row.result.attributes.printed_value)}
                            </Link>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                  <p className={styles.muted}>
                    Dots show point estimates. Whiskers show only explicitly
                    defined uncertainty (standard deviation, standard error or a
                    labelled interval); their definitions remain in Table.
                    Unresolved uncertainty is not plotted. Differences do not
                    establish statistical significance.
                  </p>
                </>
              )}
              {rows.length > 12 && (
                <button
                  className={styles.button}
                  onClick={() => update({ all: state.all === "1" ? "" : "1" })}
                >
                  {state.all === "1"
                    ? "Show first 12"
                    : `Show all ${rows.length}`}
                </button>
              )}
            </div>
          ) : (
            !loading && (
              <p>No reviewed comparison panel is linked in this release.</p>
            )
          )}
        </>
      )}
    </section>
  );
}
export default ComparisonWorkspace;
