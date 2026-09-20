import {
  isSequenceProtocol,
  sequenceSubmissionIssues,
} from "./sdk-sequence.js";
import {
  proteinGymAssayIds,
  proteinGymAssayCounts,
  proteinGymTotalVariants,
} from "./sdk-proteingym-reference.js";
import { z } from "zod";
const text = z.string().trim().min(1).max(500);
const sha = z.string().regex(/^[a-f0-9]{64}$/);
// Keep these names aligned with rewirebench/provenance.py. A digest value does
// not make a private path or customer name in its dictionary key safe to send.
const provenanceFields: Record<string, number> = {
  source_sha256: 64,
  source_csv_sha256: 64,
  validation_sha256: 64,
  dataset_manifest_sha256: 64,
  evaluator_sha256: 64,
  dataset_revision: 40,
  cohort_sha256: 64,
  split_sha256: 64,
  raw_sha256: 64,
  annotation_sha256: 64,
  reference_sha256: 64,
  train_sha256: 64,
  test_sha256: 64,
  train_val_sha256: 64,
  sdk_code_sha256: 64,
  sif_sha256: 64,
  oci_image_sha256: 64,
  evidence_manifest_sha256: 64,
  upstream_revision: 40,
  runner_revision: 40,
  protocol_revision: 40,
  code_revision: 40,
  source_revision: 40,
  model_checkpoint_revision: 40,
  model_code_revision: 40,
  model_checkpoint_sha256: 64,
  model_implementation_sha256: 64,
  model_weights_sha256: 64,
  model_configuration_sha256: 64,
};
const localEvaluationClaim = "local_evaluation_not_paper_reproduction";
const localDataVerification =
  "local_bytes_hashed_not_independently_source_verified";
