import fs from "node:fs";
import { createHash } from "node:crypto";
import { z } from "zod";
import { recordSchema, type RecordEntry } from "./schema";

export const mfassMatchedRoot = "data/omics/reviewed/mfass-matched-annotation-v1";
const files = ["report.json", "manifest-v1.json", "verification.json", "provenance.json", "exclusion-verification.json"] as const;
export const mfassMatchedInputs = [...files, "review.json"].map(file => `${mfassMatchedRoot}/${file}`);
export const mfassSourceRevision = "093fd1ae198c80ce34408d84d6543bca4fc538f2";
export const mfassExclusionsRevision = "4be7a98e2553fa2378c29625b13eb3e8ac2e58fb";
export const mfassScoredIdsHash = "89b5568e2d819b892ba5e6db680d85e41224d6a69fec4b09a85c5075cade39d8";
const prefix = "rewire-mfass-matched-v1";
export const mfassProtocolId = `${prefix}-protocol`;
const datasetId = `${prefix}-dataset`;
const conditions = ["S0", "S1", "P0", "P1"] as const;
const metricNames = {
  precision_at_capacity: "Precision at 100", recall_at_capacity: "Recall at 100",
  average_precision_sklearn: "Average precision", auroc: "AUROC",
} as const;
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const coverage = z.object({ denominator: z.literal(8324), scored: z.literal(8297), unscored: z.literal(27) });
const metrics = z.object({ n: z.literal(8297), positives: z.literal(314),
  precision_at_capacity: z.number().min(0).max(1), recall_at_capacity: z.number().min(0).max(1),
  average_precision_sklearn: z.number().min(0).max(1), auroc: z.number().min(0).max(1) });
const conditionSchema = z.object({ coverage, metrics, predictions_sha256: hash, ties: z.record(z.string(), z.unknown()) });
const allConditions = <T extends z.ZodType>(schema: T) => z.object({ S0: schema, S1: schema, P0: schema, P1: schema }).strict();
const receiptSchema = z.object({ schema_version: z.literal("1.0"), status: z.literal("reviewed"),
  review_method: z.literal("automated"), reviewed_at: z.string().min(1),
  source_revision: z.literal(mfassSourceRevision), exclusions_revision: z.literal(mfassExclusionsRevision), files: z.record(z.string(), hash),
  errors: z.array(z.string()).length(0), limitations: z.array(z.string()).min(1) }).strict();
const scope = "8,297 of 8,324 held-out variants scored in every configuration (314 positives, 460 exon groups). The same 27 rows are excluded: 23 assembly-orientation mismatches and four outside the selected canonical transcript spans. Missing scores are not zero or negative predictions.";
const caveats = [scope,
  "Exploratory comparison: prior results were known. Paired contrast intervals are unadjusted and do not establish a universal model ranking.",
  "Pangolin uses the recorded per-gene masking patch; these are exact configurations, not unqualified upstream model scores.",
  "Precision at 100 is sensitive to tied-score ordering, especially P1. Numerical source checking is automated, not human review or independent reproduction.",
  "Assembly-orientation issue reported at https://github.com/KosuriLab/MFASS/issues/1. Original v1 outputs remain unchanged; corrections require a new version."];

/** This one frozen, partially scored study is admitted on its own evidence.
 * The general local-run complete-coverage gate remains unchanged. Numerical
 * records are derived directly from the pinned report, not manually transcribed. */
