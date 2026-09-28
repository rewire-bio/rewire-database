"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  emptyUseCaseFilters, readUseCaseFilters, encodeUseCaseSearch, caseContextLabel,
  createUseCasesClient, USE_CASE_PAGE_SIZE, type UseCasePage, type UseCaseFilters,
} from "@/lib/use-cases-client";
import { researchAreaLabel } from "@/lib/omics-browse";
import { evidenceSummaryParts, type EvidenceSummary } from "@/lib/use-case-summary";
import { UseCaseCollectionStatus } from "./UseCaseCollectionPlan";
import styles from "./UseCases.module.css";

function Cards({ data, search, summaries }: { data: UseCasePage; search: string; summaries: Record<string, EvidenceSummary> }) {
  return <ul className={styles.cards}>
    {data.items.map((entry) => {
      const summary = summaries[entry.slug];
      return <li key={entry.id}><article className={styles.card}>
        <p className={styles.tag}>{researchAreaLabel(entry.area)} · {entry.contexts.map(caseContextLabel).join(" and ")}</p>
        <h3><a href={`/use-cases/${entry.slug}/${search}`}>{entry.title}</a></h3>
        {entry.collection_plan && <p><UseCaseCollectionStatus status={entry.collection_plan.status} /></p>}
        <p className={styles.question}>{entry.question}</p>
        <h4 className={styles.cardLabel}>You bring</h4>
        <ul className={styles.inputs}>{entry.inputs.map((input) => <li key={input}>{input}</li>)}</ul>
        <p className={styles.cardFoot}>{summary ? <>Opens with {evidenceSummaryParts(summary).slice(0, 3).join(" · ")}, plus limitations and sources.</> : "Opens with evaluated evidence, limitations and sources."}</p>
      <a href={`/use-cases/${entry.slug}/${search}${entry.collection_plan ? "#collection-plan" : ""}`}>{entry.collection_plan ? "View question and evidence plan →" : "Inspect evidence and limitations →"}</a>
      </article></li>;
    })}
  </ul>;
}

