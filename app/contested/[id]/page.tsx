import * as React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import Breadcrumbs from "@/components/catalogue/Breadcrumbs";
import { FindingBadges, RecordLinks, formatDate, type RecordLookup } from "@/components/catalogue/Contested";
import OverdueMark from "@/components/catalogue/OverdueMark";
import { StudyAgreement, type StudyView } from "@/components/catalogue/StudyAgreement";
import { socialMetadata } from "@/lib/catalogue-sharing";
import { buildCatalogue } from "@/lib/catalogue-build";
import { catalogueText } from "@/lib/catalogue-text";
import { recordHref, safeSourceUrl } from "@/lib/omics";
import { metricName } from "@/lib/result-labels";
import { formatScore } from "@/lib/score-display";
import {
  actionLabel, discrepancyHref, discrepancyReader, linkLabel, pendingCheck, ruleLabel, scopeLabel, stateLabel, studyKeyUrl,
  DISCREPANCIES_DOC, type Discrepancy, type DiscrepancyAction,
} from "@/lib/discrepancies";
import styles from "@/components/catalogue/Contested.module.css";
import tables from "@/app/database/database.module.css";

type Params = { id: string };

// Next's server React provides per-request memoization; plain React 18 (tests) does not.
const cache = (React as { cache?: <T>(fn: T) => T }).cache ?? (<T,>(fn: T) => fn);
/** Metadata and the page body share one read. Also finds a finding by an earlier ID. */
const loadFinding = cache((id: string): Discrepancy | null => {
  const reader = discrepancyReader();
  return reader.hasDiscrepancies() ? reader.discrepancy(id) : null;
});

export function generateMetadata({ params }: { params: Params }): Metadata {
  const d = loadFinding(params.id);
  if (!d) return {};
  const path = discrepancyHref(d.id);
  const title = `${d.label} | Contested results`;
  return {
    title, description: d.summary, alternates: { canonical: `https://benchmarks.rewirebio.io${path}` },
    ...socialMetadata({ title, description: d.summary, path: `https://benchmarks.rewirebio.io${path}` }),
  };
}

