/**
 * Extract the FLIP baseline tables into catalogue records.
 *
 * Source: Dallago, Mou, Johnston et al., "FLIP: Benchmark tasks in fitness
 * landscape inference for proteins", bioRxiv 2021.11.09.467890. Tables 4, 5 and
 * 6 hold the baselines on the GB1, AAV and thermostability landscapes, and
 * Table 7 holds the random splits the authors report separately.
 *
 * Every split is its own task. The whole point of FLIP is that the split
 * decides the difficulty: the authors keep the random splits in a separate
 * table and call them optimistic, so those are recorded as their own tasks
 * rather than mixed in with the biologically motivated ones.
 *
 * "NA" marks a baseline that cannot be applied to a landscape, such as
 * BLOSUM62 where the mutations include insertions. No result is written for it.
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
  "afcf360c88a7a4ae153b3c2d8d4fa6d4ac0abe84f2131b94409abff6447ce363";
const DATE = "2026-09-18";

const TABLES = [
  {
    number: "Table 4",
    start: /^\s*Table 4: GB1 baselines/,
    end: /^GB1\. Table 4 summarizes/,
    landscape: "GB1",
    splits: ["1-vs-rest", "2-vs-rest", "3-vs-rest", "low-vs-high"],
    rows: 13,
  },
  {
    number: "Table 5",
    start: /^\s*Table 5: AAV baselines/,
    end: /^\s*Table 6: Thermostability baselines/,
    landscape: "AAV",
    splits: ["Mut-Des", "Des-Mut", "1-vs-rest", "2-vs-rest", "7-vs-rest", "low-vs-high"],
    rows: 13,
  },
  {
    number: "Table 6",
    start: /^\s*Table 6: Thermostability baselines/,
    end: /^6\s+Discussion/,
    landscape: "Thermostability",
    splits: ["Mixed", "Human", "Human-Cell"],
    rows: 13,
  },
  {
    number: "Table 7",
    start: /^\s*Table 7: Optimistic results for random splits/,
    end: /^like different validation splits/,
    landscape: "Random sampled splits",
    splits: ["AAV", "GB1"],
    rows: 5,
    note: "The authors report these separately and call them optimistic: a random split of a mutational landscape leaks close relatives between train and test.",
  },
];

function run(file: string) {
  const { text, transformation } = readPinnedPdfText(file, SHA256, process.argv[3]);

  const tasks: TaskSpec[] = [];
  const methods = new Map<string, MethodSpec>();
  const cells: CellSpec[] = [];

  for (const config of TABLES) {
    for (const split of config.splits)
      tasks.push({
        label: `${config.landscape} ${split}`
          .toUpperCase()
          .replace(/[^A-Z0-9]+/g, "-"),
        title: `${config.landscape} fitness prediction, ${split} split`,
        metric: "Spearman correlation",
        metricKey: "spearman",
        unit: "correlation",
        direction: "higher",
        dataset: `FLIP ${config.landscape}, ${split} split`,
        protocol: [
          "Trained on the split's training set with ten percent held out for validation, scored on its test set.",
          config.note,
        ]
          .filter(Boolean)
          .join(" "),
        locator: `${config.number}, column(${split})`,
      });

    const rows = layoutRows(text, config.start, config.end).filter(
      (row) => row.length === config.splits.length + 1 && !/^(Model|Landscape)$/.test(row[0]),
    );
    if (rows.length !== config.rows)
      throw new Error(`${config.number}: ${rows.length} rows`);
    for (const row of rows) {
      const name = row[0];
      if (!methods.has(name))
        methods.set(name, {
          name,
          kind: /^(Levenshtein|BLOSUM62|Ridge|CNN)/.test(name)
            ? "method"
            : "configuration",
          description: /^(Levenshtein|BLOSUM62)/.test(name)
            ? "Sequence-similarity baseline, with no learned fitness model."
            : /^(Ridge|CNN)/.test(name)
              ? "Supervised baseline trained on one-hot encoded sequence by the FLIP authors."
              : "Protein language model embedding with the stated pooling, fed to a supervised head by the FLIP authors.",
          locator: `${config.number}, row(${name})`,
        });
      row.slice(1).forEach((printed, i) => {
        const cell = parseCell(printed);
        if (cell.value === null) return;
        cells.push({
          method: name,
          task: `${config.landscape} ${config.splits[i]}`
            .toUpperCase()
            .replace(/[^A-Z0-9]+/g, "-"),
          printed: cell.printed,
          value: cell.value,
          sd: cell.sd,
          locator: `${config.number}, row(${name}), column(${config.splits[i]})`,
        });
      });
    }
  }

  const spec: BatchSpec = {
    transformation,
    key: "flip",
    benchmarkId: "discovery-benchmark-flip",
    benchmarkName: "FLIP",
    area: "proteins-complexes",
    source: {
      id: "expansion-p3-flip",
      emit: false,
      name: "FLIP: Benchmark tasks in fitness landscape inference for proteins (bioRxiv 2021.11.09.467890)",
      url: "https://doi.org/10.1101/2021.11.09.467890",
      artifactUrl:
        "https://flip.protein.properties/assets/FLIP_2021_manuscript.pdf",
      sha256: SHA256,
      version: "posted 11 November 2021",
      venue: "bioRxiv preprint",
      retrievedAt: DATE,
    },
    reviewer: "Codex research agent; no human review claimed",
    date: DATE,
    method:
      "Deterministic parse of the pinned PDF text layer, with row counts asserted per table",
    caveats: [
      "Author-reported numbers, source checked but not independently reproduced.",
      "The split is the task here. Figures from different splits of the same landscape are not comparable.",
      "The random sampled splits in Table 7 are the authors' own illustration of an optimistic evaluation, not a headline result.",
      "NA marks a baseline that cannot be applied to that landscape, and is recorded as no result rather than as a zero.",
    ],
    tasks,
    methods: [...methods.values()],
    cells,
  };
  writeBatch(spec);
}

if (process.argv[1]?.endsWith("flip.ts")) run(process.argv[2]);
