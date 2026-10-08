import fs from "node:fs";
import path from "node:path";
import { dataPath } from "./data-pin";

export const DOMAIN_IDS = [
  "dna-genomes",
  "rna-transcriptomes",
  "proteins-complexes",
  "cells-tissues",
  "microbes-communities",
  "molecular-interactions",
] as const;

export type DomainId = (typeof DOMAIN_IDS)[number];
export type PublicationStatus = "peer_reviewed" | "preprint";
export type EvaluationOrigin = "author_reported" | "independent_paper" | "paper_compilation";

export interface LiteraturePaper {
  id: string;
  title: string;
  year: number;
  publication_status: PublicationStatus;
  version: string;
  source_url: string;
  primary_domain: DomainId;
  retrieved_utc: string;
  doi?: string;
  arxiv_id?: string;
  notes?: string;
}

export interface LiteratureResult {
  id: string;
  paper_id: string;
  domain_id: DomainId;
  task: string;
  model: string;
  model_version: string;
  dataset: string;
  dataset_version: string;
  split: string;
  metric: string;
  value: string;
  unit: string;
  uncertainty: string;
  protocol: string;
  source_locator: string;
  source_url: string;
  evaluation_origin: EvaluationOrigin;
  reviewed_utc: string;
}

const RESULT_COLUMNS: (keyof LiteratureResult)[] = [
  "id", "paper_id", "domain_id", "task", "model", "model_version",
  "dataset", "dataset_version", "split", "metric", "value", "unit",
  "uncertainty", "protocol", "source_locator", "source_url",
  "evaluation_origin", "reviewed_utc",
];

/** RFC 4180-style CSV reader: handles quoted commas, doubled quotes and newlines. */
export function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let closedQuote = false;
  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    if (quoted) {
      if (char === '"' && csv[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') { quoted = false; closedQuote = true; }
      else field += char;
    } else if (closedQuote && char !== "," && char !== "\n" && char !== "\r") {
      throw new Error("Unexpected character after closing CSV quote");
    } else if (char === '"') {
      if (field !== "") throw new Error("Unexpected quote in CSV field");
      quoted = true;
    } else if (char === ",") {
      row.push(field); field = ""; closedQuote = false;
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && csv[i + 1] === "\n") i++;
      row.push(field); field = ""; closedQuote = false;
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
    } else field += char;
  }
  if (quoted) throw new Error("Unclosed quoted CSV field");
  if (field !== "" || row.length || closedQuote) { row.push(field); rows.push(row); }
  return rows;
}

function isHttpUrl(value: string): boolean {
  try { return ["https:", "http:"].includes(new URL(value).protocol); }
  catch { return false; }
}

function isUtcTimestamp(value: string): boolean {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value.replace("Z", ".000Z");
}

export function validateLiterature(papers: LiteraturePaper[], results: LiteratureResult[]): void {
  const paperIds = new Set<string>();
  const paperById = new Map<string, LiteraturePaper>();
  const paperDois = new Set<string>();
  const paperSources = new Set<string>();
  for (const paper of papers) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(paper.id)) throw new Error(`Invalid paper slug: ${paper.id}`);
    if (paperIds.has(paper.id)) throw new Error(`Duplicate paper: ${paper.id}`);
    if (!DOMAIN_IDS.includes(paper.primary_domain)) throw new Error(`Invalid paper domain: ${paper.id}`);
    if (!["peer_reviewed", "preprint"].includes(paper.publication_status)) throw new Error(`Invalid publication status: ${paper.id}`);
    if (!paper.title?.trim() || !paper.version?.trim() || !isHttpUrl(paper.source_url) || !Number.isInteger(paper.year) || paper.year < 1900 || !isUtcTimestamp(paper.retrieved_utc)) throw new Error(`Incomplete paper: ${paper.id}`);
    const doi = paper.doi?.trim().toLowerCase();
    const source = paper.source_url.replace(/\/+$/, "");
    if ((doi && paperDois.has(doi)) || paperSources.has(source)) throw new Error(`Duplicate primary paper source: ${paper.id}`);
    if (doi) paperDois.add(doi);
    paperSources.add(source);
    paperIds.add(paper.id);
    paperById.set(paper.id, paper);
  }
  const resultIds = new Set<string>();
  const resultKeys = new Set<string>();
  const countedPapers = new Set<string>();
  for (const result of results) {
    if (!result.id || resultIds.has(result.id)) throw new Error(`Missing/duplicate result id: ${result.id}`);
    if (!paperIds.has(result.paper_id)) throw new Error(`Unknown paper in result: ${result.id}`);
    const paper = paperById.get(result.paper_id)!;
    if (!DOMAIN_IDS.includes(result.domain_id)) throw new Error(`Invalid result domain: ${result.id}`);
    if (result.domain_id !== paper.primary_domain || result.source_url !== paper.source_url) throw new Error(`Paper/source mismatch in result: ${result.id}`);
    if (![result.task, result.model, result.dataset, result.metric, result.unit, result.source_locator].every((field) => field?.trim()) || !isHttpUrl(result.source_url)) throw new Error(`Incomplete result: ${result.id}`);
    if (!/^Table \w+/i.test(result.source_locator)) throw new Error(`Missing table source locator: ${result.id}`);
    if (!result.value?.trim() || !Number.isFinite(Number(result.value))) throw new Error(`Non-numeric reported result: ${result.id}`);
    if (!["author_reported", "independent_paper", "paper_compilation"].includes(result.evaluation_origin)) throw new Error(`Invalid evaluation origin: ${result.id}`);
    if (!isUtcTimestamp(result.reviewed_utc)) throw new Error(`Missing review timestamp: ${result.id}`);
    const key = [result.paper_id, result.task, result.model, result.model_version, result.dataset, result.dataset_version, result.split, result.metric].join("\u0000");
    if (resultKeys.has(key)) throw new Error(`Duplicate paper/model/test/metric result: ${result.id}`);
    resultKeys.add(key);
    resultIds.add(result.id);
    countedPapers.add(result.paper_id);
  }
  for (const paper of papers) if (!countedPapers.has(paper.id)) throw new Error(`Paper without a verified numerical row: ${paper.id}`);
}

export function getLiterature(): { papers: LiteraturePaper[]; results: LiteratureResult[] } {
  const root = dataPath("data", "benchmark-literature");
  if (!fs.existsSync(path.join(root, "papers.json")) || !fs.existsSync(path.join(root, "results.csv"))) return { papers: [], results: [] };
  const papers = JSON.parse(fs.readFileSync(path.join(root, "papers.json"), "utf8")) as LiteraturePaper[];
  const csvRows = parseCsv(fs.readFileSync(path.join(root, "results.csv"), "utf8"));
  const header = csvRows.shift();
  if (!header || header.join(",") !== RESULT_COLUMNS.join(",")) throw new Error("Literature CSV columns do not match the schema");
  const results = csvRows.map((cells, index) => {
    if (cells.length !== RESULT_COLUMNS.length) throw new Error(`Wrong column count on literature row ${index + 2}`);
    return Object.fromEntries(RESULT_COLUMNS.map((key, i) => [key, cells[i]])) as unknown as LiteratureResult;
  });
  validateLiterature(papers, results);
  return { papers, results };
}
