// Contribution and correction submissions, validated by this function before
// they are stored. Record and release validation lives in the website's
// shared/omics/validation.ts; the identifier and source URL rules match it.
import { isIP } from "node:net";
import { z } from "zod";
import { sdkSubmissionSchema } from "./sdk-submission.js";

const short = z.string().trim().min(1).max(500);
export const id = z.string().regex(/^[a-z0-9][a-z0-9-]{0,254}$/);
export const sourceUrl = z
  .string()
  .url()
  .max(2048)
  .superRefine((value, ctx) => {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      isIP(host) ||
      host === "localhost" ||
      !host.includes(".") ||
      [".localhost", ".local", ".internal"].some((suffix) =>
        host.endsWith(suffix),
      )
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Use a public HTTP(S) source URL without credentials.",
      });
    }
  });
// Submitted URLs are stored as evidence links, never fetched by the service.
function safeDetails(value: unknown, depth = 0, parentArray = false): boolean {
  if (depth > 10) return false;
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value))
    return (
      !parentArray && value.every((item) => safeDetails(item, depth + 1, true))
    );
  if (typeof value !== "object" || value === undefined) return false;
  return Object.values(value).every((item) => safeDetails(item, depth + 1));
}
const details = z.record(z.string(), z.unknown()).superRefine((value, ctx) => {
  if (!safeDetails(value)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "Details must be JSON, at most ten levels deep, without directly nested arrays.",
    });
    return;
  }
  if (Buffer.byteLength(JSON.stringify(value)) > 24_000)
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Details exceed 24 KB",
    });
});
export const contributionFields = {
  title: short,
  summary: z.string().trim().min(10).max(10_000),
  source_urls: z.array(sourceUrl).min(1).max(20),
  target_id: id.optional(),
  name: z.string().trim().max(200).optional(),
  affiliation: z.string().trim().max(300).optional(),
  orcid: z
    .string()
    .regex(/^https:\/\/orcid\.org\/\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/)
    .optional(),
  public_credit: z.boolean().default(false),
  details,
};
export const contribution = z
  .object({
    type: z.enum(["model", "benchmark", "result", "correction"]),
    ...contributionFields,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.details.rewire_bundle !== undefined) {
      if (value.type !== "result")
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["details", "rewire_bundle"],
          message: "Runner bundles are result contributions",
        });
      const parsed = sdkSubmissionSchema.safeParse(value.details.rewire_bundle);
      if (!parsed.success)
        for (const issue of parsed.error.issues)
          ctx.addIssue({
            ...issue,
            path: ["details", "rewire_bundle", ...issue.path],
          });
    }
    if (value.type === "result") {
      for (const field of [
        "model",
        "benchmark",
        "protocol",
        "metric",
        "value",
        "source_locator",
      ]) {
        if (
          typeof value.details[field] !== "string" ||
          !(value.details[field] as string).trim()
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["details", field],
            message: `${field} is required for results`,
          });
        }
      }
    }
    if (value.type === "correction" && !value.target_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["target_id"],
        message: "Select the record to correct",
      });
    }
  });
export const patch = z.object(contributionFields).partial().strict();
export type Contribution = z.infer<typeof contribution>;