export function applyMfassMatchedEvaluations(input: RecordEntry[], texts: Record<typeof files[number], string>, review: unknown): RecordEntry[] {
  const receipt = receiptSchema.parse(review);
  if (JSON.stringify(Object.keys(receipt.files).sort()) !== JSON.stringify([...files].sort()) ||
      files.some(file => sha(texts[file]) !== receipt.files[file])) throw Error("MFASS inputs changed since review");
  const report = z.object({ manifest_sha256: hash, denominator: z.literal(8324), conditions: allConditions(conditionSchema),
    contrasts: z.record(z.string(), z.object({ candidate: z.enum(conditions), baseline: z.enum(conditions),
      denominators: z.object({ baseline_scored: z.literal(8297), candidate_scored: z.literal(8297), common: z.literal(8297),
        baseline_only: z.literal(0), candidate_only: z.literal(0), common_positives: z.literal(314), common_id_sha256: z.literal(mfassScoredIdsHash) }),
      independent_groups: z.literal(460), on_common_subset: z.object({ baseline: metrics, candidate: metrics }) }))
  }).parse(JSON.parse(texts["report.json"]));
  const manifest = z.object({ distance: z.literal(50), analysis: z.object({ capacity: z.literal(100) }).passthrough(),
    conditions: allConditions(z.object({ tool: z.string(), mask: z.string(), stem: z.string() })),
    resources_sha256: z.record(z.string(), hash), runner_files_sha256: z.record(z.string(), hash),
    code: z.record(z.string(), z.record(z.string(), z.unknown())) }).parse(JSON.parse(texts["manifest-v1.json"]));
  const provenance = z.object({ manifest_raw_sha256: hash, files: z.record(z.string(), z.object({ raw_sha256: hash, public_sha256: hash })) }).parse(JSON.parse(texts["provenance.json"]));
  if (report.manifest_sha256 !== provenance.manifest_raw_sha256 ||
      provenance.files["manifest-v1.json"]?.raw_sha256 !== report.manifest_sha256 ||
      ["manifest-v1.json", "report.json", "verification.json"].some(file => provenance.files[file]?.public_sha256 !== receipt.files[file]))
    throw Error("MFASS public/raw artifact binding mismatch");
  const verification = z.object({ passed: z.literal(true), problems: z.array(z.unknown()).length(0),
    coverage: allConditions(coverage), tables: allConditions(z.object({ predictions_sha256: hash }))
  }).parse(JSON.parse(texts["verification.json"]));
  const exclusions = z.object({ source_revision: z.literal(mfassSourceRevision), scored_ids_sha256: z.literal(mfassScoredIdsHash),
    checks: z.object({ all_archived_bundle_checksums_unchanged: z.literal(true), identical_scored_ids_all_four_conditions: z.literal(true),
      identical_ids_labels_groups: z.literal(true), exclusions_match_original_tool_files_and_investigation: z.literal(true) }).strict(),
    exclusion_counts: z.object({ assembly_orientation: z.literal(23), canonical_transcript_span: z.literal(4) }).strict(),
    conditions: allConditions(z.object({ predictions_sha256: hash, unscored_sha256: hash,
      eligible: z.literal(8324), scored: z.literal(8297), unscored: z.literal(27), positives_scored: z.literal(314), groups_scored: z.literal(460) }))
  }).parse(JSON.parse(texts["exclusion-verification.json"]));
  const expectedContrasts = ["P0-S0", "P1-P0", "S1-S0"];
  if (JSON.stringify(Object.keys(report.contrasts).sort()) !== JSON.stringify(expectedContrasts)) throw Error("MFASS contrast inventory mismatch");
  for (const [name, contrast] of Object.entries(report.contrasts)) {
    if (name !== `${contrast.candidate}-${contrast.baseline}`) throw Error("MFASS contrast identity mismatch");
    for (const side of ["baseline", "candidate"] as const)
      if (Object.keys(metricNames).some(key => contrast.on_common_subset[side][key as keyof typeof metricNames] !==
          report.conditions[contrast[side]].metrics[key as keyof typeof metricNames])) throw Error("MFASS metrics disagree with paired report");
  }
  for (const condition of conditions) {
    const config = manifest.conditions[condition];
    if (config.tool !== (condition.startsWith("S") ? "spliceai" : "pangolin") ||
        config.mask !== ({ S0: "0", S1: "1", P0: "False", P1: "True" })[condition]) throw Error("MFASS configuration mismatch");
    if (report.conditions[condition].predictions_sha256 !== verification.tables[condition].predictions_sha256 ||
        report.conditions[condition].predictions_sha256 !== exclusions.conditions[condition].predictions_sha256)
      throw Error("MFASS prediction identity mismatch");
  }
  const sourceId = (file: string) => `${prefix}-source-${file.replace(/\.json$/, "").replaceAll(".", "-")}`;
  const sources = files.map(sourceId);
  const reviewNote = { method: "automated_execution_evidence_review", reviewed_at: receipt.reviewed_at,
    notes: "Computational source, coverage and metric checks only; not independent human review or published-score reproduction." };
  const rec = (id: string, kind: RecordEntry["kind"], name: string, attributes: Record<string, unknown>, links: RecordEntry["links"] = [], sourceIds = sources): RecordEntry =>
    recordSchema.parse({ id, kind, name, description: scope, status: "source_checked", facets: { areas: ["dna-genomes"] }, source_ids: sourceIds, links, attributes });
  const base = `https://github.com/rewire-bio/rewire-benchmarks/blob/${mfassSourceRevision}/benchmarks/mfass/results/matched-annotation-v1`;
  const records: RecordEntry[] = files.map(file => {
    const url = file === "exclusion-verification.json"
      ? `https://github.com/rewire-bio/rewire-benchmarks/blob/${mfassExclusionsRevision}/docs/mfass-matched-study-exclusions/verification.json`
      : `${base}/${file}`;
    return rec(sourceId(file), "source", `MFASS matched canonical annotation v1: ${file}`, {
    url, artifact_url: url.replace("github.com/", "raw.githubusercontent.com/").replace("/blob/", "/"),
    artifact_sha256: receipt.files[file], version: file === "exclusion-verification.json" ? mfassExclusionsRevision : mfassSourceRevision, retrieved_at: receipt.reviewed_at,
    source_type: "rewire_execution_report", evidence_origin: "rewire_run",
  }, [], []); });
  records.push(rec(datasetId, "dataset_subset", "MFASS v2 test: matched canonical annotation coverage", {
    version: "split-v2-matched-annotation-v1", test_count: 8324, scored_count: 8297, missing_count: 27,
    positive_count: 314, independent_groups: 460, scored_ids_sha256: mfassScoredIdsHash,
    exclusion_counts: exclusions.exclusion_counts, exclusion_issue_url: "https://github.com/KosuriLab/MFASS/issues/1",
    source_locator: "report.json: coverage and contrasts; computational exclusion verification", limitations: caveats,
  }));
  const resultId = (condition: string, key: string) => `${prefix}-result-${condition.toLowerCase()}-${key.replaceAll("_", "-")}`;
  records.push(rec(mfassProtocolId, "protocol", "MFASS: matched GENCODE 44 canonical annotation", {
    version: "matched-annotation-v1", source_locator: "manifest-v1.json; report.json", limitations: caveats,
    reproduction_url: `${base}/README.md`,
    comparison_panels: Object.entries(metricNames).map(([key, metric]) => ({
      id: `${prefix}-${key.replaceAll("_", "-")}`, title: `MFASS matched canonical annotation: ${metric}`,
      protocol_id: mfassProtocolId, dataset_id: datasetId, metric, unit: "dimensionless", direction: "higher",
      result_ids: conditions.map(condition => resultId(condition, key)), source_ids: sources,
      source_locator: `report.json: conditions.*.metrics.${key}`, context: scope, caveats,
      review: { method: "automated_source_review", date: "2026-09-25" },
    })),
  }, [{ relation: "part_of", target_id: "rewire-mfass-v2" }, { relation: "evaluates_task", target_id: "catalog-task-mfass-splice" }]));
  const claim = (subject: string, relation: string, target: string, explanation: string) => rec(`${subject}-${relation.replaceAll("_", "-")}-${target}`, "claim", explanation,
    { field: `links:${relation}:${target}`, value: target, source_locator: "manifest-v1.json: study and conditions", review: reviewNote }, [{ relation: "subject", target_id: subject }]);
  records.push(claim(mfassProtocolId, "part_of", "rewire-mfass-v2", "This matched-annotation protocol evaluates MFASS splice-variant prioritisation."));
  records.push(claim(mfassProtocolId, "evaluates_task", "catalog-task-mfass-splice", "This matched-annotation protocol directly evaluates the MFASS splice-variant prioritisation task on its documented filtered test subset."));
  for (const condition of conditions) {
    const run = report.conditions[condition], config = manifest.conditions[condition], model = config.tool;
    const configurationId = `${prefix}-configuration-${condition.toLowerCase()}`;
    const evaluationId = `${prefix}-evaluation-${condition.toLowerCase()}`;
    const name = `${model === "spliceai" ? "SpliceAI 1.3.1" : "Pangolin 1.0.2 + per-gene masking patch"} · mask ${config.mask} (${condition})`;
    records.push(rec(configurationId, "configuration", name, { condition, configuration: config, distance: 50,
      annotation: "GENCODE v44 canonical transcripts", code: manifest.code[model], resources_sha256: manifest.resources_sha256,
      source_locator: `manifest-v1.json: conditions.${condition}; code.${model}`, limitations: caveats,
    }, [{ relation: "variant_of", target_id: `discovery-model-${model}` }]));
    records.push(claim(configurationId, "variant_of", `discovery-model-${model}`, `This exact ${condition} configuration evaluates ${model} with the documented code, weights, annotation and masking settings.`));
    const counts = { eligible_count: 8324, scored_count: 8297, missing_count: 27, coverage: "8297/8324" };
    records.push(rec(evaluationId, "evaluation", `${name} on MFASS matched annotation`, {
      origin: "rewire_run", execution_scope: "partial_selected_evaluation", suite_complete: false, published_score_reproduction: false,
      ...counts, positive_count: 314, independent_groups: 460, exclusion_counts: exclusions.exclusion_counts,
      scored_ids_sha256: mfassScoredIdsHash, predictions_sha256: run.predictions_sha256, unscored_sha256: exclusions.conditions[condition].unscored_sha256,
      protocol: "MFASS matched GENCODE 44 canonical annotation", version: "1", input_information: "GRCh38 genomic context; distance 50; matched canonical annotation; no assay labels during prediction",
      comparison: { protocol_id: mfassProtocolId, dataset_version: datasetId, split: "split-v2 test", subset: "identical 8297 scored IDs; 27 excluded", population: "8297/8324",
        inputs: "GRCh38 genomic context; matched GENCODE44 canonical annotation", adaptation: "zero-shot pretrained specialists",
        metric_implementation: manifest.runner_files_sha256["packages/rewirebench/src/rewirebench/metrics.py"], aggregation: "common scored variants", budget: "one frozen execution per condition" },
      run_url: `${base}/report.json`, reproduction_url: `${base}/README.md`, source_locator: `report.json: conditions.${condition}`,
      ties: run.ties, limitations: caveats, review: reviewNote,
    }, [{ relation: "configuration", target_id: configurationId }, { relation: "protocol", target_id: mfassProtocolId }, { relation: "dataset_subset", target_id: datasetId }]));
    for (const [key, metric] of Object.entries(metricNames)) {
      const value = run.metrics[key as keyof typeof metricNames];
      records.push(rec(resultId(condition, key), "result", `${name}: ${metric}`, {
        metric, metric_key: key, metric_direction: "higher", unit: "dimensionless", numeric_value: String(value), printed_value: String(value),
        ...counts, uncertainty: null, source_locator: `report.json: conditions.${condition}.metrics.${key}`, review: reviewNote,
        missing_metadata: { uncertainty: "Point estimate; paired contrast intervals are reported separately in the source and must not be used as intervals for this individual condition." },
      }, [{ relation: "evaluation", target_id: evaluationId }]));
    }
  }
  const ids = new Set(input.map(record => record.id));
  if (records.some(record => ids.has(record.id))) throw Error("MFASS records cannot replace existing records");
  return [...input, ...records];
}

export function addMfassMatchedEvaluations(input: RecordEntry[]): RecordEntry[] {
  const texts = Object.fromEntries(files.map(file => [file, fs.readFileSync(`${mfassMatchedRoot}/${file}`, "utf8")])) as Record<typeof files[number], string>;
  return applyMfassMatchedEvaluations(input, texts, JSON.parse(fs.readFileSync(`${mfassMatchedRoot}/review.json`, "utf8")));
}
