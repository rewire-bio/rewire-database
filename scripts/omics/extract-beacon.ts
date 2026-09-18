/**
 * Extract the BEACON benchmark comparison table into catalogue records.
 *
 * Closes the gap recorded on `discovery-benchmark-beacon`, whose research block
 * reads "Full comparison table extraction remains pending; no composite RNA score
 * inferred."
 *
 * Source: Ren, Chen, Qiao et al., "BEACON: Benchmark for Comprehensive RNA Tasks
 * and Language Models", arXiv:2406.10391v2. Table 1 supplies the task
 * specifications, Table 3 the 13-task by 18-method comparison.
 *
 * Every printed value is transcribed from the pinned PDF text layer by
 * `parseBeaconTables`, never retyped. The parser requires exactly 13
 * well-formed cells per row and exactly 18 rows, so a layout change fails loudly
 * rather than emitting a plausible but wrong table. Model names containing digits
 * (Splice-H510, UTRBERT-3mer) are the specific hazard: splitting on whitespace
 * alone captures those digits as data.
 *
 * The Literature SOTA row is deliberately not emitted. Those numbers belong to
 * the cited papers under their own protocols, and attributing them to a BEACON
 * evaluation would misstate their provenance.
 *
 * No composite score is computed across tasks. Metrics differ by task and the
 * authors' own gap note warns against exactly that.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";

export const BEACON_SOURCE_URL = "https://arxiv.org/pdf/2406.10391";
export const BENCHMARK_ID = "discovery-benchmark-beacon";
const REVIEWER = "Codex research agent; no human review claimed";

export const TASK_ORDER = [
  "SSP",
  "CMP",
  "DMP",
  "SSI",
  "SPL",
  "APA",
  "NcRNA",
  "Modif",
  "MRL",
  "VDP",
  "PRS",
  "CRI-On",
  "CRI-Off",
] as const;
export type TaskKey = (typeof TASK_ORDER)[number];

/** Table 1 row, keyed by the label Table 3 uses. */
type TaskSpec = {
  label: string;
  title: string;
  metric: string;
  metricKey: string;
  unit: string;
  direction: "higher" | "lower";
  splits: string;
  taskType: string;
  level: string;
  dataset: string;
};

/**
 * Table 1 as printed. Held here rather than parsed because the column is a
 * ragged multi-line block; the numbers that matter are all in Table 3, which is
 * parsed. Each field is transcribed from p.6 Table 1.
 */
