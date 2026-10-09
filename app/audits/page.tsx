import { downloadHref } from "@/lib/downloads";
import { socialMetadata } from "@/lib/catalogue-sharing";
import Link from "next/link";
import type { Metadata } from "next";
import { buildCatalogue } from "@/lib/catalogue-build";
import type { AuditRun } from "@/shared/omics/audit";
import AuditExplorer from "./AuditExplorer";
const pageMetadata = {
  title: "Catalogue audit history",
  description:
    "Linked verification checks, source evidence and correction history for the rewire catalogue.",
  alternates: { canonical: "https://benchmarks.rewirebio.io/audits/" },
};
export const metadata: Metadata = {
  ...pageMetadata,
  ...socialMetadata({
    title: pageMetadata.title,
    description: pageMetadata.description,
    path: pageMetadata.alternates.canonical,
  }),
};
export default function Audits() {
  const { catalogue, query } = buildCatalogue();
  const release_id = catalogue.release_id;
  const initial = query.auditRecords({ release_id, limit: 25 });
  const runs: AuditRun[] = [];
  for (let cursor: string | undefined; ; ) {
    const page = query.auditRuns({ release_id, limit: 100, cursor });
    runs.push(...page.items);
    if (!page.next_cursor) break;
    cursor = page.next_cursor;
  }
  return (
    <>
      <header className="page-head">
        <div className="wrap">
          <span className="kick">Evidence and verification</span>
          <h1>Catalogue audit history</h1>
          <p className="intro">
            Each check records what was inspected, its source and its outcome.
            Repeat audits preserve earlier findings and link corrections to
            subsequent checks.
          </p>
        </div>
      </header>
      <section className="block first">
        <div className="wrap">
          <p>
            <Link href="/evidence/">Evidence and sources</Link> · Release{" "}
            {catalogue.release_id}
          </p>
          <p>
            Supported means the stated check passed. Source access, structural
            validity and source transcription are different checks; none alone
            establishes independent experimental reproduction.
          </p>
          <p>
            Unresolved and inaccessible evidence stays visible. Historical
            review imports retain their original methods and dates.
          </p>
          {initial.total > 0 ? (
            <>
              <p>
                <a
                  href={downloadHref(`/omics/releases/${catalogue.release_id}/audit-checks.jsonl`)}
                >
                  Audit checks JSONL (gzip)
                </a>{" "}
                ·{" "}
                <a
                  href={downloadHref(`/omics/releases/${catalogue.release_id}/audit-runs.json`)}
                >
                  Audit runs (gzip)
                </a>{" "}
                ·{" "}
                <a
                  href={downloadHref(`/omics/releases/${catalogue.release_id}/audit-resolutions.json`)}
                >
                  Resolutions (gzip)
                </a>
              </p>
              <AuditExplorer
                releaseId={catalogue.release_id}
                runs={runs}
                initial={initial}
              />
            </>
          ) : (
            <p>No audit history is available in this release.</p>
          )}
          <h2>Review scope</h2>
          {runs.map((r) => (
            <details key={r.id}>
              <summary>
                {r.id}: {r.record_count.toLocaleString()} records,{" "}
                {r.check_count.toLocaleString()} checks
              </summary>
              <p>{r.scope}</p>
              <p>
                {r.review_method} · {r.reviewer} · {r.completed_at}
              </p>
              <ul>
                {r.limitations.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}
