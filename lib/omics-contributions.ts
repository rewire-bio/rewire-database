/** Browser-safe contribution contract. No imports from the private service or Admin SDK. */
import { createTRPCUntypedClient, httpBatchLink } from "@trpc/client";
import { z } from "zod";

const fields = {
  title: z.string().trim().min(1).max(500),
  summary: z.string().trim().min(10).max(10_000),
  source_urls: z.array(z.string().url()).min(1).max(20),
  target_id: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{0,254}$/)
    .optional(),
  name: z.string().max(200).optional(),
  affiliation: z.string().max(300).optional(),
  orcid: z.string().url().optional(),
  public_credit: z.boolean().optional(),
  details: z.record(z.string(), z.unknown()),
};
export const contributionInput = z
  .object({
    type: z.enum(["model", "benchmark", "result", "correction"]),
    ...fields,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.type === "correction" && !value.target_id)
      context.addIssue({
        code: "custom",
        path: ["target_id"],
        message: "Select the record to correct.",
      });
    if (value.type === "result")
      for (const field of [
        "model",
        "benchmark",
        "protocol",
        "metric",
        "value",
        "source_locator",
      ])
        if (
          typeof value.details[field] !== "string" ||
          !(value.details[field] as string).trim()
        )
          context.addIssue({
            code: "custom",
            path: ["details", field],
            message: `${field} is required.`,
          });
  });
const status = z.enum([
  "submitted",
  "in_review",
  "changes_requested",
  "rejected",
  "accepted",
  "published",
]);
const submissionBody = z.object({
  type: z.enum(["model", "benchmark", "result", "correction"]),
  ...fields,
  id: z.string(),
  status,
  created_at: z.string(),
  updated_at: z.string(),
  published_ids: z.array(z.string()).optional(),
  release_id: z.string().optional(),
});
// Projection strips unexpected private fields, including inside historical payloads.
export const submissionOutput = submissionBody.extend({
  revisions: z
    .array(
      z.object({
        id: z.string(),
        created_at: z.string(),
        actor: z.string(),
        status,
        note: z.string().optional(),
        payload: submissionBody.optional(),
      }),
    )
    .optional(),
  review_notes: z
    .array(z.object({ note: z.string(), created_at: z.string(), status }))
    .optional(),
});
export type ContributionInput = z.infer<typeof contributionInput>;
export type SubmissionOutput = z.infer<typeof submissionOutput>;

export function createContributionClient(
  url: string,
  getToken: () => Promise<string>,
) {
  const transport = createTRPCUntypedClient({
    links: [
      httpBatchLink({
        url,
        headers: async () => ({ authorization: `Bearer ${await getToken()}` }),
      }),
    ],
  });
  return {
    submission: {
      create: {
        mutate: async (input: {
          contribution: ContributionInput;
          idempotencyKey: string;
        }) => {
          const parsed = z
            .object({
              contribution: contributionInput,
              idempotencyKey: z.string().min(16).max(128),
            })
            .strict()
            .parse(input);
          return z
            .object({ id: z.string(), status })
            .parse(await transport.mutation("submission.create", parsed));
        },
      },
      list: {
        query: async () =>
          z
            .array(submissionOutput)
            .parse(await transport.query("submission.list")),
      },
      get: {
        query: async (input: { id: string }) =>
          submissionOutput.parse(
            await transport.query("submission.get", input),
          ),
      },
      update: {
        mutate: async (input: {
          id: string;
          patch: Partial<Omit<ContributionInput, "type">>;
        }) => {
          const parsed = z
            .object({
              id: z.string(),
              patch: z.object(fields).partial().strict(),
            })
            .strict()
            .parse(input);
          return submissionOutput.parse(
            await transport.mutation("submission.update", parsed),
          );
        },
      },
    },
  };
}
