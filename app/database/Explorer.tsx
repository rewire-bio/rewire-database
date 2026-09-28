"use client";
import { catalogueText } from "@/lib/catalogue-text";
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
  primaryKinds,
  secondaryKinds,
  singularKindLabels,
  type CatalogueFilters,
  researchAreaLabel,
  catalogueSearch,
  browseFilterSummary,
  supportsEvaluationSummary,
  explorerPrintedScore,
  BROWSE_PAGE_SIZE,
  countLabel,
  statusLabel,
} from "@/lib/omics-browse";
import styles from "./database.module.css";
import ui from "./Explorer.module.css";

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
  const [applied, setApplied] = useState({
    filters: defaultFilters,
    cursor: undefined as string | undefined,
  });
  const [ready, setReady] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  // Scoped facet counts come back with each page of results, so an option that is
  // offered always leads somewhere. Fall back to the release-wide lists only
  // before the first response has arrived.
  const entries = (
    counts: Record<string, number> | undefined,
    fallback: string[],
  ): [string, number][] =>
    counts
      ? Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0]))
      : fallback.map((value) => [value, 0] as [string, number]);
  const availableAreas = entries(
    (data as { available?: { areas: Record<string, number> } }).available
      ?.areas,
    release.facets.areas,
  );
  if (filters.area && !availableAreas.some(([area]) => area === filters.area))
    availableAreas.push([filters.area, 0]);
  const availableStatuses = entries(
    (data as { available?: { statuses: Record<string, number> } }).available
      ?.statuses,
    release.facets.statuses,
  );
  if (
    filters.status &&
    !availableStatuses.some(([status]) => status === filters.status)
  )
    availableStatuses.push([filters.status, 0]);
  const client = useMemo(
    () => catalogueClient(release.release_id),
    [release.release_id],
  );
  useEffect(() => {
    const read = () => {
      const next = readCatalogueFilters(window.location.search);
      setFilters(next);
      setCursor(
        new URLSearchParams(window.location.search).get("cursor") || undefined,
      );
      if (!primaryKinds.some((kind) => kind === next.kind)) setMoreOpen(true);
      setSelected([]);
      setReady(true);
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);
  useEffect(() => {
    if (!ready) return;
    let active = true;
    const controller = new AbortController();
    let deadline: ReturnType<typeof setTimeout> | undefined;
    setLoading(true);
    setError("");
    const timer = setTimeout(() => {
      deadline = setTimeout(() => {
        if (!active) return;
        active = false;
        controller.abort();
        setError("Loading these records took too long. Please retry.");
        setLoading(false);
      }, 15_000);
      client
        .list(
          {
            ...filters,
            q: filters.q || undefined,
            area: filters.area || undefined,
            status: filters.status || undefined,
            origin: filters.origin || undefined,
            cursor,
            limit: BROWSE_PAGE_SIZE,
          },
          controller.signal,
        )
        .then((page) => {
          if (active) {
            setData(page);
            setApplied({ filters, cursor });
          }
        })
        .catch(() => {
          if (active)
            setError(
              "The catalogue service is unavailable. The requested records could not be loaded. Please retry.",
            );
        })
        .finally(() => {
          clearTimeout(deadline);
          if (active) setLoading(false);
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
      clearTimeout(deadline);
      controller.abort();
    };
  }, [client, filters, cursor, retry, ready]);
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
  const navigate = (
    next: CatalogueFilters,
    nextCursor?: string,
    replace = false,
  ) => {
    setFilters(next);
    setCursor(nextCursor);
    setSelected([]);
    if (!primaryKinds.some((kind) => kind === next.kind)) setMoreOpen(true);
    const url = `${window.location.pathname}${catalogueSearch(next, nextCursor)}#browse`;
    window.history[replace ? "replaceState" : "pushState"](null, "", url);
  };
  const change = (key: keyof CatalogueFilters, value: string) => {
    navigate({ ...filters, [key]: value }, undefined, key === "q");
  };
  // Controls reflect the requested URL immediately; rows belong to the last
  // successful request. Never display that page under different filters.
  const showResults =
    catalogueSearch(filters, cursor) ===
    catalogueSearch(applied.filters, applied.cursor);
  const busy = loading || (!showResults && !error);
  const returnTo = `/${catalogueSearch(applied.filters, applied.cursor)}#browse`;
  const pageInfo = data as CataloguePage & {
    previous_cursor?: string | null;
    range_start?: number;
    range_end?: number;
    evaluation_summaries?: Record<
      string,
      { evaluation_count: number; result_count: number }
    >;
  };
  return (
    <>
      <div className={ui.searchPanel}>
        <label className={ui.search} htmlFor="catalogue-search">
          Search the database
        </label>
        <input
          id="catalogue-search"
          className={ui.searchInput}
          type="search"
          value={filters.q}
          placeholder="Model name, benchmark, organism or biological task"
          aria-describedby="catalogue-search-scope"
          onChange={(event) => change("q", event.target.value)}
        />
        <div className={ui.scope}>
          <span id="catalogue-search-scope" className={ui.scopeLabel}>
            Search in
            <span className="sr-only">
              {" "}
              {kindLabels[filters.kind].toLowerCase()}
            </span>
          </span>
          <div className={ui.kinds} role="group" aria-label="Record type">
            {primaryKinds.map((kind) => (
              <button
                key={kind}
                className={ui.kind}
                aria-pressed={filters.kind === kind}
                onClick={() => change("kind", kind)}
              >
                {kindLabels[kind]}{" "}
                <span className={styles.tabCount}>
                  {(release.facets.counts[kind] || 0).toLocaleString()}
                </span>
              </button>
            ))}
          </div>
        </div>
        <details
          className={ui.more}
          open={moreOpen}
          onToggle={(event) => setMoreOpen(event.currentTarget.open)}
        >
          <summary>
            More record types
            {!primaryKinds.some((kind) => kind === filters.kind)
              ? `: ${kindLabels[filters.kind]}`
              : ""}
          </summary>
          <div
            className={styles.supporting}
            role="group"
            aria-label="Methods, evaluation design and supporting records"
          >
            <span className={styles.browseGroupLabel}>
              Methods and evaluation records
            </span>
            {secondaryKinds.map((kind) => (
              <button
                key={kind}
                aria-pressed={filters.kind === kind}
                onClick={() => change("kind", kind)}
              >
                {kindLabels[kind]}
              </button>
            ))}
          </div>
        </details>
        <p className={ui.kindDescription}>{kindDescriptions[filters.kind]}</p>
      </div>
      <div className={ui.refine} role="group" aria-labelledby="refine-label">
        <span id="refine-label" className={ui.refineLabel}>
          Narrow these results
        </span>
        <label className={ui.filter}>
          Research area
          <select
            value={filters.area}
            onChange={(event) => change("area", event.target.value)}
          >
            <option value="">All areas</option>
            {availableAreas.map(([area, count]) => (
              <option key={area} value={area}>
                {researchAreaLabel(area)} ({count})
              </option>
            ))}
          </select>
        </label>
        <label className={ui.filter}>
          Evidence status
          <select
            value={filters.status}
            onChange={(event) => change("status", event.target.value)}
          >
            <option value="">All statuses</option>
            {availableStatuses.map(([status, count]) => (
              <option key={status} value={status}>
                {statusLabel(status)} ({count})
              </option>
            ))}
          </select>
        </label>
        {["result", "evaluation"].includes(filters.kind) && (
          <div
            className={ui.origin}
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
                className={ui.kind}
                aria-pressed={filters.origin === value}
                onClick={() => change("origin", value)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {(filters.q || filters.area || filters.status || filters.origin) && (
          <button
            className={ui.clear}
            onClick={() => navigate({ ...defaultFilters, kind: filters.kind })}
          >
            Clear search and filters
          </button>
        )}
      </div>
      <div aria-live="polite">
        {busy ? (
          <p>Loading {kindLabels[filters.kind].toLowerCase()}…</p>
        ) : showResults ? (
          <p className={styles.muted}>
            {data.total.toLocaleString()} matching{" "}
            {data.total === 1
              ? singularKindLabels[applied.filters.kind].toLowerCase()
              : kindLabels[applied.filters.kind].toLowerCase()}
          </p>
        ) : null}
        {error && (
          <div className={styles.error}>
            <p>{error}</p>
            {showResults && (
              <p>
                <strong>Showing:</strong> {browseFilterSummary(applied.filters)}
              </p>
            )}
            <button
              className={styles.button}
              onClick={() => setRetry(retry + 1)}
            >
              Retry
            </button>
          </div>
        )}
      </div>
      {showResults && applied.filters.kind === "result" && (
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
      <div className={ui.rows} aria-busy={loading}>
        {(showResults ? data.items : []).map((record) => (
          <article className={ui.row} key={record.id}>
            <span className={styles.tag}>
              {singularKindLabels[record.kind]} · {statusLabel(record.status)}
            </span>
            <h3>
              <Link
                href={`${recordHref(record)}?return_to=${encodeURIComponent(returnTo)}`}
              >
                {catalogueText(record.name)}
              </Link>
            </h3>
            <p className={ui.description}>
              {catalogueText(
                (record.attributes.profile as { summary?: string } | undefined)
                  ?.summary || record.description,
              )}
            </p>
            {record.kind === "result" && (
              <>
                <p>
                  <strong>
                    {explorerPrintedScore(
                      record.attributes.printed_value,
                      record.attributes.unit,
                    )}
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
              {(record.facets.areas || []).map(researchAreaLabel).join(" · ")}
              {record.facets.areas?.length ? " · " : ""}
              {countLabel(record.source_ids.length, "source")}
            </p>
            {supportsEvaluationSummary(record.kind) &&
              pageInfo.evaluation_summaries?.[record.id] && (
                <p className={ui.counts}>
                  {pageInfo.evaluation_summaries[record.id].evaluation_count > 0
                    ? `${countLabel(pageInfo.evaluation_summaries[record.id].evaluation_count, "evaluation")} · ${countLabel(pageInfo.evaluation_summaries[record.id].result_count, "result")}`
                    : "No evaluations linked in this release"}
                </p>
              )}
          </article>
        ))}
      </div>
      {showResults && !data.total && !loading && !error && (
        <div className={ui.empty}>
          <p>No records match these filters.</p>
          <button
            className={styles.button}
            onClick={() => navigate({ ...defaultFilters, kind: filters.kind })}
          >
            Reset filters
          </button>
        </div>
      )}
      {showResults && (
        <nav className={ui.pagination} aria-label="Catalogue pages">
          <button
            className={styles.button}
            disabled={
              loading || Boolean(error) || pageInfo.previous_cursor == null
            }
            onClick={() =>
              navigate(applied.filters, pageInfo.previous_cursor || undefined)
            }
          >
            Previous
          </button>
          <span>
            Showing {pageInfo.range_start ?? (data.items.length ? 1 : 0)}–
            {pageInfo.range_end ?? data.items.length} of{" "}
            {data.total.toLocaleString()}
          </span>
          <button
            className={styles.button}
            disabled={loading || Boolean(error) || !data.next_cursor}
            onClick={() =>
              navigate(applied.filters, data.next_cursor || undefined)
            }
          >
            Next
          </button>
        </nav>
      )}
    </>
  );
}