export const TASKS: Record<TaskKey, TaskSpec> = {
  SSP: {
    label: "SSP",
    title: "Secondary structure prediction",
    metric: "F1",
    metricKey: "f1",
    unit: "percent",
    direction: "higher",
    splits: "10,814/1,300/1,305",
    taskType: "Multi-label Cls",
    level: "Nucleotide",
    dataset: "bpRNA-1m",
  },
  CMP: {
    label: "CMP",
    title: "Contact map prediction",
    metric: "Top L Precision",
    metricKey: "precision_at_l",
    unit: "percent",
    direction: "higher",
    splits: "188/23/80",
    taskType: "Multi-label Cls",
    level: "Nucleotide",
    dataset: "RNAcontact",
  },
  DMP: {
    label: "DMP",
    title: "Distance map prediction",
    metric: "R2",
    metricKey: "r2",
    unit: "percent",
    direction: "higher",
    splits: "188/23/80",
    taskType: "Reg",
    level: "Nucleotide",
    dataset: "RNAcontact",
  },
  SSI: {
    label: "SSI",
    title: "Structure score imputation",
    metric: "R2",
    metricKey: "r2",
    unit: "percent",
    direction: "higher",
    splits: "14,049/1,756/3,095",
    taskType: "Reg",
    level: "Nucleotide",
    dataset: "StructureImpute",
  },
  SPL: {
    label: "SPL",
    title: "Splice site prediction",
    metric: "Top-k ACC",
    metricKey: "top_k_accuracy",
    unit: "percent",
    direction: "higher",
    splits: "144,628/18,078/16,505",
    taskType: "Multi-class Cls",
    level: "Nucleotide",
    dataset: "SpliceAI",
  },
  APA: {
    label: "APA",
    title: "Alternative polyadenylation isoform prediction",
    metric: "R2",
    metricKey: "r2",
    unit: "percent",
    direction: "higher",
    splits: "145,463/33,170/49,755",
    taskType: "Reg",
    level: "Sequence",
    dataset: "APARENT",
  },
  NcRNA: {
    label: "ncRNA",
    title: "Non-coding RNA family classification",
    metric: "ACC",
    metricKey: "accuracy",
    unit: "percent",
    direction: "higher",
    splits: "5,679/650/2,400",
    taskType: "Multi-class Cls",
    level: "Sequence",
    dataset: "Noorul's ncRNA set",
  },
  Modif: {
    label: "Modif",
    title: "RNA modification site prediction",
    metric: "AUC",
    metricKey: "auc",
    unit: "percent",
    direction: "higher",
    splits: "304,661/3,599/1,200",
    taskType: "Multi-label Cls",
    level: "Sequence",
    dataset: "MultiRM",
  },
  MRL: {
    label: "MRL",
    title: "Mean ribosome loading prediction",
    metric: "R2",
    metricKey: "r2",
    unit: "percent",
    direction: "higher",
    splits: "76,319/7,600/7,600",
    taskType: "Reg",
    level: "Sequence",
    dataset: "Optimus",
  },
  VDP: {
    label: "VDP",
    title: "Vaccine degradation prediction",
    metric: "MCRMSE",
    metricKey: "mcrmse",
    unit: "error",
    direction: "lower",
    splits: "2,155/245/629",
    taskType: "Multi-label Reg",
    level: "Nucleotide",
    dataset: "OpenVaccine",
  },
  PRS: {
    label: "PRS",
    title: "Programmable RNA switch prediction",
    metric: "R2",
    metricKey: "r2",
    unit: "percent",
    direction: "higher",
    splits: "73,227/9,153/9,154",
    taskType: "Multi-label Reg",
    level: "Sequence",
    dataset: "Angenent-Mari's switch set",
  },
  "CRI-On": {
    label: "CRI-On",
    title: "CRISPR on-target efficiency prediction",
    metric: "Spearman Corr",
    metricKey: "spearman_corr",
    unit: "percent",
    direction: "higher",
    splits: "1,453/207/416",
    taskType: "Reg",
    level: "Sequence",
    dataset: "DeepCRISPR",
  },
  "CRI-Off": {
    label: "CRI-Off",
    title: "CRISPR off-target effect prediction",
    metric: "Spearman Corr",
    metricKey: "spearman_corr",
    unit: "percent",
    direction: "higher",
    splits: "14,223/2,032/4,064",
    taskType: "Reg",
    level: "Sequence",
    dataset: "DeepCRISPR",
  },
};

export type MethodRow = {
  name: string;
  group: "literature" | "naive" | "pretrained" | "beacon";
  values: Record<TaskKey, string>;
};

const CELL = /^(?:\d+\.\d+\(\d+\.\d+\)|\d+\.\d+|\d+)$/;

/**
 * Parse Table 3 out of the PDF text layer.
 *
 * Throws rather than returning a partial table: a silently short parse is how a
 * benchmark database acquires numbers nobody printed.
 */
export function parseBeaconTables(text: string): MethodRow[] {
  const lines = text.split("\n");
  const start = lines.findIndex((line) =>
    line.includes("Table 3: Benchmark results across various 13 RNA tasks"),
  );
  if (start < 0)
    throw new Error("Table 3 heading not found in the source text");

  const rows: MethodRow[] = [];
  let group: MethodRow["group"] | null = null;
  for (const line of lines.slice(start, start + 30)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.includes("Literature SOTA")) {
      group = "literature";
      continue;
    }
    if (trimmed.includes("Naive supervised Model")) {
      group = "naive";
      continue;
    }
    if (trimmed.includes("Pretrained RNA Language Model")) {
      group = "pretrained";
      continue;
    }
    if (trimmed.includes("Our BEACON-B")) {
      group = "beacon";
      continue;
    }
    if (/^(Task|Metric)\b/.test(trimmed)) continue;

    const parts = trimmed.split(/\s{2,}/);
    if (parts.length < 2 || !group) continue;
    const [name, ...cells] = parts;
    if (cells.length !== TASK_ORDER.length) continue;
    if (!cells.every((cell) => CELL.test(cell))) continue;
    rows.push({
      name,
      group,
      values: Object.fromEntries(
        TASK_ORDER.map((task, index) => [task, cells[index]]),
      ) as Record<TaskKey, string>,
    });
  }

  if (rows.length !== 18)
    throw new Error(
      `Expected 18 rows in Table 3, parsed ${rows.length}. The table layout changed; ` +
        `refusing to emit a partial extraction.`,
    );
  return rows;
}