const tdcRevision = "c310c35f27e3f506411018ac43d97b8ba23ca652";
const genomicRevision = "605d8539830e16c85abe7826990958303ffc5e1c";
// Evaluator mapping pinned by the runner; these are local-copy submissions,
// never a claim that their local denominators match an official cohort.
const tdcMetrics: Record<string, string> = {
  caco2_wang: "mae",
  hia_hou: "roc-auc",
  pgp_broccatelli: "roc-auc",
  bioavailability_ma: "roc-auc",
  lipophilicity_astrazeneca: "mae",
  solubility_aqsoldb: "mae",
  bbb_martins: "roc-auc",
  ppbr_az: "mae",
  vdss_lombardo: "spearman",
  cyp2c9_veith: "pr-auc",
  cyp2d6_veith: "pr-auc",
  cyp3a4_veith: "pr-auc",
  cyp2c9_substrate_carbonmangels: "pr-auc",
  cyp3a4_substrate_carbonmangels: "roc-auc",
  cyp2d6_substrate_carbonmangels: "pr-auc",
  half_life_obach: "spearman",
  clearance_hepatocyte_az: "spearman",
  clearance_microsome_az: "spearman",
  ld50_zhu: "mae",
  herg: "roc-auc",
  ames: "roc-auc",
  dili: "roc-auc",
};
const genomicDatasets = new Set([
  "demo_coding_vs_intergenomic_seqs",
  "demo_human_or_worm",
  "dummy_mouse_enhancers_ensembl",
  "drosophila_enhancers_stark",
  "human_enhancers_cohn",
  "human_enhancers_ensembl",
  "human_ensembl_regulatory",
  "human_nontata_promoters",
  "human_ocr_ensembl",
]);
function numericTree(depth: number): z.ZodType<unknown> {
  if (depth > 6) return z.never();
  return z.union([
    z.number().finite(),
    z.null(),
    z.record(z.string().min(1), numericTree(depth + 1)),
  ]);
}
function hasNumber(value: unknown): boolean {
  return (
    typeof value === "number" ||
    (!!value &&
      typeof value === "object" &&
      Object.values(value).some(hasNumber))
  );
}
/** Explicit public bundle boundary. No paths, predictions, identifiers, weights or credentials. */
export const sdkSubmissionSchema = z
  .object({
    schema_version: z.literal("1.0"),
    data_verification: z
      .enum([
        "pinned_source_bytes",
        "local_bytes_hashed_not_independently_source_verified",
        "unreported",
      ])
      .optional()
      .default("unreported"),
    kind: z.literal("rewire_benchmark_submission"),
    evaluation_claim: z.literal(localEvaluationClaim).optional(),
    evaluation_method: z
      .enum([
        "frozen_embedding_probe",
        "adapter_fit",
        "imported_predictions",
        "prefitted_or_zero_shot_adapter",
      ])
      .optional(),
    protocol_id: z.enum([
      "mfass-v2",
      "mfass-v2-frozen-encoder",
      "proteingym-v1.3-dms-substitutions",
      "tdc-admet-group-v1",
      "genomic-benchmarks-v2",
      "flip2-fitness-v1",
      "dart-eval-task1-zero-shot-v1",
      "mrnabench-sample-mrl-v1",
    ]),
    protocol_version: text,
    dataset_id: text,
    scope: z.enum(["full", "subset"]),
    completion: z.enum(["complete", "partial"]),
    model: z
      .object({
        name: text,
        training_overlap: z.string().trim().min(1).max(5000),
      })
      .strict(),
    metrics: z
      .record(z.string().min(1), numericTree(1))
      .refine(hasNumber, "At least one finite numerical metric is required"),
    coverage: z
      .object({
        denominator: z.number().int().nonnegative(),
        scored: z.number().int().positive(),
        unscored: z.number().int().nonnegative(),
      })
      .strict(),
    provenance: z.record(z.string(), z.string()).superRefine((value, ctx) => {
      for (const [key, digest] of Object.entries(value)) {
        if (
          !Object.hasOwn(provenanceFields, key) ||
          digest.length !== provenanceFields[key] ||
          !/^[a-f0-9]+$/.test(digest)
        )
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              "Provenance accepts only allowlisted SHA256 hashes and pinned revisions",
            path: [key],
          });
      }
    }),
    execution_status: z.enum([
      "imported_predictions",
      "imported_embeddings",
      "local_adapter",
    ]),
    review_status: z.literal("unreviewed_contribution"),
    independently_reproduced: z.literal(false),
    prepared_sha256: sha,
    predictions_sha256: sha,
  })
  .strict()
  .superRefine((value, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["metrics"], message });
    const scalar = (v: unknown) => v === null || typeof v === "number";
    const metricObject = (v: unknown): v is Record<string, unknown> =>
      !!v && typeof v === "object" && !Array.isArray(v);
    const mfassNames = new Set([
      "n",
      "positives",
      "prevalence",
      "capacity",
      "precision_at_capacity",
      "recall_at_capacity",
      "average_precision_sklearn",
      "auroc",
    ]);
    const mfassCounts = new Set(["n", "positives", "prevalence", "capacity"]);
    const pgNames = new Set(["Spearman", "AUC", "MCC", "NDCG", "Top_recall"]);
    let measured = false;
    if (
      !isSequenceProtocol(value.protocol_id) &&
      value.evaluation_method !== undefined
    )
      issue("Evaluation method is supported only for sequence protocols");
    if (
      value.execution_status === "imported_embeddings" &&
      !isSequenceProtocol(value.protocol_id) &&
      value.protocol_id !== "mfass-v2-frozen-encoder"
    )
      issue("Imported embeddings are not supported by this protocol");
    if (isSequenceProtocol(value.protocol_id)) {
      const errors = sequenceSubmissionIssues(value);
      errors.forEach(issue);
      measured = !errors.length;
    } else if (
      value.protocol_id === "tdc-admet-group-v1" ||
      value.protocol_id === "genomic-benchmarks-v2"
    ) {
      if (
        value.evaluation_claim !== localEvaluationClaim ||
        value.data_verification !== localDataVerification
      )
        issue(
          "Local-copy results must disclaim paper reproduction and source verification",
        );
      const tdc = value.protocol_id === "tdc-admet-group-v1";
      const prefix = tdc ? "tdc-admet-" : "genomic-benchmarks-";
      const dataset = value.dataset_id.startsWith(prefix)
        ? value.dataset_id.slice(prefix.length)
        : "";
      const knownDataset = tdc
        ? Object.hasOwn(tdcMetrics, dataset)
        : genomicDatasets.has(dataset);
      if (!knownDataset) issue("Unknown local-copy dataset");
      const performance = new Set(
        tdc
          ? knownDataset
            ? [tdcMetrics[dataset]]
            : []
          : dataset === "human_ensembl_regulatory"
            ? ["accuracy", "f1_macro", "f1_weighted"]
            : ["accuracy", "f1"],
      );
      if (value.protocol_version !== (tdc ? tdcRevision : "2"))
        issue("Unsupported local-copy protocol version");
      if (
        value.provenance.upstream_revision !==
          (tdc ? tdcRevision : genomicRevision) ||
        !(tdc ? ["test_sha256"] : ["train_sha256", "test_sha256"]).every(
          (key) => /^[a-f0-9]{64}$/.test(value.provenance[key] ?? ""),
        )
      )
        issue(
          "Local-copy results require the evaluator revision and local source hashes",
        );
      const allowed = new Set([...performance, "n"]);
      if (
        Object.keys(value.metrics).length !== allowed.size ||
        Object.keys(value.metrics).some((key) => !allowed.has(key))
      )
        issue(
          "Include only all prescribed scalar metrics for the selected dataset",
        );
      if (
        !Number.isSafeInteger(value.metrics.n) ||
        value.metrics.n !== value.coverage.scored
      )
        issue("Metric n must reconcile with scored coverage");
      for (const key of performance) {
        const metric = value.metrics[key];
        if (!scalar(metric))
          issue("Local-copy metrics must be numbers or null");
        if (typeof metric !== "number") continue;
        measured = true;
        const lower = key === "spearman" ? -1 : 0;
        const upper = key === "mae" ? Infinity : 1;
        if (metric < lower || metric > upper)
          issue(`Metric ${key} is outside its valid range`);
      }
    } else if (value.protocol_id !== "proteingym-v1.3-dms-substitutions") {
      for (const [key, metric] of Object.entries(value.metrics)) {
        if (!mfassNames.has(key) || !scalar(metric))
          issue("MFASS accepts only its defined scalar metrics");
        if (
          mfassNames.has(key) &&
          !mfassCounts.has(key) &&
          typeof metric === "number"
        )
          measured = true;
      }
    } else {
      const check = (metrics: unknown) => {
        if (!metricObject(metrics) || !Object.keys(metrics).length) {
          issue("ProteinGym requires defined metric values");
          return;
        }
        for (const [key, metric] of Object.entries(metrics)) {
          if (!pgNames.has(key) || !scalar(metric))
            issue("ProteinGym accepts only its five defined scalar metrics");
          if (pgNames.has(key) && typeof metric === "number") measured = true;
        }
      };
      if (
        Object.keys(value.metrics).length === 1 &&
        "per_assay" in value.metrics
      ) {
        const assays = value.metrics.per_assay;
        if (!metricObject(assays) || !Object.keys(assays).length)
          issue("Per-assay metrics need a pinned assay identity");
        else {
          const allowed = new Set<string>(proteinGymAssayIds);
          if (
            value.scope === "full" &&
            Object.keys(assays).length !== allowed.size
          )
            issue("Full ProteinGym scope requires every pinned assay");
          let scored = 0,
            denominator = 0;
          for (const [id, summary] of Object.entries(assays)) {
            if (!allowed.has(id)) issue("Unknown ProteinGym assay identity");
            if (
              !metricObject(summary) ||
              Object.keys(summary).length !== 3 ||
              Object.keys(summary).some(
                (key) => !["metrics", "scored", "denominator"].includes(key),
              )
            ) {
              issue("Invalid ProteinGym assay summary");
              continue;
            }
            check(summary.metrics);
            if (summary.denominator !== proteinGymAssayCounts[id])
              issue("Assay denominator must match the pinned reference");
            if (
              !Number.isSafeInteger(summary.scored) ||
              !Number.isSafeInteger(summary.denominator) ||
              typeof summary.scored !== "number" ||
              typeof summary.denominator !== "number" ||
              summary.scored < 0 ||
              summary.denominator <= 0 ||
              summary.scored > summary.denominator
            )
              issue("Assay counts must reconcile");
            else {
              scored += summary.scored;
              denominator += summary.denominator;
            }
          }
          if (
            scored !== value.coverage.scored ||
            denominator !== value.coverage.denominator
          )
            issue("Assay counts must match total coverage");
        }
      } else {
        if (
          value.scope !== "full" ||
          value.completion !== "complete" ||
          value.coverage.denominator !== proteinGymTotalVariants
        )
          issue(
            "ProteinGym aggregate metrics require a complete canonical track",
          );
        check(value.metrics);
      }
    }
    if (!measured) issue("Counts alone are not a benchmark metric");
    if (
      value.coverage.scored + value.coverage.unscored !==
      value.coverage.denominator
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Coverage counts must reconcile",
      });
    if (
      value.completion === "complete" &&
      (value.scope !== "full" || value.coverage.unscored > 0)
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Completion must match coverage",
      });
  });
