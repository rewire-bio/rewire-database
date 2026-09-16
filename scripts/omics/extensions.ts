import { z } from "zod";
// Optional domain blocks can grow without turning an absent observation into a
// guessed value. Present values are validated; null means explicitly unknown.
const text = z.string().min(1).nullable().optional();
const quantity = z
  .object({ value: z.number().finite(), unit: z.string().min(1) })
  .strict()
  .nullable()
  .optional();
const count = z.number().int().nonnegative().nullable().optional();
export const extensionsSchema = z
  .object({
    genomics: z
      .object({
        assembly: text,
        chromosome: text,
        coordinate_system: z
          .enum(["0-based-half-open", "1-based-closed"])
          .nullable()
          .optional(),
        start: count,
        end: count,
        strand: z.enum(["+", "-", "unstranded"]).nullable().optional(),
        window_length: z.number().int().positive().nullable().optional(),
        variant_offset: count,
        orientation: z
          .enum(["genomic-forward", "transcript", "assay"])
          .nullable()
          .optional(),
        window_placement: text,
      })
      .strict()
      .superRefine((v, ctx) => {
        if (v.start != null && v.end != null && v.end < v.start)
          ctx.addIssue({
            code: "custom",
            message: "Coordinate end precedes start",
          });
        if (
          v.variant_offset != null &&
          v.window_length != null &&
          v.variant_offset >= v.window_length
        )
          ctx.addIssue({
            code: "custom",
            message: "Zero-based variant offset is outside sequence window",
          });
      })
      .optional(),
    protein: z
      .object({
        sequence_identity_threshold: z
          .number()
          .min(0)
          .max(1)
          .nullable()
          .optional(),
        identity_algorithm: text,
        msa_source: text,
        msa_version: text,
        templates: text,
        template_cutoff: text,
        structure_availability: text,
      })
      .strict()
      .optional(),
    cellular: z
      .object({
        donor: text,
        cell_type: text,
        perturbation: text,
        dose: quantity,
        time: quantity,
        biological_replicates: count,
        batch: text,
      })
      .strict()
      .optional(),
    molecular_measurement: z
      .object({
        molecule_identifier: text,
        identifier_namespace: text,
        assay_platform: text,
        preprocessing: text,
        measurement_unit: text,
        ion_adduct: text,
        identification_resolution: text,
      })
      .strict()
      .optional(),
    microbial: z
      .object({
        taxonomy: text,
        taxonomy_version: text,
        reference_database: text,
        reference_version: text,
        sample_context: text,
      })
      .strict()
      .optional(),
    mechanistic: z
      .object({
        solver: text,
        solver_version: text,
        constraints: text,
        experimental_conditions: text,
      })
      .strict()
      .optional(),
  })
  .strict();
