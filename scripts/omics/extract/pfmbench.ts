/**
 * Extract the PFMBench comparison tables into catalogue records.
 *
 * Source: Wu, Tan, Zhang et al., "PFMBench: Protein Foundation Model
 * Benchmark", arXiv:2506.14796v1. Table 3 holds the core models on eleven
 * representative tasks; Table 4 holds the zero-shot ProteinGym scores.
 *
 * Table 3 abbreviates its column headers. Each is expanded here to the task
 * Table 1 names, which is also where the metric comes from: the metric differs
 * by task, and reading one column with another column's metric would be wrong
 * in a way no count would catch.
 *
 * Table 3's "#Win" column and Table 4's "Rank" column are summaries the authors
 * computed over the other columns, not measurements, so neither is recorded as
 * a result. Table 7 reports adapter tuning over the same core models and tasks
 * as Table 3 and is left out rather than filed as a second, conflicting score
 * for the same evaluation.
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
  "59c7bbb888e8e91f33c1e2cabfde062c32381d6ca727d23b6655c977aabf97a2";
const DATE = "2026-09-18";
const NAME = "PFMBench";

/** Table 3 column header, the Table 1 task it abbreviates, and that task's metric. */
const COLUMNS = [
  ["PDBBind", "PDBbind", "Spearman", "spearman", "PDB-BIND"],
  ["Bind. DB", "BindingDB", "Spearman", "spearman", "BINDING-DB"],
  ["Stability", "TAPE_Stability", "Spearman", "spearman", "STABILITY"],
  ["Anti.Res.", "Antibiotic resistance", "Accuracy", "accuracy", "ANTI-RES"],
  ["Mat.Pro.", "Material production", "Accuracy", "accuracy", "MAT-PROD"],
  ["EC", "Enzyme Commission", "F1 score", "f1", "EC"],
  ["M. I. Bin.", "Metal ion binding", "Accuracy", "accuracy", "METAL-ION"],
  ["Sec. Str.", "Secondary structure", "Accuracy", "accuracy", "SEC-STRUCT"],
  ["DL2 M.", "DeepLoc2 Multi", "F1 score", "f1", "DEEPLOC2"],
  ["Clo. CLF", "Cloning CLF", "AUROC", "auroc", "CLONING-CLF"],
  ["DeepSol", "DeepSol", "AUROC", "auroc", "DEEPSOL"],
] as const;

function run(file: string) {
  const html = fs.readFileSync(file, "utf8");
  const sha = createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  if (sha !== SHA256)
    throw new Error(`Artifact hash ${sha} does not match the pinned ${SHA256}`);

  const tasks: TaskSpec[] = [];
  const methods = new Map<string, MethodSpec>();
  const cells: CellSpec[] = [];
  /** Reference markers such as "ESM-2 [ 35 ]" are citations, not model names. */
  const modelName = (printed: string) =>
    printed.replace(/\s*\[\s*\d+\s*\]\s*$/, "").trim();
  const addMethod = (name: string, family: string, locator: string) => {
    if (!methods.has(name))
      methods.set(name, {
        name,
        kind: "configuration",
        description: `Protein foundation model evaluated by the PFMBench authors under their fine-tuning protocol. Input family: ${family}.`,
        locator,
      });
  };

  for (const [, task, metric, metricKey, label] of COLUMNS)
    tasks.push({
      label,
      title: task,
      metric,
      metricKey,
      unit: metricKey === "spearman" ? "correlation" : "fraction",
      direction: "higher",
      dataset: task,
      protocol:
        "Fine-tuned with an adapter under the PFMBench harness; train, validation and test counts are in Table 1.",
      locator: `Table 1, row(${task})`,
    });

  const core = tableMatching(html, /Table 3: Core model results/);
  const width = COLUMNS.length + 2;
  let family = "";
  const families = new Set<string>();
  let rows = 0;
  for (const row of core.rows.slice(1)) {
    if (row.length !== width)
      throw new Error(`Table 3 row: ${row.join(" | ")}`);
    const values = row.slice(1, COLUMNS.length + 1);
    // A category header fills only its first cell.
    if (values.every((value) => !value.trim())) {
      family = row[0];
      families.add(family);
      continue;
    }
    const name = modelName(row[0]);
    addMethod(name, family, `Table 3, row(${row[0]})`);
    rows += 1;
    values.forEach((printed, i) => {
      const cell = parseCell(printed);
      if (cell.value === null) return;
      cells.push({
        method: name,
        task: COLUMNS[i][4],
        printed: cell.printed,
        value: cell.value,
        sd: cell.sd,
        locator: `Table 3, row(${row[0]}), column(${COLUMNS[i][0]})`,
      });
    });
  }
  // Twelve models in four input families, as printed. The counts are asserted
  // so a changed table fails here rather than publishing a partial read.
  if (rows !== 12 || families.size !== 4)
    throw new Error(`Table 3: ${rows} model rows in ${families.size} families`);

  const zeroShot = tableMatching(html, /Table 4: Zero-shot proteingym/);
  tasks.push({
    label: "PROTEINGYM-ZS",
    title: "ProteinGym zero-shot variant effect prediction",
    metric: "Spearman",
    metricKey: "spearman",
    unit: "correlation",
    direction: "higher",
    dataset: "ProteinGym",
    protocol:
      "Scored zero-shot, with no fine-tuning, as reported in PFMBench Table 4.",
    locator: "Table 1, row(ProteinGym)",
  });
  const zsRows = zeroShot.rows.slice(1);
  if (zsRows.length !== 9) throw new Error(`Table 4: ${zsRows.length} rows`);
  for (const row of zsRows) {
    if (row.length !== 7) throw new Error(`Table 4 row: ${row.join(" | ")}`);
    const name = modelName(row[0]);
    addMethod(name, row[3], `Table 4, row(${row[0]})`);
    const cell = parseCell(row[5]);
    if (cell.value === null) continue;
    cells.push({
      method: name,
      task: "PROTEINGYM-ZS",
      printed: cell.printed,
      value: cell.value,
      sd: cell.sd,
      locator: `Table 4, row(${row[0]}), column(ProteinGym)`,
    });
  }

  const spec: BatchSpec = {
    key: "pfmbench",
    benchmarkId: "discovery-benchmark-pfmbench",
    benchmarkName: NAME,
    area: "proteins-complexes",
    source: {
      id: "expansion-p3-pfmbench",
      emit: false,
      name: "PFMBench: Protein Foundation Model Benchmark (arXiv:2506.14796v1)",
      url: "https://arxiv.org/abs/2506.14796",
      artifactUrl: "https://arxiv.org/html/2506.14796v1",
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
      "The metric differs by task, taken from Table 1, so these figures cannot be averaged into one score.",
      "Table 3 scores come from adapter fine-tuning; the ProteinGym figure is zero-shot and is not comparable to them.",
    ],
    tasks,
    methods: [...methods.values()],
    cells,
  };
  writeBatch(spec);
}

if (process.argv[1]?.endsWith("pfmbench.ts")) run(process.argv[2]);
