import type { Metadata } from "next";
import Link from "next/link";
import Breadcrumbs from "@/components/catalogue/Breadcrumbs";
import { FindingEntry, type RecordLookup } from "@/components/catalogue/Contested";
import { socialMetadata } from "@/lib/catalogue-sharing";
import { buildCatalogue } from "@/lib/catalogue-build";
import { recordHref } from "@/lib/omics";
import { catalogueText } from "@/lib/catalogue-text";
import { fullUseCaseDetail } from "@/lib/use-cases-build";
import {
  contestedFilters, contestedList, contestedQuery, disagreementOf, resultIdsOfUseCase, severityLabel, stateLabel, DISCREPANCIES_DOC, STATE_LABELS,
  type ContestedFilters,
} from "@/lib/discrepancies";
import styles from "@/components/catalogue/Contested.module.css";

const pageMetadata = {
  title: "Contested results",
  description: "Where one study disagrees with what other studies report for the same models. Found automatically in each release and listed as leads to check, with what we are doing to resolve each one.",
  alternates: { canonical: "https://benchmarks.rewirebio.io/contested/" },
};
export const metadata: Metadata = {
  ...pageMetadata,
  ...socialMetadata({ title: pageMetadata.title, description: pageMetadata.description, path: pageMetadata.alternates.canonical }),
};

type SearchParams = Record<string, string | string[] | undefined>;

function FilterLinks({ label, options, current, filters, field }: {
  label: string; options: { value?: string; text: string }[]; current?: string; filters: ContestedFilters; field: keyof ContestedFilters;
}) {
  return <p>
    <span className={styles.muted}>{label}: </span>
    {options.map((option, i) => <span key={option.value ?? "all"}>
      {i > 0 && " · "}
      <Link href={contestedQuery(filters, { [field]: option.value })} aria-current={current === option.value ? "true" : undefined}>{option.text}</Link>
    </span>)}
  </p>;
}

