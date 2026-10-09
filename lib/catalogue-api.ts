import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";
import { auditCategories, auditOutcomes } from "../services/omics/src/audit";
import { entityKinds } from "../services/omics/src/entity-kinds";
import { recordPageKinds } from "../services/omics/src/record-pages";
import { researchCapabilities } from "../services/omics/src/research";
import type { PreparedCatalogue } from "../services/omics/src/prepared-catalogue";
import { preparedCatalogue } from "./prepared";
import { localRecordPage } from "./record-page-local";

// The public catalogue API, served by the frontend from the release its image
// embeds. Inputs and answers match the former Firebase procedures; a request
// pinned to any other release is refused rather than answered from this one.
const t = initTRPC.create();
const id = z.string().regex(/^[a-z0-9][a-z0-9-]{0,254}$/);
const pinned = { release_id: id };
const pagination = {
  cursor: z.string().max(8000).optional(),
  limit: z.number().int().min(1).max(100).optional(),
};

export function catalogueRouter(open: () => PreparedCatalogue = preparedCatalogue) {
  function read<T>(releaseId: string | undefined, run: (query: PreparedCatalogue) => T): T {
    const query = open();
    if (releaseId !== undefined && releaseId !== query.release_id)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Catalogue release ${releaseId} is not served; the current release is ${query.release_id}.`,
      });
    try {
      return run(query);
    } catch (error) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: error instanceof Error ? error.message : "Invalid catalogue query",
      });
    }
  }
  const omit = <T extends { release_id?: string }>({ release_id: _, ...rest }: T) => rest;
  return t.router({
    catalogue: t.router({
      release: t.procedure
        .input(z.object({ release_id: id.optional() }).strict().default({}))
        .query(({ input }) => read(input.release_id, (q) => q.release())),
      list: t.procedure
        .input(z.object({
          ...pinned, ...pagination,
          kind: z.enum(entityKinds).optional(),
          q: z.string().max(300).optional(),
          area: z.string().max(100).optional(),
          status: z.string().max(100).optional(),
          origin: z.string().max(100).optional(),
          readiness: z.enum(researchCapabilities).optional(),
        }).strict())
        .query(({ input }) => read(input.release_id, (q) => q.list(omit(input)))),
      get: t.procedure
        .input(z.object({ ...pinned, id }).strict())
        .query(({ input }) => read(input.release_id, (q) => q.get({ ...input, include_comparisons: false }))),
      // Result and evaluation pages as the server renders them; null when the release has none.
      page: t.procedure
        .input(z.object({ ...pinned, kind: z.enum(recordPageKinds), id }).strict())
        .query(({ input }) => read(input.release_id, () => localRecordPage(input.kind, input.id) ?? null)),
      useCases: t.procedure
        .input(z.object({
          ...pinned, ...pagination,
          q: z.string().max(300).optional(),
          area: z.string().max(100).optional(),
          context: z.enum(["research", "clinical_research"]).optional(),
        }).strict())
        .query(({ input }) => read(input.release_id, (q) => q.useCases().list(omit(input)))),
      useCase: t.procedure
        .input(z.object({ ...pinned, slug: id, ...pagination }).strict())
        .query(({ input }) => read(input.release_id, (q) =>
          q.useCases().get({ slug: input.slug, cursor: input.cursor, limit: input.limit }))),
      useCaseEvaluationResults: t.procedure
        .input(z.object({ ...pinned, mapping_id: id, evaluation_id: id, ...pagination }).strict())
        .query(({ input }) => read(input.release_id, (q) => q.useCases().evaluationResults(omit(input)))),
      useCaseLinks: t.procedure
        .input(z.object({ ...pinned, id }).strict())
        .query(({ input }) => read(input.release_id, (q) => q.useCases().links({ id: input.id }))),
      comparison: t.procedure
        .input(z.object({ ...pinned, id, panel_id: id }).strict())
        .query(({ input }) => read(input.release_id, (q) => q.comparison(input))),
      results: t.procedure
        .input(z.object({
          ...pinned, ...pagination, id,
          metric: z.string().max(200).optional(),
          origin: z.string().max(100).optional(),
          configuration_id: id.optional(),
          protocol_id: id.optional(),
          dataset_id: id.optional(),
          tested_entity_id: id.optional(),
        }).strict())
        .query(({ input }) => read(input.release_id, (q) => q.results(omit(input)))),
      evidence: t.procedure
        .input(z.object({
          ...pinned, ...pagination, id,
          q: z.string().max(300).optional(),
          scope: z.enum(["individual_claim", "record_context", "catalogue_metadata", "source_metadata"]).optional(),
        }).strict())
        .query(({ input }) => read(input.release_id, (q) => q.evidence(omit(input)))),
      researchReadiness: t.procedure
        .input(z.object({
          ...pinned, ...pagination, id: id.optional(),
          capability: z.enum(researchCapabilities).optional(),
          ready: z.boolean().optional(),
        }).strict())
        .query(({ input }) => read(input.release_id, (q) => q.researchReadiness(omit(input)))),
      investigations: t.procedure
        .input(z.object({ ...pinned, ...pagination, id: id.optional(), record_id: id.optional() }).strict())
        .query(({ input }) => read(input.release_id, (q) => q.investigations(omit(input)))),
      auditRuns: t.procedure
        .input(z.object({ ...pinned, ...pagination }).strict())
        .query(({ input }) => read(input.release_id, (q) => q.auditRuns(input))),
      auditRecords: t.procedure
        .input(z.object({
          ...pinned, ...pagination,
          run_id: id.optional(),
          kind: z.string().max(100).optional(),
          date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
          date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
          q: z.string().max(300).optional(),
          outcome: z.enum(auditOutcomes).optional(),
          category: z.enum(auditCategories).optional(),
        }).strict())
        .query(({ input }) => read(input.release_id, (q) => q.auditRecords(input))),
      auditChecks: t.procedure
        .input(z.object({
          ...pinned, ...pagination,
          record_id: id,
          run_id: id.optional(),
          outcome: z.enum(auditOutcomes).optional(),
          category: z.enum(auditCategories).optional(),
        }).strict())
        .query(({ input }) => read(input.release_id, (q) => q.auditChecks(input))),
      compare: t.procedure
        .input(z.object({ ...pinned, ids: z.array(id).min(2).max(20) }).strict())
        .query(({ input }) => read(input.release_id, (q) => q.compare(input))),
    }),
  });
}
export type CatalogueRouter = ReturnType<typeof catalogueRouter>;
