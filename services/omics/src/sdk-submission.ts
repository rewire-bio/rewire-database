import {
  proteinGymAssayIds,
  proteinGymAssayCounts,
  proteinGymTotalVariants,
} from "./sdk-proteingym-reference.js";
import { z } from "zod";
const text = z.string().trim().min(1).max(500);
const sha = z.string().regex(/^[a-f0-9]{64}$/);
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
    protocol_id: z.enum([
      "mfass-v2",
      "mfass-v2-frozen-encoder",
      "proteingym-v1.3-dms-substitutions",
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
    provenance: z.record(z.string()).superRefine((value, ctx) => {
      for (const [key, digest] of Object.entries(value)) {
        if (!(
          (key.endsWith("_sha256") && /^[a-f0-9]{64}$/.test(digest)) ||
          (key.endsWith("_revision") && /^[a-f0-9]{40}$/.test(digest))
        ))
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              "Provenance accepts only SHA256 hashes and pinned revisions",
            path: [key],
          });
      }
    }),
    execution_status: z.enum(["imported_predictions", "local_adapter"]),
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
    if (value.protocol_id !== "proteingym-v1.3-dms-substitutions") {
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
