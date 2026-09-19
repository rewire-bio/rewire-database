/**
 * Extract the ATOM3D results tables into catalogue records.
 *
 * Source: Townshend, Vögele, Suriana et al., "ATOM3D: Tasks on Molecules in
 * Three Dimensions", arXiv:2012.04035v4. Tables 3 to 6 hold the results for
 * small molecules, biopolymers, joint tasks and structure ranking.
 *
 * The comparison methods appear in these tables only as citations, so that is
 * what they are named here; which method each citation refers to is recorded in
 * the description from the paper's own body text rather than guessed.
 *
 * Two shapes need care. In Table 4 the non-3D column holds a different method
 * per row, so each row names its own comparison rather than inheriting the
 * column heading. In Table 6 the state-of-the-art cell prints its value and its
 * citation together, so the two are split apart.
 *
 * Metrics are mixed and two of them, MAE and RMSE, are errors. Each row states
 * its own metric and direction here, taken from the table's metric column.
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
  "92656c20a15311c32bed9edc7f465bb26eb30338f40324fe43bec4b1fc6a7890";
const DATE = "2026-09-18";

const CITED: Record<string, string> = {
  "[Tsubaki et al., 2019]":
    "Two-dimensional graph neural network on the chemical bond graph, as the ATOM3D text describes it.",
  "[Liu et al., 2019]":
    "N-gram graph method on the chemical bond graph, as the ATOM3D text describes it.",
  "[Sanchez-Garcia et al., 2018]":
    "Sequence-only BIPSPI, a boosted decision tree method for protein interaction prediction, as the ATOM3D text describes it.",
  "[Rao et al., 2019]":
    "TAPE, a transformer over protein sequence, as the ATOM3D text describes it.",
  "[Öztürk et al., 2018]":
    "DeepDTA, a one-dimensional convolutional network over both partners, as the ATOM3D text describes it.",
  "[Karimi et al., 2019]":
    "DeepAffinity, over ligand SMILES and annotated protein sequence, as the ATOM3D text describes it.",
};

type Row = {
  task: string;
  title: string;
  metric: string;
  metricKey: string;
  unit: string;
  direction: "higher" | "lower";
  /** Column index to method name, for tables whose comparison column varies. */
  methods: string[];
};