export default function ContestedPage({ searchParams = {} }: { searchParams?: SearchParams }) {
  const { catalogue, query } = buildCatalogue();
  const filters = contestedFilters(searchParams);
  const useCase = filters.use_case ? fullUseCaseDetail(filters.use_case) : null;
  const list = contestedList(filters, undefined, () => resultIdsOfUseCase(useCase));
  const lookup: RecordLookup = (id) => {
    const record = query.record(id);
    return record ? { name: record.name, href: recordHref(record) } : null;
  };
  const system = filters.system ? lookup(filters.system) : null;
  const disagreementFor = (id: string) => {
    const finding = query.discrepancy(id);
    return finding ? disagreementOf(finding) : null;
  };
  const severities = ["high", "medium", "low"].filter((s) => list?.totals.severity[s]);
  const states = Object.keys(STATE_LABELS).filter((s) => list?.totals.state[s]);
  const systems = (list?.systems ?? [])
    .map((id) => ({ id, name: catalogueText(lookup(id)?.name ?? id) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return <>
    <header className="page-head"><div className="wrap">
      <Breadcrumbs items={[{ name: "Database", path: "/" }, { name: "Evidence and sources", path: "/evidence/" }, { name: "Contested results", path: "/contested/" }]} />
      <span className="kick">Evidence and investigation</span>
      <h1>Contested results</h1>
      <p className="intro">Where one study disagrees with what other studies report for the same models, and what we are doing to resolve each case.</p>
    </div></header>
    <section className="block first"><div className="wrap content">
      <nav aria-label="Contested results navigation"><Link href="/evidence/">Evidence and sources</Link> · <Link href="/investigations/">Discrepancy investigations</Link></nav>
      <div className={styles.notice}>
        <p>These are automatic leads, not findings of error. Each release, a check compares how every study ranks the models it shares with other studies. It flags a study that reverses the order the others agree on, or whose gap to a shared reference model lies well outside theirs. Different tasks, populations or metrics often explain a flag.</p>
        <p>A flag never hides a result. Flagged results stay in every table, page and download, marked Contested. A result is withheld only when a reviewer marks it disputed.</p>
        <p>How the check works, and how each follow-up is recorded: <a href={DISCREPANCIES_DOC}>discrepancies between studies</a>.</p>
      </div>
      {!list && <section className={styles.section}>
        <h2>No discrepancy data in this release</h2>
        <p>Release {catalogue.release_id} was published before the database checked for disagreements between studies. Findings appear here from the first release that includes them.</p>
      </section>}
      {list && <>
        <section className={styles.section} aria-labelledby="counts-heading">
          <h2 id="counts-heading">In this release</h2>
          <ul className={styles.counts}>
            <li><strong>{list.totals.open}</strong>open</li>
            <li><strong>{list.totals.settled}</strong>settled</li>
            {severities.map((s) => <li key={s}><strong>{list.totals.severity[s]}</strong>{severityLabel(s).toLowerCase()}</li>)}
          </ul>
          <p className={styles.muted}>Release {catalogue.release_id} · {list.totals.all} findings in all{list.rules.rules.version !== undefined && <> · rules version {String(list.rules.rules.version)}</>}</p>
        </section>
        <section className={styles.section} aria-labelledby="list-heading">
          <h2 id="list-heading">Findings</h2>
          <div className={styles.filters}>
            <FilterLinks label="Status" field="settled" filters={filters} current={filters.settled}
              options={[{ text: "All" }, { value: "open", text: "Open" }, { value: "settled", text: "Settled" }]} />
            <FilterLinks label="Severity" field="severity" filters={filters} current={filters.severity}
              options={[{ text: "All" }, ...severities.map((s) => ({ value: s, text: severityLabel(s).split(" ")[0] }))]} />
            <FilterLinks label="State" field="state" filters={filters} current={filters.state}
              options={[{ text: "All" }, ...states.map((s) => ({ value: s, text: stateLabel(s) }))]} />
            <form method="get" action="/contested/">
              {filters.severity && <input type="hidden" name="severity" value={filters.severity} />}
              {filters.state && <input type="hidden" name="state" value={filters.state} />}
              {filters.settled && <input type="hidden" name="status" value={filters.settled} />}
              {filters.use_case && <input type="hidden" name="use_case" value={filters.use_case} />}
              <label><span className={styles.muted}>Model: </span>
                <select name="system" defaultValue={filters.system ?? ""}>
                  <option value="">All models</option>
                  {systems.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>{" "}
              <button type="submit">Show</button>
            </form>
            {filters.use_case && <p>Showing findings that involve results in {useCase
              ? <Link href={`/use-cases/${encodeURIComponent(useCase.use_case.slug)}/`}>{useCase.use_case.title}</Link>
              : <>an unknown use case, <code>{filters.use_case}</code></>}, from the study that disagrees or from the agreeing group. <Link href={contestedQuery(filters, { use_case: undefined })}>All use cases</Link></p>}
            {filters.system && <p>Showing findings that compare {system ? <Link href={system.href}>{catalogueText(system.name)}</Link> : <code>{filters.system}</code>}. <Link href={contestedQuery(filters, { system: undefined })}>All models</Link></p>}
          </div>
          <p className={styles.muted}>{list.page.total} {list.page.total === 1 ? "finding matches" : "findings match"}, most severe first.</p>
          {list.page.items.map((d) => <FindingEntry key={d.id} d={d} lookup={lookup} view={disagreementFor(d.id)} />)}
          {!list.page.items.length && <p>No findings match these filters.</p>}
          {(filters.cursor || list.page.next_cursor) && <p>
            {filters.cursor && <Link href={contestedQuery(filters)}>First page</Link>}
            {filters.cursor && list.page.next_cursor && " · "}
            {list.page.next_cursor && <Link href={contestedQuery(filters, { cursor: list.page.next_cursor })}>Next page</Link>}
          </p>}
        </section>
      </>}
    </div></section>
  </>;
}
