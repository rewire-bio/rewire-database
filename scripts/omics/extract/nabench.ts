/**
 * Extract the NABench comparison tables into catalogue records.
 *
 * Source: "NABench: Large-Scale Benchmarks of Nucleotide Foundation Models for
 * Fitness Prediction", arXiv:2511.02888v1. Tables 6 and 12 hold the overall
 * scores on the deep mutational scanning and SELEX collections; Tables 7 to 11
 * break the same runs down by nucleotide type.
 *
 * The breakdowns are kept as separate tasks rather than folded into the overall
 * score, because a per-type figure and an overall figure answer different
 * questions and the paper reports both. Nothing is averaged across them here.
 *
 * Every figure is a correlation or an AUC where higher is better, so no
 * direction is inverted in this batch.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import { parseCell, tableMatching } from "./tables";
import {
  writeBatch,
  type BatchSpec,
  type CellSpec,
  type MethodSpec,
  type TaskSpec,
} from "./batch";

const SHA256 =
  "fefd48d53b1a7eadf9e14db96adacc8e646304c1b592562d9f136f4508941350";
const DATE = "2026-09-18";
const NAME = "NABench";

const TYPES = [
  "mRNA",
  "ribozyme",
  "tRNA",
  "aptamer",
  "promoter",
  "enhancer",
] as const;

/** The per-type tables: caption, setting, metric. */
const BREAKDOWNS = [
  {
    table: /Table 7: Zero-shot Spearman/,
    number: "Table 7",
    setting: "zero-shot",
    prefix: "ZS-CORR",
    metric: "Spearman ρ",
    key: "spearman",
    unit: "correlation",
  },
  {
    table: /Table 8: Zero-shot AUC/,
    number: "Table 8",
    setting: "zero-shot",
    prefix: "ZS-AUC",
    metric: "AUC",
    key: "auc",
    unit: "fraction",
  },
  {
    table: /Table 9: Few-shot Spearman/,
    number: "Table 9",
    setting: "few-shot",
    prefix: "FS-CORR",
    metric: "Spearman ρ",
    key: "spearman",
    unit: "correlation",
  },
  {
    table: /Table 10: The Spearman.{0,3}s .{0,3} of random cross validation/,
    number: "Table 10",
    setting: "supervised, random cross validation",
    prefix: "RCV-CORR",
    metric: "Spearman ρ",
    key: "spearman",
    unit: "correlation",
  },
  {
    table: /Table 11: Contiguous Cross Validation/,
    number: "Table 11",
    setting: "supervised, contiguous cross validation",
    prefix: "CCV-CORR",
    metric: "Spearman ρ",
    key: "spearman",
    unit: "correlation",
  },
];

/** The overall tables: caption, collection, and the columns they print. */
const OVERALL = [
  {
    table: /Table 6: Overall Scores of all models on DMS/,
    number: "Table 6",
    prefix: "DMS",
    collection: "NABench deep mutational scanning assays",
    columns: [
      ["Zero-shot Spearman ρ", "spearman", "correlation", "ZS-CORR"],
      ["Zero-shot AUC", "auc", "fraction", "ZS-AUC"],
      ["Zero-shot MCC", "mcc", "correlation", "ZS-MCC"],
      ["Zero-shot NDCG", "ndcg", "fraction", "ZS-NDCG"],
      ["Contiguous cross validation Spearman ρ", "spearman", "correlation", "CCV"],
      ["Random cross validation Spearman ρ", "spearman", "correlation", "RCV"],
      ["Few-shot Spearman ρ", "spearman", "correlation", "FS"],
    ],
  },
  {
    table: /Table 12: Overall Scores of all models on SELEX/,
    number: "Table 12",
    prefix: "SELEX",
    collection: "NABench SELEX assays",
    columns: [
      ["Zero-shot Spearman ρ", "spearman", "correlation", "ZS-CORR"],
      ["Zero-shot AUC", "auc", "fraction", "ZS-AUC"],
      ["Zero-shot MCC", "mcc", "correlation", "ZS-MCC"],
      ["Zero-shot NDCG", "ndcg", "fraction", "ZS-NDCG"],
      ["Random cross validation Spearman ρ", "spearman", "correlation", "RCV"],
      ["Few-shot Spearman ρ", "spearman", "correlation", "FS"],
    ],
  },
];

