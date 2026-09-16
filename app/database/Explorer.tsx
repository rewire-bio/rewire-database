"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  catalogueClient,
  type CataloguePage,
  type CatalogueRelease,
  type Comparison,
} from "@/lib/catalogue-client";
import { recordHref, displayValue } from "@/lib/omics";
import {
  defaultFilters,
  readCatalogueFilters,
  kindLabels,
  kindDescriptions,
  type CatalogueFilters,
} from "@/lib/omics-browse";
import styles from "./database.module.css";

export default function Explorer({
  initial,
  release,
}: {
  initial: CataloguePage;
  release: CatalogueRelease;
}) {
  const [filters, setFilters] = useState(defaultFilters);
  const [data, setData] = useState(initial);
  const [cursor, setCursor] = useState<string | undefined>();
  const [selected, setSelected] = useState<string[]>([]);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const client = useMemo(
    () => catalogueClient(release.release_id),
    [release.release_id],
  );
  useEffect(() => {
    const read = () => {
      setFilters(readCatalogueFilters(window.location.search));
      setCursor(undefined);
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const timer = setTimeout(
      () =>
        client
          .list({
            ...filters,
            q: filters.q || undefined,
            area: filters.area || undefined,
            status: filters.status || undefined,
            origin: filters.origin || undefined,
            cursor,
            limit: 20,
          })
          .then((page) => {
            if (active) setData(page);
          })
          .catch(() => {
            if (active)
              setError(
                "The catalogue service is unavailable. Showing the last loaded page; requested filters have not been applied.",
              );
          })
          .finally(() => {
            if (active) setLoading(false);
          }),
      200,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [client, filters, cursor, retry]);
  useEffect(() => {
    let active = true;
    setComparison(null);
    if (selected.length >= 2)
      client
        .compare({ ids: selected })
        .then((result) => {
          if (active) setComparison(result);
        })
        .catch(() => {
          if (active)
            setComparison({
              release_id: release.release_id,
              compatible: false,
              reasons: [
                "Compatibility service unavailable. No comparison has been established.",
              ],
            });
        });
    return () => {
      active = false;
    };
  }, [selected, client, release.release_id]);
  const change = (key: keyof CatalogueFilters, value: string) => {
    const next = { ...filters, [key]: value };
    setFilters(next);
    setCursor(undefined);
    const url = new URL(window.location.href);
    for (const [key, value] of Object.entries(next)) {
      if (!value || (key === "kind" && value === "model"))
        url.searchParams.delete(key);
      else url.searchParams.set(key, value);
    }
    window.history.replaceState(null, "", url);
  };
  return (
    <>
      <div
        className={styles.tabs}
        role="group"
        aria-label="Browse the database"
      >
        {(["model", "benchmark", "dataset", "baseline", "result"] as const).map(
          (kind) => (
            <button
              key={kind}
              className={styles.button}
              aria-pressed={filters.kind === kind}
              onClick={() => change("kind", kind)}
            >
              {kindLabels[kind]}{" "}
              <span className={styles.tabCount}>
                {release.facets.counts[kind] || 0}
              </span>
            </button>
          ),
        )}
      </div>
      <div
        className={styles.supporting}
        role="group"
        aria-label="Supporting records"
      >
        <span>Supporting records</span>
        {(["source", "evaluation", "claim"] as const).map((kind) => (
          <button
            key={kind}
            aria-pressed={filters.kind === kind}
            onClick={() => change("kind", kind)}
          >
            {kindLabels[kind]}
          </button>
        ))}
      </div>
      <p className={styles.kindDescription}>{kindDescriptions[filters.kind]}</p>
      <div className={styles.filters}>
        <label className={styles.label}>
          Search
          <input
            type="search"
            value={filters.q}
            placeholder="Model, task or biological context"
            onChange={(event) => change("q", event.target.value)}
          />
        </label>
        <label className={styles.label}>
          Research area
          <select
            value={filters.area}
            onChange={(event) => change("area", event.target.value)}
          >
            <option value="">All areas</option>
            {release.facets.areas.map((area) => (
              <option key={area} value={area}>
                {area.replace(/-/g, " ")}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.label}>
          Evidence status
          <select
            value={filters.status}
            onChange={(event) => change("status", event.target.value)}
          >
            <option value="">All statuses</option>
            {release.facets.statuses.map((status) => (
              <option key={status} value={status}>
                {status.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
      </div>
      {["result", "evaluation"].includes(filters.kind) && (
        <div
          className={styles.originFilter}
          role="group"
          aria-label="Result provenance"
        >
          <span>Evidence from</span>
          {[
            ["", "All evaluations"],
            ["literature", "Published evaluations"],
            ["rewire", "Rewire evaluations"],
          ].map(([value, label]) => (
            <button
              key={value}
              className={styles.button}
              aria-pressed={filters.origin === value}
              onClick={() => change("origin", value)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <div aria-live="polite">
        {loading ? (
          <p>Loading catalogue…</p>
        ) : (
          <p className={styles.muted}>
            {data.total} matching records · Release {release.release_id}
          </p>
        )}
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
      {filters.kind === "result" && (
        <div className={styles.notice}>
          <strong>Compare results</strong>
          <p>
            Select 2–20 records to check protocol compatibility. This does not
            create a universal ranking.
          </p>
          {selected.length > 0 && (
            <>
              <p>{selected.length} selected.</p>
              {comparison && (
                <>
                  <p>
                    {comparison.compatible
                      ? "Recorded comparison conditions match. Inspect the original evidence before interpreting differences."
                      : "These results cannot be compared automatically."}
                  </p>
                  <ul className={styles.list}>
                    {comparison.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </>
              )}
              <button className={styles.button} onClick={() => setSelected([])}>
                Clear selection
              </button>
            </>
          )}
        </div>
      )}
      <div className={styles.grid} aria-busy={loading}>
        {data.items.map((record) => (
          <article className={styles.card} key={record.id}>
            <span className={styles.tag}>
              {record.kind} · {record.status.replace(/_/g, " ")}
            </span>
            <h2>
              <Link href={recordHref(record)}>{record.name}</Link>
            </h2>
            <p>
              {(record.attributes.profile as { summary?: string } | undefined)
                ?.summary || record.description}
            </p>
            {record.kind === "result" && (
              <>
                <p>
                  <strong>
                    {displayValue(record.attributes.printed_value)}
                    {record.attributes.unit === "percent" ? "%" : ""}
                  </strong>{" "}
                  · {displayValue(record.attributes.metric)}
                </p>
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    checked={selected.includes(record.id)}
                    disabled={
                      !selected.includes(record.id) && selected.length >= 20
                    }
                    onChange={(event) =>
                      setSelected(
                        event.target.checked
                          ? [...selected, record.id]
                          : selected.filter((id) => id !== record.id),
                      )
                    }
                  />
                  Include in compatibility check
                </label>
              </>
            )}
            <p className={styles.muted}>
              {(record.facets.areas || []).join(" · ")} ·{" "}
              {record.source_ids.length} linked sources
            </p>
          </article>
        ))}
      </div>
      {!data.total && <p>No records match these filters.</p>}
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
            Next records
          </button>
        )}
      </div>
    </>
  );
}
