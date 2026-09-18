/**
 * Extract the DART-Eval comparison tables into catalogue records.
 *
 * Source: Patel, Kang, Viswanathan et al., "DART-Eval: A Comprehensive DNA
 * Language Model Evaluation Benchmark on Regulatory DNA", arXiv:2412.05430v1.
 * Tables 3 to 6 hold the four evaluated tasks.
 *
 * DART-Eval scores the same model in several settings: zero-shot, probed,
 * fine-tuned, and ab initio baselines trained from scratch. A setting is part
 * of what was run, not a property of the model, so it is carried in the method
 * name. "DNABERT-2 (probed)" and "DNABERT-2 (fine-tuned)" are different things
 * and averaging them would be meaningless.
 *
 * Tables 3 and 6 put the setting in the column headers and Tables 4 and 5 put
 * it in a row group, so the two shapes are read separately rather than through
 * one clever loop that would quietly mislabel one of them.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import { parseCell, sectioned, tableMatching } from "./tables";
import { writeBatch, type BatchSpec, type CellSpec, type MethodSpec, type TaskSpec } from "./batch";

const SHA256 =
  "4194b137ba55c9a2c269d119a9afec6ae1bb0feaf17d91433ae483c41221a56b";
const KEY = "dart-eval";
const BENCHMARK = "discovery-benchmark-dart-eval";
const NAME = "DART-Eval";
const DATE = "2026-09-18";
const REVIEWER = "Codex research agent; no human review claimed";

const CCRE = "ENCODE cCREs against dinucleotide-shuffled backgrounds";
const PEAKS = "ENCODE chromatin accessibility peaks in five cell lines";
const AFRICAN = "Chromatin QTLs in African LCLs";
const YORUBAN = "DNase QTLs in Yoruban LCLs";

const CELLS = ["GM12878", "H1ESC", "HEPG2", "IMR90", "K562"];

const tasks: TaskSpec[] = [];
const methods = new Map<string, MethodSpec>();
const cells: CellSpec[] = [];

const task = (t: Omit<TaskSpec, "unit"> & { unit?: string }) => {
  tasks.push({ unit: t.unit ?? "fraction", ...t } as TaskSpec);
};

/**
 * The paper writes its ab initio baselines as an italic "Ab initio" followed by
 * the baseline name in the same cell, and abbreviates Nucleotide Transformer to
 * NT in the later tables. Both are the paper's own typography for an entity it
 * names in full in Table 1.
 */
const modelName = (printed: string) =>
  printed === "NT"
    ? "Nucleotide Transformer"
    : printed.replace(/^Ab initio\s+/, "");

const setting = (name: string, printed: string) => {
  const model = modelName(printed);
  const full = `${model} (${name})`;
  if (!methods.has(full))
    methods.set(full, {
      name: full,
      kind: name === "ab initio" ? "method" : "configuration",
      description:
        name === "ab initio"
          ? `Baseline trained from scratch by the DART-Eval authors, evaluated ${name}.`
          : `DNA language model evaluated by the DART-Eval authors in the ${name} setting.`,
      locator: `Table 1, row(${model})`,
    });
  return full;
};