function run(file: string) {
  const html = fs.readFileSync(file, "utf8");
  const sha = createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  if (sha !== SHA256)
    throw new Error(`Artifact hash ${sha} does not match the pinned ${SHA256}`);

  const tasks: TaskSpec[] = [];
  const methods = new Map<string, MethodSpec>();
  const cells: CellSpec[] = [];
  /** "Evo2-7B ( Nguyen, 2025 )" is a model and a citation. */
  const modelName = (printed: string) =>
    printed.replace(/\s*\([^)]*\d{4}[^)]*\)\s*$/, "").trim();
  const addMethod = (name: string, locator: string) => {
    if (!methods.has(name))
      methods.set(name, {
        name,
        kind: "configuration",
        description:
          "Nucleotide foundation model evaluated by the NABench authors under their fitness prediction protocol.",
        locator,
      });
  };

  for (const group of BREAKDOWNS) {
    const table = tableMatching(html, group.table);
    for (const type of TYPES)
      tasks.push({
        label: `${group.prefix}-${type.toUpperCase()}`,
        title: `Fitness prediction on ${type} assays, ${group.setting}`,
        metric: group.metric,
        metricKey: group.key,
        unit: group.unit,
        direction: "higher",
        dataset: `NABench ${type} assays`,
        protocol: `Scored ${group.setting} across the NABench ${type} assays.`,
        locator: `${group.number}, column(${type})`,
      });
    const rows = table.rows.slice(1).filter((row) => row[0]?.trim());
    if (rows.length < 20)
      throw new Error(`${group.number}: ${rows.length} rows`);
    for (const row of rows) {
      if (row.length !== TYPES.length + 1)
        throw new Error(`${group.number} row: ${row.join(" | ")}`);
      const name = modelName(row[0]);
      addMethod(name, `${group.number}, row(${row[0]})`);
      row.slice(1).forEach((printed, i) => {
        const cell = parseCell(printed);
        if (cell.value === null) return;
        cells.push({
          method: name,
          task: `${group.prefix}-${TYPES[i].toUpperCase()}`,
          printed: cell.printed,
          value: cell.value,
          sd: cell.sd,
          locator: `${group.number}, row(${row[0]}), column(${TYPES[i]})`,
        });
      });
    }
  }

  for (const group of OVERALL) {
    const table = tableMatching(html, group.table);
    for (const [metric, key, unit, suffix] of group.columns)
      tasks.push({
        label: `${group.prefix}-${suffix}`,
        title: `Overall fitness prediction on ${group.collection}, ${metric}`,
        metric,
        metricKey: key,
        unit,
        direction: "higher",
        dataset: group.collection,
        protocol: `Aggregated by the NABench authors across ${group.collection}.`,
        locator: `${group.number}, column(${metric})`,
      });
    const rows = table.rows.slice(2).filter((row) => row[0]?.trim());
    if (rows.length < 20)
      throw new Error(`${group.number}: ${rows.length} rows`);
    for (const row of rows) {
      if (row.length !== group.columns.length + 1)
        throw new Error(`${group.number} row: ${row.join(" | ")}`);
      const name = modelName(row[0]);
      addMethod(name, `${group.number}, row(${row[0]})`);
      row.slice(1).forEach((printed, i) => {
        const cell = parseCell(printed);
        if (cell.value === null) return;
        cells.push({
          method: name,
          task: `${group.prefix}-${group.columns[i][3]}`,
          printed: cell.printed,
          value: cell.value,
          sd: cell.sd,
          locator: `${group.number}, row(${row[0]}), column(${group.columns[i][0]})`,
        });
      });
    }
  }

  const spec: BatchSpec = {
    key: "nabench",
    benchmarkId: "discovery-benchmark-nabench",
    benchmarkName: NAME,
    area: "rna-transcriptomes",
    source: {
      id: "evidence-expansion-nabench-fefd48d5",
      emit: false,
      name: "NABench: Large-Scale Benchmarks of Nucleotide Foundation Models for Fitness Prediction (arXiv:2511.02888v1)",
      url: "https://arxiv.org/abs/2511.02888",
      artifactUrl: "https://arxiv.org/html/2511.02888v1",
      sha256: SHA256,
      version: "v1",
      venue: "arXiv preprint",
      retrievedAt: DATE,
    },
    reviewer: "Codex research agent; no human review claimed",
    date: DATE,
    method:
      "Deterministic parse of the pinned HTML tables, with row and column counts asserted",
    caveats: [
      "Author-reported numbers, source checked but not independently reproduced.",
      "Zero-shot, few-shot and supervised cross validation figures come from different protocols and are not comparable to each other.",
      "The per-nucleotide-type figures and the overall figures describe the same runs at different resolutions, so they must not be combined.",
    ],
    tasks,
    methods: [...methods.values()],
    cells,
  };
  writeBatch(spec);
}

if (process.argv[1]?.endsWith("nabench.ts")) run(process.argv[2]);
