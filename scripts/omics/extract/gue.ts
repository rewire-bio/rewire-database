/**
 * Extract the GUE benchmark results into catalogue records.
 *
 * Source: Zhou, Ji, Li et al., "DNABERT-2: Efficient Foundation Model and
 * Benchmark for Multi-Species Genome", ICLR 2024. Table 6 reports every model
 * on every GUE dataset; Table 12 gives each task's metric and split sizes.
 *
 * Table 6 is printed as four stacked blocks, each with its own header. The
 * column headings are asserted against the expected list rather than trusted
 * from position, because a PDF text layer gives no column boundaries: if the
 * headings ever change, the extraction stops instead of filing H3K9ac scores
 * under H4.
 *
 * Every task is scored with MCC except Covid Variant Classification, which
 * Table 12 scores with F1. The diamond on "DNABERT-2 diamond" marks further
 * pre-training on the GUE training sets, which is a different model, so it is
 * kept as its own entry.
 */
import { readPinnedPdfText } from "./pdf";
import { layoutRows, parseCell } from "./tables";
import {
  writeBatch,
  type BatchSpec,
  type CellSpec,
  type MethodSpec,
  type TaskSpec,
} from "./batch";

const SHA256 =
  "49300acee3e4afd44bebc3de9893c3bc310d331bd4805374e0952fdfbf366f06";
const DATE = "2026-09-18";

/** Each block: the headings it must print, and the task each column belongs to. */
const BLOCKS = [
  {
    headings: ["H3", "H3K14ac", "H3K36me3", "H3K4me1", "H3K4me2", "H3K4me3"],
    group: "Epigenetic marks prediction",
  },
  {
    headings: ["H3K79me3", "H3K9ac", "H4", "H4ac", "all", "notata", "tata"],
    group: "Epigenetic marks prediction",
    groups: [
      "Epigenetic marks prediction",
      "Epigenetic marks prediction",
      "Epigenetic marks prediction",
      "Epigenetic marks prediction",
      "Promoter detection",
      "Promoter detection",
      "Promoter detection",
    ],
  },
  {
    headings: ["0", "1", "2", "3", "4", "all", "notata", "tata"],
    group: "Transcription factor prediction (human)",
    groups: [
      "Transcription factor prediction (human)",
      "Transcription factor prediction (human)",
      "Transcription factor prediction (human)",
      "Transcription factor prediction (human)",
      "Transcription factor prediction (human)",
      "Core promoter detection",
      "Core promoter detection",
      "Core promoter detection",
    ],
  },
  {
    headings: ["0", "1", "2", "3", "4", "Covid", "Reconstruct"],
    group: "Transcription factor prediction (mouse)",
    groups: [
      "Transcription factor prediction (mouse)",
      "Transcription factor prediction (mouse)",
      "Transcription factor prediction (mouse)",
      "Transcription factor prediction (mouse)",
      "Transcription factor prediction (mouse)",
      "Covid variant classification",
      "Splice site prediction",
    ],
  },
];

const MODELS = [
  "DNABERT (3-mer)",
  "DNABERT (4-mer)",
  "DNABERT (5-mer)",
  "DNABERT (6-mer)",
  "NT-500M-human",
  "NT-500M-1000g",
  "NT-2500M-1000g",
  "NT-2500M-multi",
  "DNABERT-2",
  "DNABERT-2♦",
];

