/**
 * Extract the GENEB probe comparison into catalogue records.
 *
 * Source: "GENEB: Why Genomic Models Are Hard to Compare", arXiv:2606.04525v1.
 * Table 8 reports the average macro-MCC of eleven representative models under a
 * linear probe and under an MLP probe, across the thirteen representative tasks.
 *
 * This is the only per-model score table in the paper. The rest of GENEB's
 * results are correlations, deltas between controlled pairs, and stability
 * summaries, which describe the benchmark rather than place a model on it, and
 * the full forty-model grid is reported in figures rather than in a table. Only
 * Table 8 is extracted; nothing is read off a figure.
 *
 * The Delta column is the difference between the two probes, which the two
 * recorded scores already carry, so it is not stored as a third result.
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
  "47975089c0ca738d5e2d6e6ea91cd4e7b80498c3f175803d8ec39ca77aa41629";
const DATE = "2026-09-18";

const PROBES = [
  {
    label: "LINEAR-PROBE",
    title: "Average macro-MCC across the 13 representative tasks, linear probe",
    column: "Linear MCC",
  },
  {
    label: "MLP-PROBE",
    title: "Average macro-MCC across the 13 representative tasks, MLP probe",
    column: "MLP MCC",
  },
];

function run(file: string) {
  const html = fs.readFileSync(file, "utf8");
  const sha = createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  if (sha !== SHA256)
    throw new Error(`Artifact hash ${sha} does not match the pinned ${SHA256}`);

  const table = tableMatching(html, /Table 8\s*:\s*Per-model average MCC/);
  const rows = table.rows.slice(1).filter((row) => row[0]?.trim());
  if (rows.length !== 11) throw new Error(`Table 8: ${rows.length} rows`);

  const tasks: TaskSpec[] = PROBES.map((probe) => ({
    label: probe.label,
    title: probe.title,
    metric: "Macro-MCC",
    metricKey: "macro_mcc",
    unit: "correlation",
    direction: "higher",
    dataset: "GENEB representative task subset",
    protocol:
      "Frozen embeddings scored with a probe over the thirteen representative tasks, one from each functional category (Table 7).",
    locator: `Table 8, column(${probe.column})`,
  }));
  const methods: MethodSpec[] = [];
  const cells: CellSpec[] = [];
  for (const row of rows) {
    if (row.length !== 4) throw new Error(`Table 8 row: ${row.join(" | ")}`);
    const name = row[0].trim();
    methods.push({
      name,
      kind: "configuration",
      description:
        "Genomic foundation model evaluated by the GENEB authors with frozen embeddings and a probe.",
      locator: `Table 8, row(${name})`,
    });
    PROBES.forEach((probe, i) => {
      const cell = parseCell(row[i + 1]);
      if (cell.value === null) return;
      cells.push({
        method: name,
        task: probe.label,
        printed: cell.printed,
        value: cell.value,
        sd: cell.sd,
        locator: `Table 8, row(${name}), column(${probe.column})`,
      });
    });
  }

  const spec: BatchSpec = {
    key: "geneb",
    benchmarkId: "discovery-benchmark-geneb",
    benchmarkName: "GENEB",
    area: "dna-genomes",
    source: {
      id: "evidence-expansion-p2-evidence-discovery-final-geneb-47975089c0ca",
      emit: false,
      name: "GENEB: Why Genomic Models Are Hard to Compare (arXiv:2606.04525v1)",
      url: "https://arxiv.org/abs/2606.04525",
      artifactUrl: "https://arxiv.org/html/2606.04525v1",
      sha256: SHA256,
      version: "v1",
      venue: "arXiv preprint",
      retrievedAt: DATE,
    },
    reviewer: "Codex research agent; no human review claimed",
    date: DATE,
    method:
      "Deterministic parse of the pinned HTML table, with row and column counts asserted",
    caveats: [
      "Author-reported numbers, source checked but not independently reproduced.",
      "These are averages over the thirteen representative tasks, not a score on any single task.",
      "The paper's own point is that these rankings shift with the probe and the protocol, so a position here is not a general ranking.",
    ],
    tasks,
    methods,
    cells,
  };
  writeBatch(spec);
}

if (process.argv[1]?.endsWith("geneb.ts")) run(process.argv[2]);
