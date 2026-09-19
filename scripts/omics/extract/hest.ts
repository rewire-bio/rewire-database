/**
 * Extract the HEST-Benchmark results into catalogue records.
 *
 * Source: Jaume, Doucet, Song et al., "HEST-1k: A Dataset for Spatial
 * Transcriptomics and Histology Image Analysis", arXiv:2406.16192v1. Table 1
 * reports ten patch encoders across ten cancer cohorts, scored with Pearson
 * correlation under a Random Forest regression head.
 *
 * The PDF prints each cohort over three lines: the ten values, then the cohort
 * name, then the ten standard deviations. They are stitched back together here
 * by position, and the count of both lines is asserted, so a misread drops the
 * whole cohort instead of pairing a value with the wrong spread.
 *
 * The Average row is the authors' mean over the ten cohorts, not a measurement
 * on a dataset, so it is not recorded as a result.
 */
import { readPinnedPdfText } from "./pdf";
import { parseCell } from "./tables";
import {
  writeBatch,
  type BatchSpec,
  type CellSpec,
  type MethodSpec,
  type TaskSpec,
} from "./batch";

const SHA256 =
  "636099a73dee8337f60e6e9120230b914605b35553872ddf76e4661bbe14be9b";
const DATE = "2026-09-18";

const ENCODERS = [
  "ResNet50",
  "KimiaNet",
  "Ciga",
  "CTransPath",
  "Remedis",
  "Phikon",
  "PLIP",
  "UNI",
  "CONCH",
  "GigaPath",
];

const COHORTS: Record<string, string> = {
  IDC: "Invasive ductal carcinoma",
  PRAD: "Prostate adenocarcinoma",
  PAAD: "Pancreatic adenocarcinoma",
  SKCM: "Skin cutaneous melanoma",
  COAD: "Colon adenocarcinoma",
  READ: "Rectum adenocarcinoma",
  CCRCC: "Clear cell renal cell carcinoma",
  HCC: "Hepatocellular carcinoma",
  LUNG: "Lung",
  LYMPH_IDC: "Lymph node metastasis of invasive ductal carcinoma",
};

function run(file: string) {
  const { text, transformation } = readPinnedPdfText(file, SHA256, process.argv[3]);

  const lines = text.split("\n").map((line) => line.trim());
  const from = lines.findIndex((line) =>
    /^Table 1: HEST-Benchmark results/.test(line),
  );
  if (from < 0) throw new Error("Table 1 not found");
  const header = lines.slice(from, from + 8).find((line) =>
    ENCODERS.every((encoder) => line.includes(encoder)),
  );
  if (!header) throw new Error("Table 1: encoder heading not found");

  const tasks: TaskSpec[] = [];
  const methods: MethodSpec[] = ENCODERS.map((name) => ({
    name,
    kind: "configuration",
    description:
      "Published histology patch encoder whose frozen features the HEST authors scored with a Random Forest regression head.",
    locator: `Table 1, column(${name})`,
  }));
  const cells: CellSpec[] = [];

  const window = lines.slice(from, from + 60);
  for (const [cohort, title] of Object.entries(COHORTS)) {
    const at = window.findIndex((line) => line === cohort);
    if (at < 1) throw new Error(`Table 1: cohort ${cohort} not found`);
    const values = window[at - 1].split(/\s+/).filter(Boolean);
    const spreads = window[at + 1].split(/\s+/).filter(Boolean);
    if (values.length !== ENCODERS.length || spreads.length !== ENCODERS.length)
      throw new Error(
        `Table 1: ${cohort} has ${values.length} values and ${spreads.length} spreads`,
      );
    tasks.push({
      label: cohort,
      title: `Gene expression prediction from histology, ${title}`,
      metric: "Pearson correlation",
      metricKey: "pearson_r",
      unit: "correlation",
      direction: "higher",
      dataset: `HEST-Benchmark ${cohort}`,
      protocol:
        "Random Forest regression with 70 trees over frozen patch features, averaged over folds or patients.",
      locator: `Table 1, row(${cohort})`,
    });
    values.forEach((printed, i) => {
      const cell = parseCell(`${printed} ${spreads[i]}`);
      if (cell.value === null) return;
      cells.push({
        method: ENCODERS[i],
        task: cohort,
        printed: cell.printed,
        value: cell.value,
        sd: cell.sd,
        locator: `Table 1, row(${cohort}), column(${ENCODERS[i]})`,
      });
    });
  }

  const spec: BatchSpec = {
    transformation,
    // Table 2 caption: mean ± standard deviation over folds (or patients).
    uncertaintyType: "standard_deviation",
    key: "hest",
    benchmarkId: "discovery-benchmark-hest-benchmark",
    benchmarkName: "HEST-Benchmark",
    area: "cells-tissues",
    source: {
      id: "evidence-expansion-p2-hest-cached-636099a73dee",
      emit: false,
      name: "HEST-1k: A Dataset for Spatial Transcriptomics and Histology Image Analysis (arXiv:2406.16192v1)",
      url: "https://arxiv.org/abs/2406.16192",
      artifactUrl: "https://arxiv.org/pdf/2406.16192v1",
      sha256: SHA256,
      version: "v1",
      venue: "arXiv preprint",
      retrievedAt: DATE,
    },
    reviewer: "Codex research agent; no human review claimed",
    date: DATE,
    method:
      "Deterministic parse of the pinned PDF text layer, stitching each cohort's value and spread lines with both counts asserted",
    caveats: [
      "Author-reported numbers, source checked but not independently reproduced.",
      "Every figure comes from the same Random Forest head over frozen features, so it measures the encoder, not a full prediction pipeline.",
      "Cohorts differ in size and difficulty, so a figure in one cohort is not comparable to a figure in another.",
    ],
    tasks,
    methods,
    cells,
  };
  writeBatch(spec);
}

if (process.argv[1]?.endsWith("hest.ts")) run(process.argv[2]);
