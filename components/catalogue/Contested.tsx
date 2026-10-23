import Link from "next/link";
import { catalogueText } from "@/lib/catalogue-text";
import {
  discrepancyHref, ruleLabel, scopeLabel, severityLabel, stateLabel,
  type DiscrepancySummary, type ResultContest,
} from "@/lib/discrepancies";
import OverdueMark from "./OverdueMark";
import styles from "./Contested.module.css";

/** Resolves a record ID to its name and page, or null when the release has no such record. */
export type RecordLookup = (id: string) => { name: string; href: string } | null;

/** "19 October 2026" from an ISO date; other text unchanged. */
export function formatDate(value: string | null): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}/.test(value)) return value ?? "";
  return new Date(`${value.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export function RecordLinks({ ids, lookup }: { ids: string[]; lookup: RecordLookup }) {
  return <>{ids.map((id, i) => {
    const record = lookup(id);
    return <span key={id}>{i > 0 && ", "}{record ? <Link href={record.href}>{catalogueText(record.name)}</Link> : <code>{id}</code>}</span>;
  })}</>;
}

export function FindingBadges({ d }: { d: Pick<DiscrepancySummary, "severity" | "state" | "settled" | "rule" | "scope"> }) {
  return <ul className={styles.badges} aria-label="About this finding">
    <li className={d.severity === "high" ? styles.high : undefined}>{severityLabel(d.severity)}</li>
    <li className={d.settled ? styles.settled : undefined}>{stateLabel(d.state)}</li>
    <li>{ruleLabel(d.rule)}</li>
    {d.scope && <li>{scopeLabel(d.scope)}</li>}
  </ul>;
}

/** The follow-up line of a list entry: how many actions, the latest, and the next check. */
export function FollowUpLine({ d }: { d: DiscrepancySummary }) {
  if (!d.actions) return <p className={styles.muted}>Not reviewed yet.</p>;
  return <p className={styles.muted}>
    {d.actions} follow-up {d.actions === 1 ? "action" : "actions"}
    {d.last_action_date && <>, latest {formatDate(d.last_action_date)}</>}
    {!d.settled && d.next_check && <>. Next check {formatDate(d.next_check)}<OverdueMark nextCheck={d.next_check} /></>}
  </p>;
}

export function FindingEntry({ d, lookup }: { d: DiscrepancySummary; lookup: RecordLookup }) {
  return <article className={styles.entry}>
    <h3><Link href={discrepancyHref(d.id)}>{d.label}</Link></h3>
    <FindingBadges d={d} />
    <p>{d.summary}</p>
    <dl className={styles.facts}>
      <dt>Compared</dt><dd><RecordLinks ids={d.systems} lookup={lookup} /></dd>
    </dl>
    <FollowUpLine d={d} />
  </article>;
}

/** On a result or evaluation page: the findings its results take part in. Flag only; the
 * results stay in every table and download. */
export function ContestedPanel({ contests, scope }: { contests: ResultContest[]; scope: "result" | "evaluation" }) {
  if (!contests.length) return null;
  const seen = new Map<string, ResultContest>();
  // A finding in which a result is the outlier outranks one in which it agrees.
  for (const c of contests) if (!seen.has(c.discrepancy.id) || c.role === "outlier") seen.set(c.discrepancy.id, c);
  const items = [...seen.values()];
  const open = items.filter((c) => !c.discrepancy.settled).length;
  const subject = scope === "result" ? "This result" : "Results in this evaluation";
  return <aside id="contested" className={styles.panel} aria-labelledby="contested-heading">
    <h2 id="contested-heading">Contested{open ? "" : " (settled)"}</h2>
    <p>{subject} {scope === "result" ? "takes" : "take"} part in {items.length === 1 ? "a disagreement" : `${items.length} disagreements`} between studies, found automatically. This is a lead to check, not a finding of error. The values are shown as published.</p>
    <ul>
      {items.map(({ discrepancy: d, role }) => <li key={d.id}>
        <Link href={discrepancyHref(d.id)}>{d.label}</Link>{" "}
        <span className={styles.muted}>
          {role === "outlier" ? "From the study that disagrees" : "From a study in the agreeing group"} · {stateLabel(d.state)}
        </span>
      </li>)}
    </ul>
  </aside>;
}
