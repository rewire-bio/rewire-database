"use client";

import { useEffect, useState } from "react";
import { lastCompletedSweep, refreshDate, reviewOverdue, type RefreshData } from "@/lib/refresh";
import styles from "./RefreshStatus.module.css";

export default function RefreshStatus({ data, compact = false }: { data: RefreshData | null; compact?: boolean }) {
  // Start from the same server/client markup, then keep due state current.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const completed = data && lastCompletedSweep(data);
  const publication = data?.updates[0];
  const latestAttempt = data && [...data.runs].sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at))[0];
  return <section className={`${styles.panel}${compact ? ` ${styles.compact}` : ""}`} aria-labelledby="freshness-heading">
    <h2 id="freshness-heading">Database freshness</h2>
    <dl className={styles.dates}>
      <div>
        <dt>Last published update</dt>
        <dd>{publication ? <>{publication.time_basis === "observed" && "Verified published at "}<time dateTime={publication.published_at}>{refreshDate(publication.published_at)}</time>{publication.time_basis === "observed" && <span className={styles.note}>First observed; exact deployment time unavailable.</span>}</> : compact ? "No verified publication receipt." : "Publication receipt not recorded for this catalogue."}</dd>
      </div>
      <div>
        <dt>Last completed evidence sweep</dt>
        <dd>{completed ? <time dateTime={completed.finished_at!}>{refreshDate(completed.finished_at!)}</time> : "No completed sweep recorded."}</dd>
      </div>
      <div>
        <dt>Next planned review</dt>
        <dd>{data ? <><time dateTime={data.schedule.next_due_at}>{refreshDate(data.schedule.next_due_at)}</time><span className={styles.note}>{data.schedule.timezone} · {data.schedule.status}{compact && data.schedule.status === "planned" && " · automation not active"}</span></> : "Schedule not recorded."}</dd>
      </div>
    </dl>
    {!compact && data && <p>{data.schedule.description}{data.schedule.status === "planned" && " This cadence is planned; automation is not yet active."}{data.schedule.status === "paused" && " Scheduled reviews are paused."}</p>}
    {data && now !== null && reviewOverdue(data, now) && <p className={styles.alert} role="status"><strong>{data.schedule.status === "planned" ? "The planned review date has passed." : "The scheduled evidence review is overdue."}</strong>{!compact && " The recorded schedule still has an outstanding review due."}</p>}
    {latestAttempt && (compact || latestAttempt.status !== "completed") && <p>Latest attempt: {latestAttempt.status} ({refreshDate(latestAttempt.started_at)}).{latestAttempt.status !== "completed" && " This does not advance the completed sweep date."}</p>}
    {!compact && latestAttempt && latestAttempt.status !== "completed" && latestAttempt.coverage.gaps.length > 0 && <>
      <p>Incomplete coverage: {latestAttempt.coverage.checked_ids.length} of {latestAttempt.coverage.target_ids.length} targets checked.</p>
      <ul className={styles.gaps}>{latestAttempt.coverage.gaps.map((gap, index) => <li key={index}>{gap}</li>)}</ul>
    </>}
    {!compact && completed && <p>Last completed scope: {completed.coverage.checked_ids.length} of {completed.coverage.target_ids.length} declared targets checked.{completed.outcome === "no_change" && " No candidate catalogue changes found in this sweep."}{completed.outcome === "review_required" && " Candidate changes require review; sweep completion does not establish publication."}</p>}
    {!compact && completed && completed.coverage.gaps.length > 0 && <>
      <p>Remaining gaps:</p>
      <ul className={styles.gaps}>{completed.coverage.gaps.map((gap, index) => <li key={index}>{gap}</li>)}</ul>
    </>}
    <p className={styles.caveat}>A monthly sweep does not mean every record was reverified.{!compact && " Record and use-case review dates describe their own evidence checks."}</p>
    {!compact && data && <p>{data.schedule.status === "planned" ? "Proposed maintenance owner" : "Maintenance owner"}: {data.schedule.maintainer ?? "unassigned"}.</p>}
    <p className={styles.links}><a href="/updates/">Update history and coverage</a><a href="/updates/feed.xml">Published updates feed</a></p>
  </section>;
}
