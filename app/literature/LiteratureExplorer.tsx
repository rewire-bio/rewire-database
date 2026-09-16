"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { LiteraturePaper, LiteratureResult } from "@/lib/benchmark-literature";
import styles from "./literature.module.css";
import { matchesBenchmarkModelQuery } from "@/lib/benchmark-model-aliases";

const DOMAIN_LABELS: Record<string, string> = {
  "dna-genomes": "DNA & genomes",
  "rna-transcriptomes": "RNA & transcriptomes",
  "proteins-complexes": "Proteins & complexes",
  "cells-tissues": "Cells & tissues",
  "microbes-communities": "Microbes & communities",
  "molecular-interactions": "Molecular interactions",
};

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, "en"));
}

function uniqueIgnoringCase(values: string[]): string[] {
  const byLowercase = new Map<string, string>();
  for (const value of values) if (value && !byLowercase.has(value.toLowerCase())) byLowercase.set(value.toLowerCase(), value);
  return Array.from(byLowercase.values()).sort((a, b) => a.localeCompare(b, "en"));
}

function versionSuffix(version: string): string {
  return version && !/^not stated/i.test(version) ? ` (${version})` : "";
}

function originLabel(origin: LiteratureResult["evaluation_origin"]): string {
  if (origin === "author_reported") return "Author's model";
  if (origin === "paper_compilation") return "Compiled from another paper";
  return "Independent paper evaluation";
}

function displayUnit(unit: string): string {
  if (["unitless", "fraction", "count"].includes(unit)) return "";
  return unit === "percent" ? "%" : unit;
}

function scoreText(value: string, unit: string): string {
  const shown = displayUnit(unit);
  return `${value}${shown === "%" ? "%" : shown ? ` ${shown}` : ""}`;
}

function Filter({ label, value, values, onChange, optionLabel = (item) => item }: { label: string; value: string; values: string[]; onChange: (next: string) => void; optionLabel?: (item: string) => string }) {
  return <label className={styles.filter}><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}><option value="">All</option>{values.map((item) => <option key={item} value={item}>{optionLabel(item)}</option>)}</select></label>;
}

export default function LiteratureExplorer({ papers, results }: { papers: LiteraturePaper[]; results: LiteratureResult[] }) {
  const [query, setQuery] = useState("");
  const [domain, setDomain] = useState("");
  const [task, setTask] = useState("");
  const [model, setModel] = useState("");
  const [dataset, setDataset] = useState("");
  const [metric, setMetric] = useState("");
  const [year, setYear] = useState("");
  const [publication, setPublication] = useState("");
  const [visibleCount, setVisibleCount] = useState(50);
  useEffect(() => {
    const initialQuery = new URLSearchParams(window.location.search).get("q");
    if (initialQuery) setQuery(initialQuery);
  }, []);
  useEffect(() => { setVisibleCount(50); }, [query, domain, task, model, dataset, metric, year, publication]);
  const paperById = useMemo(() => new Map(papers.map((paper) => [paper.id, paper])), [papers]);
  const filtered = useMemo(() => results.filter((result) => {
    const paper = paperById.get(result.paper_id);
    if (!paper) return false;
    if (domain && result.domain_id !== domain) return false;
    if (task && result.task.toLowerCase() !== task.toLowerCase()) return false;
    if (model && result.model !== model) return false;
    if (dataset && result.dataset !== dataset) return false;
    if (metric && result.metric.toLowerCase() !== metric.toLowerCase()) return false;
    if (year && String(paper.year) !== year) return false;
    if (publication && paper.publication_status !== publication) return false;
    const haystack = `${paper.title} ${result.model} ${result.task} ${result.dataset} ${result.metric} ${result.protocol}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase()) || matchesBenchmarkModelQuery(result.model, query);
  }), [results, paperById, query, domain, task, model, dataset, metric, year, publication]);
  const ordered = useMemo(() => [...filtered].sort((a, b) => {
    const pa = paperById.get(a.paper_id)!;
    const pb = paperById.get(b.paper_id)!;
    return pb.year - pa.year || pa.title.localeCompare(pb.title, "en") || a.id.localeCompare(b.id, "en");
  }), [filtered, paperById]);
  const domainValues = unique(results.map((result) => result.domain_id));
  const years = unique(papers.map((paper) => String(paper.year))).reverse();

  return <div>
    <div className={styles.controls}>
      <label className={styles.search}><span>Search papers and results</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Paper, model, dataset or metric" /></label>
      <div className={styles.filters}>
        <Filter label="Domain" value={domain} values={domainValues} onChange={setDomain} optionLabel={(item) => DOMAIN_LABELS[item] || item} />
        <Filter label="Task" value={task} values={uniqueIgnoringCase(results.map((result) => result.task))} onChange={setTask} />
        <Filter label="Model" value={model} values={unique(results.map((result) => result.model))} onChange={setModel} />
        <Filter label="Dataset" value={dataset} values={unique(results.map((result) => result.dataset))} onChange={setDataset} />
        <Filter label="Metric" value={metric} values={uniqueIgnoringCase(results.map((result) => result.metric))} onChange={setMetric} />
        <Filter label="Year" value={year} values={years} onChange={setYear} />
        <Filter label="Publication" value={publication} values={["peer_reviewed", "preprint"]} onChange={setPublication} optionLabel={(item) => item === "peer_reviewed" ? "Peer-reviewed" : "Preprint"} />
      </div>
    </div>
    <p className={styles.count} aria-live="polite">{ordered.length} of {results.length} paper-reported rows match · {Math.min(visibleCount, ordered.length)} displayed</p>
    {ordered.length === 0 && <p className={styles.empty}>No results match these filters.</p>}
    <div className={styles.results}>
      {ordered.slice(0, visibleCount).map((result) => {
        const paper = paperById.get(result.paper_id)!;
        return <article key={result.id} className={styles.result}>
          <div className={styles.resultTop}><span className={styles.badge}>Paper-reported</span><span>{DOMAIN_LABELS[result.domain_id]}</span><span>{paper.publication_status === "peer_reviewed" ? "Peer-reviewed" : "Preprint"}</span><span>{paper.year}</span></div>
          <h2><Link href={`/literature/papers/${paper.id}/`}>{paper.title}</Link></h2>
          <p className={styles.identity}><strong>{result.model}{versionSuffix(result.model_version)}</strong> <span aria-hidden="true">·</span> {result.task}</p>
          <dl className={styles.fields}>
            <div><dt>Reported score</dt><dd className={styles.score}>{scoreText(result.value, result.unit)}{result.uncertainty ? <small> {result.uncertainty}</small> : null}</dd></div>
            <div><dt>Metric</dt><dd>{result.metric}</dd></div>
            <div><dt>Dataset / split</dt><dd>{result.dataset}{result.dataset_version ? ` ${result.dataset_version}` : ""}{result.split ? ` · ${result.split}` : ""}</dd></div>
          </dl>
          <p className={styles.protocol}>{result.protocol || "Protocol detail not reported in the source table."}</p>
          <div className={styles.source}><span>{originLabel(result.evaluation_origin)}</span><a href={result.source_url} target="_blank" rel="noreferrer">{result.source_locator} &rarr;</a></div>
        </article>;
      })}
    </div>
    {ordered.length > visibleCount && <button className={styles.more} type="button" onClick={() => setVisibleCount((current) => current + 50)}>Show 50 more rows</button>}
  </div>;
}
