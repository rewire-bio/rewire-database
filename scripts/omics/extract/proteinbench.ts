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
    prefix: "IF",
    dataset: "CASP, CAMEO and de novo backbones",
    protocol:
      "Inverse folding: recover a sequence for a given backbone. Values are the median over repeated runs.",
  },
  {
    caption: /Table 3: Performance of backbone design/,
    number: "Table 3",
    prefix: "BB",
    dataset: "Designed backbones at fixed lengths",
    protocol:
      "Unconditional backbone design at a fixed sequence length. Values are the median over repeated runs.",
  },
  {
    caption: /Table 4: Performance of protein sequence generative/,
    number: "Table 4",
    prefix: "SEQ",
    dataset: "Generated sequences at fixed lengths",
    protocol:
      "Unconditional sequence generation at a fixed length. Values are the mean and standard deviation over repeated runs.",
  },
  {
    caption: /Table 5: Performance of protein co-design/,
    number: "Table 5",
    prefix: "CO",
    dataset: "Co-generated structures and sequences at fixed lengths",
    protocol:
      "Joint structure and sequence generation at a fixed length. Values are the mean and standard deviation over repeated runs.",
  },
  {
    caption: /Table 6: Performance of antibody design/,
    number: "Table 6",
    prefix: "AB",
    dataset: "RAbD, 55 antibody-antigen complexes",
    protocol:
      "Antibody design on the 55 antibody-antigen complexes of the RAbD set.",
  },
  {
    caption: /Table 7: Performance of protein folding on the CAMEO2022/,
    number: "Table 7",
    prefix: "FOLD",
    dataset: "CAMEO2022, 183 proteins",
    protocol:
      "Structure prediction on CAMEO2022. Each cell prints the mean and the median over 183 proteins.",
    splitMeanMedian: true,
  },
];

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
    const blocks = headedBlocks(table);
    if (!blocks.length) throw new Error(`${config.number}: no header found`);
    for (const block of blocks) {
      const columns = block.metrics
        .map((metric, index) => ({ metric: clean(metric), index }))
        .filter((column) => column.metric && column.index > 0);
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
            unit: "score",
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
          const printed = row[column.index] ?? "";
          const metric = column.metric.replace(/[↑↓]/g, "").trim();
          const group = block.groups[column.index] || "";
          const pieces = config.splitMeanMedian
            ? printed.split("/").map((part, i) => [part, i === 0 ? "mean" : "median"] as const)
            : ([[printed, ""]] as const);
          if (config.splitMeanMedian && pieces.length > 2)
            throw new Error(`${config.number}: cannot split "${printed}"`);
          for (const [part, stat] of pieces) {
            const cell = parseCell(part);
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
    date: DATE,
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
  writeBatch(spec);
}

if (process.argv[1]?.endsWith("proteinbench.ts")) run(process.argv[2]);
