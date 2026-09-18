import fs from "node:fs";
import crypto from "node:crypto";
import {
  parseCsv,
  validateLiterature,
  type LiteraturePaper,
  type LiteratureResult,
} from "../../lib/benchmark-literature";
import { MODELS, TESTS, MATCHES } from "../../lib/benchmark-catalog";
import { validateRecords, type RecordEntry } from "./schema";
// This migration reconstructs the historical import, not the latest release.
const DATE = JSON.parse(
  fs.readFileSync("data/omics/releases/2026-09-16-b5213be10a49.json", "utf8"),
).released_at;
const hash = (s: string) =>
  crypto.createHash("sha256").update(s).digest("hex").slice(0, 14);
const papers: LiteraturePaper[] = JSON.parse(
  fs.readFileSync("data/benchmark-literature/papers.json", "utf8"),
);
const csv = parseCsv(
  fs.readFileSync("data/benchmark-literature/results.csv", "utf8"),
);
const columns = csv.shift()!;
const results = csv.map((r) =>
  Object.fromEntries(columns.map((k, i) => [k, r[i]])),
) as unknown as LiteratureResult[];
validateLiterature(papers, results);
type Review = {
  status?: string;
  printed_value?: string;
  source_locator?: string;
  source_url?: string;
  method?: string;
  reviewer?: string;
  reviewed_at?: string;
  notes?: string;
  paper_id?: string;
  artifact_sha256?: string;
  retrieval_url?: string;
  evidence?: string;
  table_rows?: string[][];
};
const reviews = new Map<string, Review>(
  fs.existsSync("data/omics/legacy-review.jsonl")
    ? fs
        .readFileSync("data/omics/legacy-review.jsonl", "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((x) => {
          const r = JSON.parse(x);
          return [r.id, r];
        })
    : [],
);
// Apply later reviews last, independently of filename order. Each override is
// tied to the original fetched artifact when that artifact was available.
const manualReviews = fs
  .readdirSync("data/omics")
  .filter((f) => f.startsWith("legacy-manual-") && f.endsWith(".jsonl"))
  .sort()
  .flatMap((file) =>
    fs
      .readFileSync("data/omics/" + file, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line)),
  )
  .sort((a, b) => Date.parse(a.reviewed_at) - Date.parse(b.reviewed_at));
const originalReviews = new Map(reviews);
for (const r of manualReviews) {
  const original = originalReviews.get(r.id);
  if (
    !original ||
    (original.artifact_sha256 && original.artifact_sha256 !== r.artifact_sha256)
  )
    throw new Error("Manual review artifact mismatch " + r.id);
  reviews.set(r.id, { ...reviews.get(r.id), ...r });
}
const exclusions: Record<string, string> = {
  "kidney-cell-segmentation-2025":
    "Standalone kidney pathology cell segmentation, without an omics or molecular prediction endpoint.",
  "anndictionary-2025":
    "General-purpose language-model annotation via textual prompts; outside specialist biological-model catalogue.",
  "llm-cell-identification-2025":
    "General-purpose language-model identifier evaluated through textual annotation rather than a specialist biological model.",
};
const records = new Map<string, RecordEntry>();
function add(r: RecordEntry) {
  if (
    records.has(r.id) &&
    JSON.stringify(records.get(r.id)) !== JSON.stringify(r)
  )
    throw new Error(`Conflicting migration ${r.id}`);
  records.set(r.id, r);
  return r.id;
}
function record(
  id: string,
  kind: RecordEntry["kind"],
  name: string,
  source_ids: string[],
  attributes: Record<string, unknown>,
  links: RecordEntry["links"] = [],
  facets: RecordEntry["facets"] = {},
  status: RecordEntry["status"] = "needs_review",
  description = "",
) {
  return add({
    id,
    kind,
    name,
    description,
    status,
    facets,
    source_ids,
    links,
    attributes,
  });
}
const missing = (pairs: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(pairs)
      .filter(([, v]) => v === null || v === "")
      .map(([k]) => [k, "not_reported_in_legacy_extract"]),
  );
