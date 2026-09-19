/** Build versioned source-scoped records from independently checked acquisition cells. */
import fs from "node:fs";
import { createHash } from "node:crypto";
import { slug } from "../extract/batch";
import type { RecordEntry } from "../schema";
const root = "data/omics/acquisition/2026-09-19";
const sha = (v: string) => createHash("sha256").update(v).digest("hex");
const id = (kind: string, value: unknown) =>
  `acquired-${kind}-${sha(JSON.stringify(value)).slice(0, 20)}`;
const read = (p: string) =>
  fs
    .readFileSync(p, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
const current = JSON.parse(
  fs.readFileSync("public/omics/catalogue.json", "utf8"),
).records as RecordEntry[];
const existing = new Map(current.map((r) => [r.id, r]));
const records = new Map<string, RecordEntry>();
const decisions: any[] = [];
const scopeReview = JSON.parse(
  fs.readFileSync(
    `${root}/challenges/proteins-independent-review.json`,
    "utf8",
  ),
);
const proteinAccepted = new Set(scopeReview.accepted_candidate_ids);
if (
  scopeReview.input_candidates_sha256 !==
  sha(fs.readFileSync(`${root}/proteins/candidates.jsonl`, "utf8"))
)
  throw Error("Protein review hash mismatch");
const challengeReview = JSON.parse(
  fs.readFileSync(
    `${root}/cells-networks/challenges-independent-review.json`,
    "utf8",
  ),
);
if (
  challengeReview.candidate_sha256 !==
    sha(fs.readFileSync(`${root}/challenges/candidates.jsonl`, "utf8")) ||
  challengeReview.issues.length
)
  throw Error("Challenge review hash mismatch or unresolved errors");
const cellsReview = JSON.parse(
  fs.readFileSync(`${root}/cells-networks/verification-receipt.json`, "utf8"),
);
if (
  cellsReview.candidate_file_sha256 !==
  sha(fs.readFileSync(`${root}/cells-networks/candidates.jsonl`, "utf8"))
)
  throw Error("Cells review hash mismatch");
const all = [
  ...read(`${root}/proteins/candidates.jsonl`).map((c) => ({
    ...c,
    lane: "proteins",
  })),
  ...read(`${root}/challenges/candidates.jsonl`).map((c) => ({
    ...c,
    lane: "challenges",
  })),
  ...read(`${root}/cells-networks/candidates.jsonl`).map((c) => ({
    ...c,
    lane: "cells-networks",
  })),
];
const checkedSource = new Map<string, string>();
const sourceManifest = new Map(
  read(`${root}/challenges/sources.jsonl`).map((s) => [s.id, s]),
);
function put(r: RecordEntry) {
  const old = records.get(r.id);
  if (old && JSON.stringify(old) !== JSON.stringify(r))
    throw Error(`Record collision ${r.id}`);
  records.set(r.id, r);
  return r;
}
function source(c: any) {
  const key = c.source_id
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-");
  const old = existing.get(key);
  if (
    old?.kind === "source" &&
    old.attributes.artifact_sha256 === c.artifact_sha256
  )
    return key;
  const manifest = sourceManifest.get(c.source_id);
  const sid = id("source", [c.source_url, c.artifact_sha256]);
  if (!records.has(sid))
    put({
      id: sid,
      kind: "source",
      name: `${existing.get(c.benchmark_id)?.name || c.benchmark_id}: ${c.source_version}`,
      description:
        "Primary source artifact; cited cells checked separately from scientific interpretation.",
      status: "source_checked",
      facets: {},
      source_ids: [],
      links: [],
      attributes: {
        url: c.source_url,
        artifact_url: c.artifact_url || c.source_url,
        version: c.source_version,
        retrieved_at: "2026-09-19",
        artifact_sha256: c.artifact_sha256,
        hash_scope: manifest?.archive_member
          ? "SHA-256 of the named archive member; archive SHA-256 recorded separately"
          : "Exact downloaded bytes, before optional gzip storage",
        ...(manifest?.archive_member
          ? {
              artifact_member: manifest.archive_member,
              archive_sha256: manifest.archive_sha256,
            }
          : {}),
        access_and_reuse:
          "See original publisher or repository; no blanket licence inferred.",
      },
    });
  return sid;
}
const groups = new Map<
  string,
  { protocol: RecordEntry; datasetId: string; rows: any[] }
>();
for (const c of all) {
  let reason = "accepted source transcription with stated limitations";
  if (c.benchmark_id.includes("petab"))
    reason =
      "quarantined: unresolved timing units, software identity and experimental scope";
  else if (c.lane === "proteins" && !proteinAccepted.has(c.candidate_id))
    reason = "quarantined: conflicting detailed and summary table";
  else if (c.numeric_value === null || !Number.isFinite(c.numeric_value))
    reason =
      "explicit missing or inapplicable source cell, not a numerical result";
  const accept = reason.startsWith("accepted");
  decisions.push({
    candidate_id: c.candidate_id,
    benchmark_id: c.benchmark_id,
    accepted: accept,
    reason,
    source_locator: c.source_locator,
    artifact_sha256: c.artifact_sha256,
  });
  if (!accept) continue;
  const sid = source(c);
  checkedSource.set(c.candidate_id, sid);
  let stratum = "";
  if (c.benchmark_id.includes("plinder"))
    stratum = /vina/i.test(c.model_or_submission)
      ? "docking with ground-truth-centred search box"
      : /diffdock/i.test(c.model_or_submission)
        ? "rigid-receptor docking"
        : "co-folding";
  if (c.benchmark_id.includes("beeline"))
    stratum = JSON.stringify({
      reference_network: c.conditions?.reference_network,
      gene_selection: c.conditions?.gene_selection,
    });
  const scope = [c.benchmark_id, c.source_id, c.protocol, c.dataset, stratum];
  const pid = id("protocol", scope),
    did = id("dataset", [c.source_id, c.dataset]);
  if (!records.has(did))
    put({
      id: did,
      kind: "dataset_subset",
      name: c.dataset,
      description: `Source-defined subset: ${c.dataset}. Exact membership and scoring coverage remain as reported in the cited artifact.`,
      status: "discovered",
      facets: {},
      source_ids: [sid],
      links: [],
      attributes: {
        source_locator: c.source_locator,
        missing_metadata: { split_manifest: "unextracted" },
      },
    });
  if (!groups.has(pid)) {
    const protocol: RecordEntry = {
      id: pid,
      kind: "protocol",
      name: `${c.protocol} · ${c.dataset}${stratum ? ` · ${stratum}` : ""}`,
      description: `Source-specific evaluation. ${stratum ? `Input conditions: ${stratum}. ` : ""}No equivalence to other releases, protocols or model families is inferred.`,
      status: "discovered",
      facets: {},
      source_ids: [sid],
      links: [{ relation: "part_of", target_id: c.benchmark_id }],
      attributes: {
        source_locator: c.source_locator,
        procedure: c.protocol,
        comparison_panels: [],
        scope_limitations:
          c.conditions?.notes ||
          "Exact source-defined evaluation scope; reported scores are not rewire reproductions.",
      },
    };
    put(protocol);
    put({
      id: id("membership", pid),
      kind: "claim",
      name: `${c.protocol}: benchmark membership`,
      description:
        "The cited source identifies this evaluation with the named benchmark.",
      status: "source_checked",
      facets: {},
      source_ids: [sid],
      links: [{ relation: "subject", target_id: pid }],
      attributes: {
        field: `links:part_of:${c.benchmark_id}`,
        target_id: c.benchmark_id,
        source_locator: c.source_locator,
        review: { method: "ai_assisted_source_review", date: "2026-09-19" },
      },
    });
    groups.set(pid, { protocol, datasetId: did, rows: [] });
  }
  const config = [
    c.source_id,
    c.model_or_submission,
    c.conditions?.features,
    c.conditions?.scaling,
    c.conditions?.configuration,
  ];
  const mid = id("configuration", config);
  if (!records.has(mid))
    put({
      id: mid,
      kind: /gold standard/i.test(c.model_or_submission)
        ? "method"
        : "configuration",
      name: `${c.model_or_submission}${c.conditions?.features ? ` · ${c.conditions.features}, ${c.conditions.scaling}` : ""}`,
      description: /gold standard/i.test(c.model_or_submission)
        ? "Gold-standard reference output supplied by the assessment. This is an experimental reference, not a competing predictive model."
        : "Exact source-reported configuration or submission label. Family membership, checkpoint identity and aliases have not been inferred.",
      status: "discovered",
      facets: {},
      source_ids: [sid],
      links: [],
      attributes: {
        source_locator: c.source_locator,
        reported_configuration:
          c.conditions?.configuration ?? c.model_or_submission,
        reference_kind: /gold standard/i.test(c.model_or_submission)
          ? "gold_standard_reference"
          : "not_a_reference",
        missing_metadata: {
          checkpoint_revision: "unreported",
          model_family: "unextracted",
        },
      },
    });
  const eid = id("evaluation", [pid, mid]);
  if (!records.has(eid))
    put({
      id: eid,
      kind: "evaluation",
      name: `${c.model_or_submission} · ${c.protocol} · ${c.dataset}`,
      description: `${c.protocol}; ${c.dataset}. Source checked, not independently reproduced.`,
      status: "discovered",
      facets: {},
      source_ids: [sid],
      links: [
        { relation: "model", target_id: mid },
        { relation: "benchmark", target_id: pid },
        { relation: "dataset", target_id: did },
      ],
      attributes: {
        origin: c.evidence_origin?.includes("independent")
          ? "independent_paper"
          : "author_reported",
        protocol: c.protocol,
        source_locator: c.source_locator,
        conditions: Object.fromEntries(
          Object.entries(c.conditions || {}).filter(
            ([k]) =>
              !["aggregation", "raw_row", "parameter_count_printed"].includes(
                k,
              ),
          ),
        ),
        comparison: {
          protocol_id: pid,
          dataset_version: c.source_version,
          split: c.split || c.dataset,
          population: c.dataset,
          inputs: stratum || "unreported",
          adaptation: c.conditions?.adaptation || "unreported",
          aggregation: "metric-specific; inspect each result",
        },
        missing_metadata: {
          checkpoint_revision: "unreported",
          scored_count: "unreported",
        },
      },
    });
  const rid = id("result", c.candidate_id);
  const direction = c.direction.includes("higher")
    ? "higher"
    : c.direction.includes("lower")
      ? "lower"
      : "unreported";
  put({
    id: rid,
    kind: "result",
    name: `${c.model_or_submission} · ${c.metric} · ${c.dataset}`,
    description:
      "Reported measurement transcribed from the pinned source. Not independently reproduced.",
    status: "source_checked",
    facets: {},
    source_ids: [sid],
    links: [{ relation: "evaluation", target_id: eid }],
    attributes: {
      metric: c.metric,
      metric_direction: direction,
      unit: c.unit,
      printed_value: c.printed_value,
      numeric_value: String(c.numeric_value),
      uncertainty: c.uncertainty,
      aggregation: c.conditions?.aggregation || "unreported",
      scoring_conditions: Object.fromEntries(
        Object.entries(c.conditions || {}).filter(([k]) => k !== "raw_row"),
      ),
      source_locator: c.source_locator,
      acquisition_candidate_id: c.candidate_id,
      missing_metadata: { denominator: "unreported" },
      review: {
        method: "independent_automated_cell_check_and_ai_scope_review",
        date: "2026-09-19",
        artifact_sha256: c.artifact_sha256,
        receipt: `data/omics/acquisition/2026-09-19/${c.lane}/`,
        notes:
          "Transcription checked independently. No human review or scientific reproduction claimed.",
      },
    },
  });
  groups
    .get(pid)!
    .rows.push({ ...c, result_id: rid, direction, source_id: sid });
  decisions[decisions.length - 1].result_id = rid;
}
for (const [pid, g] of groups) {
  const metrics = new Map<string, any[]>();
  for (const c of g.rows) {
    const k = JSON.stringify([c.metric, c.unit, c.direction]);
    metrics.set(k, [...(metrics.get(k) || []), c]);
  }
  for (const [key, rows] of metrics) {
    if (rows.length < 2 || rows[0].direction === "unreported") continue;
    for (let start = 0; start < rows.length; start += 80) {
      const page = rows.slice(start, start + 80);
      if (page.length < 2) continue;
      const c = page[0];
      (g.protocol.attributes.comparison_panels as any[]).push({
        id: id("figure", [pid, key, start]),
        title: `${g.protocol.name}: ${c.metric}${rows.length > 80 ? ` (source entries ${start + 1}–${start + page.length} of ${rows.length})` : ""}`,
        protocol_id: pid,
        dataset_id: g.datasetId,
        metric: c.metric,
        unit: c.unit,
        direction: c.direction,
        result_ids: page.map((x) => x.result_id),
        source_ids: [c.source_id],
        source_locator: `${page[0].source_locator} through ${page.at(-1).source_locator}`,
        context:
          "Complete selected source table is retained across source-order panels. These point estimates do not establish statistical significance or a universal ranking.",
        caveats: [
          g.protocol.description,
          String(g.protocol.attributes.scope_limitations),
          "Missing source cells and quarantined conflicts are recorded in acquisition and audit tables. Per-result scoring denominators may be unreported.",
        ],
        review: { method: "automated_source_review", date: "2026-09-19" },
      });
    }
  }
}
const output = [...records.values()].sort((a, b) => a.id.localeCompare(b.id));
const text = output.map((r) => JSON.stringify(r)).join("\n") + "\n";
fs.writeFileSync(`${root}/reviewed-records.jsonl`, text);
fs.writeFileSync(
  `${root}/integration-decisions.jsonl`,
  decisions.map((r) => JSON.stringify(r)).join("\n") + "\n",
);
fs.writeFileSync(
  `${root}/integration-receipt.json`,
  JSON.stringify(
    {
      date: "2026-09-19",
      records_sha256: sha(text),
      candidate_inputs: ["proteins", "challenges", "cells-networks"].map(
        (lane) => ({
          lane,
          sha256: sha(
            fs.readFileSync(`${root}/${lane}/candidates.jsonl`, "utf8"),
          ),
        }),
      ),
      counts: {
        records: output.length,
        results: output.filter((r) => r.kind === "result").length,
        protocols: groups.size,
      },
      review_method:
        "Separate transcription checks plus AI-assisted protocol mapping; no human review or reproduction",
      limitations: [
        "PEtab artifacts retained in staging: insufficient evaluation context",
        "Four conflicting FLIP2 summary/detailed cells quarantined",
        "VCC validation snapshot provisional",
        "scIB metric directions checked against pinned official consumer code; no new normalization",
      ],
    },
    null,
    2,
  ) + "\n",
);
console.log({
  records: output.length,
  results: output.filter((r) => r.kind === "result").length,
});