export default function UseCaseExplorer({ initial, summaries = {}, areaCounts = {} }: {
  initial: UseCasePage;
  /** Evidence coverage per use-case slug, computed from the same pinned release. */
  summaries?: Record<string, EvidenceSummary>;
  /** Number of use cases per biological area in the whole collection. */
  areaCounts?: Record<string, number>;
}) {
  const [filters, setFilters] = useState(emptyUseCaseFilters);
  const [draft, setDraft] = useState(emptyUseCaseFilters);
  const [cursor, setCursor] = useState<string | undefined>();
  const [data, setData] = useState(initial);
  const [applied, setApplied] = useState("");
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const search = encodeUseCaseSearch(filters, cursor);
  const client = useMemo(() => createUseCasesClient(initial.release_id, initial.input_sha256), [initial.release_id, initial.input_sha256]);

  useEffect(() => {
    const read = () => {
      const next = readUseCaseFilters(window.location.search);
      setFilters(next);
      setDraft(next);
      setCursor(new URLSearchParams(window.location.search).get("cursor") || undefined);
      setReady(true);
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!search && !retry) {
      setData(initial);
      setApplied("");
      setLoading(false);
      setError("");
      return;
    }
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const deadline = setTimeout(() => {
      if (!active) return;
      active = false;
      controller.abort();
      setLoading(false);
      setError("Loading use cases took too long. Please retry.");
    }, 15_000);
    client.list({
      q: filters.q || undefined,
      area: filters.area || undefined,
      context: filters.context || undefined,
      cursor,
      limit: USE_CASE_PAGE_SIZE,
    }, controller.signal).then((page) => {
      if (active) { setData(page); setApplied(search); }
    }).catch(() => {
      if (active) setError("The requested use cases could not be loaded. Please retry or clear the filters to view this release's initial questions.");
    }).finally(() => {
      clearTimeout(deadline);
      if (active) setLoading(false);
    });
    return () => { active = false; clearTimeout(deadline); controller.abort(); };
  }, [client, cursor, filters, initial, ready, retry, search]);

  function navigate(next: UseCaseFilters, nextCursor?: string) {
    setFilters(next); setDraft(next); setCursor(nextCursor); setRetry(0);
    window.history.pushState(window.history.state, "", `/use-cases/${encodeUseCaseSearch(next, nextCursor)}#questions`);
  }
  function submit(event: FormEvent) { event.preventDefault(); navigate(draft); }
  const current = !loading && !error && applied === search;
  const areas = [...new Set([...initial.available.areas, ...(filters.area ? [filters.area] : [])])];

  const total = Object.values(areaCounts).reduce((sum, count) => sum + count, 0);

  return <div id="questions">
    <div className={styles.areas} role="group" aria-labelledby="browse-areas">
      <p id="browse-areas" className={styles.groupLabel}>Browse by biological area</p>
      <button type="button" className={styles.chip} aria-pressed={!filters.area} onClick={() => navigate({ ...draft, area: "" })}>All areas{total ? <span> {total}</span> : null}</button>
      {areas.map((area) => <button type="button" key={area} className={styles.chip} aria-pressed={filters.area === area} onClick={() => navigate({ ...draft, area })}>
        {researchAreaLabel(area)}{areaCounts[area] ? <span> {areaCounts[area]}</span> : null}
      </button>)}
    </div>
    <form className={styles.filters} onSubmit={submit} role="search" aria-label="Find a use case">
      <div className={styles.searchField}>
        <label htmlFor="use-case-q">Search questions and inputs</label>
        <input id="use-case-q" name="q" type="search" maxLength={200} value={draft.q} aria-describedby="use-case-search-hint" placeholder="For example, splicing, single-cell RNA-seq or mass spectra" onChange={(event) => setDraft({ ...draft, q: event.target.value })} />
        <p id="use-case-search-hint" className={styles.hint}>Matches titles, questions, input data types, settings and method names.</p>
      </div>
      <div>
        <label htmlFor="use-case-context">Research setting</label>
        <select id="use-case-context" name="context" value={draft.context} aria-describedby="use-case-context-hint" onChange={(event) => setDraft({ ...draft, context: event.target.value as UseCaseFilters["context"] })}>
          <option value="">All settings</option>{initial.available.contexts.map((context) => <option key={context} value={context}>{caseContextLabel(context)}</option>)}
        </select>
        <p id="use-case-context-hint" className={styles.hint}>Clinical research questions also state what the evidence does not establish for patients or clinical workflows.</p>
      </div>
      <button className={`${styles.button} ${styles.primary}`} type="submit">Search</button>
    </form>
    <div className={styles.status}>
      <div aria-live="polite" aria-atomic="true">
        {error ? <p role="alert">{error} <button type="button" className={styles.button} onClick={() => setRetry(retry + 1)}>Retry</button></p>
          : !current ? <p>Loading matching use cases…</p>
          : <p className={styles.muted}>{data.total} {data.total === 1 ? "matching use case" : "matching use cases"}{filters.q ? ` for “${filters.q}”` : ""}{filters.area ? ` in ${researchAreaLabel(filters.area)}` : ""}.</p>}
      </div>
      {search && <button type="button" className={styles.button} onClick={() => navigate(emptyUseCaseFilters)}>Clear filters</button>}
    </div>
    {current && (data.total ? <Cards data={data} search={search} summaries={summaries} /> : <div className={styles.notice}>
      <h3>No use cases match these filters</h3>
      <p>Try a broader term, choose another biological area or clear the filters. This is a curated set of questions; absence does not establish that a model is unsuitable.</p>
      <p><button type="button" className={styles.button} onClick={() => navigate(emptyUseCaseFilters)}>Show all use cases</button></p>
      <p>Looking for a specific model or benchmark instead? <a href="/models/">Browse models</a> · <a href="/benchmarks/">Browse benchmarks</a> · <a href="/">Search the full database</a></p>
    </div>)}
    {current && (cursor || data.next_cursor) && <nav aria-label="Use case pages" className={styles.actions}>
      {cursor && <button type="button" className={styles.button} onClick={() => navigate(filters)}>First page</button>}
      {data.next_cursor && <button type="button" className={styles.button} onClick={() => navigate(filters, data.next_cursor!)}>Next page</button>}
    </nav>}
    <noscript><p>These are the first questions in this release. Enable JavaScript to apply search and filters; the question pages, collection plans and evidence remain readable without it.</p></noscript>
  </div>;
}