const scope = papers.map((p) => ({
  paper_id: p.id,
  decision: exclusions[p.id] ? "excluded" : "included",
  reason:
    exclusions[p.id] ||
    "Biological sequence, molecular, microbial or omics task; model architecture alone does not exclude a specialist biological pipeline.",
  reviewed_at: DATE,
  reviewer: "Codex scope review; not a scientific validation",
}));
for (const p of papers) {
  const rev = [...reviews.values()].find(
    (r) => r.paper_id === p.id && r.artifact_sha256,
  );
  record(
    p.id,
    "source",
    p.title,
    [],
    {
      url: p.source_url,
      version: p.version,
      retrieved_at: p.retrieved_utc,
      doi: p.doi ?? null,
      publication_status: p.publication_status,
      year: p.year,
      artifact_sha256: rev?.artifact_sha256 ?? null,
      artifact_url: rev?.retrieval_url ?? rev?.source_url ?? null,
      artifact_retrieved_at: rev?.reviewed_at ?? null,
      legacy_paper: p,
      scope_decision: exclusions[p.id] ?? "included",
      missing_metadata: missing({ licence: null }),
    },
    [],
    { areas: [p.primary_domain] },
    exclusions[p.id] ? "excluded" : "discovered",
    "Primary paper retained with its original identifier. Metadata inherited from the literature collection; individual result checks are separate.",
  );
}
for (const r of results) {
  const status = exclusions[r.paper_id]
    ? "excluded"
    : ["source_checked", "disputed", "superseded"].includes(
          reviews.get(r.id)?.status ?? "",
        )
      ? (reviews.get(r.id)!.status as string)
      : "needs_review";
  const f = { areas: [r.domain_id], tasks: [r.task] };
  const mid =
    "reported-model-" + hash([r.paper_id, r.model, r.model_version].join("|"));
  const did =
    "reported-dataset-" +
    hash([r.paper_id, r.dataset, r.dataset_version, r.split].join("|"));
  const bid =
    "reported-task-" + hash([r.paper_id, r.task, r.dataset, r.split].join("|"));
  const eid = "evaluation-" + r.id;
  record(
    mid,
    "model",
    r.model,
    [r.paper_id],
    {
      entity_level: "method",
      version: r.model_version || null,
      reported_name: r.model,
      missing_metadata: missing({
        version: r.model_version,
        checkpoint_revision: null,
        training_data: null,
        licence: null,
      }),
    },
    [],
    { areas: [r.domain_id] },
    exclusions[r.paper_id] ? "excluded" : "needs_review",
    "Identity as reported in this paper. Unspecified versions are not assumed equivalent to other papers.",
  );
  record(
    did,
    "dataset",
    r.dataset,
    [r.paper_id],
    {
      version: r.dataset_version || null,
      split: r.split || null,
      missing_metadata: missing({
        version: r.dataset_version,
        split: r.split,
        accession: null,
      }),
    },
    [],
    { areas: [r.domain_id] },
    exclusions[r.paper_id] ? "excluded" : "needs_review",
  );
  record(
    bid,
    "benchmark",
    r.task,
    [r.paper_id],
    {
      entity_level: "task",
      version: null,
      task: r.task,
      scope_note:
        "Paper-specific evaluation task; protocol completeness requires further extraction.",
      missing_metadata: missing({ protocol_version: null, split: r.split }),
    },
    [{ relation: "dataset", target_id: did }],
    f,
    exclusions[r.paper_id] ? "excluded" : "needs_review",
  );
  record(
    eid,
    "evaluation",
    `${r.model}: ${r.task}`,
    [r.paper_id],
    {
      origin: r.evaluation_origin,
      protocol: r.protocol,
      version: r.model_version || null,
      comparison: {
        protocol_id: null,
        dataset_version: r.dataset_version || null,
        split: r.split || null,
        population: null,
        inputs: null,
        adaptation: null,
        metric_implementation: null,
        aggregation: null,
        budget: null,
      },
      missing_metadata: missing({
        model_version: r.model_version,
        dataset_version: r.dataset_version,
        split: r.split,
        original_evaluation:
          r.evaluation_origin === "paper_compilation" ? null : "not_applicable",
      }),
    },
    [
      { relation: "model", target_id: mid },
      { relation: "benchmark", target_id: bid },
      { relation: "dataset", target_id: did },
    ],
    f,
    exclusions[r.paper_id] ? "excluded" : "needs_review",
  );
  const rev = reviews.get(r.id);
  record(
    r.id,
    "result",
    `${r.model} · ${r.metric} · ${r.dataset}`,
    [r.paper_id],
    {
      printed_value: rev?.printed_value ?? r.value,
      numeric_value: r.value,
      metric: r.metric,
      metric_direction: "unknown",
      unit: r.unit,
      uncertainty: r.uncertainty || null,
      source_locator: rev?.source_locator ?? r.source_locator,
      review: rev
        ? {
            method: rev.method,
            reviewer: rev.reviewer,
            reviewed_at: rev.reviewed_at,
            notes: rev.notes,
            evidence: rev.evidence,
            artifact_sha256: rev.artifact_sha256,
            retrieval_url: rev.retrieval_url ?? rev.source_url ?? null,
          }
        : {
            method: "legacy_review_not_repeated",
            reviewer: "legacy collection",
            reviewed_at: r.reviewed_utc,
            notes: "Preserved historical value; pending fresh source check.",
          },
      legacy_id: r.id,
      legacy_row: r,
      missing_metadata: missing({
        model_version: r.model_version,
        dataset_version: r.dataset_version,
        split: r.split,
        uncertainty: r.uncertainty,
      }),
    },
    [{ relation: "evaluation", target_id: eid }],
    f,
    status as RecordEntry["status"],
  );
  if (status === "source_checked")
    record(
      "claim-" + r.id,
      "claim",
      `Reported ${r.metric} for ${r.model}`,
      [r.paper_id],
      {
        field: "attributes.printed_value",
        value: rev?.printed_value ?? r.value,
        source_locator: rev?.source_locator ?? r.source_locator,
        review: {
          method: rev?.method,
          reviewer: rev?.reviewer,
          reviewed_at: rev?.reviewed_at,
          notes: rev?.notes,
        },
      },
      [{ relation: "subject", target_id: r.id }],
      f,
      "source_checked",
    );
}
for (const m of MODELS) {
  const sid = "catalog-source-" + m.id;
  record(
    sid,
    "source",
    `${m.name} official resource`,
    [],
    {
      url: m.sourceUrl,
      version: null,
      missing_metadata: { version: "not_pinned_in_legacy_catalogue" },
      retrieved_at: DATE,
    },
    [],
    {},
    "discovered",
  );
  record(
    "catalog-model-" + m.id,
    "model",
    m.name,
    [sid],
    {
      entity_level: "family",
      version: m.version,
      reported_name: m.name,
      access: m.access,
      method_type: m.kind,
      missing_metadata: {
        checkpoint_revision: "not_yet_extracted",
        training_data: "not_yet_extracted",
        licence: "not_yet_extracted",
      },
    },
    [],
    { areas: [...m.domainIds], method_types: [m.kind] },
    "discovered",
    "Existing candidate catalogue entry; exact checkpoint and metadata require primary-source review.",
  );
}
for (const t of TESTS) {
  const matches = MATCHES.filter((m) => m.testId === t.id);
  record(
    "catalog-task-" + t.id,
    "benchmark",
    t.name,
    matches.map((m) => "catalog-source-" + m.modelId),
    {
      entity_level: "task",
      version: null,
      task: t.name,
      scope_note: t.note,
      missing_metadata: { protocol_version: "not_yet_extracted" },
    },
    [],
    { areas: [t.domainId] },
    "discovered",
  );
}
for (const m of MODELS.filter((m) => m.kind === "baseline"))
  record(
    "catalog-baseline-" + m.id,
    "baseline",
    m.name,
    ["catalog-source-" + m.id],
    {
      baseline_type: "established_method",
      applicability: "proposed",
      requirements: m.access,
      missing_metadata: { exact_protocol: "not_yet_extracted" },
    },
    [
      { relation: "model", target_id: "catalog-model-" + m.id },
      ...MATCHES.filter((x) => x.modelId === m.id).map((x) => ({
        relation: "applicable_to",
        target_id: "catalog-task-" + x.testId,
      })),
    ],
    { areas: [...m.domainIds] },
    "discovered",
  );
