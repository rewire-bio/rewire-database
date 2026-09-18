/**
 * Extract the ProteinGym benchmark tables into catalogue records.
 *
 * Source: Notin, Kollasch, Ritter et al., "ProteinGym: Large-Scale Benchmarks
 * for Protein Fitness Prediction and Design", NeurIPS 2023 Datasets and
 * Benchmarks. Table 2 is the zero-shot substitution benchmark, Table 3 the
 * supervised substitution benchmark, and Table 4 the zero-shot indel benchmark.
 *
 * This PDF prints each caption below its table, so each table is read from the
 * heading row down to its own caption line.
 *
 * Table 3 reports MSE alongside Spearman, and MSE is better when lower. It is
 * recorded that way: the paper marks the direction in the header, and reading
 * it as a score would rank the worst model first.
 *
 * The left column carries a model-type label that spans several rows and wraps
 * across lines ("Protein language models" over three lines). It is not used to
 * identify anything here, only the model name in the second column is, so the
 * wrapping cannot shift a score onto the wrong model.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import { parseCell } from "./tables";
import {
  writeBatch,
  type BatchSpec,
  type CellSpec,
  type MethodSpec,
  type TaskSpec,
} from "./batch";

const SHA256 =
  "a3b08cc4a6befd64620cf0f287d78d55a36dc2639955f52c5655f83833c50104";
const DATE = "2026-09-18";

type Column = {
  label: string;
  title: string;
  metric: string;
  metricKey: string;
  unit: string;
  direction: "higher" | "lower";
};

const TABLES = [
  {
    number: "Table 2",
    start: /^Model type\s+Model name\s+Spearman\s+AUC\s+MCC\s+NDCG\s+Recall/,
    end: /^Table 2: Zero-shot substitution DMS benchmark/,
    dataset: "ProteinGym substitution DMS assays",
    protocol:
      "Zero-shot scoring of substitution assays, averaged over assays with the correction the paper describes.",
    columns: [
      ["ZS-SUB-SPEARMAN", "Zero-shot substitutions, Spearman", "Spearman", "spearman", "correlation", "higher"],
      ["ZS-SUB-AUC", "Zero-shot substitutions, AUC", "AUC", "auc", "fraction", "higher"],
      ["ZS-SUB-MCC", "Zero-shot substitutions, MCC", "MCC", "mcc", "correlation", "higher"],
      ["ZS-SUB-NDCG", "Zero-shot substitutions, NDCG@10%", "NDCG@10%", "ndcg", "fraction", "higher"],
      ["ZS-SUB-RECALL", "Zero-shot substitutions, top 10% recall", "Top 10% recall", "recall", "fraction", "higher"],
    ],
  },
  {
    number: "Table 3",
    start: /^Model\s+Model name\s+Spearman \(↑\)\s+MSE \(↓\)/,
    end: /^Table 3: Supervised substitution DMS benchmark/,
    dataset: "ProteinGym substitution DMS assays",
    protocol:
      "Supervised fitness prediction under three cross-validation schemes: contiguous, modulo and random splits.",
    skipRows: 1,
    // Table 3 lists ESM-1v, MSAT and Tranception twice, once as an auxiliary
    // zero-shot score over one-hot inputs and once as an embedding. The model
    // type is therefore part of the identity here, and is carried down the
    // rows it spans.
    qualifyByType: true,
    columns: [
      ["SUP-SUB-SPEARMAN-CONTIG", "Supervised substitutions, contiguous split, Spearman", "Spearman", "spearman", "correlation", "higher"],
      ["SUP-SUB-SPEARMAN-MOD", "Supervised substitutions, modulo split, Spearman", "Spearman", "spearman", "correlation", "higher"],
      ["SUP-SUB-SPEARMAN-RAND", "Supervised substitutions, random split, Spearman", "Spearman", "spearman", "correlation", "higher"],
      ["SUP-SUB-SPEARMAN-AVG", "Supervised substitutions, average over splits, Spearman", "Spearman", "spearman", "correlation", "higher"],
      ["SUP-SUB-MSE-CONTIG", "Supervised substitutions, contiguous split, MSE", "MSE", "mse", "error", "lower"],
      ["SUP-SUB-MSE-MOD", "Supervised substitutions, modulo split, MSE", "MSE", "mse", "error", "lower"],
      ["SUP-SUB-MSE-RAND", "Supervised substitutions, random split, MSE", "MSE", "mse", "error", "lower"],
      ["SUP-SUB-MSE-AVG", "Supervised substitutions, average over splits, MSE", "MSE", "mse", "error", "lower"],
    ],
  },
  {
    number: "Table 4",
    start: /^Model type\s+Model name\s+Spearman by DMS type/,
    end: /^Table 4: Zero-shot indel DMS benchmark/,
    dataset: "ProteinGym indel DMS assays",
    protocol:
      "Zero-shot scoring of insertion and deletion assays, split by how the test sequences were generated.",
    skipRows: 1,
    columns: [
      ["ZS-INDEL-SPEARMAN-LIBRARY", "Zero-shot indels, library assays, Spearman", "Spearman", "spearman", "correlation", "higher"],
      ["ZS-INDEL-SPEARMAN-DESIGNED", "Zero-shot indels, designed or natural assays, Spearman", "Spearman", "spearman", "correlation", "higher"],
      ["ZS-INDEL-SPEARMAN-ALL", "Zero-shot indels, all assays, Spearman", "Spearman", "spearman", "correlation", "higher"],
      ["ZS-INDEL-AUC", "Zero-shot indels, all assays, AUC", "AUC", "auc", "fraction", "higher"],
    ],
  },
];

function run(file: string) {
  const text = fs.readFileSync(file, "utf8");
  const sha = createHash("sha256")
    .update(fs.readFileSync(process.argv[3]))
    .digest("hex");
  if (sha !== SHA256)
    throw new Error(`Artifact hash ${sha} does not match the pinned ${SHA256}`);

  const lines = text.split("\n");
  const tasks = new Map<string, TaskSpec>();
  const methods = new Map<string, MethodSpec>();
  const cells: CellSpec[] = [];

  for (const config of TABLES) {
    const columns = config.columns as unknown as [
      string,
      string,
      string,
      string,
      string,
      Column["direction"],
    ][];
    for (const [label, title, metric, metricKey, unit, direction] of columns)
      tasks.set(label, {
        label,
        title,
        metric,
        metricKey,
        unit,
        direction,
        dataset: config.dataset,
        protocol: config.protocol,
        locator: `${config.number}, column(${title})`,
      });

    const from = lines.findIndex((line) => config.start.test(line.trim()));
    if (from < 0) throw new Error(`${config.number}: heading not found`);
    const rest = lines.slice(from + 1 + (config.skipRows ?? 0));
    const to = rest.findIndex((line) => config.end.test(line.trim()));
    if (to < 0) throw new Error(`${config.number}: caption not found`);
    let rows = 0;
    let type = "";
    for (const line of rest.slice(0, to)) {
      const parts = line.trim().split(/\s{2,}/).filter(Boolean);
      // Data rows end with one value per column. Anything shorter is a
      // continuation of the wrapped model-type label in the left column.
      const values = parts.slice(-columns.length);
      if (parts.length < columns.length + 1) continue;
      if (!values.every((value) => /^[\d.−-]/.test(value))) continue;
      const labels = parts.slice(0, parts.length - columns.length);
      if (config.qualifyByType && labels.length > 1) type = labels[0].trim();
      const printedName = labels[labels.length - 1].trim();
      const name =
        config.qualifyByType && type ? `${type} ${printedName}` : printedName;
      if (!printedName || /^(Model|Avg\.)$/.test(printedName)) continue;
      rows += 1;
      if (!methods.has(name))
        methods.set(name, {
          name,
          kind: "configuration",
          description: config.qualifyByType
            ? "Supervised fitness predictor evaluated by the ProteinGym authors. The leading term is the input representation the paper's model type column gives."
            : "Fitness prediction model evaluated by the ProteinGym authors under their harness.",
          locator: `${config.number}, row(${labels.join(" ")})`,
        });
      values.forEach((printed, i) => {
        const cell = parseCell(printed);
        if (cell.value === null) return;
        cells.push({
          method: name,
          task: columns[i][0],
          printed: cell.printed,
          value: cell.value,
          sd: cell.sd,
          locator: `${config.number}, row(${labels.join(" ")}), column(${columns[i][1]})`,
        });
      });
    }
    if (rows < 9) throw new Error(`${config.number}: ${rows} model rows`);
  }

  const spec: BatchSpec = {
    key: "proteingym",
    benchmarkId: "discovery-benchmark-proteingym",
    benchmarkName: "ProteinGym",
    area: "proteins-complexes",
    source: {
      id: "evidence-expansion-proteingym-a3b08cc4",
      emit: false,
      name: "ProteinGym: Large-Scale Benchmarks for Protein Fitness Prediction and Design (NeurIPS 2023 Datasets and Benchmarks)",
      url: "https://papers.nips.cc/paper/2023/file/cac723e5ff29f65e3fcbb0739ae91bee-Paper-Datasets_and_Benchmarks.pdf",
      artifactUrl:
        "https://papers.nips.cc/paper/2023/file/cac723e5ff29f65e3fcbb0739ae91bee-Paper-Datasets_and_Benchmarks.pdf",
      sha256: SHA256,
      version: "NeurIPS 2023 camera ready",
      venue: "NeurIPS 2023 Datasets and Benchmarks",
      retrievedAt: DATE,
    },
    reviewer: "Codex research agent; no human review claimed",
    date: DATE,
    method:
      "Deterministic parse of the pinned PDF text layer, reading each table from its heading row down to its own caption",
    caveats: [
      "Author-reported numbers, source checked but not independently reproduced.",
      "MSE is better when lower; every other metric here is better when higher.",
      "Zero-shot, supervised and indel benchmarks use different protocols and assay sets, so their figures are not comparable to each other.",
    ],
    tasks: [...tasks.values()],
    methods: [...methods.values()],
    cells,
  };
  writeBatch(spec);
}

if (process.argv[1]?.endsWith("proteingym.ts")) run(process.argv[2]);