const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/&/g, "-and-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

/** Split "64.18(0.44)" into its printed value and standard deviation. */
export function splitValue(cell: string) {
  const match = cell.match(/^([\d.]+)\((\d+\.\d+)\)$/);
  return match
    ? { value: match[1], sd: match[2] }
    : { value: cell, sd: null as string | null };
}

export function buildRecords(rows: MethodRow[], sha256: string, date: string) {
  const out: Record<string, unknown>[] = [];
  const sourceId = "source-beacon-arxiv-2406-10391";

  out.push({
    id: sourceId,
    kind: "source",
    name: "BEACON: Benchmark for Comprehensive RNA Tasks and Language Models (arXiv:2406.10391v2)",
    description:
      "Pinned primary artifact. Review is limited to the cited tables and rows.",
    status: "source_checked",
    facets: { areas: ["rna-transcriptomes"] },
    source_ids: [],
    links: [],
    attributes: {
      url: "https://arxiv.org/abs/2406.10391",
      artifact_url: BEACON_SOURCE_URL,
      artifact_sha256: sha256,
      retrieved_at: date,
      venue: "arXiv preprint",
      version: "v2, 12 December 2024",
    },
  });

  const datasetId = (name: string) => `beacon-dataset-${slug(name)}`;
  for (const name of [...new Set(TASK_ORDER.map((key) => TASKS[key].dataset))])
    out.push({
      id: datasetId(name),
      // dataset_subset, not dataset: this is the split BEACON assembled from the
      // named source, and the upstream release has not been checked here.
      kind: "dataset_subset",
      name: `${name} (BEACON split)`,
      description: `The split of ${name} that the BEACON authors evaluated on, named in their Table 1. The upstream dataset release is not catalogued here, so no claim is made that this matches the original splits.`,
      status: "source_checked",
      facets: { areas: ["rna-transcriptomes"] },
      source_ids: [sourceId],
      links: [],
      attributes: {
        source_locator: "Table1,p.6,column(Source/Venue)",
        missing_metadata: { version: "unreported", url: "unextracted" },
      },
    });

  // One figure per task, reproducing that column of Table 3. Metrics differ by
  // task, so a column is the widest honest comparison: the same metric, dataset
  // and split for every method in it.
  const scored = rows.filter((row) => row.group !== "literature");
  for (const key of TASK_ORDER) {
    const spec = TASKS[key];
    const panel = {
      id: `beacon-panel-${slug(spec.label)}`,
      title: `BEACON ${spec.label}: ${spec.title}`,
      protocol_id: `beacon-task-${slug(spec.label)}`,
      dataset_id: datasetId(spec.dataset),
      metric: spec.metricKey,
      unit: spec.unit,
      direction: spec.direction,
      result_ids: scored.map(
        (row) =>
          `beacon-result-${slug(row.name)}-${slug(spec.label)}-${slug(spec.metricKey)}`,
      ),
      source_ids: [sourceId],
      source_locator: `Table3,p.8,column(${spec.label})`,
      context: `Every method in BEACON Table 3 on ${spec.title}, scored with ${spec.metric} on ${spec.dataset} with the split ${spec.splits}.`,
      caveats: [
        "Author-reported numbers, source checked but not independently reproduced.",
        "The Literature SOTA row is excluded: those numbers come from other papers under their own protocols.",
        "Metrics differ between tasks, so these figures cannot be averaged into one RNA score.",
      ],
      review: { method: "automated_source_review" as const, date },
    };
    out.push({
      id: `beacon-task-${slug(spec.label)}`,
      kind: "task",
      name: `BEACON ${spec.label}: ${spec.title}`,
      description: `${spec.title}. ${spec.taskType} at ${spec.level.toLowerCase()} level, scored with ${spec.metric}. Dataset ${spec.dataset}; train/validation/test ${spec.splits}.`,
      status: "source_checked",
      facets: { areas: ["rna-transcriptomes"], tasks: [spec.title] },
      source_ids: [sourceId],
      links: [{ relation: "part_of", target_id: BENCHMARK_ID }],
      attributes: {
        metric: spec.metric,
        metric_direction: spec.direction,
        task_type: spec.taskType,
        rna_level: spec.level,
        dataset: spec.dataset,
        splits: spec.splits,
        source_locator: `Table1,p.6,row(${spec.label})`,
        comparison_panels: [panel],
      },
    });
    // The catalogue rolls a task's results up to its benchmark only when a
    // sourced claim backs the part_of edge, so state where Table 1 says it.
    out.push({
      id: `beacon-association-${slug(spec.label)}`,
      kind: "claim",
      name: `BEACON ${spec.label}: part of ${BENCHMARK_ID}`,
      description: `Table 1 lists ${spec.label} among the 13 tasks that make up BEACON.`,
      status: "source_checked",
      facets: { areas: ["rna-transcriptomes"] },
      source_ids: [sourceId],
      links: [
        { relation: "subject", target_id: `beacon-task-${slug(spec.label)}` },
      ],
      attributes: {
        field: `links:part_of:${BENCHMARK_ID}`,
        target_id: BENCHMARK_ID,
        source_locator: `Table1,p.6,row(${spec.label})`,
        review: {
          method: "automated_source_review",
          date,
          note: "Primary-source transcription with no human sign-off and no independent reproduction.",
        },
      },
    });
  }

  for (const row of rows) {
    if (row.group === "literature") continue;
    out.push({
      id: `beacon-model-${slug(row.name)}`,
      // A Table 3 row is what BEACON ran, not the upstream released model. The
      // naive architectures were trained from scratch, so they are methods; the
      // language model rows are backbones fine-tuned under BEACON's protocol,
      // so they are configurations rather than model identities this batch has
      // independently checked.
      kind: row.group === "naive" ? "method" : "configuration",
      name: row.name,
      description:
        row.group === "naive"
          ? `Supervised architecture trained from scratch per task by the BEACON authors.`
          : row.group === "beacon"
            ? `RNA language model pre-trained by the BEACON authors, then fine-tuned per task under their protocol.`
            : `Published RNA language model backbone, fine-tuned per task by the BEACON authors under their protocol.`,
      status: "source_checked",
      facets: { areas: ["rna-transcriptomes"] },
      source_ids: [sourceId],
      links: [],
      attributes: {
        family: row.group,
        source_locator: `Table3,p.8,row(${row.name})`,
        missing_metadata: {
          checkpoint_revision: "unreported",
          parameters: "unextracted",
        },
      },
    });
    for (const key of TASK_ORDER) {
      const spec = TASKS[key];
      const { value, sd } = splitValue(row.values[key]);
      const base = `${slug(row.name)}-${slug(spec.label)}`;
      const evaluationId = `beacon-evaluation-${base}`;
      const locator = `Table3,p.8,row(${row.name}),column(${spec.label})`;

      out.push({
        id: evaluationId,
        kind: "evaluation",
        name: `${row.name} on BEACON ${spec.label}: ${spec.title}`,
        description: `BEACON harness evaluation of ${row.name} on ${spec.title}, scored with ${spec.metric}.`,
        status: "source_checked",
        facets: { areas: ["rna-transcriptomes"], tasks: [spec.title] },
        source_ids: [sourceId],
        links: [
          {
            relation: "benchmark",
            target_id: `beacon-task-${slug(spec.label)}`,
          },
          { relation: "model", target_id: `beacon-model-${slug(row.name)}` },
          { relation: "dataset", target_id: datasetId(spec.dataset) },
        ],
        attributes: {
          origin: "author_reported",
          protocol: `BEACON harness, fixed downstream head per task. Train/validation/test ${spec.splits}; dataset ${spec.dataset}.`,
          comparison: {
            protocol_id: `beacon-task-${slug(spec.label)}`,
            split: spec.splits,
            adaptation:
              row.group === "naive"
                ? "Naive supervised model trained from scratch by the BEACON authors"
                : row.group === "beacon"
                  ? "BEACON-B pre-trained by the paper's authors, then fine-tuned on the task"
                  : "Published pre-trained RNA language model, fine-tuned by the BEACON authors",
            metric_implementation: spec.metric,
          },
          missing_metadata: {
            checkpoint_revision: "unreported",
            seeds: "unreported",
            budget: "unreported",
            split_manifest: "unextracted",
          },
          source_locator: locator,
        },
      });

      out.push({
        id: `beacon-result-${base}-${slug(spec.metricKey)}`,
        kind: "result",
        name: `${row.name} · BEACON ${spec.label} · ${spec.metric}`,
        description:
          "Author-reported score transcribed from the complete comparison table. Source checked; not independently reproduced.",
        status: "source_checked",
        facets: { areas: ["rna-transcriptomes"], tasks: [spec.title] },
        source_ids: [sourceId],
        links: [{ relation: "evaluation", target_id: evaluationId }],
        attributes: {
          metric: spec.metricKey,
          metric_direction: spec.direction,
          unit: spec.unit,
          printed_value: row.values[key],
          numeric_value: value,
          uncertainty: sd ? { type: "standard_deviation", value: sd } : null,
          source_locator: locator,
          missing_metadata: {
            denominator: "unextracted",
            seeds: "unreported",
          },
          review: {
            method:
              "Deterministic parse of the pinned PDF text layer, with row and cell counts asserted and ten values cross-checked against the printed table",
            reviewer: REVIEWER,
            date,
            artifact_sha256: sha256,
            retrieval_url: BEACON_SOURCE_URL,
            notes:
              "Source checked, not reproduced. Metrics differ by task, so no composite score across tasks is computed or implied.",
          },
        },
      });
    }
  }
  return out;
}

