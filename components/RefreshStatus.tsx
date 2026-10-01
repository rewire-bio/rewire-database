"use client";

import { useEffect, useState } from "react";
import { lastCompletedSweep, refreshDate, reviewOverdue, type RefreshData } from "@/lib/refresh";

export default function RefreshStatus({ data }: { data: RefreshData | null }) {
  // The exported HTML and first client render agree. The browser then keeps the
  // due state current without requiring another static-site deployment.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const completed = data && lastCompletedSweep(data);
  const publication = data?.updates[0];
  const latestAttempt = data && [...data.runs].sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at))[0];
  return <section aria-labelledby="freshness-heading">
    <h2 id="freshness-heading">Database freshness</h2>
    <dl>
      <dt>Last published update</dt>
      <dd>{publication ? <>{publication.time_basis === "observed" && "Verified published at "}<time dateTime={publication.published_at}>{refreshDate(publication.published_at)}</time>{publication.time_basis === "observed" && " (first observed; exact deployment time unavailable)"}</> : "Publication receipt not recorded for this catalogue."}</dd>
      <dt>Last completed evidence sweep</dt>
      <dd>{completed ? <time dateTime={completed.finished_at!}>{refreshDate(completed.finished_at!)}</time> : "No completed sweep recorded."}</dd>
      <dt>Next planned review</dt>
      <dd>{data ? <><time dateTime={data.schedule.next_due_at}>{refreshDate(data.schedule.next_due_at)}</time> · {data.schedule.timezone} · {data.schedule.status}</> : "Schedule not recorded."}</dd>
    </dl>
    {data && <p>{data.schedule.description}{data.schedule.status === "planned" && " This cadence is planned; automation is not yet active."}{data.schedule.status === "paused" && " Scheduled reviews are paused."}</p>}
    {data && now !== null && reviewOverdue(data, now) && <p role="status"><strong>{data.schedule.status === "planned" ? "The planned review date has passed." : "The scheduled evidence review is overdue."}</strong> The recorded schedule still has an outstanding review due.</p>}
    {latestAttempt && latestAttempt.status !== "completed" && <p>Latest attempt: {latestAttempt.status} ({refreshDate(latestAttempt.started_at)}). This does not advance the completed sweep date.</p>}
    {latestAttempt && latestAttempt.status !== "completed" && latestAttempt.coverage.gaps.length > 0 && <p>Incomplete coverage: {latestAttempt.coverage.checked_ids.length} of {latestAttempt.coverage.target_ids.length} targets checked. {latestAttempt.coverage.gaps.join(" ")}</p>}
    {completed && <p>Last completed scope: {completed.coverage.checked_ids.length} of {completed.coverage.target_ids.length} declared targets checked.{completed.outcome === "no_change" && " No candidate catalogue changes found in this sweep."}{completed.outcome === "review_required" && " Candidate changes require review; sweep completion does not establish publication."}</p>}
    {completed && completed.coverage.gaps.length > 0 && <p>Remaining gaps: {completed.coverage.gaps.join(" ")}</p>}
    <p>A monthly sweep does not mean every record was reverified. Record and use-case review dates describe their own evidence checks.</p>
    {data && <p>{data.schedule.status === "planned" ? "Proposed maintenance owner" : "Maintenance owner"}: {data.schedule.maintainer ?? "unassigned"}.</p>}
    <p><a href="/updates/">Update history and coverage</a> · <a href="/updates/feed.xml">Published updates feed</a></p>
  </section>;
}
