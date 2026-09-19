import fs from "node:fs";
import Link from "next/link";
import type { Metadata } from "next";
import { buildCatalogue } from "@/lib/catalogue-build";
import { auditPage } from "@/services/omics/src/audit";
import type { AuditIndexRow, AuditRun } from "@/services/omics/src/audit";
import AuditExplorer from "./AuditExplorer";
export const metadata: Metadata = {
  title: "Catalogue audit history",
  description:
    "Linked verification checks, source evidence and correction history for the rewire catalogue.",
  alternates: { canonical: "https://benchmarks.rewire.it/audits/" },
};
export default function Audits() {
  const { catalogue } = buildCatalogue();
  const base = `public/omics/releases/${catalogue.release_id}`;
  const read = (name: string) =>
    fs.existsSync(`${base}/${name}`)
      ? JSON.parse(fs.readFileSync(`${base}/${name}`, "utf8"))
      : [];
  const index: AuditIndexRow[] = read("audit-index.json");
  const runs: AuditRun[] = read("audit-runs.json");
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
          {index.length > 0 ? (
            <>
              <p>
                <a
                  href={`/omics/releases/${catalogue.release_id}/audit-checks.csv`}
                >
                  Audit checks CSV
                </a>{" "}
                ·{" "}
                <a
                  href={`/omics/releases/${catalogue.release_id}/audit-checks.jsonl`}
                >
                  Audit checks JSONL
                </a>{" "}
                ·{" "}
                <a
                  href={`/omics/releases/${catalogue.release_id}/audit-runs.json`}
                >
                  Audit runs
                </a>{" "}
                ·{" "}
                <a
                  href={`/omics/releases/${catalogue.release_id}/audit-resolutions.json`}
                >
                  Resolutions
                </a>
              </p>
              <AuditExplorer
                releaseId={catalogue.release_id}
                runs={runs}
                initial={auditPage(
                  index.map(({ chunk_ids, ...r }) => r),
                  { limit: 25 },
                  { release_id: catalogue.release_id },
                )}
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
