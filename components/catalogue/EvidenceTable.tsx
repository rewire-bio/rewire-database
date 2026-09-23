"use client";
import EvidenceValue from "./EvidenceValue";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { catalogueClient, type EvidencePage } from "@/lib/catalogue-client";
import { safeSourceUrl } from "@/lib/omics";
import styles from "@/app/database/database.module.css";

const scopes = {
  individual_claim: "Individual claims",
  record_context: "Context-only references",
  catalogue_metadata: "Catalogue metadata",
  source_metadata: "Source metadata",
};
export default function EvidenceTable({
  id,
  initial,
  initialScope,
  collapsed = false,
  sectionId = "evidence",
}: {
  id: string;
  initial: EvidencePage;
  initialScope: string;
  collapsed?: boolean;
  sectionId?: string;
}) {
  const client = useMemo(
    () => catalogueClient(initial.release_id),
    [initial.release_id],
  );
  const [data, setData] = useState(initial);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [scope, setScope] = useState(initialScope);
  const [cursor, setCursor] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    // Static rows belong to a pinned release, so refreshing the identical
    // first page cannot add evidence. Keep requests for deliberate changes.
    if (!q && scope === initialScope && !cursor && !retry) {
      setData(initial);
      setLoading(false);
      setError("");
      return;
    }
    let active = true;
    setLoading(true);
    setError("");
    client
      .evidence({
        id,
        q: q || undefined,
        scope: scope || undefined,
        cursor,
        limit: 10,
      })
      .then((value) => {
        if (active) setData(value);
      })
      .catch(() => {
        if (active)
          setError(
            "Evidence could not be refreshed. The last loaded rows remain below; requested filters have not been applied. The complete release is available to download.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, id, q, scope, cursor, retry, initial, initialScope]);
  const release = `/omics/releases/${initial.release_id}`;
  return (
    <section
      id={sectionId}
      className={styles.section}
      aria-labelledby="evidence-title"
    >
      <h2 id="evidence-title">Evidence table</h2>
      <details className={styles.profileDisclosure} open={!collapsed}>
        <summary>Inspect claims, sources and review details</summary>
        <p>
          Trace each statement to its source and review. A context-only
          reference supports the record generally; it does not verify an
          individual field. Source checking does not reproduce an experiment.
        </p>
        <p className={styles.muted}>
          One row per statement and cited source. Multiple citations are not
          independent evaluations. Shared locators are labelled explicitly.
        </p>
        <form
          className={styles.filters}
          onSubmit={(event) => {
            event.preventDefault();
            setQ(search);
            setCursor(undefined);
          }}
        >
          <label className={styles.label}>
            Search evidence
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              maxLength={300}
              placeholder="Property, claim or source"
            />
          </label>
          <label className={styles.label}>
            Evidence scope
            <select
              value={scope}
              onChange={(event) => {
                setScope(event.target.value);
                setCursor(undefined);
              }}
            >
              <option value="">All recorded fields</option>
              {Object.entries(scopes).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className={styles.button} disabled={loading}>
            Search evidence
          </button>
        </form>
        <div aria-live="polite">
          <p className={styles.muted}>
            {loading
              ? "Updating evidence…"
              : `${data.total} evidence ${data.total === 1 ? "row" : "rows"} matching the loaded filters`}
          </p>
          {error && (
            <p role="alert">
              {error}{" "}
              <button
                className={styles.button}
                onClick={() => setRetry((v) => v + 1)}
              >
                Retry evidence
              </button>
            </p>
          )}
        </div>
        <div
          className={styles.tableScroll}
          tabIndex={0}
          role="region"
          aria-label="Evidence and original sources"
        >
          <table className={`${styles.resultTable} ${styles.evidenceTable}`}>
            <caption>
              Claims, original sources and review scope · Release{" "}
              {initial.release_id}
            </caption>
            <thead>
              <tr>
                <th scope="col">Property and statement</th>
                <th scope="col">Original source and location</th>
                <th scope="col">Review and provenance</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((row) => (
                <tr key={row.row_id}>
                  <th scope="row">
                    <strong>{row.property}</strong>
                    <div className={styles.evidenceValue}>
                      <EvidenceValue
                        valueJson={row.value_json}
                        fallback={row.value}
                        fieldPath={row.field_path}
                      />
                    </div>
                    <small>{scopes[row.evidence_scope]}</small>
                  </th>
                  <td>
                    {row.source_id ? (
                      <>
                        <Link href={`/database/source/${row.source_id}/`}>
                          {row.source_title}
                        </Link>
                        {safeSourceUrl(row.source_url) && (
                          <p>
                            <a href={safeSourceUrl(row.source_url)}>
                              Original source ↗
                            </a>
                          </p>
                        )}
                        <p>
                          {row.source_locator ||
                            "No field-specific location recorded"}
                        </p>
                        {row.locator_scope === "shared_claim_locator" && (
                          <p className={styles.muted}>
                            Shared locator for this statement’s cited sources;
                            not a separate locator for each citation.
                          </p>
                        )}
                        <p className={styles.muted}>
                          Version: {row.source_version || "Not recorded"}
                          <br />
                          Retrieved: {row.retrieved_at || "Not recorded"}
                        </p>
                      </>
                    ) : (
                      "No external source attached; see review scope."
                    )}
                  </td>
                  <td>
                    <strong>{row.review_status.replace(/_/g, " ")}</strong>
                    <p>
                      {row.review_method.replace(/_/g, " ") ||
                        "No individual claim review recorded"}
                      {row.review_date && ` · ${row.review_date}`}
                    </p>
                    {row.evidence_origin && (
                      <p>{row.evidence_origin.replace(/_/g, " ")}</p>
                    )}
                    {row.source_concerns && (
                      <p className={styles.notice}>
                        Source has a recorded evidence concern. Consult its
                        source page before using the claim.
                      </p>
                    )}
                    <details>
                      <summary>Audit details</summary>
                      <p>{row.review_note}</p>
                      {row.review_status === "conflicting_claim" && (
                        <p>
                          Conflicting source claim:{" "}
                          <code>{row.claimed_value_json}</code>. Claim record
                          status: {row.claim_record_status}.
                        </p>
                      )}
                      <p>
                        Field: <code>{row.field_path}</code>
                      </p>
                      {row.claim_id && (
                        <p>
                          Claim:{" "}
                          <Link href={`/database/claim/${row.claim_id}/`}>
                            {row.claim_id}
                          </Link>
                        </p>
                      )}
                      <p>
                        Source artifact SHA-256:{" "}
                        <code>{row.artifact_sha256 || "Not recorded"}</code>
                      </p>
                      <p>Hash scope: {row.hash_scope}</p>
                      {row.artifact_format && (
                        <p>Format: {row.artifact_format}</p>
                      )}
                      {row.artifact_member && (
                        <p>Archive member: {row.artifact_member}</p>
                      )}
                      {safeSourceUrl(row.artifact_url) && (
                        <p>
                          <a href={safeSourceUrl(row.artifact_url)}>
                            Inspected artifact
                          </a>
                        </p>
                      )}
                      {row.extraction_artifact_sha256 && (
                        <p>
                          Extraction artifact SHA-256:{" "}
                          <code>{row.extraction_artifact_sha256}</code>
                        </p>
                      )}
                      {safeSourceUrl(row.extraction_artifact_url) && (
                        <p>
                          <a href={safeSourceUrl(row.extraction_artifact_url)}>
                            Extraction artifact
                          </a>
                        </p>
                      )}
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data.items.length && (
          <p>
            No evidence rows match these filters. Choose another scope or clear
            the search.
          </p>
        )}
        <div className={styles.downloads}>
          {cursor && (
            <button
              className={styles.button}
              disabled={loading}
              onClick={() => setCursor(undefined)}
            >
              First evidence page
            </button>
          )}
          {data.next_cursor && (
            <button
              className={styles.button}
              disabled={loading}
              onClick={() => setCursor(data.next_cursor || undefined)}
            >
              Next evidence rows
            </button>
          )}
          <a href={`${release}/evidence.csv`} download>
            All evidence (CSV)
          </a>
          <a href={`${release}/evidence.jsonl`} download>
            All evidence (JSONL)
          </a>
          <Link href="/evidence/">How to read the evidence</Link>
        </div>
      </details>
    </section>
  );
}