function run(file: string) {
  const html = fs.readFileSync(file, "utf8");
  const sha = createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  if (sha !== SHA256)
    throw new Error(`Artifact hash ${sha} does not match the pinned ${SHA256}`);

  // Table 3. Columns carry the setting; every row is one model.
  const t3 = tableMatching(html, /Table 3: Regulatory element identification/);
  const t3cols: [string, string, string][] = [
    ["zero-shot", "REI-ACC", "accuracy"],
    ["probed", "REI-ABS", "absolute_accuracy"],
    ["probed", "REI-PAIR", "paired_accuracy"],
    ["fine-tuned", "REI-ABS", "absolute_accuracy"],
    ["fine-tuned", "REI-PAIR", "paired_accuracy"],
    ["ab initio", "REI-ABS", "absolute_accuracy"],
    ["ab initio", "REI-PAIR", "paired_accuracy"],
  ];
  task({
    label: "REI-ACC",
    title: "Regulatory element identification, zero-shot accuracy",
    metric: "Accuracy",
    metricKey: "accuracy",
    direction: "higher",
    dataset: CCRE,
    protocol:
      "Distinguish ENCODE cCREs from dinucleotide-shuffled background sequences, scored zero-shot from model likelihood.",
    locator: "Table 3, column(Zero-Shot Accuracy)",
  });
  for (const [label, title, metric, key] of [
    ["REI-ABS", "Regulatory element identification, absolute accuracy", "Absolute accuracy", "absolute_accuracy"],
    ["REI-PAIR", "Regulatory element identification, paired accuracy", "Paired accuracy", "paired_accuracy"],
  ] as const)
    task({
      label,
      title,
      metric,
      metricKey: key,
      direction: "higher",
      dataset: CCRE,
      protocol:
        "Distinguish ENCODE cCREs from dinucleotide-shuffled background sequences. The setting the model was run in is part of the method name.",
      locator: `Table 3, column(${metric})`,
    });
  const t3rows = t3.rows.slice(2);
  if (t3rows.length !== 7) throw new Error(`Table 3: ${t3rows.length} rows`);
  for (const row of t3rows) {
    if (row.length !== 8) throw new Error(`Table 3 row: ${row.join(" | ")}`);
    row.slice(1).forEach((printed, i) => {
      const [mode, label, metricKey] = t3cols[i];
      const cell = parseCell(printed);
      if (cell.value === null) return;
      cells.push({
        method: setting(mode, row[0]),
        task: label,
        printed: cell.printed,
        value: cell.value,
        sd: cell.sd,
        locator: `Table 3, row(${row[0]}), column(${mode} ${metricKey})`,
      });
    });
  }

  // Table 4. A row group carries the setting; columns are the scored cell types.
  const t4 = tableMatching(html, /Table 4: Cell-type-specific element/);
  task({
    label: "CTS-ACC",
    title: "Cell-type-specific element classification, overall accuracy",
    metric: "Accuracy",
    metricKey: "accuracy",
    direction: "higher",
    dataset: PEAKS,
    protocol: "Classify which of five cell lines a accessible element belongs to.",
    locator: "Table 4, column(Overall Accuracy)",
  });
  for (const cellLine of CELLS)
    task({
      label: `CTS-${cellLine}`,
      title: `Cell-type-specific element classification, ${cellLine}`,
      metric: "AUROC",
      metricKey: "auroc",
      direction: "higher",
      dataset: PEAKS,
      protocol: `One-against-rest AUROC for ${cellLine} accessible elements.`,
      locator: `Table 4, column(${cellLine} AUROC)`,
    });
  for (const { section, cells: row } of sectioned(t4.rows.slice(2), 7)) {
    const model = row[0];
    row.slice(1).forEach((printed, i) => {
      const label = i === 0 ? "CTS-ACC" : `CTS-${CELLS[i - 1]}`;
      const cell = parseCell(printed);
      if (cell.value === null) return;
      cells.push({
        method: setting(section.toLowerCase(), model),
        task: label,
        printed: cell.printed,
        value: cell.value,
        sd: cell.sd,
        locator: `Table 4, row(${section} ${model}), column(${label})`,
      });
    });
  }

  // Table 5. Same shape as Table 4, two metrics across the same five cell types.
  const t5 = tableMatching(html, /Table 5: Chromatin activity prediction/);
  for (const cellLine of CELLS) {
    task({
      label: `CA-SPEARMAN-${cellLine}`,
      title: `Chromatin activity prediction, ${cellLine}, positives only`,
      metric: "Spearman r",
      metricKey: "spearman_r",
      direction: "higher",
      dataset: PEAKS,
      protocol: `Rank correlation with measured accessibility among positive ${cellLine} peaks.`,
      locator: `Table 5, column(Spearman r ${cellLine})`,
    });
    task({
      label: `CA-AUROC-${cellLine}`,
      title: `Chromatin activity prediction, ${cellLine}, positives against negatives`,
      metric: "AUROC",
      metricKey: "auroc",
      direction: "higher",
      dataset: PEAKS,
      protocol: `Separating positive ${cellLine} peaks from matched negatives.`,
      locator: `Table 5, column(AUROC ${cellLine})`,
    });
  }
  for (const { section, cells: row } of sectioned(t5.rows.slice(2), 11)) {
    const model = row[0];
    row.slice(1).forEach((printed, i) => {
      const label =
        i < 5 ? `CA-SPEARMAN-${CELLS[i]}` : `CA-AUROC-${CELLS[i - 5]}`;
      const cell = parseCell(printed);
      if (cell.value === null) return;
      cells.push({
        method: setting(section.toLowerCase(), model),
        task: label,
        printed: cell.printed,
        value: cell.value,
        sd: cell.sd,
        locator: `Table 5, row(${section} ${row[0]}), column(${label})`,
      });
    });
  }

  // Table 6. Rows group by variant dataset; columns carry setting and metric.
  const t6 = tableMatching(html, /Table 6: Variant scoring/);
  const t6cols: [string, string, string][] = [
    ["zero-shot likelihood", "auroc", "AUROC"],
    ["zero-shot embedding", "auroc", "AUROC"],
    ["probed", "pearson_r", "Pearson r"],
    ["probed", "auroc", "AUROC"],
    ["fine-tuned", "pearson_r", "Pearson r"],
    ["fine-tuned", "auroc", "AUROC"],
    ["ab initio", "pearson_r", "Pearson r"],
    ["ab initio", "auroc", "AUROC"],
  ];
  for (const [dataset, short] of [
    [AFRICAN, "AFRICAN"],
    [YORUBAN, "YORUBAN"],
  ] as const)
    for (const [key, metric] of [
      ["auroc", "AUROC"],
      ["pearson_r", "Pearson r"],
    ] as const)
      task({
        label: `VS-${short}-${key.toUpperCase()}`,
        title: `Variant scoring on ${dataset}, ${metric}`,
        metric,
        metricKey: key,
        direction: "higher",
        dataset,
        protocol:
          "Score the effect of a variant on chromatin accessibility, against the measured QTL call.",
        locator: `Table 6, row group(${short}), column(${metric})`,
      });
  for (const { section, cells: row } of sectioned(t6.rows.slice(2), 9)) {
    const model = row[0];
    if (!model) continue;
    const short = /african/i.test(section) ? "AFRICAN" : "YORUBAN";
    row.slice(1).forEach((printed, i) => {
      const [mode, key] = t6cols[i];
      const cell = parseCell(printed);
      if (cell.value === null) return;
      cells.push({
        method: setting(mode, model),
        task: `VS-${short}-${key.toUpperCase()}`,
        printed: cell.printed,
        value: cell.value,
        sd: cell.sd,
        locator: `Table 6, row(${section} ${row[0]}), column(${mode} ${key})`,
      });
    });
  }

  const spec: BatchSpec = {
    key: KEY,
    benchmarkId: BENCHMARK,
    benchmarkName: NAME,
    area: "dna-genomes",
    source: {
      id: "evidence-expansion-p2-evidence-discovery-final-dart-4194b137ba55",
      emit: false,
      name: "DART-Eval: A Comprehensive DNA Language Model Evaluation Benchmark on Regulatory DNA (arXiv:2412.05430v1)",
      url: "https://arxiv.org/abs/2412.05430",
      artifactUrl: "https://arxiv.org/html/2412.05430v1",
      sha256: SHA256,
      version: "v1",
      venue: "arXiv preprint",
      retrievedAt: DATE,
    },
    reviewer: REVIEWER,
    date: DATE,
    method:
      "Deterministic parse of the pinned HTML tables, with row and column counts asserted",
    caveats: [
      "Author-reported numbers, source checked but not independently reproduced.",
      "The evaluation setting is part of the method name: a zero-shot, probed and fine-tuned run of the same model are different entries.",
      "Metrics and datasets differ between tasks, so these figures cannot be averaged into one score.",
    ],
    tasks,
    methods: [...methods.values()],
    cells,
  };
  writeBatch(spec);
}

if (process.argv[1]?.endsWith("dart-eval.ts")) run(process.argv[2]);
