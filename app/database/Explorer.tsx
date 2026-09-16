"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  OmicsRecord,
  recordHref,
  compareResults,
  originLabel,
  displayValue,
} from "@/lib/omics";
import styles from "./database.module.css";
import {
  defaultFilters,
  filterCatalogue,
  readCatalogueFilters,
  kindLabels,
  kindDescriptions,
  type CatalogueFilters,
} from "@/lib/omics-browse";
export default function Explorer({ records }: { records: OmicsRecord[] }) {
  const [filters, setFilters] = useState(defaultFilters);
  const { kind, q: query, area, status, origin } = filters;
  const [limit, setLimit] = useState(20);
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => {
    const read = () => {
      setFilters(readCatalogueFilters(window.location.search));
      setLimit(20);
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);
  const changeFilter = (key: keyof CatalogueFilters, value: string) => {
    const next = { ...filters, [key]: value };
    setFilters(next);
    setLimit(20);
    const url = new URL(window.location.href);
    for (const [name, val] of Object.entries(next)) {
      if (!val || (name === "kind" && val === "model"))
        url.searchParams.delete(name);
      else url.searchParams.set(name, val);
    }
    window.history.replaceState(null, "", url);
  };
  const areas = useMemo(
    () =>
      Array.from(
        new Set(records.flatMap((record) => record.facets.areas || [])),
      ).sort(),
    [records],
  );
  const statuses = useMemo(
    () => Array.from(new Set(records.map((record) => record.status))).sort(),
    [records],
  );
  const filtered = useMemo(
    () => filterCatalogue(records, filters),
    [records, filters],
  );
  const selectedResults = records.filter((record) =>
    selected.includes(record.id),
  );
  const comparison = compareResults(selectedResults, records);
  return (
    <>
      <div
        className={styles.tabs}
        role="group"
        aria-label="Browse the database"
      >
        {(["model", "benchmark", "dataset", "baseline", "result"] as const).map(
          (item) => (
            <button
              key={item}
              className={styles.button}
              aria-pressed={kind === item}
              onClick={() => changeFilter("kind", item)}
            >
              {kindLabels[item]}{" "}
              <span className={styles.tabCount}>
                {records.filter((record) => record.kind === item).length}
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
        {(["source", "evaluation", "claim"] as const).map((item) => (
          <button
            key={item}
            aria-pressed={kind === item}
            onClick={() => changeFilter("kind", item)}
          >
            {kindLabels[item]}
          </button>
        ))}
      </div>
      <p className={styles.kindDescription}>{kindDescriptions[kind]}</p>
      <div className={styles.filters}>
        <label className={styles.label}>
          Search
          <input
            type="search"
            value={query}
            onChange={(event) => {
              changeFilter("q", event.target.value);
            }}
            placeholder="Model, task or biological context"
          />
        </label>
        <label className={styles.label}>
          Research area
          <select
            value={area}
            onChange={(event) => {
              changeFilter("area", event.target.value);
            }}
          >
            <option value="">All areas</option>
            {areas.map((item) => (
              <option key={item} value={item}>
                {item.replace(/-/g, " ")}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.label}>
          Evidence status
          <select
            value={status}
            onChange={(event) => {
              changeFilter("status", event.target.value);
            }}
          >
            <option value="">All statuses</option>
            {statuses.map((item) => (
              <option key={item} value={item}>
                {item.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
      </div>
      {["result", "evaluation"].includes(kind) && (
        <div
          className={styles.originFilter}
          role="group"
          aria-label="Result provenance"
        >
          <span>Evidence from</span>
          {(
            [
              ["", "All evaluations"],
              ["literature", "Published evaluations"],
              ["rewire", "Rewire evaluations"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              className={styles.button}
              aria-pressed={origin === value}
              onClick={() => changeFilter("origin", value)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <p className={styles.muted} aria-live="polite">
        {filtered.length} matching records
      </p>
      {kind === "result" && (
        <div className={styles.notice}>
          <strong>Compare results</strong>
          <p>
            Select two or more records to check protocol compatibility.
            Selection order does not imply ranking.
          </p>
          {selected.length > 0 && (
            <>
              <p>
                {selected.length} selected.{" "}
                {comparison.compatible
                  ? "The recorded comparison fields match. Review the original evidence before interpreting differences."
                  : "These records cannot be compared automatically."}
              </p>
              <ul className={styles.list}>
                {comparison.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              <button className={styles.button} onClick={() => setSelected([])}>
                Clear selection
              </button>
            </>
          )}
        </div>
      )}
      <div className={styles.grid}>
        {filtered.slice(0, limit).map((record) => {
          const evaluation = records.find(
            (candidate) =>
              candidate.id ===
              record.links.find((link) => link.relation === "evaluation")
                ?.target_id,
          );
          return (
            <article className={styles.card} key={record.id}>
              <span className={styles.tag}>
                {record.kind} · {record.status.replace(/_/g, " ")}
              </span>
              <h2>
                <Link href={recordHref(record)}>{record.name}</Link>
              </h2>
              <p>{record.description}</p>
              {record.kind === "result" && (
                <>
                  <p>
                    <strong>
                      {displayValue(record.attributes.printed_value)}
                    </strong>{" "}
                    · {displayValue(record.attributes.metric)}
                  </p>
                  <p className={styles.muted}>
                    {originLabel(evaluation?.attributes.origin)}
                  </p>
                  <label className={styles.check}>
                    <input
                      type="checkbox"
                      checked={selected.includes(record.id)}
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
                {(record.facets.areas || []).join(" · ")}
                {record.source_ids.length > 0
                  ? ` · ${record.source_ids.length} linked source${record.source_ids.length === 1 ? "" : "s"}`
                  : ""}
              </p>
            </article>
          );
        })}
      </div>
      {filtered.length === 0 && <p>No records match these filters.</p>}
      {filtered.length > limit && (
        <button className={styles.button} onClick={() => setLimit(limit + 20)}>
          Show more records
        </button>
      )}
    </>
  );
}
