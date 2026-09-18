/**
 * Extract the PerturBench comparison tables into catalogue records.
 *
 * Source: Wu, Wershof, Schmon et al., "PerturBench: Benchmarking Machine
 * Learning Models for Cellular Perturbation Analysis", arXiv:2408.10609v1.
 * Table 2 is covariate transfer on Srivatsan20 and Table 3 is combination
 * prediction on Norman19.
 *
 * Both tables report four metrics, two of which are better when lower. RMSE is
 * an error. The rank metrics measure how often another perturbation's
 * prediction is closer to the observed profile than the right one's, so 0 is a
 * perfect ordering (Section 4.2.1). Recording those as higher-is-better would
 * invert the ranking the paper reports.
 *
 * An asterisk on a model name is the paper's mark for a model it reimplemented
 * or adapted rather than ran as published. It is kept in the name because the
 * number belongs to that adaptation.
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
  "5c4804565dd9faa17a11853a79e9847dcb6da73715b4c91f62e5b274cc79f186";
const DATE = "2026-09-18";
const NAME = "PerturBench";

/** The four columns, in the order Tables 2 and 3 print them. */
const METRICS = [
  {
    suffix: "COSINE",
    metric: "Cosine similarity of log fold change",
    key: "cosine_logfc",
    unit: "fraction",
    direction: "higher" as const,
    column: "Cosine, log fold change (LogFC)",
  },
  {
    suffix: "RMSE",
    metric: "RMSE of the mean",
    key: "rmse_mean",
    unit: "error",
    direction: "lower" as const,
    column: "RMSE, mean",
  },
  {
    suffix: "COSINE-RANK",
    metric: "Cosine LogFC rank",
    key: "cosine_logfc_rank",
    unit: "fraction",
    direction: "lower" as const,
    column: "Cosine, LogFC rank",
  },
  {
    suffix: "RMSE-RANK",
    metric: "RMSE mean rank",
    key: "rmse_mean_rank",
    unit: "fraction",
    direction: "lower" as const,
    column: "RMSE, mean rank",
  },
];

const EXPERIMENTS = [
  {
    prefix: "CT",
    table: /Table 2\s*:\s*Results of the first covariate transfer/,
    number: "Table 2",
    dataset: "Srivatsan20",
    title: "covariate transfer",
    protocol:
      "Train on some cell types and predict drug effects in a held-out cell type, reported as the mean and one standard deviation over seeds.",
  },
  {
    prefix: "CB",
    table: /Table 3\s*:\s*Results of the first combo prediction/,
    number: "Table 3",
    dataset: "Norman19",
    title: "combination prediction",
    protocol:
      "Predict the effect of a pair of gene overexpressions from single perturbations, reported as the mean and one standard deviation over seeds.",
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

  for (const experiment of EXPERIMENTS) {
    const table = tableMatching(html, experiment.table);
    for (const metric of METRICS)
      tasks.push({
        label: `${experiment.prefix}-${metric.suffix}`,
        title: `${experiment.title} on ${experiment.dataset}, ${metric.metric}`,
        metric: metric.metric,
        metricKey: metric.key,
        unit: metric.unit,
        direction: metric.direction,
        dataset: experiment.dataset,
        protocol: experiment.protocol,
        locator: `${experiment.number}, column(${metric.column})`,
      });
    const rows = table.rows.slice(2);
    if (rows.length < 9)
      throw new Error(`${experiment.number}: ${rows.length} rows`);
    for (const row of rows) {
      if (row.length !== METRICS.length + 1)
        throw new Error(`${experiment.number} row: ${row.join(" | ")}`);
      const name = row[0].replace(/∗/g, "*").replace(/\s+\*/g, "*");
      if (!methods.has(name))
        methods.set(name, {
          name,
          kind: "configuration",
          description: name.includes("*")
            ? "Published model reimplemented or adapted by the PerturBench authors, as their asterisk marks."
            : "Baseline implemented by the PerturBench authors.",
          locator: `${experiment.number}, row(${row[0]})`,
        });
      row.slice(1).forEach((printed, i) => {
        const cell = parseCell(printed);
        if (cell.value === null) return;
        cells.push({
          method: name,
          task: `${experiment.prefix}-${METRICS[i].suffix}`,
          printed: cell.printed,
          value: cell.value,
          sd: cell.sd,
          locator: `${experiment.number}, row(${row[0]}), column(${METRICS[i].column})`,
        });
      });
    }
  }

  const spec: BatchSpec = {
    key: "perturbench",
    benchmarkId: "discovery-benchmark-perturbench",
    benchmarkName: NAME,
    area: "cells-tissues",
    source: {
      id: "evidence-expansion-perturbench-5c480456",
      emit: false,
      name: "PerturBench (arXiv:2408.10609v1)",
      url: "https://arxiv.org/abs/2408.10609",
      artifactUrl: "https://arxiv.org/html/2408.10609v1",
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
      "RMSE and both rank metrics are better when lower. The rank metrics measure how often another perturbation's prediction is closer than the right one's.",
      "The two experiments use different datasets and splits, so their figures are not comparable to each other.",
    ],
    tasks,
    methods: [...methods.values()],
    cells,
  };
  writeBatch(spec);
}

if (process.argv[1]?.endsWith("perturbench.ts")) run(process.argv[2]);