// Preserve the existing documented own-run history. No new model inference takes place.
const own = JSON.parse(
  fs.readFileSync("data/benchmark-runs/mfass-v2.json", "utf8"),
);
const sid = "rewire-mfass-v2-source";
record(
  sid,
  "source",
  "MFASS v2 pinned rewire artifacts",
  [],
  {
    url: own.benchmark_repo_url + "/tree/" + own.source_revision,
    version: own.source_revision,
    retrieved_at: DATE,
    artifact_sha256: crypto
      .createHash("sha256")
      .update(fs.readFileSync("data/benchmark-runs/mfass-v2.json"))
      .digest("hex"),
  },
  [],
  {},
  "source_checked",
);
record(
  "rewire-mfass-v1",
  "benchmark",
  "MFASS v1 (superseded)",
  [sid],
  {
    entity_level: "protocol",
    version: "v1",
    task: "Splice-variant prioritisation",
    scope_note: own.correction,
    missing_metadata: {},
  },
  [],
  { areas: ["dna-genomes"] },
  "superseded",
  own.correction,
);
record(
  "rewire-mfass-v2",
  "benchmark",
  "MFASS v2",
  [sid],
  {
    entity_level: "protocol",
    version: own.source_revision,
    task: "Splice-variant prioritisation",
    scope_note: own.correction,
    missing_metadata: {},
  },
  [{ relation: "supersedes", target_id: "rewire-mfass-v1" }],
  { areas: ["dna-genomes"] },
  "source_checked",
);
record(
  "rewire-mfass-v2-dataset",
  "dataset",
  "MFASS v2 eligible assay cohort",
  [sid],
  {
    version: own.source_revision,
    split: "split-v2.tsv",
    cohort_variants: own.cohort_variants,
    train_variants: own.train_variants,
    test_variants: own.test_variants,
    test_positives: own.test_positives,
    independent_test_groups: own.independent_test_groups,
    missing_metadata: {},
  },
  [],
  { areas: ["dna-genomes"] },
  "source_checked",
);
for (const m of own.methods) {
  const mid = "rewire-model-" + m.id.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    eid = "rewire-evaluation-" + m.id.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  record(
    mid,
    "model",
    m.name,
    [sid],
    {
      entity_level: "method",
      version: own.source_revision,
      reported_name: m.name,
      missing_metadata: {},
    },
    [],
    { areas: ["dna-genomes"] },
    "source_checked",
  );
  record(
    eid,
    "evaluation",
    m.name + " on MFASS v2",
    [sid],
    {
      origin: "rewire_run",
      protocol: m.protocol,
      version: own.source_revision,
      run_url: "/benchmarks/runs/mfass-v2/",
      comparison: {
        protocol_id: "mfass-v2",
        dataset_version: own.source_revision,
        split: "split-v2.tsv",
        population: m.coverage,
        inputs: null,
        adaptation: null,
        metric_implementation: null,
        aggregation: null,
        budget: null,
      },
      coverage: m.coverage,
      missing_metadata: {
        paired_comparison:
          "Refer to paired bootstrap artifacts; marginal scores are not paired comparisons.",
      },
    },
    [
      { relation: "model", target_id: mid },
      { relation: "benchmark", target_id: "rewire-mfass-v2" },
      { relation: "dataset", target_id: "rewire-mfass-v2-dataset" },
    ],
    { areas: ["dna-genomes"] },
    "reproduced",
  );
  for (const metric of ["precision_at_100", "average_precision", "auroc"])
    record(
      "rewire-result-" +
        m.id.toLowerCase().replace(/[^a-z0-9]+/g, "-") +
        "-" +
        metric.replace(/_/g, "-"),
      "result",
      `${m.name} · ${metric}`,
      [sid],
      {
        printed_value: String(m[metric]),
        numeric_value: String(m[metric]),
        metric,
        metric_direction: "higher",
        unit: "fraction",
        uncertainty: null,
        source_locator: m.result_file + " :: " + metric,
        review: {
          method: "existing_run_import",
          reviewer: "rewire documented MFASS v2 run",
          reviewed_at: DATE,
          notes:
            "Imported existing documented own-run record, not a newly executed reproduction.",
        },
        coverage: m.coverage,
        missing_metadata: {
          uncertainty: "Point estimate; see paired-comparison artifacts.",
        },
      },
      [{ relation: "evaluation", target_id: eid }],
      { areas: ["dna-genomes"] },
      "reproduced",
    );
}
const output = validateRecords([...records.values()]).sort((a, b) =>
  a.id.localeCompare(b.id),
);
fs.mkdirSync("data/omics", { recursive: true });
fs.writeFileSync(
  "data/omics/migrated.jsonl",
  output.map((r) => JSON.stringify(r)).join("\n") + "\n",
);
fs.writeFileSync(
  "data/omics/scope-audit.jsonl",
  scope.map((r) => JSON.stringify(r)).join("\n") + "\n",
);
console.log(
  `Migrated ${papers.length} source papers, ${results.length} unchanged result rows, ${Object.keys(exclusions).length} scoped exclusions, ${output.length} records.`,
);
