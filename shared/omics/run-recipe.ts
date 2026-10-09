import { z } from "zod";
import type { CatalogueRecord } from "./catalogue-query.js";
import { isBenchmarkSubject } from "./entity-kinds.js";

const nonempty = z.string().min(1);
const evidence = {
  source_ids: z.array(nonempty).min(1),
  source_locator: nonempty,
};
export const runRecipeSchema = z
  .object({
    id: nonempty,
    protocol_id: nonempty,
    version: nonempty,
    title: nonempty,
    purpose: z.enum(["rescore_predictions", "generate_and_evaluate"]),
    summary: nonempty,
    inputs: z.array(nonempty).min(1),
    outputs: z.array(nonempty).min(1),
    requirements: z
      .object({
        data: nonempty,
        weights: nonempty,
        licence: nonempty,
        software: nonempty,
        hardware: nonempty,
      })
      .strict(),
    instructions: z
      .array(
        z
          .object({
            runtime: z.enum([
              "python",
              "command_line",
              "podman",
              "apptainer",
              "slurm",
            ]),
            title: nonempty,
            code: nonempty,
            status: z.enum([
              "source_reviewed_not_executed",
              "smoke_tested",
              "executed",
            ]),
            validation_receipt: z
              .object({
                source_id: nonempty,
                source_locator: nonempty,
                scope: z.enum([
                  "synthetic_smoke",
                  "selected_assay",
                  "full_protocol",
                ]),
                platform: nonempty,
              })
              .strict()
              .optional(),
            ...evidence,
          })
          .strict(),
      )
      .min(1),
    limitations: z.array(nonempty).min(1),
    ...evidence,
  })
  .strict()
  .superRefine((value, ctx) => {
    for (const [i, instruction] of value.instructions.entries()) {
      if (
        instruction.status === "smoke_tested" &&
        instruction.validation_receipt?.scope === "full_protocol"
      )
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["instructions", i],
          message: "A smoke receipt cannot claim full-protocol execution",
        });
      if (
        instruction.status !== "source_reviewed_not_executed" &&
        !instruction.validation_receipt
      )
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["instructions", i],
          message: "Execution claims require a validation receipt",
        });
    }
  });
export type RunRecipe = z.infer<typeof runRecipeSchema>;
export const reproductionSchema = z
  .object({
    recipe_owner_id: nonempty,
    recipe_id: nonempty,
    applicability: z.enum(["rescore_predictions", "generate_and_evaluate"]),
    explanation: nonempty,
    ...evidence,
  })
  .strict();

export function validateRunRecipes(
  record: CatalogueRecord,
  byId: Map<string, CatalogueRecord>,
) {
  function citations(ids: string[]) {
    for (const id of ids) {
      const source = byId.get(id);
      if (
        source?.kind !== "source" ||
        !record.source_ids.includes(id) ||
        !/^[a-f0-9]{64}$/.test(String(source.attributes.artifact_sha256))
      )
        throw new Error(`Unpinned recipe evidence ${record.id} -> ${id}`);
    }
  }
  if (record.attributes.run_recipes !== undefined) {
    if (!isBenchmarkSubject(record.kind))
      throw new Error("Recipes require an evaluation-design record");
    const recipes = z
      .array(runRecipeSchema)
      .min(1)
      .parse(record.attributes.run_recipes);
    if (new Set(recipes.map((r) => r.id)).size !== recipes.length)
      throw new Error("Duplicate recipe IDs");
    for (const recipe of recipes)
      citations([
        ...recipe.source_ids,
        ...recipe.instructions.flatMap((i) => [
          ...i.source_ids,
          ...(i.validation_receipt ? [i.validation_receipt.source_id] : []),
        ]),
      ]);
  }
  if (record.attributes.reproduction !== undefined) {
    if (record.kind !== "evaluation")
      throw new Error("Recipe applicability belongs to an exact evaluation");
    const reference = reproductionSchema.parse(record.attributes.reproduction);
    const owner = byId.get(reference.recipe_owner_id);
    const recipes = z
      .array(runRecipeSchema)
      .safeParse(owner?.attributes.run_recipes);
    const recipe =
      recipes.success && recipes.data.find((r) => r.id === reference.recipe_id);
    if (!recipe || recipe.purpose !== reference.applicability)
      throw new Error("Unknown or incompatible evaluation recipe");
    const benchmarkIds = record.links
      .filter((l) => l.relation === "assessment")
      .map((l) => l.target_id);
    if (!benchmarkIds.includes(reference.recipe_owner_id))
      throw new Error(
        "Recipe must belong to the evaluation's exact design record",
      );
    citations(reference.source_ids);
  }
}
