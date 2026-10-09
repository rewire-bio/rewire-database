import { validateRunRecipes } from "./run-recipe.js";
import { validateRunGuide } from "./run-guide.js";
import {
  entityKinds,
  validateDatasetReuseLink,
  legacyKinds,
} from "./entity-kinds.js";
import { relationAllows, relations, type Relation } from "./relations.js";
import { currentRecords } from "./current.js";
import { profileSchema } from "./profile-schema.js";
import { validateSourceIdentity } from "./source-identity.js";
import { z } from "zod";
import { createCatalogueQuery } from "./catalogue-query.js";
import { validateBenchmarkResearch } from "./benchmark-research.js";
import { isIP } from "node:net";
import { assertPublicCatalogue } from "./catalogue-query.js";
import { researchDataSchema, validateResearchData } from "./research.js";

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
const link = z
  .object({
    relation: z.enum(relations as [Relation, ...Relation[]]),
    target_id: id,
  })
  .strict();
export const recordSchema = z
  .object({
    id,
    kind: z.enum(entityKinds),
    name: short,
    description: z.string(),
    status: z.enum([
      "discovered",
      "needs_review",
      "source_checked",
      "reproduced",
      "disputed",
      "superseded",
      "excluded",
    ]),
    facets: z.record(z.string(), z.array(z.string())),
    source_ids: z.array(id),
    links: z.array(link),
    attributes: z.record(z.string(), z.unknown()),
  })
  .strict()
  .superRefine((record, ctx) => {
    const a = record.attributes;
    const issue = (message: string) =>
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["attributes"],
        message,
      });
    if (record.kind === "source") {
      if (!sourceUrl.safeParse(a.url).success || !a.retrieved_at)
        issue("Sources need a public URL and retrieval date");
    }
    if (
      record.kind === "model" &&
      !["family", "checkpoint", "method", "service"].includes(
        String(a.entity_level),
      )
    )
      issue("Model needs explicit entity_level");
    if (
      record.kind === "benchmark" &&
      !["suite", "protocol", "task", "challenge", "evaluator"].includes(
        String(a.entity_level),
      )
    )
      issue("Benchmark needs explicit entity_level");
    if (
      record.kind === "baseline" &&
      !["proposed", "source_supported"].includes(String(a.applicability))
    )
      issue("Baseline applicability is required");
    if (record.kind === "evaluation") {
      if (
        ![
          "author_reported",
          "independent_paper",
          "paper_compilation",
          "rewire_run",
          "unreported",
        ].includes(String(a.origin))
      )
        issue("Evaluation origin is required");
      if (!a.comparison || typeof a.comparison !== "object")
        issue("Evaluation comparison fields are required");
    }
    if (record.kind === "result") {
      if (typeof a.printed_value !== "string" || typeof a.metric !== "string")
        issue("Preserve printed value and metric");
      if (
        a.numeric_value !== null &&
        (typeof a.numeric_value !== "string" ||
          !/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(a.numeric_value))
      )
        issue("numeric_value must be a decimal string or null");
      if (!["higher", "lower", "unknown"].includes(String(a.metric_direction)))
        issue("Metric direction is required");
      if (record.links.filter((l) => l.relation === "evaluation").length !== 1)
        issue("Result must link to exactly one evaluation");
      if (
        ["source_checked", "reproduced"].includes(record.status) &&
        (!record.source_ids.length || !a.source_locator || !a.review)
      )
        issue("Checked results need a source, precise locator and review");
    }
    if (
      record.kind === "claim" &&
      (!a.field ||
        !a.source_locator ||
        !record.links.some((l) => l.relation === "subject"))
    )
      issue("Claim needs field, subject and source locator");
  });
export const snapshotSchema = z
  .object({
    schema_version: z.enum(["1.0", "1.1"]),
    release_id: id,
    released_at: z.string().datetime(),
    records: z.array(recordSchema),
    coverage: z.record(z.string(), z.unknown()),
    research: researchDataSchema.optional(),
  })
  .strict();
export type CatalogueRecord = z.infer<typeof recordSchema>;
/** Releases written before single-meaning relations and declared attributes are validated in
 * the current shapes. */
function withCurrentRecords(input: unknown): unknown {
  const records = (input as { records?: unknown } | null)?.records;
  if (!Array.isArray(records)) return input;
  try {
    return { ...(input as object), records: currentRecords(records as never[]) };
  } catch {
    return input; // malformed records: let the schema report them
  }
}
export function validateSnapshot(input: unknown) {
  assertPublicCatalogue(input);
  const snapshot = snapshotSchema.parse(withCurrentRecords(input));
  if (snapshot.research) validateResearchData(snapshot.research, snapshot);
  const records = new Map(
    snapshot.records.map((record) => [record.id, record]),
  );
  if (records.size !== snapshot.records.length)
    throw new Error("Duplicate record IDs");
  for (const record of snapshot.records) {
    if (
      snapshot.schema_version === "1.0" &&
      !(legacyKinds as readonly string[]).includes(record.kind)
    )
      throw new Error(
        "Entity kinds introduced in 1.1 require schema version 1.1",
      );
    if (
      snapshot.schema_version === "1.1" &&
      record.kind === "benchmark" &&
      !["suite", "challenge"].includes(String(record.attributes.entity_level))
    )
      throw new Error("Benchmarks must be top-level suites or challenges");
    if (record.kind === "evaluation")
      for (const role of ["system", "assessment", "data"])
        if (record.links.filter((link) => link.relation === role).length !== 1)
          throw new Error(`Invalid evaluation ${role} ${record.id}`);
    const aliases = record.attributes.legacy_kinds;
    if (
      aliases !== undefined &&
      (!Array.isArray(aliases) ||
        aliases.some((kind) => !entityKinds.includes(kind)))
    )
      throw new Error("Invalid legacy entity route");
    validateBenchmarkResearch(record, records);
    validateRunGuide(record, records);
    validateRunRecipes(record, records);
    validateSourceIdentity(record, records);
    const profile = record.attributes.profile;
    if (profile !== undefined) profileSchema.parse(profile);
    function validateProfileEvidence(value: unknown): void {
      if (!value || typeof value !== "object") return;
      for (const [key, child] of Object.entries(value)) {
        if (["source_ids", "summary_source_ids"].includes(key)) {
          if (
            !Array.isArray(child) ||
            child.some(
              (id) =>
                typeof id !== "string" || records.get(id)?.kind !== "source",
            )
          )
            throw new Error(`Invalid profile evidence on ${record.id}`);
        } else validateProfileEvidence(child);
      }
    }
    validateProfileEvidence(profile);
    for (const source of record.source_ids)
      if (records.get(source)?.kind !== "source")
        throw new Error(`Invalid source ${source} on ${record.id}`);
    for (const link of record.links) {
      const target = records.get(link.target_id);
      if (!target) throw new Error(`Unresolved link ${link.target_id}`);
      validateDatasetReuseLink(record, link, target);
      if (!relationAllows(link.relation, record.kind, target.kind))
        throw new Error(
          `Relationship ${link.relation} cannot link ${record.kind} ${record.id} to ${target.kind} ${target.id}`,
        );
    }
  }
  if (snapshot.records.some((record) => record.attributes.comparison_panels)) {
    const query = createCatalogueQuery(snapshot);
    for (const record of snapshot.records.filter(
      (record) => record.attributes.comparison_panels,
    ))
      query.get({ id: record.id });
  }
  return snapshot;
}
