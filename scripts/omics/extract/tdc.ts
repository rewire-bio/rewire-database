/**
 * Extract the Therapeutics Data Commons ADMET baselines into catalogue records.
 *
 * Source: Huang, Fu, Gao et al., "Therapeutics Data Commons: Machine Learning
 * Datasets and Tasks for Drug Discovery and Development", arXiv:2102.09548v1.
 * Table 4 holds the baselines on the twenty-two ADMET benchmark datasets, and
 * Table 3 gives each dataset its metric and split.
 *
 * The metric differs per dataset and cannot be inferred from the value: 0.678
 * is a good AUROC and a poor MAE. Each dataset therefore carries the metric
 * Table 3 states, and the direction is cross-checked against the arrow Table 4
 * prints beside the dataset name. If the two ever disagree the extraction
 * stops.
 *
 * TDC.VDss and TDC.Half Life are written TDC.VD and TDC.Half_Life in Table 4.
 * They are the same datasets, and the mapping is spelled out below.
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
  "aaa5526f6f100093bc06c9921a8564ad08cfd5332270d614d7681051c2dd66bc";
const DATE = "2026-09-18";

/** Table 4 column name, Table 3 dataset, category, metric, direction. */
const DATASETS: [string, string, string, string, "higher" | "lower"][] = [
  ["TDC.Caco2", "TDC.Caco2", "Absorption", "MAE", "lower"],
  ["TDC.HIA", "TDC.HIA", "Absorption", "AUROC", "higher"],
  ["TDC.Pgp", "TDC.Pgp", "Absorption", "AUROC", "higher"],
  ["TDC.Bioav", "TDC.Bioav", "Absorption", "AUROC", "higher"],
  ["TDC.Lipo", "TDC.Lipo", "Absorption", "MAE", "lower"],
  ["TDC.AqSol", "TDC.AqSol", "Absorption", "MAE", "lower"],
  ["TDC.BBB", "TDC.BBB", "Distribution", "AUROC", "higher"],
  ["TDC.PPBR", "TDC.PPBR", "Distribution", "MAE", "lower"],
  ["TDC.VD", "TDC.VDss", "Distribution", "Spearman", "higher"],
  ["TDC.CYP2C9 Inhibition", "TDC.CYP2C9 Inhibition", "Metabolism", "AUPRC", "higher"],
  ["TDC.CYP2D6 Inhibition", "TDC.CYP2D6 Inhibition", "Metabolism", "AUPRC", "higher"],
  ["TDC.CYP3A4 Inhibition", "TDC.CYP3A4 Inhibition", "Metabolism", "AUPRC", "higher"],
  ["TDC.CYP2C9 Substrate", "TDC.CYP2C9 Substrate", "Metabolism", "AUPRC", "higher"],
  ["TDC.CYP2D6 Substrate", "TDC.CYP2D6 Substrate", "Metabolism", "AUPRC", "higher"],
  ["TDC.CYP3A4 Substrate", "TDC.CYP3A4 Substrate", "Metabolism", "AUROC", "higher"],
  ["TDC.Half_Life", "TDC.Half Life", "Excretion", "Spearman", "higher"],
  ["TDC.CL-Hepa", "TDC.CL-Hepa", "Excretion", "Spearman", "higher"],
  ["TDC.CL-Micro", "TDC.CL-Micro", "Excretion", "Spearman", "higher"],
  ["TDC.LD50", "TDC.LD50", "Toxicity", "MAE", "lower"],
  ["TDC.hERG", "TDC.hERG", "Toxicity", "AUROC", "higher"],
  ["TDC.AMES", "TDC.AMES", "Toxicity", "AUROC", "higher"],
  ["TDC.DILI", "TDC.DILI", "Toxicity", "AUROC", "higher"],
];

/** Each block of Table 4: its datasets in printed order, and its model rows. */
const BLOCKS: [string, string[], string[]][] = [
  [
    "Absorption",
    ["TDC.Caco2", "TDC.HIA", "TDC.Pgp", "TDC.Bioav", "TDC.Lipo", "TDC.AqSol"],
    ["RDKit2D + MLP", "CNN", "Morgan + MLP"],
  ],
  [
    "Distribution",
    ["TDC.BBB", "TDC.PPBR", "TDC.VD"],
    ["RDKit2D + MLP", "Morgan + MLP", "CNN"],
  ],
  [
    "Metabolism",
    [
      "TDC.CYP2C9 Inhibition",
      "TDC.CYP2D6 Inhibition",
      "TDC.CYP3A4 Inhibition",
      "TDC.CYP2C9 Substrate",
      "TDC.CYP2D6 Substrate",
      "TDC.CYP3A4 Substrate",
    ],
    ["RDKit2D + MLP", "Morgan + MLP", "CNN"],
  ],
  [
    "Excretion",
    ["TDC.Half_Life", "TDC.CL-Hepa", "TDC.CL-Micro"],
    ["RDKit2D + MLP", "Morgan + MLP", "CNN"],
  ],
  [
    "Toxicity",
    ["TDC.LD50", "TDC.hERG", "TDC.AMES", "TDC.DILI"],
    ["RDKit2D + MLP", "Morgan + MLP", "CNN"],
  ],
];

