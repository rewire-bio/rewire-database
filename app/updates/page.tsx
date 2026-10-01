import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import RefreshStatus from "@/components/RefreshStatus";
import { buildCatalogue } from "@/lib/catalogue-build";
import { readRefresh } from "@/lib/refresh-build";
import { refreshDate } from "@/lib/refresh";

export const metadata: Metadata = {
  title: "Database update history | Rewire",
  description: "Published catalogue changes, evidence sweep coverage and the planned review cadence.",
  alternates: { canonical: "https://benchmarks.rewirebio.io/updates/", types: { "application/atom+xml": "https://benchmarks.rewirebio.io/updates/feed.xml" } },
};

export default function UpdatesPage() {
  const { catalogue } = buildCatalogue();
  const data = readRefresh(process.cwd(), catalogue.release_id);
  const runs = [...(data?.runs ?? [])].sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at));
  return <>
    <PageHeader title="Database updates" intro="What was published, what was checked and what remains unresolved." breadcrumbs={[{ name: "Database", path: "/" }, { name: "Updates", path: "/updates/" }]} />
    <div className="wrap content">
      <RefreshStatus data={data} />
      <section aria-labelledby="publication-heading">
        <h2 id="publication-heading">Published changes</h2>
        <p>Publication entries have recorded deployment receipts matching the adopted catalogue or an available earlier release archive. Entries without a matching available archive receipt and later, unadopted releases are omitted.</p>
        {!data?.updates.length && <p>No verified publication entry is recorded for this catalogue. Its release date is not evidence of a publication time.</p>}
        {data?.updates.map((update) => <article key={`${update.release_id}:${update.commit}`} id={`release-${update.release_id}-${update.commit}`}>
          <h3><time dateTime={update.published_at}>{refreshDate(update.published_at)}</time> · {update.release_id}</h3>
          {update.time_basis === "observed" && <p>Verified published at this observation time; the exact deployment time is not available.</p>}
          <ul>{update.summary.map((line, index) => <li key={index}>{line}</li>)}</ul>
          {update.links.length > 0 && <ul>{update.links.map((link, index) => <li key={index}><a href={link.url}>{link.label}</a></li>)}</ul>}
          <p><a href={update.receipt_url}>Publication receipt</a> · <a href={`/omics/releases/${update.release_id}/manifest.json`}>Release checksums</a></p>
        </article>)}
      </section>
      <section aria-labelledby="sweeps-heading">
        <h2 id="sweeps-heading">Evidence sweep history</h2>
        <p>Sweeps are bounded research and review work. Automated source checks are not human scientific review or independent benchmark reproduction.</p>
        {!runs.length && <p>No evidence sweep attempts have been recorded.</p>}
        {runs.map((run) => <article key={run.id} id={`sweep-${run.id}`}>
          <h3>{run.cycle_id} · attempt {run.attempt} · {run.status}</h3>
          <p>Started <time dateTime={run.started_at}>{refreshDate(run.started_at)}</time>{run.finished_at && <>; finished <time dateTime={run.finished_at}>{refreshDate(run.finished_at)}</time></>}. Baseline: <a href={`/omics/releases/${run.baseline_release_id}/manifest.json`}>{run.baseline_release_id}</a>.</p>
          {run.outcome === "no_change" && <p>No candidate catalogue changes found in this sweep.</p>}
          {run.outcome === "review_required" && <p>Candidate changes prepared for review. See the publication history for changes that reached this website.</p>}
          <p>Coverage: {run.coverage.checked_ids.length} of {run.coverage.target_ids.length} declared targets checked. Added: {run.counts.added}; revised: {run.counts.revised}; excluded: {run.counts.excluded}; blocked: {run.counts.blocked}. These are run counts, not a claim of new published records.</p>
          <details><summary>Checked scope and gaps</summary><p>Target scope: {run.coverage.target_ids.join(", ") || "None recorded"}.</p><p>Checked: {run.coverage.checked_ids.join(", ") || "None recorded"}.</p>{run.coverage.gaps.length ? <ul>{run.coverage.gaps.map((gap, index) => <li key={index}>{gap}</li>)}</ul> : <p>No gaps recorded within this bounded scope.</p>}</details>
          {(run.report_url || run.pr_url) && <p>{run.report_url && <a href={run.report_url}>Run report</a>}{run.report_url && run.pr_url && " · "}{run.pr_url && <a href={run.pr_url}>Review pull request</a>}</p>}
        </article>)}
      </section>
    </div>
  </>;
}
