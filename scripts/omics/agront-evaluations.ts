import fs from "node:fs";
import { createHash } from "node:crypto";
import { buildBatch, type BatchSpec } from "./extract/batch";
import { recordSchema, type RecordEntry } from "./schema";

export const agroRoot = "data/omics/reviewed/agront-2026-09-23";
export const agroFamily = "discovery-model-agro-nucleotide-transformer";
export const agroBenchmark = "agront-2024-plant-genomic-benchmark";
export const agroInputs = ["records.jsonl", "review.json", "rows.json", "Fig3_panele.txt", "Fig3_panelf.txt", "paper-method-locators.json", "article.xml.gz"].map(file => `${agroRoot}/${file}`);
const revision = "78ec8156c2ffb3e5475277fdb7eb603294224e53";
const paperId = "agront-2024-paper-methods";
const paperLocator = "Methods: Fine-tuning strategy (Sec16), Promoter and terminator strength prediction (Sec21); Figure 3 caption";
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const sources = [
  { file: "Fig3_panele.txt", hash: "9cea450b579aa1eb61ff3bcb70e017410402abd6261aef8fc270cafc926a7c7b", task: "promoter strength", baseline: "CNN (Jores et al.)", panel: "3e" },
  { file: "Fig3_panelf.txt", hash: "2a72d3cfd8c0cd5611ef91f0fd5e3e958aec55e2abb58773992b677b3fb9f1ef", task: "terminator strength", baseline: "CNN (Gorjifard et al.)", panel: "3f" },
];
type Row = {
  task: string; species_or_sequence_class: string; assay_system: string;
  assay_model_label: string; method_label: string; printed_value: string; numeric_value: string;
  source_file: string; source_line_1based: number; source_row_text: string;
  source_locator: string; source_sha256: string;
};
const caveats = [
  "Author-reported R² values, source checked but not independently reproduced. No uncertainty is supplied in these tables.",
  "Compare only within the same task, assay system and sequence class. No aggregate across these conditions is reported here.",
  "Exact fitted checkpoint hashes, seeds and scoring denominators have not been established for these source rows.",
];
function record(id: string, kind: RecordEntry["kind"], name: string, description: string, attributes: Record<string, unknown> = {}): RecordEntry {
  return { id, kind, name, description, status: "source_checked", facets: { areas: ["genomics"] }, source_ids: [paperId], links: [], attributes };
}