/** What the rule counted, in words. Unknown rules list their numbers as given. */
function Numbers({ d, lookup }: { d: Discrepancy; lookup: RecordLookup }) {
  const n = d.numbers as Record<string, number | undefined>;
  const name = (id: string | null) => (id ? catalogueText(lookup(id)?.name ?? id) : "");
  if (d.rule === "ordering-reversal" && n.outlier_comparisons !== undefined) {
    const higher = d.consensus_higher;
    const lower = d.systems.find((s) => s !== higher) ?? null;
    return <dl className={styles.facts}>
      {higher && <><dt>Other studies</dt><dd>rank {name(higher)} above {name(lower)} in {n.consensus_agreements} of {n.consensus_comparisons} comparisons</dd></>}
      {higher && <><dt>This study</dt><dd>ranks {name(lower)} above {name(higher)} in {n.outlier_reversals} of {n.outlier_comparisons} comparisons</dd></>}
    </dl>;
  }
  if (d.rule === "gap-outlier" && n.outlier_gap !== undefined) {
    const signed = (v: number | undefined) => (v === undefined ? "" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}`);
    return <dl className={styles.facts}>
      <dt>Reference model</dt><dd>{name(d.reference_system)}</dd>
      <dt>This study</dt><dd>median relative difference {signed(n.outlier_gap)}</dd>
      <dt>Other studies</dt><dd>{signed(n.consensus_gap_min)} to {signed(n.consensus_gap_max)}</dd>
    </dl>;
  }
  return <dl className={styles.facts}>
    {Object.entries(d.numbers).map(([key, value]) => <React.Fragment key={key}><dt>{key.replace(/_/g, " ")}</dt><dd>{String(value)}</dd></React.Fragment>)}
  </dl>;
}

type Row = { id: string; source: { name: string; href: string; url?: string }[]; tool: { name: string; href: string }[]; procedure: { name: string; href: string } | null; metric: string; value: string };

function resultRows(ids: string[]): Row[] {
  const { query } = buildCatalogue();
  return ids.flatMap((id) => {
    const row = query.results({ id, limit: 1 }).items[0];
    const result = row?.result ?? query.record(id);
    if (!result) return [];
    const link = (r: { id: string; kind: string; name: string }) => ({ name: catalogueText(r.name), href: recordHref(r as never) });
    // models holds every tested record, configurations included; list each once, configurations first.
    const tested = row ? [...new Map([...row.configurations, ...row.models].map((r) => [r.id, r])).values()] : [];
    const procedure = row?.protocols[0] ?? row?.benchmarks[0] ?? row?.evaluation ?? null;
    const a = result.attributes;
    return [{
      id,
      source: (row?.sources ?? []).map((s) => ({ ...link(s), url: safeSourceUrl(s.attributes.url) })),
      tool: tested.slice(0, 2).map(link),
      procedure: procedure ? link(procedure) : null,
      metric: metricName(String(a.metric ?? ""), typeof a.metric_qualifier === "string" ? a.metric_qualifier : null),
      value: formatScore(a.printed_value),
    }];
  });
}

/** The finding's studies with their records resolved: the disagreeing study first, then the most compared. */
function studyViews(d: Discrepancy, a: string, b: string, lookup: RecordLookup): StudyView[] {
  const { query } = buildCatalogue();
  const named = (id: string | null) => {
    if (!id) return null;
    const record = lookup(id);
    return record ? { name: catalogueText(record.name), href: record.href } : { name: catalogueText(id), href: null };
  };
  return [...(d.studies ?? [])]
    .sort((x, y) => Number(y.role === "outlier") - Number(x.role === "outlier") || y.comparisons_total - x.comparisons_total)
    .map((s) => {
      const records = s.source_ids.flatMap((id) => {
        const record = query.record(id);
        return record ? [record] : [];
      });
      const [first, ...rest] = records;
      return {
        key: s.key,
        role: s.role,
        source: first ? { name: catalogueText(first.name), href: recordHref(first) } : { name: s.key.replace(/^(doi|repository|source):/, ""), href: null },
        more: rest.map((r) => ({ name: catalogueText(r.name), href: recordHref(r) })),
        url: safeSourceUrl(first?.attributes.url) ?? studyKeyUrl(s.key),
        higherA: s.higher[a] ?? 0,
        higherB: s.higher[b] ?? 0,
        ties: s.ties,
        gap: s.gap,
        total: s.comparisons_total,
        comparisons: s.comparisons.map((c) => ({
          protocol: named(c.protocol),
          dataset: named(c.dataset),
          metric: [metricName(c.metric, c.qualifier), c.unit, c.split && `${c.split} split`].filter(Boolean).join(", "),
          valueA: c.values[a] ?? null,
          valueB: c.values[b] ?? null,
          resultA: c.results[a] ?? null,
          resultB: c.results[b] ?? null,
          higher: c.higher === a ? "a" : c.higher === b ? "b" : null,
        })),
      };
    });
}

const RESULT_TABLE_ROWS = 40;

function ResultTable({ caption, rows, outlier }: { caption: string; rows: Row[]; outlier?: boolean }) {
  return <div className={tables.tableScroll} tabIndex={0} role="region" aria-label={caption}>
    <table className={tables.resultTable}>
      <caption>{caption}</caption>
      <thead><tr><th scope="col">Study</th><th scope="col">Tool</th><th scope="col">Protocol or benchmark</th><th scope="col">Metric</th><th scope="col">Value</th></tr></thead>
      <tbody>
        {rows.map((r) => <tr key={r.id} className={outlier ? styles.outlierRow : undefined}>
          <td>{r.source.length ? r.source.map((s, i) => <span key={s.href}>{i > 0 && "; "}<Link href={s.href}>{s.name}</Link></span>) : "Not linked"}</td>
          <th scope="row">{r.tool.length ? r.tool.map((t, i) => <span key={t.href}>{i > 0 && ", "}<Link href={t.href}>{t.name}</Link></span>) : "Not linked"}</th>
          <td>{r.procedure ? <Link href={r.procedure.href}>{r.procedure.name}</Link> : "Not linked"}</td>
          <td>{r.metric}</td>
          <td><Link href={`/database/result/${encodeURIComponent(r.id)}/`}>{r.value}</Link></td>
        </tr>)}
      </tbody>
    </table>
  </div>;
}

/** A follow-up link with its short name: "owner/repo#N" for a GitHub issue or pull request, else the host. */
function namedLink(url: string | null, text: string) {
  const href = url ? safeSourceUrl(url) : undefined;
  const name = href ? linkLabel(href) : null;
  return href && name ? { href, text, name } : null;
}

function Action({ a, latest, pending, lookup }: { a: DiscrepancyAction; latest: boolean; pending: string | null; lookup: RecordLookup }) {
  const issue = /^https:\/\/github\.com\/[^/]+\/[^/]+\/issues\/\d+/.test(a.report_url ?? "");
  const report = namedLink(a.report_url, issue ? "Issue raised with the authors" : "Report to the authors");
  const investigation = namedLink(a.investigation_url, "Our investigation");
  const links = [report, investigation].filter((x): x is NonNullable<typeof x> => !!x);
  // The step's main link: the report to the authors when there is one, otherwise our investigation.
  const main = links[0];
  return <li>
    <h3>{a.date ? formatDate(a.date) : "Undated"}: {a.action ? actionLabel(a.action) : stateLabel(a.state)}
      {main && <> · <a href={main.href}>{main.name}</a></>}</h3>
    <p className={styles.muted}>State after this step: {stateLabel(a.state)}</p>
    {a.rationale && <p>{a.rationale}</p>}
    {a.upstream_response && <p>Authors&apos; response: {a.upstream_response}</p>}
    {a.awaiting && <p>Waiting for: {a.awaiting.replace(/\.$/, "")}{a.expected_by && <>, expected by {formatDate(a.expected_by)}</>}.</p>}
    {a.next_check && <p>Next check: {formatDate(a.next_check)}{latest && pending && <OverdueMark nextCheck={pending} />}</p>}
    {a.resolved_by.length > 0 && <p>Resolved by: <RecordLinks ids={a.resolved_by} lookup={lookup} /></p>}
    {links.length > 0 && <ul className={styles.stepLinks}>{links.map((l) => <li key={l.href}>{l.text} · <a href={l.href}>{l.name}</a></li>)}</ul>}
  </li>;
}

export default function ContestedFindingPage({ params }: { params: Params }) {
  const d = loadFinding(params.id);
  if (!d) notFound();
  if (d.id !== params.id) permanentRedirect(discrepancyHref(d.id));
  const { query } = buildCatalogue();
  const lookup: RecordLookup = (id) => {
    const record = query.record(id);
    return record ? { name: record.name, href: recordHref(record) } : null;
  };
  const outlier = resultRows(d.outlier_results);
  const consensus = resultRows(d.consensus_results);
  const pending = pendingCheck(d);
  const firstOutlier = d.outlier_results[0];
  const systemA = d.consensus_higher ?? d.systems[0];
  const systemB = d.systems.find((s) => s !== systemA) ?? null;
  const studies = systemA && systemB ? studyViews(d, systemA, systemB, lookup) : [];
  const systemName = (id: string) => catalogueText(lookup(id)?.name ?? id);
  return <>
    <header className="page-head"><div className="wrap">
      <Breadcrumbs items={[{ name: "Database", path: "/" }, { name: "Contested results", path: "/contested/" }, { name: d.label, path: discrepancyHref(d.id) }]} />
      <span className="kick">Contested result</span>
      <h1>{d.label}</h1>
      <FindingBadges d={d} />
      <p className="intro">{d.summary}</p>
    </div></header>
    <section className="block first"><div className="wrap content">
      <div className={styles.notice}>
        <p>An automatic lead, not a finding of error. The results below are shown as published, everywhere on the site, until a reviewer decides otherwise.</p>
      </div>
      {studies.length > 0 && <section className={styles.section} aria-labelledby="studies-heading">
        <h2 id="studies-heading">Which studies agree</h2>
        <StudyAgreement studies={studies} a={systemName(systemA!)} b={systemName(systemB!)} gap={d.rule === "gap-outlier" || studies.some((s) => s.gap !== null)} />
      </section>}
      <section className={styles.section} aria-labelledby="summary-heading">
        <h2 id="summary-heading">What disagrees</h2>
        <Numbers d={d} lookup={lookup} />
        <dl className={styles.facts}>
          <dt>Compared</dt><dd><RecordLinks ids={d.systems} lookup={lookup} /></dd>
          <dt>Study that disagrees</dt><dd><RecordLinks ids={d.outlier_sources} lookup={lookup} /></dd>
          <dt>Other studies</dt><dd>{d.consensus_sources.length > 5
            ? <details><summary>{d.consensus_sources.length} studies</summary><RecordLinks ids={d.consensus_sources} lookup={lookup} /></details>
            : <RecordLinks ids={d.consensus_sources} lookup={lookup} />}</dd>
          <dt>Rule</dt><dd>{ruleLabel(d.rule)}; {scopeLabel(d.scope).toLowerCase()}</dd>
          <dt>Model identity</dt><dd>{d.identity_basis === "reviewed" ? "Matched across studies through reviewed links" : "Matched across studies partly through links not yet reviewed"}</dd>
          {d.previous_ids.length > 0 && <><dt>Earlier IDs</dt><dd>{d.previous_ids.join(", ")}</dd></>}
        </dl>
      </section>
      <section className={styles.section} aria-labelledby="numbers-heading">
        <h2 id="numbers-heading">The compared numbers</h2>
        <p>Each value links to its result record and source. Compare values within one protocol; the rule compares rankings, not raw values across protocols.</p>
        {outlier.length > 0 && <ResultTable caption={`In the study that disagrees (${outlier.length})`} rows={outlier} outlier />}
        {consensus.length > 0 && (consensus.length > RESULT_TABLE_ROWS
          ? <details><summary>In the other studies ({consensus.length} results)</summary><ResultTable caption="In the other studies" rows={consensus} /></details>
          : <ResultTable caption={`In the other studies (${consensus.length})`} rows={consensus} />)}
      </section>
      <section className={styles.section} aria-labelledby="follow-up-heading">
        <h2 id="follow-up-heading">Follow-up</h2>
        <p className={styles.muted}>Current state: {stateLabel(d.state)}{d.settled ? ". Settled." : "."}{pending && <> Next check {formatDate(pending)}<OverdueMark nextCheck={pending} />.</>}</p>
        {d.actions.length
          ? <ol className={styles.timeline}>
            {d.actions.map((a, i) => <Action key={`${a.revision}-${i}`} a={a} latest={i === d.actions.length - 1} pending={pending} lookup={lookup} />)}
          </ol>
          : <p>No one has reviewed this finding yet.</p>}
      </section>
      <section className={styles.section} aria-labelledby="help-heading">
        <h2 id="help-heading">How to help resolve this</h2>
        <p>If you know why these studies disagree, for example a different population, metric or preprocessing step, or you have a corrected value, tell us through the <Link href={firstOutlier ? `/contribute/?type=correction&target_id=${encodeURIComponent(firstOutlier)}` : "/contribute/"}>contribution form</Link>. A reviewer checks every submission against its source before anything changes, and the step is added to the follow-up above.</p>
        <p className={styles.muted}>Finding {d.id} · <Link href="/contested/">All contested results</Link> · <a href={DISCREPANCIES_DOC}>How findings are made and followed up</a></p>
      </section>
    </div></section>
  </>;
}