function run(file: string) {
  const { text, transformation } = readPinnedPdfText(file, SHA256, process.argv[3]);

  const rows = layoutRows(
    text,
    /^A\.1\s+A LL E XPERIMENT R ESULTS/,
    /^Table 6: This table presents/,
  );
  const tasks = new Map<string, TaskSpec>();
  const methods = new Map<string, MethodSpec>();
  const cells: CellSpec[] = [];

  let index = 0;
  for (const block of BLOCKS) {
    // Find the header row for this block: the headings, exactly, in order.
    const header = rows.findIndex(
      (row, i) =>
        i >= index &&
        row.length === block.headings.length &&
        row.every((cell, j) => cell === block.headings[j]),
    );
    if (header < 0)
      throw new Error(`Table 6: header not found for ${block.headings.join(",")}`);
    const groups = block.groups ?? block.headings.map(() => block.group);
    block.headings.forEach((heading, i) => {
      const group = groups[i];
      const covid = group.startsWith("Covid");
      const label = `${group} ${heading}`
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      tasks.set(label, {
        label,
        title: `${group}, dataset ${heading}`,
        metric: covid ? "F1" : "MCC",
        metricKey: covid ? "f1" : "mcc",
        unit: covid ? "percent" : "percent",
        direction: "higher",
        dataset: `GUE ${group}, ${heading}`,
        protocol:
          "Fine-tuned on the GUE training split, scored on its test split. Split sizes are in Table 12.",
        locator: `Table 12, row(${group})`,
      });
    });
    const body = rows.slice(header + 1, header + 1 + MODELS.length);
    if (body.length !== MODELS.length)
      throw new Error(`Table 6: ${body.length} rows under ${block.headings[0]}`);
    body.forEach((row, r) => {
      if (row.length !== block.headings.length + 1 || row[0] !== MODELS[r])
        throw new Error(`Table 6 row: ${row.join(" | ")}`);
      // The caption defines the diamond as further pre-training on the GUE
      // training sets. Spelling that out keeps the two DNABERT-2 entries apart
      // in the catalogue, where a lone diamond would not survive an id.
      const name = MODELS[r].replace(
        /\u2666$/,
        " (further pre-trained on GUE)",
      );
      if (!methods.has(name))
        methods.set(name, {
          name,
          kind: "configuration",
          description: name.includes("♦")
            ? "DNABERT-2 with further pre-training on the GUE training sets, as the paper's diamond marks."
            : "Genome language model fine-tuned on each GUE dataset by the DNABERT-2 authors.",
          locator: `Table 6, row(${MODELS[r]})`,
        });
      row.slice(1).forEach((printed, i) => {
        const cell = parseCell(printed);
        if (cell.value === null) return;
        const group = groups[i];
        const label = `${group} ${block.headings[i]}`
          .toUpperCase()
          .replace(/[^A-Z0-9]+/g, "-")
          .replace(/^-|-$/g, "");
        cells.push({
          method: name,
          task: label,
          printed: cell.printed,
          value: cell.value,
          sd: cell.sd,
          locator: `Table 6, row(${MODELS[r]}), column(${group} ${block.headings[i]})`,
        });
      });
    });
    index = header + MODELS.length;
  }

  const spec: BatchSpec = {
    transformation,
    key: "gue",
    benchmarkId: "discovery-benchmark-gue",
    benchmarkName: "GUE",
    area: "dna-genomes",
    source: {
      id: "evidence-expansion-gue-49300ace",
      emit: false,
      name: "DNABERT-2: Efficient Foundation Model and Benchmark for Multi-Species Genome (arXiv:2306.15006)",
      url: "https://arxiv.org/abs/2306.15006",
      artifactUrl: "https://arxiv.org/pdf/2306.15006",
      sha256: SHA256,
      version: "ICLR 2024 conference paper",
      venue: "ICLR 2024",
      retrievedAt: DATE,
    },
    reviewer: "Codex research agent; no human review claimed",
    date: DATE,
    method:
      "Deterministic parse of the pinned PDF text layer, with every column heading asserted against the expected list",
    caveats: [
      "Author-reported numbers, source checked but not independently reproduced.",
      "Scores are MCC, except Covid variant classification which is F1, both on a 0 to 100 scale.",
      "The diamond entry is DNABERT-2 with further pre-training on the GUE training sets, so it is not directly comparable to the others.",
    ],
    tasks: [...tasks.values()],
    methods: [...methods.values()],
    cells,
  };
  writeBatch(spec);
}

if (process.argv[1]?.endsWith("gue.ts")) run(process.argv[2]);
