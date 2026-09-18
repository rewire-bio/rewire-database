"use client";
import { useEffect, useMemo, useState } from "react";
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
  groupEntities,
} from "@/lib/omics-browse";
import styles from "@/app/database/database.module.css";

function RecordLinks({ records }: { records: OmicsRecord[] }) {
  return (
    <>
      {records.length
        ? records.map((record, i) => (
            <span key={record.id}>
              {i > 0 ? ", " : ""}
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
}: {
  id: string;
  initial: ResultsPage;
  title?: string;
}) {
  const client = useMemo(
    () => catalogueClient(initial.release_id),
    [initial.release_id],
  );
  const [data, setData] = useState(initial);
  const [metric, setMetric] = useState("");
  const [origin, setOrigin] = useState("");
  const [configuration, setConfiguration] = useState("");
  const [cursor, setCursor] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    client
      .results({
        id,
        metric: metric || undefined,
        origin: origin || undefined,
        configuration_id: configuration || undefined,
        cursor,
        limit: 25,
      })
      .then((page) => {
        if (active) setData(page);
      })
      .catch(() => {
        if (active)
          setError(
            "The results service is unavailable. The table below retains the last loaded page; requested filters have not been applied.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, id, metric, origin, configuration, cursor, retry]);
  const groups = new Map<string, ResultsPage["items"]>();
  for (const row of data.items) {
    const key = row.evaluation?.id || row.result.id;
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  return (
    <section
      id="results"
      className={styles.section}
      aria-labelledby="results-title"
    >
      <h2 id="results-title">{title}</h2>
      <p className={styles.muted}>
        Release {initial.release_id} · {data.evaluation_count}{" "}
        {data.evaluation_count === 1 ? "evaluation" : "evaluations"} ·{" "}
        {data.total} {data.total === 1 ? "metric row" : "metric rows"}.
        Different protocols are not a single leaderboard. Where several
        source tables report the same metric, the published comparisons above
        offer a pooled view that names what it does not hold constant.
      </p>
      {initial.total > 0 && (
        <div className={styles.filters}>
          <label className={styles.label}>
            Evaluation setup
            <select
              aria-label="Evaluation setup"
              value={configuration}
              onChange={(event) => {
                setConfiguration(event.target.value);
                setCursor(undefined);
              }}
            >
              <option value="">All evaluation setups</option>
              {initial.facets.configurations.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.label}>
            Metric
            <select
              aria-label="Metric"
              value={metric}
              onChange={(event) => {
                setMetric(event.target.value);
                setCursor(undefined);
              }}
            >
              <option value="">All metrics</option>
              {initial.facets.metrics.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className={styles.label}>
            Evidence origin
            <select
              aria-label="Evidence origin"
              value={origin}
              onChange={(event) => {
                setOrigin(event.target.value);
                setCursor(undefined);
              }}
            >
              <option value="">All origins</option>
              {initial.facets.origins.map((item) => (
                <option value={item} key={item}>
                  {originLabel(item)}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <div aria-live="polite">
        {loading && <p>Loading results…</p>}
        {error && (
          <div className={styles.error}>
            <p>{error}</p>
            <button
              className={styles.button}
              onClick={() => setRetry(retry + 1)}
            >
              Retry
            </button>
          </div>
        )}
      </div>
      {!data.total ? (
        <p>No evaluations linked in this release.</p>
      ) : (
        <div
          className={styles.tableScroll}
          tabIndex={0}
          role="region"
          aria-label="Evaluation results"
          aria-busy={loading}
        >
          <table className={styles.resultTable}>
            <caption>Results grouped by the exact reported evaluation</caption>
            <thead>
              <tr>
                <th scope="col">Metric and finding</th>
                <th scope="col">Coverage and uncertainty</th>
                <th scope="col">Evidence</th>
              </tr>
            </thead>
            {Array.from(groups).map(([key, rows]) => {
              const first = rows[0];
              return (
                <tbody key={key}>
                  <tr>
                    <th
                      colSpan={3}
                      className={styles.evaluationHeading}
                      scope="rowgroup"
                    >
                      {first.evaluation ? (
                        <Link href={recordHref(first.evaluation)}>
                          {first.evaluation.name}
                        </Link>
                      ) : (
                        "Evaluation not linked"
                      )}
                      <div className={styles.evaluationLinks}>
                        {groupEntities([
                          ...testedEntities(first),
                          ...evaluationEntities(first),
                          ...datasetEntities(first),
                        ]).map((group) => (
                          <span
                            key={group.kind}
                            className={styles.typedContext}
                          >
                            {group.label}:{" "}
                            <RecordLinks records={group.records} />
                          </span>
                        ))}
                      </div>
                      <p>
                        {displayValue(first.evaluation?.attributes.protocol)}
                      </p>
                      <p className={styles.muted}>
                        {originLabel(first.origin)} · Evaluation metadata:{" "}
                        {first.evaluation?.status.replace(/_/g, " ") ||
                          "not reported"}
                      </p>
                    </th>
                  </tr>
                  {rows.map(({ result, sources, review_status }) => (
                    <tr key={result.id}>
                      <td>
                        <Link href={recordHref(result)}>
                          <strong>
                            {displayValue(result.attributes.printed_value)}
                            {result.attributes.unit === "percent" ? "%" : ""}
                          </strong>{" "}
                          {displayValue(result.attributes.metric)}
                        </Link>
                        <p className={styles.muted}>
                          Unit: {displayValue(result.attributes.unit)} ·
                          Direction:{" "}
                          {displayValue(result.attributes.metric_direction)}
                        </p>
                        {!!result.attributes.aggregation && (
                          <p>
                            Aggregation:{" "}
                            {displayValue(result.attributes.aggregation)}
                          </p>
                        )}
                      </td>
                      <td>
                        <p>
                          Uncertainty:{" "}
                          {displayValue(
                            result.attributes.uncertainty ??
                              (
                                result.attributes.missing_metadata as
                                  | Record<string, unknown>
                                  | undefined
                              )?.uncertainty,
                          ).replace(/_/g, " ")}
                        </p>
                        <p>
                          {typeof result.attributes.coverage === "string" ? (
                            `Coverage (scored/eligible): ${result.attributes.coverage}`
                          ) : (
                            <>
                              Scored:{" "}
                              {displayValue(
                                result.attributes.scored_count ??
                                  (
                                    result.attributes.coverage as
                                      | Record<string, unknown>
                                      | undefined
                                  )?.scored,
                              )}{" "}
                              · Eligible:{" "}
                              {displayValue(
                                result.attributes.eligible_count ??
                                  (
                                    result.attributes.coverage as
                                      | Record<string, unknown>
                                      | undefined
                                  )?.denominator,
                              )}
                            </>
                          )}
                        </p>
                      </td>
                      <td>
                        <span className={styles.tag}>
                          {review_status.replace(/_/g, " ")}
                        </span>
                        <EvidenceConcerns sources={sources} />
                        <Evidence
                          ids={result.source_ids}
                          locator={String(
                            result.attributes.source_locator ||
                              "Evidence location not reported",
                          )}
                          sources={sources}
                        />
                        <p className={styles.muted}>
                          Source checking is not independent reproduction.
                        </p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              );
            })}
          </table>
        </div>
      )}
      <div className={styles.downloads}>
        {cursor && (
          <button
            className={styles.button}
            disabled={loading}
            onClick={() => setCursor(undefined)}
          >
            First page
          </button>
        )}
        {data.next_cursor && (
          <button
            className={styles.button}
            disabled={loading}
            onClick={() => setCursor(data.next_cursor || undefined)}
          >
            Next results
          </button>
        )}
      </div>
    </section>
  );
}