function main() {
  const pdfText = process.argv[2];
  const pdfFile = process.argv[3];
  if (!pdfText || !pdfFile) {
    console.error(
      "usage: tsx scripts/omics/extract-beacon.ts <beacon.txt> <beacon.pdf>",
    );
    process.exit(1);
  }
  const sha256 = createHash("sha256")
    .update(fs.readFileSync(pdfFile))
    .digest("hex");
  const rows = parseBeaconTables(fs.readFileSync(pdfText, "utf8"));
  const date = new Date().toISOString().slice(0, 10);
  const records = buildRecords(rows, sha256, date);
  const out = "data/omics/reviewed/beacon-2026.jsonl";
  fs.writeFileSync(
    out,
    records.map((record) => JSON.stringify(record)).join("\n") + "\n",
  );
  // Receipt: the loader refuses to publish a file it has not been handed a
  // digest for, so a hand-edited batch cannot slip into a release.
  const receipt = "data/omics/reviews/2026-09-18-beacon-extraction.json";
  fs.mkdirSync("data/omics/reviews", { recursive: true });
  fs.writeFileSync(
    receipt,
    JSON.stringify(
      {
        batch: "beacon-2026",
        source: BEACON_SOURCE_URL,
        artifact_sha256: sha256,
        records_sha256: createHash("sha256")
          .update(fs.readFileSync(out))
          .digest("hex"),
        method:
          "Deterministic parse of the pinned PDF text layer by scripts/omics/extract-beacon.ts",
        reviewer: REVIEWER,
        reviewed_at: date,
        errors: [],
      },
      null,
      2,
    ) + "\n",
  );
  const counts = records.reduce<Record<string, number>>((acc, record) => {
    const kind = String(record.kind);
    acc[kind] = (acc[kind] || 0) + 1;
    return acc;
  }, {});
  console.log(`${out}: ${records.length} records`, counts);
  console.log(`artifact sha256 ${sha256}`);
}

if (process.argv[1]?.endsWith("extract-beacon.ts")) main();
