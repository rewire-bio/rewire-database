/**
 * Extract the ProteinBench comparison tables into catalogue records.
 *
 * Source: Ye, Zhang, Liu et al., "ProteinBench: A Holistic Evaluation of
 * Protein Foundation Models", arXiv:2409.06744v1. Tables 2 to 7 hold the
 * evaluated tasks: inverse folding, backbone design, sequence generation,
 * co-design, antibody design and folding.
 *
 * ProteinBench marks the direction of every metric in the header with an arrow,
 * so direction is read from the paper rather than assumed here, and a column
 * without an arrow stops the extraction. Getting this wrong would invert a
 * ranking silently: half of these metrics, including scRMSD, perplexity and
 * binding energy, are better when lower.
 *
 * Several tables print a wide comparison as stacked blocks with repeated
 * headers, so the blocks are read separately. Table 7 prints "mean / median" in
 * one cell, which is two measurements; both are recorded, as separate tasks.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import {
  arrowDirection,
  headedBlocks,
  isMissingCell,
  parseCell,
  tableMatching,
  type Table,
} from "./tables";
import {
  slug,
  writeBatch,
  type BatchSpec,
  type CellSpec,
  type MethodSpec,
  type TaskSpec,
} from "./batch";

const SHA256 =
  "4334d636223ad42bfb9ae68aae03f5a255c29ba1cebe7b8f9588fb3b9b5453b2";
const DATE = "2026-09-18";
const NAME = "ProteinBench";

const TABLES = [
  {
    caption: /Table 2: Performance of structure-based sequence design/,
    number: "Table 2",
    blocks: [{ rows: 4, columns: 13, metrics: 12 }],
    prefix: "IF",
    dataset: "CASP, CAMEO and de novo backbones",
    protocol:
      "Inverse folding: recover a sequence for a given backbone. Values are the median over repeated runs.",
  },
  {
    caption: /Table 3: Performance of backbone design/,
    number: "Table 3",
    blocks: [
      { rows: 9, columns: 11, metrics: 10 },
      { rows: 9, columns: 11, metrics: 10 },
    ],
    prefix: "BB",
    dataset: "Designed backbones at fixed lengths",
    protocol:
      "Unconditional backbone design at a fixed sequence length. Values are the median over repeated runs.",
  },
  {
    caption: /Table 4: Performance of protein sequence generative/,
    number: "Table 4",
    blocks: [
      { rows: 5, columns: 11, metrics: 10 },
      { rows: 5, columns: 11, metrics: 10 },
    ],
    prefix: "SEQ",
    dataset: "Generated sequences at fixed lengths",
    protocol:
      "Unconditional sequence generation at a fixed length. Values are the mean and standard deviation over repeated runs.",
  },
  {
    caption: /Table 5: Performance of protein co-design/,
    number: "Table 5",
    blocks: [
      { rows: 5, columns: 9, metrics: 8 },
      { rows: 5, columns: 9, metrics: 8 },
    ],
    prefix: "CO",
    dataset: "Co-generated structures and sequences at fixed lengths",
    protocol:
      "Joint structure and sequence generation at a fixed length. Values are the mean and standard deviation over repeated runs.",
  },
  {
    caption: /Table 6: Performance of antibody design/,
    number: "Table 6",
    blocks: [
      { rows: 8, columns: 8, metrics: 7 },
      // The last column of the second block is blank padding in the source.
      { rows: 8, columns: 8, metrics: 6 },
    ],
    prefix: "AB",
    dataset: "RAbD, 55 antibody-antigen complexes",
    protocol:
      "Antibody design on the 55 antibody-antigen complexes of the RAbD set.",
  },
  {
    caption: /Table 7: Performance of protein folding on the CAMEO2022/,
    number: "Table 7",
    blocks: [{ rows: 5, columns: 8, metrics: 7 }],
    prefix: "FOLD",
    dataset: "CAMEO2022, 183 proteins",
    protocol:
      "Structure prediction on CAMEO2022. Each cell prints the mean and the median over 183 proteins.",
    splitMeanMedian: true,
  },
];

/** Fixed dimensions of the pinned paper, including stacked table blocks. */
export function proteinBenchBlocks(table: Table, number: string) {
  const config = TABLES.find((entry) => entry.number === number);
  if (!config) throw new Error(`Unknown ProteinBench table: ${number}`);
  const blocks = headedBlocks(table);
  if (blocks.length !== config.blocks.length)
    throw new Error(`${number}: expected ${config.blocks.length} blocks, got ${blocks.length}`);
  for (const [index, block] of blocks.entries()) {
    const expected = config.blocks[index];
    if (
      block.rows.length !== expected.rows ||
      block.metrics.length !== expected.columns ||
      block.metrics.slice(1).filter((metric) => metric.trim()).length !== expected.metrics
    )
      throw new Error(`${number}, block ${index + 1}: unexpected row or column count`);
    for (const row of block.rows) {
      if (row.length !== expected.columns)
        throw new Error(`${number}, row(${row[0]}): expected ${expected.columns} cells, got ${row.length}`);
      for (let i = 1; i < row.length; i++)
        if (!block.metrics[i].trim() && row[i].trim())
          throw new Error(`${number}, row(${row[0]}): value in an unlabelled column`);
    }
  }
  return blocks;
}

