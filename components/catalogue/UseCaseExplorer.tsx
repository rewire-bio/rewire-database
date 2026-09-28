"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  emptyUseCaseFilters, readUseCaseFilters, encodeUseCaseSearch, caseContextLabel,
  createUseCasesClient, USE_CASE_PAGE_SIZE, type UseCasePage, type UseCaseFilters,
} from "@/lib/use-cases-client";
import { researchAreaLabel } from "@/lib/omics-browse";
import { UseCaseCollectionStatus } from "./UseCaseCollectionPlan";
import styles from "./UseCases.module.css";

function Cards({ data, search }: { data: UseCasePage; search: string }) {
  return <div className={styles.cards}>
    {data.items.map((entry) => <article className={styles.card} key={entry.id}>
      <span className={styles.tag}>{researchAreaLabel(entry.area)} · {entry.contexts.map(caseContextLabel).join(" / ")}</span>
      <h2><a href={`/use-cases/${entry.slug}/${search}`}>{entry.title}</a></h2>
      {entry.collection_plan && <p><UseCaseCollectionStatus status={entry.collection_plan.status} /></p>}
      <p>{entry.question}</p>
      <p className={styles.muted}><strong>Inputs:</strong> {entry.inputs.join("; ")}</p>
      <p className={styles.muted}>{entry.setting}</p>
      <a href={`/use-cases/${entry.slug}/${search}${entry.collection_plan ? "#collection-plan" : ""}`}>{entry.collection_plan ? "View question and evidence plan →" : "Inspect evidence and limitations →"}</a>
    </article>)}
  </div>;
}

export default function UseCaseExplorer({ initial }: { initial: UseCasePage }) {
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

  return <div id="questions">
    <form className={styles.filters} onSubmit={submit} role="search" aria-label="Find a use case">
      <label>Question or inputs
        <input name="q" type="search" maxLength={200} value={draft.q} placeholder="For example, splicing or protein stability" onChange={(event) => setDraft({ ...draft, q: event.target.value })} />
      </label>
      <label>Biological area
        <select name="area" value={draft.area} onChange={(event) => setDraft({ ...draft, area: event.target.value })}>
          <option value="">All areas</option>{areas.map((area) => <option key={area} value={area}>{researchAreaLabel(area)}</option>)}
        </select>
      </label>
      <label>Context
        <select name="context" value={draft.context} onChange={(event) => setDraft({ ...draft, context: event.target.value as UseCaseFilters["context"] })}>
          <option value="">All contexts</option>{initial.available.contexts.map((context) => <option key={context} value={context}>{caseContextLabel(context)}</option>)}
        </select>
      </label>
      <button className={styles.button} type="submit">Find use cases</button>
    </form>
    {search && <p><button type="button" className={styles.button} onClick={() => navigate(emptyUseCaseFilters)}>Clear filters</button></p>}
    <div aria-live="polite" aria-atomic="true">
      {error ? <p role="alert">{error} <button type="button" className={styles.button} onClick={() => setRetry(retry + 1)}>Retry</button></p>
        : !current ? <p>Loading matching use cases…</p>
        : <p className={styles.muted}>{data.total} {data.total === 1 ? "matching use case" : "matching use cases"}{filters.q ? ` for “${filters.q}”` : ""}.</p>}
    </div>
    {current && (data.total ? <Cards data={data} search={search} /> : <div className={styles.notice}>
      <h2>No use cases match these filters</h2>
      <p>Try a broader question or clear the filters. This is a curated set of questions; absence does not establish that a model is unsuitable.</p>
      <a href="/">Search the full catalogue</a>
    </div>)}
    {current && (cursor || data.next_cursor) && <nav aria-label="Use case pages" className={styles.actions}>
      {cursor && <button type="button" className={styles.button} onClick={() => navigate(filters)}>First page</button>}
      {data.next_cursor && <button type="button" className={styles.button} onClick={() => navigate(filters, data.next_cursor!)}>Next page</button>}
    </nav>}
    <noscript><p>These are the first questions in this release. Enable JavaScript to apply search and filters; the question pages, collection plans and evidence remain readable without it.</p></noscript>
  </div>;
}
