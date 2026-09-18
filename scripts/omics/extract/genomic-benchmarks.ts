/**
 * Extract the Genomic Benchmarks baseline table into catalogue records.
 *
 * Source: Grešová, Martinek, Čechý et al., "Genomic benchmarks: a collection of
 * datasets for genomic sequence classification", BMC Genomic Data 2023.
 * Table 2 reports the baseline convolutional network on each dataset, in two
 * implementations of the same architecture.
 *
 * The two columns are PyTorch and TensorFlow builds of the one network the
 * paper specifies, so they are recorded as two configurations of that network
 * rather than as two different models. The gap between them on a dataset is a
 * property of the implementations, which is part of what the table shows.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import { parseCell, tableMatching } from "./tables";
import {
  slug,
  writeBatch,
  type BatchSpec,
  type CellSpec,
  type MethodSpec,
  type TaskSpec,
} from "./batch";

const SHA256 =
  "bda6fe51e3363a5d2fc8d265ca536897d3e83eb76458fc95066c21933e3bd0c0";
const DATE = "2026-09-18";

const COLUMNS: [string, string, string][] = [
  ["Baseline CNN (PyTorch)", "Accuracy", "accuracy"],
  ["Baseline CNN (PyTorch)", "F1 score", "f1"],
  ["Baseline CNN (TensorFlow)", "Accuracy", "accuracy"],
  ["Baseline CNN (TensorFlow)", "F1 score", "f1"],
];

function run(file: string) {
  const xml = fs.readFileSync(file, "utf8");
  const sha = createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  if (sha !== SHA256)
    throw new Error(`Artifact hash ${sha} does not match the pinned ${SHA256}`);

  const table = tableMatching(xml, /Performance of baseline models on benchmark datasets/);
  const rows = table.rows.slice(2).filter((row) => row[0]?.trim());
  if (rows.length !== 9) throw new Error(`Table 2: ${rows.length} rows`);

  const tasks: TaskSpec[] = [];
  const methods = new Map<string, MethodSpec>();
  const cells: CellSpec[] = [];

  for (const row of rows) {
    if (row.length !== COLUMNS.length + 1)
      throw new Error(`Table 2 row: ${row.join(" | ")}`);
    const dataset = row[0].trim();
    for (const [, metric, metricKey] of COLUMNS.slice(0, 2))
      tasks.push({
        label: `${slug(dataset)}-${metricKey}`.toUpperCase(),
        title: `${dataset}, ${metric}`,
        metric,
        metricKey,
        unit: "percent",
        direction: "higher",
        dataset,
        protocol:
          "The paper's own three-layer convolutional baseline, trained on each dataset's training split and scored on its test split. Architecture is in Table 1.",
        locator: `Table 2, row(${dataset})`,
      });
    row.slice(1).forEach((printed, i) => {
      const [name, metric, metricKey] = COLUMNS[i];
      if (!methods.has(name))
        methods.set(name, {
          name,
          kind: "configuration",
          description: `The paper's baseline convolutional network, built with ${name.includes("PyTorch") ? "PyTorch" : "TensorFlow"}.`,
          locator: `Table 2, column(${name})`,
        });
      const cell = parseCell(printed);
      if (cell.value === null) return;
      cells.push({
        method: name,
        task: `${slug(dataset)}-${metricKey}`.toUpperCase(),
        printed: cell.printed,
        value: cell.value,
        sd: cell.sd,
        locator: `Table 2, row(${dataset}), column(${name} ${metric})`,
      });
    });
  }

  const spec: BatchSpec = {
    key: "genomic-benchmarks",
    benchmarkId: "discovery-benchmark-genomic-benchmarks",
    benchmarkName: "Genomic Benchmarks",
    area: "dna-genomes",
    source: {
      id: "expansion-p3-genomic-benchmarks",
      emit: false,
      name: "Genomic benchmarks: a collection of datasets for genomic sequence classification (BMC Genomic Data 2023)",
      url: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10150520/",
      artifactUrl:
        "https://www.ebi.ac.uk/europepmc/webservices/rest/PMC10150520/fullTextXML",
      sha256: SHA256,
      version: "PMC10150520 full text",
      venue: "BMC Genomic Data",
      retrievedAt: DATE,
    },
    reviewer: "Codex research agent; no human review claimed",
    date: DATE,
    method:
      "Deterministic parse of the pinned JATS XML table, with row and column counts asserted",
    caveats: [
      "Author-reported numbers, source checked but not independently reproduced.",
      "Both columns are the same baseline architecture in two frameworks, not two competing models.",
      "These are the paper's reference baselines, not a leaderboard of the best available models.",
    ],
    tasks,
    methods: [...methods.values()],
    cells,
  };
  writeBatch(spec);
}

if (process.argv[1]?.endsWith("genomic-benchmarks.ts")) run(process.argv[2]);