/** Deterministic transcription of both complete primary source tables. */
export function buildAgroRecords(): RecordEntry[] {
  const rows: Row[] = JSON.parse(fs.readFileSync(`${agroRoot}/rows.json`, "utf8"));
  if (rows.length !== 24) throw Error("AgroNT requires both complete 12-row tables");
  const paper = record(paperId, "source", "AgroNT: published methods and Figure 3", "Publisher full-text XML snapshot. Review is limited to the cited methods and identity claims.", {
    url: "https://www.nature.com/articles/s42003-024-06465-2",
    artifact_url: "https://www.ebi.ac.uk/europepmc/webservices/rest/PMC11233511/fullTextXML",
    artifact_sha256: "bcc1ad6d01ce59853d4e81c9d097427d2115c392ee51cf41d06bd4434cf1d378",
    version: "Version of record, 2024-07-09; retrieved XML snapshot",
    retrieved_at: "2026-09-23", doi: "10.1038/s42003-024-06465-2",
  });
  paper.source_ids = [];
  const benchmark = record(agroBenchmark, "benchmark", "Plant Genomic Benchmark (PGB)", "Plant genomic evaluations introduced with AgroNT. This release contains the complete promoter and terminator comparison tables from Figure 3e and 3f; other tasks remain unextracted.", {
    entity_level: "suite", source_locator: paperLocator,
    run_documentation: { record_id: agroBenchmark, status: "source_reviewed_not_executed", source_ids: [paperId], source_locator: paperLocator,
      summary: "The paper describes IA3 fine-tuning on 170 bp sequences using the original studies' train/test datasets. Rewire has no maintained runner for this benchmark. Exact fitted checkpoints, split manifests and execution settings have not been verified; these reported scores are not a reproduction recipe." },
    missing_metadata: { runner: "unavailable", split_manifest: "unextracted" },
  });
  const out = [paper, benchmark];
  for (const source of sources) {
    const bytes = fs.readFileSync(`${agroRoot}/${source.file}`);
    if (sha(bytes) !== source.hash) throw Error(`AgroNT source hash mismatch: ${source.file}`);
    const lines = bytes.toString("utf8").trimEnd().split(/\r?\n/);
    const selected = rows.filter(row => row.source_file === `Figures/${source.file}`);
    if (lines.length !== 13 || selected.length !== 12 || new Set(selected.map(row => row.source_line_1based)).size !== 12)
      throw Error("AgroNT source table coverage mismatch");
    for (const row of selected) {
      const [species, assay, method, score] = lines[row.source_line_1based - 1].split("\t");
      if (row.source_line_1based < 2 || row.source_row_text !== lines[row.source_line_1based - 1] || row.source_sha256 !== source.hash || row.task !== source.task || species !== row.species_or_sequence_class || assay !== row.assay_model_label || method !== row.method_label || score !== row.printed_value || score !== row.numeric_value || !["AgroNT", source.baseline].includes(method) || row.assay_system !== (assay === "Maize model" ? "maize protoplasts" : "tobacco leaves"))
        throw Error("AgroNT row differs from pinned source");
    }
    const methodName = (row: Row) => `${row.method_label}: ${source.task}, ${row.assay_system}`;
    const label = (row: Row) => `${row.assay_system}: ${row.species_or_sequence_class === "GC" ? "randomized GC sequences" : row.species_or_sequence_class}`;
    const protocol = "170 bp assay sequences; original study train/test datasets, as described in Methods Sec21. R² is scored separately by assay system and sequence class. Fitted model checkpoint, seeds and scored counts are not established here.";
    const spec: BatchSpec = {
      key: `agront-2024-fig${source.panel}`, benchmarkId: agroBenchmark, benchmarkName: `PGB ${source.task}`, area: "genomics",
      source: { id: `agront-2024-fig${source.panel}-source`, name: `AgroNT Figure ${source.panel} source table`, url: "https://huggingface.co/datasets/InstaDeepAI/plant-genomic-benchmark", artifactUrl: `https://huggingface.co/datasets/InstaDeepAI/plant-genomic-benchmark/resolve/${revision}/Figures/${source.file}`, sha256: source.hash, version: revision, venue: "Communications Biology", retrievedAt: "2026-09-23" },
      reviewer: "Codex automated source review", date: "2026-09-23", method: "Exact-string transcription checked against all rows of the pinned author TSV", caveats,
      tasks: selected.filter(row => row.method_label === "AgroNT").map(row => ({ label: label(row), title: `${source.task} prediction`, metric: "R²", metricKey: "r2", unit: "coefficient of determination", direction: "higher", dataset: `${source.task} test sequences: ${label(row)}`, protocol, locator: `${source.file}, column R2, ${label(row)}; Methods Sec21` })),
      methods: [...new Map(selected.map(row => [methodName(row), row])).values()].map(row => ({ name: methodName(row), kind: "configuration", description: row.method_label === "AgroNT" ? "AgroNT with task-specific regression and IA3 fine-tuning, as described in the paper. Exact fitted checkpoint is unreported." : `${source.baseline} as evaluated in the AgroNT paper on the original study's data. Exact fitted checkpoint is unreported.`, locator: `${source.file}, Type=${row.method_label}, Model=${row.assay_model_label}; ${paperLocator}` })),
      cells: selected.map(row => ({ method: methodName(row), task: label(row), printed: row.printed_value, value: row.numeric_value, locator: row.source_locator })),
    };
    const batch = buildBatch(spec);
    for (const item of batch) {
      if (item.kind !== "source" && item.kind !== "result") item.source_ids.push(paperId);
      if (item.kind === "task") { item.kind = "protocol"; item.attributes.entity_level = "protocol"; }
      if (item.kind === "dataset_subset") item.description = "Reported test subset of the original promoter or terminator study. The AgroNT Methods state that the original training and test datasets were used. Exact split manifest and scored count remain unextracted.";
      if (item.kind === "evaluation") {
        item.attributes.published_score_reproduction = false;
        item.attributes.suite_complete = false;
        item.attributes.adaptation = item.name.startsWith("AgroNT:") ? "IA3 fine-tuning; task-specific regression head" : "Task-specific CNN from the cited original study";
        item.attributes.sequence_length_bp = 170;
      }
      if (item.kind === "configuration" && item.name.startsWith("AgroNT:")) {
        item.links.push({ relation: "family", target_id: agroFamily });
        const claim = record(`${item.id}-family-claim`, "claim", `${item.name}: AgroNT family`, "The paper identifies the evaluated AgroNT model and describes its task-specific fine-tuning.", { field: `links:family:${agroFamily}`, target_id: agroFamily, source_locator: paperLocator, review: { method: "automated_source_review", date: "2026-09-23", note: "Primary methods and figure identity; no exact fitted checkpoint inferred." } });
        claim.links = [{ relation: "subject", target_id: item.id }];
        out.push(claim);
      }
    }
    // Every comparison includes both methods from the complete source table.
    if (batch.filter(item => item.kind === "result").length !== 12) throw Error("Incomplete AgroNT result batch");
    out.push(...batch);
  }
  return out.map(item => recordSchema.parse(item));
}

export function addAgroEvaluations(input: RecordEntry[]): RecordEntry[] {
  const text = fs.readFileSync(`${agroRoot}/records.jsonl`, "utf8");
  const review = JSON.parse(fs.readFileSync(`${agroRoot}/review.json`, "utf8"));
  if (review.status !== "reviewed" || review.review_method !== "automated" || review.errors?.length !== 0 || review.records_sha256 !== sha(text)) throw Error("AgroNT review receipt mismatch");
  for (const [file, hash] of Object.entries(review.input_sha256 as Record<string, string>))
    if (sha(fs.readFileSync(`${agroRoot}/${file}`)) !== hash) throw Error("AgroNT reviewed input changed");
  const added = buildAgroRecords();
  if (added.map(item => JSON.stringify(item)).join("\n") + "\n" !== text) throw Error("AgroNT records differ from reviewed extraction");
  const ids = new Set(input.map(item => item.id));
  if (added.some(item => ids.has(item.id))) throw Error("AgroNT additions cannot replace existing records");
  return [...input, ...added];
}
