/**
 * Extract the mRNABench linear probe results into catalogue records.
 *
 * Source: Shi, Dalal, Fradkin et al., "mRNABench: A curated benchmark for
 * mature mRNA property and function prediction", bioRxiv 2025.07.05.662870.
 * Table 2 reports every model family on the ten benchmark tasks, with each
 * task's metric printed in the header.
 *
 * The metric alternates between AUPRC on a percentage scale and Pearson R on a
 * correlation scale, so it is read from the header row rather than assumed, and
 * the unit follows it. Reading an R of 0.64 as a percentage would put it at the
 * bottom of a table of AUPRC scores.
 *
 * Table 2 reports the best model of each family. The appendix tables report
 * every checkpoint with confidence intervals, and they carry the same caption
 * as each other, so they are left for a later pass rather than matched by a
 * caption that cannot tell them apart.
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
  "79f6264ee883535203c63a313547e7c57baa85585f76b42f8d899eb17fb7e600";
const DATE = "2026-09-18";

const TITLES: Record<string, string> = {
  VEP: "Variant effect prediction",
  "MRL MPRA": "Mean ribosome load on an MPRA library",
  eCLIP: "eCLIP binding site prediction",
  "mRNA Loc-LR": "mRNA localisation, long range",
  "mRNA Loc-SR": "mRNA localisation, short range",
  HL: "mRNA half life",
  MRL: "Mean ribosome load",
  "MRL-HL-Pair": "Paired mean ribosome load and half life",
  "Prot Loc": "Protein localisation",
  GO: "Gene Ontology term prediction",
};

function run(file: string) {
  const xml = fs.readFileSync(file, "utf8");
  const sha = createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  if (sha !== SHA256)
    throw new Error(`Artifact hash ${sha} does not match the pinned ${SHA256}`);

  const table = tableMatching(xml, /Table 2: Linear probe results/);
  const names = table.rows[1].map((cell) => cell.trim());
  const metrics = table.rows[2].slice(1).map((cell) => cell.trim());
  if (names.length !== metrics.length)
    throw new Error(
      `Table 2: ${names.length} task names for ${metrics.length} metrics`,
    );
  for (const name of names)
    if (!TITLES[name]) throw new Error(`Table 2: unknown task column "${name}"`);
  if (table.rows[2][0] !== "Metric")
    throw new Error("Table 2: metric row not where expected");

  const tasks: TaskSpec[] = names.map((name, i) => {
    const percent = /%/.test(metrics[i]);
    return {
      label: slug(name).toUpperCase(),
      title: TITLES[name],
      metric: metrics[i],
      metricKey: percent ? "auprc" : "pearson_r",
      unit: percent ? "percent" : "correlation",
      direction: "higher",
      dataset: `mRNABench ${name}`,
      protocol:
        "A linear probe over frozen embeddings, scored as the mean over ten random seeds.",
      locator: `Table 2, column(${name})`,
    };
  });
  const methods = new Map<string, MethodSpec>();
  const cells: CellSpec[] = [];

  let models = 0;
  for (const row of table.rows.slice(3)) {
    if (row.length !== names.length + 1) continue;
    const name = row[0].trim();
    if (!name) continue;
    models += 1;
    if (!methods.has(name))
      methods.set(name, {
        name,
        kind: /^(Naive|Supervised)/.test(name) ? "method" : "configuration",
        description: /^(Naive|Supervised)/.test(name)
          ? "Baseline trained from scratch by the mRNABench authors."
          : "Best checkpoint of this model family, as selected by the mRNABench authors and listed in their Appendix D.",
        locator: `Table 2, row(${name})`,
      });
    row.slice(1).forEach((printed, i) => {
      const cell = parseCell(printed);
      if (cell.value === null) return;
      cells.push({
        method: name,
        task: slug(names[i]).toUpperCase(),
        printed: cell.printed,
        value: cell.value,
        sd: cell.sd,
        locator: `Table 2, row(${name}), column(${names[i]})`,
      });
    });
  }
  if (models < 15) throw new Error(`Table 2: ${models} model rows`);

  const spec: BatchSpec = {
    key: "mrnabench",
    benchmarkId: "discovery-benchmark-mrnabench",
    benchmarkName: "mRNABench",
    area: "rna-transcriptomes",
    source: {
      id: "expansion-p3-mrnabench-2025",
      emit: false,
      name: "mRNABench: A curated benchmark for mature mRNA property and function prediction (bioRxiv 2025.07.05.662870)",
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12265608/",
      artifactUrl: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12265608/",
      sha256: SHA256,
      version: "PMC12265608 full text",
      venue: "bioRxiv preprint",
      retrievedAt: DATE,
    },
    reviewer: "Codex research agent; no human review claimed",
    date: DATE,
    method:
      "Deterministic parse of the pinned full text table, with the metric taken from the table's own header row",
    caveats: [
      "Author-reported numbers, source checked but not independently reproduced.",
      "Metrics alternate between AUPRC on a percentage scale and Pearson R, so figures in different columns are on different scales.",
      "Each row is the best checkpoint of a model family, chosen by the authors, not the family's average.",
    ],
    tasks,
    methods: [...methods.values()],
    cells,
  };
  writeBatch(spec);
}

if (process.argv[1]?.endsWith("mrnabench.ts")) run(process.argv[2]);
