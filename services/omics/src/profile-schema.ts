import { z } from "zod";

/** Shared profile contract for static rendering and service imports.
 * New evidence fields remain optional solely for historical releases. */
const evidence = {
  source_ids: z.array(z.string().min(1)).min(1),
  source_locator: z.string().trim().min(1),
};
const assertion = z.object({ text: z.string().min(1), ...evidence }).strict();
export const profileSchema = z
  .object({
    summary: z.string().min(1),
    summary_source_ids: z.array(z.string().min(1)).min(1).optional(),
    summary_source_locator: z.string().trim().min(1).optional(),
    sections: z.array(
      z
        .object({
          title: z.string().min(1),
          body: z.string().min(1),
          ...evidence,
        })
        .strict(),
    ),
    facts: z.array(
      z
        .object({
          label: z.string().min(1),
          value: z.string().min(1),
          status: z
            .enum([
              "source_checked",
              "unreported",
              "unextracted",
              "unavailable",
              "inapplicable",
            ])
            .optional(),
          ...evidence,
        })
        .strict(),
    ),
    strengths: z.array(assertion),
    limitations: z.array(assertion),
    diagram: z
      .object({
        title: z.string().min(1),
        steps: z.array(z.string().min(1)).min(2).max(8),
        caption: z.string().min(1),
        ...evidence,
      })
      .strict()
      .optional(),
    coverage: z.enum(["reviewed", "limited"]),
    gaps: z.array(z.string().min(1)),
    review: z
      .object({
        method: z.literal("automated_source_review"),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        note: z.string().min(1),
      })
      .strict(),
  })
  .strict()
  .superRefine((profile, ctx) => {
    if (
      Boolean(profile.summary_source_ids) !==
      Boolean(profile.summary_source_locator)
    )
      ctx.addIssue({
        code: "custom",
        message: "Summary evidence needs both sources and a locator.",
      });
    if (profile.coverage === "limited" && !profile.gaps.length)
      ctx.addIssue({
        code: "custom",
        message: "Limited profiles must document evidence gaps.",
      });
    if (profile.coverage === "reviewed" && !profile.sections.length)
      ctx.addIssue({
        code: "custom",
        message: "Reviewed profiles need sourced explanation.",
      });
  });
export type OmicsProfile = z.infer<typeof profileSchema>;
