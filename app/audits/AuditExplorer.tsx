"use client";
import { catalogueText } from "@/lib/catalogue-text";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import type {
  AuditCheck,
  AuditIndexRow,
  AuditRun,
  AuditResolution,
} from "@/services/omics/src/audit";
import styles from "@/app/database/database.module.css";
type Page<T> = {
  items: T[];
  total: number;
  next_cursor: string | null;
  resolutions?: AuditResolution[];
  record_url?: string | null;
  source_urls?: Record<string, string | null>;
};
type Check = AuditCheck & { applies_to_current_record?: boolean };
async function query<T>(name: string, input: unknown): Promise<T> {
  const response = await fetch(
    `/api/trpc/catalogue.${name}?input=${encodeURIComponent(JSON.stringify(input))}`,
  );
  if (!response.ok)
    throw Error("Audit data could not be loaded. Please retry.");
  const json = await response.json();
  if (!json.result?.data) throw Error("Invalid audit response");
  return json.result.data;
}
export default function AuditExplorer({
  releaseId,
  runs,
  initial,
}: {
  releaseId: string;
  runs: AuditRun[];
  initial: Page<Omit<AuditIndexRow, "chunk_ids">>;
}) {
  const [rows, setRows] = useState(initial);
  const [q, setQ] = useState("");
  const [outcome, setOutcome] = useState("");
  const [run, setRun] = useState("");
  const [kind, setKind] = useState("");
  const [category, setCategory] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [checks, setChecks] = useState<Page<Check> | null>(null);
  const [record, setRecord] = useState("");
  const requestVersion = useRef(0);
  const filters = {
    release_id: releaseId,
    q: q || undefined,
    outcome: outcome || undefined,
    run_id: run || undefined,
    kind: kind || undefined,
    category: category || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
  };
  async function search(cursor?: string) {
    const version = ++requestVersion.current;
    setBusy(true);
    setError("");
    try {
      const page = await query<Page<Omit<AuditIndexRow, "chunk_ids">>>(
        "auditRecords",
        { ...filters, cursor, limit: 25 },
      );
      if (version === requestVersion.current) setRows(page);
    } catch (e) {
      if (version === requestVersion.current) setError(String(e));
    } finally {
      if (version === requestVersion.current) setBusy(false);
    }
  }
  async function history(id: string, cursor?: string) {
    const version = ++requestVersion.current;
    setBusy(true);
    setError("");
    try {
      const page = await query<Page<Check>>("auditChecks", {
        release_id: releaseId,
        record_id: id,
        cursor,
        limit: 25,
      });
      if (version !== requestVersion.current) return;
      setChecks((prev) =>
        cursor && prev
          ? { ...page, items: [...prev.items, ...page.items] }
          : page,
      );
      setRecord(id);
    } catch (e) {
      if (version === requestVersion.current) setError(String(e));
    } finally {
      if (version === requestVersion.current) setBusy(false);
    }
  }
  async function revealCheck(id: string) {
    const version = ++requestVersion.current;
    setBusy(true);
    setError("");
    try {
      let current = checks;
      while (
        current &&
        !current.items.some((c) => c.id === id) &&
        current.next_cursor
      ) {
        const page = await query<Page<Check>>("auditChecks", {
          release_id: releaseId,
          record_id: record,
          cursor: current.next_cursor,
          limit: 25,
        });
        current = { ...page, items: [...current.items, ...page.items] };
      }
      if (version !== requestVersion.current) return;
      setChecks(current);
      if (current?.items.some((c) => c.id === id))
        requestAnimationFrame(() =>
          document.getElementById(id)?.scrollIntoView({ block: "center" }),
        );
    } catch (e) {
      if (version === requestVersion.current) setError(String(e));
    } finally {
      if (version === requestVersion.current) setBusy(false);
    }
  }
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("record");
    if (id) void history(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
        className={styles.filters}
      >
        <label className={styles.label}>
          Record name or ID{" "}
          <input value={q} onChange={(e) => setQ(e.target.value)} />
        </label>{" "}
        <label className={styles.label}>
          Outcome{" "}
          <select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
            <option value="">All outcomes</option>
            {[
              "supported",
              "contradicted",
              "insufficient_evidence",
              "inaccessible",
              "not_applicable",
            ].map((o) => (
              <option key={o} value={o}>
                {o.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>{" "}
        <label className={styles.label}>
          Run{" "}
          <select value={run} onChange={(e) => setRun(e.target.value)}>
            <option value="">All audits</option>
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                {r.id}
              </option>
            ))}
          </select>
        </label>{" "}
        <label className={styles.label}>
          Record type{" "}
          <input
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            placeholder="e.g. result"
          />
        </label>{" "}
        <label className={styles.label}>
          Check{" "}
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All checks</option>
            {[
              "structure",
              "source_access",
              "source_transcription",
              "scientific_context",
              "metadata",
              "historical_receipt",
            ].map((c) => (
              <option key={c} value={c}>
                {c.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>{" "}
        <label className={styles.label}>
          From{" "}
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </label>{" "}
        <label className={styles.label}>
          To{" "}
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </label>{" "}
        <button className={styles.button} disabled={busy} type="submit">
          Filter audit
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      <p aria-live="polite">
        {busy
          ? "Loading…"
          : `${rows.total.toLocaleString()} records with audit history`}
      </p>
      <div
        className={styles.tableScroll}
        tabIndex={0}
        role="region"
        aria-label="Audit records"
      >
        <table className={styles.resultTable}>
          <caption>
            Audit coverage by record. Outcomes include historical checks, not an
            overall scientific quality grade.
          </caption>
          <thead>
            <tr>
              <th>Record</th>
              <th>Checks</th>
              <th>Outcomes</th>
              <th>Latest check</th>
              <th>History</th>
            </tr>
          </thead>
          <tbody>
            {rows.items.map((r) => (
              <tr key={r.record_id}>
                <td>
                  <a
                    href={`?record=${encodeURIComponent(r.record_id)}`}
                    onClick={(e) => {
                      e.preventDefault();
                      if (!busy) void history(r.record_id);
                    }}
                  >
                    {catalogueText(r.record_name)}
                  </a>
                  <br />
                  {r.record_kind}
                </td>
                <td>{r.check_count}</td>
                <td>
                  {r.outcomes.map((o) => o.replaceAll("_", " ")).join(", ")}
                </td>
                <td>{r.latest_check_at.slice(0, 10)}</td>
                <td>
                  <button
                    className={styles.button}
                    disabled={busy}
                    onClick={() => void history(r.record_id)}
                  >
                    View checks
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.next_cursor && (
        <button
          className={styles.button}
          disabled={busy}
          onClick={() => void search(rows.next_cursor!)}
        >
          Next records
        </button>
      )}
      {checks && (
        <section aria-label="Record audit history" className={styles.section}>
          <h2>Audit history</h2>
          <p>
            {record} · {checks.total} checks
          </p>
          {checks.record_url ? (
            <p>
              <Link href={checks.record_url}>View current record</Link>
            </p>
          ) : (
            <p>
              This record is available through its archived release downloads.
            </p>
          )}
          <p>
            Checks apply to the exact content hash recorded at review. A newer
            passing check does not silently resolve a contradictory finding.
          </p>
          {checks.items.map((c) => (
            <article
              key={c.id}
              id={c.id}
              style={{ overflowWrap: "anywhere", margin: "2rem 0" }}
            >
              <h3>
                {c.category.replaceAll("_", " ")}:{" "}
                {c.outcome.replaceAll("_", " ")}
              </h3>
              <p>{c.explanation}</p>
              {c.applies_to_current_record === false && (
                <p>
                  Historical, changed or resolved: this check does not establish
                  the current record’s status.
                </p>
              )}
              <p>
                {c.checked_at} · {c.run_id}
              </p>
              <details>
                <summary>Fields, sources and audit identity</summary>
                <p>Check: {c.id}</p>
                <p>
                  Recorded values:{" "}
                  <code>
                    {c.recorded_value_json ||
                      "Inspect the pinned record version"}
                  </code>
                </p>
                <p>
                  Source observation:{" "}
                  <code>
                    {c.observed_value_json || "See the linked review receipt"}
                  </code>
                </p>
                <p>Fields: {c.field_paths.join(", ")}</p>
                <p>
                  Content SHA-256: <code>{c.target_sha256}</code>
                </p>
                <ul>
                  {c.source_ids.map((id) => (
                    <li key={id}>
                      {checks.source_urls?.[id] ? (
                        <Link href={checks.source_urls[id]!}>{id}</Link>
                      ) : (
                        id
                      )}
                    </li>
                  ))}
                </ul>
                <p>{c.source_locators.join("; ")}</p>
                <p>Receipts: {c.receipt_ids.join(", ") || "None"}</p>
                <p>Earlier checks: {c.prior_check_ids.join(", ") || "None"}</p>
              </details>
            </article>
          ))}
          {checks.resolutions?.map((r) => (
            <article
              key={r.id}
              style={{ overflowWrap: "anywhere", margin: "2rem 0" }}
            >
              <h3>Resolution {r.id}</h3>
              <p>{r.explanation}</p>
              <p>
                {r.resolved_at} · Published in {r.published_release_id}
              </p>
              <p>
                Earlier findings:{" "}
                {r.check_ids.map((id) => (
                  <button
                    className={styles.button}
                    key={id}
                    disabled={busy}
                    onClick={() => void revealCheck(id)}
                  >
                    {id}
                  </button>
                ))}
              </p>
              <p>
                Follow-up checks:{" "}
                {r.followup_check_ids.map((id) => (
                  <button
                    className={styles.button}
                    key={id}
                    disabled={busy}
                    onClick={() => void revealCheck(id)}
                  >
                    {id}
                  </button>
                ))}
              </p>
            </article>
          ))}
          {checks.next_cursor && (
            <button
              className={styles.button}
              disabled={busy}
              onClick={() => void history(record, checks.next_cursor!)}
            >
              More checks
            </button>
          )}
        </section>
      )}
    </>
  );
}