function run(file: string) {
  const text = fs.readFileSync(file, "utf8");
  const sha = createHash("sha256")
    .update(fs.readFileSync(process.argv[3]))
    .digest("hex");
  if (sha !== SHA256)
    throw new Error(`Artifact hash ${sha} does not match the pinned ${SHA256}`);

  const byColumn = new Map(DATASETS.map((row) => [row[0], row]));
  const tasks: TaskSpec[] = DATASETS.map(
    ([column, dataset, category, metric, direction]) => ({
      label: column.toUpperCase().replace(/[^A-Z0-9]+/g, "-"),
      title: `${category}: ${dataset}`,
      metric,
      metricKey: metric.toLowerCase(),
      unit: metric === "MAE" ? "error" : metric === "Spearman" ? "correlation" : "fraction",
      direction,
      dataset,
      protocol:
        "Scaffold split, as the ADMET benchmark group defines it. Values are the mean and standard deviation over repeated runs.",
      locator: `Table 3, row(${dataset})`,
    }),
  );
  const methods = new Map<string, MethodSpec>();
  const cells: CellSpec[] = [];

  const lines = text.split("\n").map((line) => line.trim());
  const from = lines.findIndex((line) =>
    /^Table 4: Baselines Performance on the ADMET/.test(line),
  );
  if (from < 0) throw new Error("Table 4 not found");
  const body = lines.slice(from, from + 60);

  for (const [category, columns, models] of BLOCKS) {
    const head = body.findIndex((line) => line === category);
    if (head < 0) throw new Error(`Table 4: block ${category} not found`);
    // The arrows in the block heading must agree with Table 3, in order. The
    // Metabolism heading wraps its dataset names over two lines, so the arrows
    // are read as a sequence rather than beside each name.
    const heading = body.slice(head, head + 5).join(" ");
    const arrows = [...heading.matchAll(/[\u2191\u2193]/g)].map((match) =>
      match[0] === "\u2191" ? "higher" : "lower",
    );
    const expected = columns.map((column) => byColumn.get(column)![4]);
    if (arrows.length < expected.length)
      throw new Error(
        `Table 4: ${category} prints ${arrows.length} arrows for ${expected.length} columns`,
      );
    expected.forEach((direction, i) => {
      if (arrows[i] !== direction)
        throw new Error(
          `Table 4: ${columns[i]} prints ${arrows[i]}, Table 3 says ${direction}`,
        );
    });
    for (const model of models) {
      const line = body
        .slice(head, head + 12)
        .find((candidate) => candidate.startsWith(model + " "));
      if (!line) throw new Error(`Table 4: ${category} row ${model} not found`);
      // Every cell is "value plus or minus spread", and the columns are
      // separated by anything from one space to several. Reading the pairs as a
      // sequence avoids guessing where one column ends and the next begins.
      const scores = [
        ...line.matchAll(/(-?\d+(?:\.\d+)?)\s*\u00b1\s*(\d+(?:\.\d+)?)/g),
      ].map((match) => `${match[1]} \u00b1 ${match[2]}`);
      if (scores.length !== columns.length)
        throw new Error(
          `Table 4: ${category} ${model} has ${scores.length} cells, expected ${columns.length}`,
        );
      if (!methods.has(model))
        methods.set(model, {
          name: model,
          kind: "method",
          description:
            "Baseline implemented by the Therapeutics Data Commons authors over the stated molecular featurisation.",
          locator: `Table 4, row(${model})`,
        });
      scores.forEach((printed, i) => {
        const cell = parseCell(printed);
        if (cell.value === null) return;
        cells.push({
          method: model,
          task: columns[i].toUpperCase().replace(/[^A-Z0-9]+/g, "-"),
          printed: cell.printed,
          value: cell.value,
          sd: cell.sd,
          locator: `Table 4, block(${category}), row(${model}), column(${columns[i]})`,
        });
      });
    }
  }

  const spec: BatchSpec = {
    key: "tdc",
    benchmarkId: "discovery-benchmark-tdc-molecular-tasks",
    benchmarkName: "TDC ADMET benchmark group",
    area: "molecular-interactions",
    source: {
      id: "evidence-expansion-tdc-cached-v1-aaa5526f",
      emit: false,
      name: "Therapeutics Data Commons: Machine Learning Datasets and Tasks for Drug Discovery and Development (arXiv:2102.09548v1)",
      url: "https://arxiv.org/abs/2102.09548",
      artifactUrl: "https://arxiv.org/pdf/2102.09548v1",
      sha256: SHA256,
      version: "v1",
      venue: "arXiv preprint",
      retrievedAt: DATE,
    },
    reviewer: "Codex research agent; no human review claimed",
    date: DATE,
    method:
      "Deterministic parse of the pinned PDF text layer, with each dataset's direction cross-checked between Table 3 and the arrow in Table 4",
    caveats: [
      "Author-reported numbers, source checked but not independently reproduced.",
      "MAE datasets are better when lower. The metric comes from Table 3 and differs by dataset.",
      "These are the paper's own simple baselines, not the current leaderboard for the ADMET group.",
    ],
    tasks,
    methods: [...methods.values()],
    cells,
  };
  writeBatch(spec);
}

if (process.argv[1]?.endsWith("tdc.ts")) run(process.argv[2]);
