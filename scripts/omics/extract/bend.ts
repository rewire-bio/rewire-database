/**
 * Extract the BEND results table into catalogue records.
 *
 * Source: Marin, Teufel, Horlacher et al., "BEND: Benchmarking DNA Language
 * Models on Biologically Meaningful Tasks", ICLR 2024. Table 3 reports every
 * model on all seven tasks; Table 1 supplies each task's metric.
 *
 * The table has three row groups. "Expert method" is not one method but seven:
 * the specialist model the authors compare against differs per task, and its
 * name is printed under its score. Each is recorded under its own name, so the
 * expert figure for gene finding belongs to AUGUSTUS rather than to a fictional
 * method called "Expert".
 *
 * A dash means the model was not run on that task. No result is written for it.
 */
import { readPinnedPdfText } from "./pdf";
import { joinSmallCaps, layoutRows, parseCell } from "./tables";
import {
  writeBatch,
  type BatchSpec,
  type CellSpec,
  type MethodSpec,
  type TaskSpec,
} from "./batch";

const SHA256 =
  "f709b6bef3120eb979c0a0e02d2582475c49410f29850ed7601ba7a700ca379d";
const DATE = "2026-09-18";

/** Task order across Table 3, with the metric Table 1 gives each. */
const TASKS: TaskSpec[] = [
  ["GENE-FINDING", "Gene finding", "MCC", "mcc", "correlation", "GENCODE"],
  ["ENHANCER", "Enhancer annotation", "AUPRC", "auprc", "fraction", "Fulco 2019, Gasperini 2019 and Enformer enhancer set"],
  ["CHROMATIN", "Chromatin accessibility", "AUROC", "auroc", "fraction", "ENCODE chromatin accessibility"],
  ["HISTONE", "Histone modification", "AUROC", "auroc", "fraction", "ENCODE histone modification"],
  ["CPG", "CpG methylation", "AUROC", "auroc", "fraction", "ENCODE CpG methylation"],
  ["VARIANT-EXPRESSION", "Noncoding variant effects on expression", "AUROC", "auroc", "fraction", "DeepSEA expression variants"],
  ["VARIANT-DISEASE", "Noncoding variant effects on disease", "AUROC", "auroc", "fraction", "ClinVar disease variants"],
].map(([label, title, metric, metricKey, unit, dataset]) => ({
  label,
  title,
  metric,
  metricKey,
  unit,
  direction: "higher" as const,
  dataset,
  protocol:
    "A downstream head trained on frozen embeddings, except for the expert methods and the fully supervised baselines, which are trained end to end. Metric and splits are from Table 1.",
  locator: `Table 1, row(${title})`,
}));

function run(file: string) {
  const { text, transformation } = readPinnedPdfText(file, SHA256, process.argv[3]);

  const rows = layoutRows(text, /^\s*Table 3: Results on all tasks/, /^5\s+R ESULTS/);
  const methods = new Map<string, MethodSpec>();
  const cells: CellSpec[] = [];
  const add = (name: string, kind: MethodSpec["kind"], note: string, values: string[], locatorRow: string) => {
    if (!methods.has(name))
      methods.set(name, {
        name,
        kind,
        description: note,
        locator: `Table 3, row(${locatorRow})`,
      });
    values.forEach((printed, i) => {
      const cell = parseCell(printed);
      if (cell.value === null) return;
      cells.push({
        method: name,
        task: TASKS[i].label,
        printed: cell.printed,
        value: cell.value,
        sd: cell.sd,
        locator: `Table 3, row(${locatorRow}), column(${TASKS[i].title})`,
      });
    });
  };

  // The expert row prints its seven scores one line above its seven names.
  const scoreLine = rows.findIndex(
    (row) => row.length === TASKS.length && row.every((cell) => /^\d/.test(cell)),
  );
  const nameLine = rows.findIndex((row, i) => i > scoreLine && row.length === TASKS.length);
  if (scoreLine < 0 || nameLine < 0)
    throw new Error("Table 3: expert method rows not found");
  const experts = rows[nameLine].map(joinSmallCaps);
  experts.forEach((expert, i) => {
    const cell = parseCell(rows[scoreLine][i]);
    if (cell.value === null) return;
    if (!methods.has(expert))
      methods.set(expert, {
        name: expert,
        kind: "configuration",
        description:
          "Specialist published model that the BEND authors compare against on this task, not a language model embedding.",
        locator: `Table 3, row(Expert method), column(${TASKS[i].title})`,
      });
    cells.push({
      method: expert,
      task: TASKS[i].label,
      printed: cell.printed,
      value: cell.value,
      sd: cell.sd,
      locator: `Table 3, row(Expert method), column(${TASKS[i].title})`,
    });
  });

  let group = "";
  let models = 0;
  for (const row of rows.slice(nameLine + 1)) {
    if (row.length === 1) {
      group = row[0];
      continue;
    }
    // A group label can share a line with the first model of its group.
    const offset = row.length === TASKS.length + 2 ? 1 : 0;
    if (offset) group = row[0];
    if (row.length - offset !== TASKS.length + 1) continue;
    const name = row[offset];
    models += 1;
    add(
      name,
      /supervised/i.test(group) ? "method" : "configuration",
      /supervised/i.test(group)
        ? "Baseline trained end to end from one-hot sequence by the BEND authors."
        : "DNA language model whose frozen embeddings the BEND authors scored with a downstream head.",
      row.slice(offset + 1),
      name,
    );
  }
  if (models !== 15) throw new Error(`Table 3: ${models} model rows`);

  const spec: BatchSpec = {
    transformation,
    key: "bend",
    benchmarkId: "discovery-benchmark-bend",
    benchmarkName: "BEND",
    area: "dna-genomes",
    source: {
      id: "evidence-expansion-bend-final-f709b6be",
      emit: false,
      name: "BEND: Benchmarking DNA Language Models on Biologically Meaningful Tasks (ICLR 2024)",
      url: "https://proceedings.iclr.cc/paper_files/paper/2024/file/429e7b31625a8b7839f9e4d6e2aa9bb9-Paper-Conference.pdf",
      artifactUrl:
        "https://proceedings.iclr.cc/paper_files/paper/2024/file/429e7b31625a8b7839f9e4d6e2aa9bb9-Paper-Conference.pdf",
      sha256: SHA256,
      version: "ICLR 2024 camera ready",
      venue: "ICLR 2024",
      retrievedAt: DATE,
    },
    reviewer: "Codex research agent; no human review claimed",
    date: DATE,
    method:
      "Deterministic parse of the pinned PDF text layer, with row and column counts asserted",
    caveats: [
      "Author-reported numbers, source checked but not independently reproduced.",
      "The expert entries are specialist published models, each compared on one task only.",
      "The metric differs by task, taken from Table 1, so these figures cannot be averaged into one score.",
    ],
    tasks: TASKS,
    methods: [...methods.values()],
    cells,
  };
  writeBatch(spec);
}

if (process.argv[1]?.endsWith("bend.ts")) run(process.argv[2]);
