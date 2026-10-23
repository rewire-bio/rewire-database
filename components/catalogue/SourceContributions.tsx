import Link from "next/link";
import type { ReactNode } from "react";
import { catalogueText } from "@/lib/catalogue-text";
import { claimFieldLabel } from "@/lib/evidence-labels";
import { displayValue, recordHref, type OmicsRecord } from "@/lib/omics";
import { countLabel, kindLabels, singularKindLabels } from "@/lib/omics-browse";
import { metricName } from "@/lib/result-labels";
import type { PreparedQuery } from "@/lib/catalogue-build";
import styles from "@/app/database/database.module.css";

type Kind = keyof typeof kindLabels;
type Page = { total: number; range_start: number; range_end: number; previous_cursor: string | null; next_cursor: string | null };
/** One cursor per list, from the page URL (`?result=<cursor>`); the other lists stay on their first page. */
export type SourcePageParams = Partial<Record<string, string | string[]>>;

const RESULTS_LIMIT = 50;
const RECORDS_LIMIT = 25;
const anchor = (kind: string) => (kind === "result" ? "source-results" : kind === "claim" ? "source-claims" : `source-${kind.replace(/_/g, "-")}`);
const cursorFor = (params: SourcePageParams, kind: string) => {
  const value = params[kind];
  return typeof value === "string" && value.length <= 8000 ? value : undefined;
};
/** A cursor from an older release or an edited URL falls back to the first page. */
function firstPageOnError<T>(read: (cursor?: string) => T, cursor?: string): T {
  if (!cursor) return read();
  try { return read(cursor); } catch { return read(); }
}

function Pager({ kind, page, label }: { kind: string; page: Page; label: string }) {
  if (page.previous_cursor === null && !page.next_cursor) return null;
  const href = (cursor: string) => `?${cursor ? new URLSearchParams({ [kind]: cursor }) : ""}#${anchor(kind)}`;
  return (
    <nav className={styles.downloads} aria-label={`${label} pages`}>
      {page.previous_cursor !== null && <a href={href(page.previous_cursor)} rel="prev">Previous</a>}
      <span>{label} {page.range_start.toLocaleString()} to {page.range_end.toLocaleString()} of {page.total.toLocaleString()}</span>
      {page.next_cursor && <a href={href(page.next_cursor)} rel="next">Next</a>}
    </nav>
  );
}

const linked = (records: { id: string; kind: string; name: string }[]): ReactNode =>
  records.length
    ? records.map((record, i) => <span key={record.id}>{i > 0 && ", "}<Link href={recordHref(record as OmicsRecord)}>{catalogueText(record.name)}</Link></span>)
    : "Not recorded";

/** What the catalogue took from one source: counts by kind, its results, its claims
 * and the other records citing it. Read from the release's source index (serving
 * contract 3.1); a release without the index shows nothing here. */
export default function SourceContributions({ query, id, params }: { query: PreparedQuery; id: string; params: SourcePageParams }) {
  const overview = query.sourceRecords({ id, limit: RECORDS_LIMIT });
  if (!overview.total) return null;
  const kinds = Object.keys(overview.counts) as Kind[];
  const pageOf = (kind: Kind) =>
    firstPageOnError((cursor) => query.sourceRecords({ id, kind, cursor, limit: RECORDS_LIMIT }).pages[kind], cursorFor(params, kind));
  const results = overview.counts.result
    ? firstPageOnError((cursor) => query.sourceResults({ id, cursor, limit: RESULTS_LIMIT }), cursorFor(params, "result"))
    : null;
  const recordsOf = (page: { items: string[] }) =>
    page.items.flatMap((recordId) => { const record = query.record(recordId); return record ? [record as OmicsRecord] : []; });
  const described = kinds.filter((kind) => kind !== "result" && kind !== "claim");
  return (
    <>
      <section id="source-contributions" className={styles.section}>
        <h2>What this source contributed</h2>
        <p className={styles.muted}>Records in this release that cite this source. A record can cite several sources.</p>
        <ul className={styles.list}>
          {kinds.map((kind) => (
            <li key={kind}>
              <a href={`#${anchor(kind)}`}>{countLabel(overview.counts[kind], singularKindLabels[kind].toLowerCase(), kindLabels[kind].toLowerCase())}</a>
            </li>
          ))}
        </ul>
      </section>
      {results && (
        <section id="source-results" className={styles.section}>
          <h2>Results</h2>
          <p className={styles.muted}>Values as the source printed them. Compare results only under compatible protocols, datasets and metrics.</p>
          <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Results from this source">
            <table className={styles.resultTable}>
              <thead><tr><th scope="col">Model or configuration</th><th scope="col">Metric</th><th scope="col">Value</th><th scope="col">Dataset</th><th scope="col">Evaluation</th></tr></thead>
              <tbody>
                {results.items.map((row) => (
                  <tr key={row.id}><th scope="row">{linked(row.tested)}</th>
                    <td>{metricName(row.metric, row.qualifier)}</td>
                    <td><Link href={recordHref({ id: row.id, kind: "result" } as OmicsRecord)}>{row.printed_value || "Not recorded"}{row.unit ? ` ${row.unit}` : ""}</Link></td>
                    <td>{linked(row.datasets)}</td>
                    <td>{row.evaluation ? linked([row.evaluation]) : "Not recorded"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager kind="result" page={results} label="Results" />
        </section>
      )}
      {overview.counts.claim > 0 && (() => {
        const page = pageOf("claim");
        return (
          <section id="source-claims" className={styles.section}>
            <h2>Claims</h2>
            <p className={styles.muted}>Statements this source supports, each with where in the source it was checked.</p>
            <ul className={styles.list}>
              {recordsOf(page).map((claim) => {
                const field = typeof claim.attributes.field === "string" ? claim.attributes.field : "";
                const link = /^links:[a-z_]+:(.+)$/.exec(field);
                const target = link ? query.record(link[1]) : null;
                const value = claim.attributes.value;
                const locator = claim.attributes.source_locator;
                return (
                  <li key={claim.id}>
                    <Link href={recordHref(claim)}>{catalogueText(claim.name)}</Link>
                    {field && <>: {claimFieldLabel(field)} {target ? catalogueText(target.name) : value !== undefined ? displayValue(value) : ""}</>}
                    {typeof locator === "string" && locator && <span className={styles.muted}> ({catalogueText(locator)})</span>}
                  </li>
                );
              })}
            </ul>
            <Pager kind="claim" page={page} label="Claims" />
          </section>
        );
      })()}
      {described.length > 0 && (
        <section id="source-records" className={styles.section}>
          <h2>Models, benchmarks and other records</h2>
          {described.map((kind) => {
            const page = pageOf(kind);
            return (
              <section key={kind} id={anchor(kind)}>
                <h3>{kindLabels[kind]} ({overview.counts[kind].toLocaleString()})</h3>
                <ul className={styles.list}>
                  {recordsOf(page).map((record) => (
                    <li key={record.id}><Link href={recordHref(record)}>{catalogueText(record.name)}</Link></li>
                  ))}
                </ul>
                <Pager kind={kind} page={page} label={kindLabels[kind]} />
              </section>
            );
          })}
        </section>
      )}
    </>
  );
}