function run(file: string) {
  const html = fs.readFileSync(file, "utf8");
  const sha = createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  if (sha !== SHA256)
    throw new Error(`Artifact hash ${sha} does not match the pinned ${SHA256}`);

  const tasks = new Map<string, TaskSpec>();
  const methods = new Map<string, MethodSpec>();
  const cells: CellSpec[] = [];
  const clean = (printed: string) => printed.replace(/\s+/g, " ").trim();
  /**
   * A trailing asterisk is a per-table footnote marker, and it means something
   * different in each table: in Table 5 the authors could not fully reproduce
   * the method, in Table 6 the method generates several antibodies per target.
   * It qualifies that table's cell, not the identity of the model, so it is
   * dropped from the name and kept in the row locator.
   */
  const methodName = (printed: string) =>
    clean(printed).replace(/\s*\*+$/, "");

  for (const config of TABLES) {
    const table: Table = tableMatching(html, config.caption);
    const blocks = proteinBenchBlocks(table, config.number);
    for (const block of blocks) {
      const columns = block.metrics
        .map((metric, index) => ({ metric: clean(metric), index }))
        .filter((column) => column.metric && column.index > 0)
        .map((column) => ({
          ...column,
          unit: /%/.test(column.metric) || block.rows.some((row) => /%/.test(row[column.index]))
            ? "percent"
            : "score",
        }));
      for (const column of columns) {
        const direction = arrowDirection(column.metric);
        if (!direction)
          throw new Error(
            `${config.number}: column "${column.metric}" has no direction arrow`,
          );
        const metric = column.metric.replace(/[↑↓]/g, "").trim();
        const group = block.groups[column.index] || "";
        const parts = config.splitMeanMedian
          ? ([
              ["mean", "mean"],
              ["median", "median"],
            ] as const)
          : ([["", ""]] as const);
        for (const [suffix, stat] of parts) {
          const label = [
            config.prefix,
            slug(group),
            slug(metric),
            suffix && slug(suffix),
          ]
            .filter(Boolean)
            .join("-")
            .toUpperCase();
          tasks.set(label, {
            label,
            title: [group, metric, stat && `(${stat})`]
              .filter(Boolean)
              .join(" "),
            metric: [metric, stat && `(${stat})`].filter(Boolean).join(" "),
            metricKey: [slug(metric), stat].filter(Boolean).join("_"),
            unit: column.unit,
            direction,
            dataset: config.dataset,
            protocol: config.protocol,
            locator: `${config.number}, column(${group} ${column.metric})`.replace(
              /\s+/g,
              " ",
            ),
          });
        }
      }
      for (const row of block.rows) {
        const name = methodName(row[0]);
        if (!methods.has(name))
          methods.set(name, {
            name,
            kind: "configuration",
            description:
              "Protein model evaluated by the ProteinBench authors under their harness.",
            locator: `${config.number}, row(${clean(row[0])})`,
          });
        for (const column of columns) {
          const printed = row[column.index];
          // N/A contains a slash but is one missing cell, not a mean/median pair.
          if (isMissingCell(printed)) continue;
          const metric = column.metric.replace(/[↑↓]/g, "").trim();
          const group = block.groups[column.index] || "";
          const pieces = config.splitMeanMedian
            ? printed.split("/").map((part, i) => [part, i === 0 ? "mean" : "median"] as const)
            : ([[printed, ""]] as const);
          if (config.splitMeanMedian && pieces.length !== 2)
            throw new Error(`${config.number}: cannot split "${printed}"`);
          for (const [part, stat] of pieces) {
            const cell = parseCell(part, { unit: column.unit });
            if (cell.value === null) continue;
            const label = [
              config.prefix,
              slug(group),
              slug(metric),
              stat && slug(stat),
            ]
              .filter(Boolean)
              .join("-")
              .toUpperCase();
            if (!tasks.has(label)) continue;
            cells.push({
              method: name,
              task: label,
              printed: cell.printed,
              value: cell.value,
              sd: cell.sd,
              locator: `${config.number}, row(${clean(row[0])}), column(${group} ${column.metric})`.replace(
                /\s+/g,
                " ",
              ),
            });
          }
        }
      }
    }
  }

  const spec: BatchSpec = {
    // Tables 4–6 define their printed spreads as standard deviations.
    uncertaintyType: "standard_deviation",
    key: "proteinbench",
    benchmarkId: "discovery-benchmark-proteinbench",
    benchmarkName: NAME,
    area: "proteins-complexes",
    source: {
      id: "expansion-p3-proteinbench",
      emit: false,
      name: "ProteinBench: A Holistic Evaluation of Protein Foundation Models (arXiv:2409.06744v1)",
      url: "https://arxiv.org/abs/2409.06744",
      artifactUrl: "https://arxiv.org/html/2409.06744v1",
      sha256: SHA256,
      version: "v1",
      venue: "arXiv preprint",
      retrievedAt: DATE,
    },
    reviewer: "Codex research agent; no human review claimed",
    date: "2026-09-19",
    method:
      "Deterministic parse of the pinned HTML tables, with the direction of every metric read from the arrow the paper prints in its header",
    caveats: [
      "Author-reported numbers, source checked but not independently reproduced.",
      "Many of these metrics are better when lower, including scRMSD, perplexity and binding energy. The direction comes from the arrow in the paper's own header.",
      "Rows such as Native PDBs and RAbD are the natural reference the authors include for scale, not a competing method.",
    ],
    tasks: [...tasks.values()],
    methods: [...methods.values()],
    cells,
  };
  if (cells.length !== 556)
    throw new Error(`ProteinBench: expected 556 numeric measurements, got ${cells.length}`);
  writeBatch(spec);
}

if (process.argv[1]?.endsWith("proteinbench.ts")) run(process.argv[2]);
