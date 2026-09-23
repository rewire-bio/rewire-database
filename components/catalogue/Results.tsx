"use client";
import { useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import { catalogueClient, type ResultsPage } from "@/lib/catalogue-client";
import {
  displayValue,
  originLabel,
  recordHref,
  type OmicsRecord,
} from "@/lib/omics";
import { Evidence, EvidenceConcerns } from "./Profile";
import {
  testedEntities,
  evaluationEntities,
  datasetEntities,
  singularKindLabels,
} from "@/lib/omics-browse";
import { useResultsLocation } from "./useResultsLocation";
import styles from "@/app/database/database.module.css";
import ux from "./comparison.module.css";

const defaults = {
  metric: "",
  origin: "",
  configuration: "",
  protocol: "",
  dataset: "",
  entity: "",
  cursor: "",
};
function coverage(row: ResultsPage["items"][number]) {
  const attributes = row.result.attributes;
  if (attributes.coverage) return displayValue(attributes.coverage);
  return `${displayValue(attributes.scored_count)} scored / ${displayValue(attributes.eligible_count)} eligible`;
}
function RecordLinks({ records }: { records: OmicsRecord[] }) {
  return (
    <>
      {records.length
        ? records.map((record, i) => (
            <span key={record.id}>
              {i > 0 ? ", " : ""}
              <span className={styles.muted}>
                {singularKindLabels[record.kind]}:{" "}
              </span>
              <Link href={recordHref(record)}>{record.name}</Link>
            </span>
          ))
        : "Not reported"}
    </>
  );
}
export default function Results({
  id,
  initial,
  title = "Benchmarks and results",
  embedded = false,
}: {
  id: string;
  initial: ResultsPage;
  title?: string;
  embedded?: boolean;
}) {
  const headingId = useId();
  const client = useMemo(
    () => catalogueClient(initial.release_id),
    [initial.release_id],
  );
  const { state, update, ready } = useResultsLocation(defaults);
  const [data, setData] = useState(initial);
  const [applied, setApplied] = useState(defaults);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!ready) return;
    // The initial page is already pinned to this immutable release. Reuse it
    // on first load and reset; only changed filters/pages or a retry need I/O.
    if (!retry && Object.values(state).every((value) => value === "")) {
      setData(initial);
      setApplied(defaults);
      setLoading(false);
      setError("");
      return;
    }
    let active = true;
    setLoading(true);
    setError("");
    client
      .results({
        id,
        metric: state.metric || undefined,
        origin: state.origin || undefined,
        configuration_id: state.configuration || undefined,
        protocol_id: state.protocol || undefined,
        dataset_id: state.dataset || undefined,
        tested_entity_id: state.entity || undefined,
        cursor: state.cursor || undefined,
        limit: 25,
      })
      .then((page) => {
        if (active) {
          setData(page);
          setApplied(state);
        }
      })
      .catch(() => {
        if (active)
          setError(
            "The requested results could not be loaded. The last successful results and their applied filters are retained below.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, id, state, retry, ready, initial]);
  const filter = (key: keyof typeof defaults, value: string) =>
    update({ [key]: value, cursor: "" });
  const filters = [
    {
      key: "entity" as const,
      label: "Tested model or method",
      options: initial.facets.tested_entities || [],
    },
    {
      key: "protocol" as const,
      label: "Protocol",
      options: initial.facets.protocols || [],
    },
    {
      key: "dataset" as const,
      label: "Dataset",
      options: initial.facets.datasets || [],
    },
    {
      key: "configuration" as const,
      label: "Evaluation setup",
      options: initial.facets.configurations,
    },
    {
      key: "metric" as const,
      label: "Metric",
      options: initial.facets.metrics.map((name) => ({ id: name, name })),
    },
    {
      key: "origin" as const,
      label: "Evidence origin",
      options: initial.facets.origins.map((id) => ({
        id,
        name: originLabel(id),
      })),
    },
  ];
  const appliedText =
    filters
      .flatMap((item) =>
        applied[item.key]
          ? [
              `${item.label}: ${item.options.find((option) => option.id === applied[item.key])?.name || applied[item.key]}`,
            ]
          : [],
      )
      .join(" · ") || "All linked evaluations";
  return (
    <section
      id={embedded ? undefined : "results"}
      className={embedded ? undefined : styles.section}
      aria-labelledby={headingId}
    >
      <h2 id={headingId} className={embedded ? ux.tableHeading : undefined}>
        {title}
      </h2>
      <p className={styles.muted}>
        {data.evaluation_count}{" "}
        {data.evaluation_count === 1 ? "evaluation" : "evaluations"} ·{" "}
        {data.total} metric rows. Different protocols are not a single
        leaderboard.
      </p>
      {initial.total > 0 && (
        <details
          className={ux.filtersPanel}
          open={Object.entries(state).some(
            ([key, value]) => key !== "cursor" && value !== "",
          )}
        >
          <summary>Filter evaluations</summary>
          <div className={styles.filters}>
            {filters.map((item) => (
              <label key={item.key} className={styles.label}>
                {item.label}
                <select
                  value={state[item.key]}
                  onChange={(event) => filter(item.key, event.target.value)}
                >
                  <option value="">All</option>
                  {item.options.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <button className={styles.button} onClick={() => update(defaults)}>
            Reset filters
          </button>
        </details>
      )}
      <div aria-live="polite">
        {loading && <p>Loading results…</p>}
        {error && (
          <p role="alert">
            {error}{" "}
            <button
              className={styles.button}
              onClick={() => setRetry(retry + 1)}
            >
              Retry
            </button>
          </p>
        )}
      </div>
      <p className={styles.muted}>Applied filters: {appliedText}</p>
      {!data.total ? (
        <p>
          {initial.total
            ? "No results match the selected filters."
            : "No evaluations linked in this release."}
          {initial.total > 0 && (
            <>
              {" "}
              <button
                className={styles.button}
                onClick={() => update(defaults)}
              >
                Reset filters
              </button>
            </>
          )}
        </p>
      ) : (
        <div
          className={styles.tableScroll}
          tabIndex={0}
          role="region"
          aria-label="Evaluation results"
          aria-busy={loading}
        >
          <table className={`${styles.resultTable} ${ux.compactTable}`}>
            <caption>
              Exact evaluated configurations and original reported results
            </caption>
            <thead>
              <tr>
                <th scope="col">Tested configuration</th>
                <th scope="col">Protocol and dataset</th>
                <th scope="col">Finding</th>
                <th scope="col">Evidence and details</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((row) => (
                <tr key={row.result.id}>
                  <th scope="row">
                    <RecordLinks records={testedEntities(row)} />
                  </th>
                  <td>
                    <RecordLinks records={evaluationEntities(row)} />
                    <br />
                    <span className={styles.muted}>
                      <RecordLinks records={datasetEntities(row)} />
                    </span>
                  </td>
                  <td>
                    <Link href={recordHref(row.result)}>
                      <strong>
                        {displayValue(row.result.attributes.printed_value)}
                        {row.result.attributes.unit === "percent" &&
                        !/%/.test(String(row.result.attributes.printed_value))
                          ? "%"
                          : ""}
                      </strong>{" "}
                      {displayValue(row.result.attributes.metric)}
                    </Link>
                    <div className={styles.muted}>
                      {displayValue(row.result.attributes.unit)} ·{" "}
                      {displayValue(row.result.attributes.metric_direction)}
                    </div>
                    <p>
                      Uncertainty:{" "}
                      {displayValue(row.result.attributes.uncertainty)}
                    </p>
                    <p>Coverage: {coverage(row)}</p>
                  </td>
                  <td>
                    <span>
                      {originLabel(row.origin)} ·{" "}
                      {row.review_status.replace(/_/g, " ")}
                    </span>
                    <EvidenceConcerns sources={row.sources} />
                    <details>
                      <summary>Methods, coverage and source</summary>
                      {row.evaluation && (
                        <p>
                          <Link href={recordHref(row.evaluation)}>
                            {row.evaluation.name}
                          </Link>
                        </p>
                      )}
                      <p>{displayValue(row.evaluation?.attributes.protocol)}</p>
                      <p>
                        Aggregation:{" "}
                        {displayValue(row.result.attributes.aggregation)}
                      </p>
                      <Evidence
                        ids={row.result.source_ids}
                        locator={String(
                          row.result.attributes.source_locator ||
                            "Evidence location not reported",
                        )}
                        sources={row.sources}
                      />
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <nav className={ux.pagination} aria-label="Result pages">
        <button
          className={styles.button}
          disabled={loading || !!error || data.previous_cursor == null}
          onClick={() => update({ cursor: data.previous_cursor || "" })}
        >
          Previous
        </button>
        <span>
          {data.range_start ?? (data.total ? 1 : 0)}–
          {data.range_end ?? data.items.length} of {data.total} rows
        </span>
        <button
          className={styles.button}
          disabled={loading || !!error || !data.next_cursor}
          onClick={() => update({ cursor: data.next_cursor || "" })}
        >
          Next
        </button>
      </nav>
      <p className={styles.muted}>
        Source checking is not independent reproduction. Release{" "}
        {initial.release_id}.
      </p>
    </section>
  );
}