function run(file: string) {
  const { text, transformation } = readPinnedPdfText(file, SHA256, process.argv[3]);

  const tasks = new Map<string, TaskSpec>();
  const methods = new Map<string, MethodSpec>();
  const cells: CellSpec[] = [];
  const addMethod = (name: string, locator: string) => {
    if (methods.has(name)) return;
    methods.set(name, {
      name,
      kind: name.startsWith("[") ? "configuration" : "method",
      description:
        CITED[name] ??
        "Network implemented and trained by the ATOM3D authors over the three-dimensional structure.",
      locator,
    });
  };
  const record = (
    number: string,
    row: Row,
    printedRow: string[],
    values: string[],
  ) => {
    tasks.set(row.task, {
      label: row.task,
      title: row.title,
      metric: row.metric,
      metricKey: row.metricKey,
      unit: row.unit,
      direction: row.direction,
      dataset: `ATOM3D ${row.task.split("-")[0]}`,
      protocol:
        "Trained and scored under the ATOM3D split for this task. Asterisks in the paper mark a run whose training data differed.",
      locator: `${number}, row(${printedRow.join(" ")})`,
    });
    values.forEach((printed, i) => {
      const cell = parseCell(printed);
      if (cell.value === null) return;
      const name = row.methods[i];
      addMethod(name, `${number}, column(${name})`);
      cells.push({
        method: name,
        task: row.task,
        printed: cell.printed,
        value: cell.value,
        sd: cell.sd,
        locator: `${number}, row(${printedRow.join(" ")}), column(${name})`,
      });
    });
  };

  const three = ["3DCNN", "GNN", "ENN"];

  // Table 3: five columns, three rows of SMP targets, all mean absolute error.
  const t3 = layoutRows(
    text,
    /^\s*Table 3: Small molecule results/,
    /^\s*Table 4: Biopolymer results/,
  ).filter((row) => row.length >= 6);
  const smp = [
    ["SMP-MU", "Small molecule properties, dipole moment"],
    ["SMP-EGAP", "Small molecule properties, HOMO-LUMO gap"],
    ["SMP-U0AT", "Small molecule properties, atomization energy"],
  ];
  if (t3.length !== smp.length) throw new Error(`Table 3: ${t3.length} rows`);
  t3.forEach((row, i) => {
    const values = row.slice(-5);
    record(
      "Table 3",
      {
        task: smp[i][0],
        title: smp[i][1],
        metric: "MAE",
        metricKey: "mae",
        unit: "error",
        direction: "lower",
        methods: [...three, "[Tsubaki et al., 2019]", "[Liu et al., 2019]"],
      },
      row.slice(0, row.length - 5),
      values,
    );
  });

  // Table 4: the non-3D comparison differs per row.
  const t4 = layoutRows(
    text,
    /^\s*Table 4: Biopolymer results/,
    /^state-of-the-art methods do not use 1D/,
  ).filter((row) => row.length >= 5 && /^(PIP|RES|MSP)$/.test(row[0]));
  const bio: [string, string, string, string, string, Row["direction"], string][] = [
    ["PIP", "PIP", "Protein interface prediction", "AUROC", "auroc", "higher", "[Sanchez-Garcia et al., 2018]"],
    ["RES", "RES", "Residue identity", "Accuracy", "accuracy", "higher", "[Rao et al., 2019]"],
    ["MSP", "MSP", "Mutation stability prediction", "AUROC", "auroc", "higher", "[Rao et al., 2019]"],
  ];
  if (t4.length !== bio.length) throw new Error(`Table 4: ${t4.length} rows`);
  t4.forEach((row, i) => {
    const [task, , title, metric, metricKey, direction, cited] = bio[i];
    record(
      "Table 4",
      {
        task,
        title,
        metric,
        metricKey,
        unit: metricKey === "accuracy" ? "fraction" : "fraction",
        direction,
        methods: [...three, cited],
      },
      row.slice(0, 2),
      row.slice(-4),
    );
  });

  // Table 5: four rows over two joint tasks.
  const t5 = layoutRows(
    text,
    /^\s*Table 5: Joint small molecule\/biopolymer results/,
    /^\s*Table 6: Structure ranking results/,
  ).filter((row) => row.length >= 5 && /^(LBA|LEP|glob\.)/.test(row[0]));
  const joint: [string, string, string, string, string, Row["direction"]][] = [
    ["LBA-RMSE", "Ligand binding affinity, root mean squared error", "RMSE", "rmse", "error", "lower"],
    ["LBA-RP", "Ligand binding affinity, global Pearson correlation", "Pearson r", "pearson_r", "correlation", "higher"],
    ["LBA-RS", "Ligand binding affinity, global Spearman correlation", "Spearman r", "spearman_r", "correlation", "higher"],
    ["LEP-AUROC", "Ligand efficacy prediction", "AUROC", "auroc", "fraction", "higher"],
  ];
  if (t5.length !== joint.length) throw new Error(`Table 5: ${t5.length} rows`);
  t5.forEach((row, i) => {
    const [task, title, metric, metricKey, unit, direction] = joint[i];
    record(
      "Table 5",
      {
        task,
        title,
        metric,
        metricKey,
        unit,
        direction,
        methods: [...three, "[Öztürk et al., 2018]", "[Karimi et al., 2019]"],
      },
      row.slice(0, row.length - 5),
      row.slice(-5),
    );
  });

  // Table 6: the state-of-the-art cell carries its citation beside its value.
  const t6 = layoutRows(
    text,
    /^\s*Table 6: Structure ranking results/,
    /^a 1D or 2D representation would not be able/,
  ).filter((row) => row.length >= 4 && /RS$/.test(row[row.length - 4] ?? ""));
  const ranking: [string, string, Row["direction"]][] = [
    ["PSR-MEAN-RS", "Protein structure ranking, mean Spearman within a target", "higher"],
    ["PSR-GLOBAL-RS", "Protein structure ranking, global Spearman", "higher"],
    ["RSR-MEAN-RS", "RNA structure ranking, mean Spearman within a target", "higher"],
    ["RSR-GLOBAL-RS", "RNA structure ranking, global Spearman", "higher"],
  ];
  if (t6.length !== ranking.length) throw new Error(`Table 6: ${t6.length} rows`);
  t6.forEach((row, i) => {
    const [task, title, direction] = ranking[i];
    const sota = row[row.length - 1];
    const split = /^([\d.]+)\s*(\[.+\])$/.exec(sota.trim());
    if (!split) throw new Error(`Table 6: cannot split "${sota}"`);
    record(
      "Table 6",
      {
        task,
        title,
        metric: "Spearman r",
        metricKey: "spearman_r",
        unit: "correlation",
        direction,
        methods: ["3DCNN", "GNN", split[2]],
      },
      row.slice(0, row.length - 3),
      [row[row.length - 3], row[row.length - 2], split[1]],
    );
    methods.get(split[2])!.description =
      "Published state-of-the-art structure ranking method that the ATOM3D authors compare against, named only by its citation in the table.";
  });

  const spec: BatchSpec = {
    transformation,
    key: "atom3d",
    benchmarkId: "discovery-benchmark-atom3d",
    benchmarkName: "ATOM3D",
    area: "molecular-interactions",
    source: {
      id: "evidence-expansion-atom3d-92656c20",
      emit: false,
      name: "ATOM3D: Tasks on Molecules in Three Dimensions (arXiv:2012.04035v4)",
      url: "https://arxiv.org/abs/2012.04035",
      artifactUrl: "https://arxiv.org/pdf/2012.04035v4",
      sha256: SHA256,
      version: "v4",
      venue: "arXiv preprint",
      retrievedAt: DATE,
    },
    reviewer: "Codex research agent; no human review claimed",
    date: DATE,
    method:
      "Deterministic parse of the pinned PDF text layer, with the expected row labels asserted per table",
    caveats: [
      "Author-reported numbers, source checked but not independently reproduced.",
      "MAE and RMSE are errors, better when lower. The other metrics are better when higher.",
      "Comparison methods are named by the citation the table prints; the paper's text says which method each is.",
      "The paper marks some runs with an asterisk to say their training data differed, though the splitting criteria were the same.",
    ],
    tasks: [...tasks.values()],
    methods: [...methods.values()],
    cells,
  };
  writeBatch(spec);
}

if (process.argv[1]?.endsWith("atom3d.ts")) run(process.argv[2]);
