import { auditRuns, auditRecords, auditChecks } from "./audit-service.js";
import { auditOutcomes, auditCategories } from "./audit.js";
import { entityKinds } from "./entity-kinds.js";
import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";
import type { Context } from "./auth.js";
import { firebase } from "./firebase.js";
import { contribution, patch, id } from "./validation.js";
import * as store from "./store.js";
import { catalogueQuery } from "./catalogue-service.js";
import type { CatalogueQuery } from "./catalogue-query.js";
const t = initTRPC.context<Context>().create();
const authenticated = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user?.email_verified || !ctx.user.email)
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Sign in with your verified email.",
    });
  return next({ ctx: { user: ctx.user } });
});
const curator = authenticated.use(({ ctx, next }) => {
  if (ctx.user.curator !== true)
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Curator access required.",
    });
  return next();
});
const pinned = { release_id: id };
const pagination = {
  cursor: z.string().max(8000).optional(),
  limit: z.number().int().min(1).max(100).optional(),
};
const privatePagination = {
  cursor: z.string().max(2000).optional(),
  limit: z.number().int().min(1).max(200).optional(),
};
async function readCatalogue<T>(
  releaseId: string | undefined,
  run: (query: CatalogueQuery) => T,
): Promise<T> {
  const query = await catalogueQuery(firebase().db, releaseId);
  try {
    return run(query);
  } catch (error) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        error instanceof Error ? error.message : "Invalid catalogue query",
    });
  }
}
export const appRouter = t.router({
  catalogue: t.router({
    release: t.procedure
      .input(z.object({ release_id: id.optional() }).strict().default({}))
      .query(({ input }) =>
        readCatalogue(input.release_id, (q) => q.release()),
      ),
    list: t.procedure
      .input(
        z
          .object({
            ...pinned,
            ...pagination,
            kind: z.enum([...entityKinds]).optional(),
            q: z.string().max(300).optional(),
            area: z.string().max(100).optional(),
            status: z.string().max(100).optional(),
            origin: z.string().max(100).optional(),
          })
          .strict(),
      )
      .query(({ input }) =>
        readCatalogue(input.release_id, (q) => {
          const { release_id, ...query } = input;
          return q.list(query);
        }),
      ),
    get: t.procedure
      .input(z.object({ ...pinned, id }).strict())
      .query(({ input }) =>
        readCatalogue(input.release_id, (q) => q.get({ ...input, include_comparisons: false })),
      ),
    comparison: t.procedure
      .input(z.object({ ...pinned, id, panel_id: id }).strict())
      .query(({ input }) => readCatalogue(input.release_id, q => q.comparison(input))),
    results: t.procedure
      .input(
        z
          .object({
            ...pinned,
            ...pagination,
            id,
            metric: z.string().max(200).optional(),
            origin: z.string().max(100).optional(),
            configuration_id: id.optional(),
          })
          .strict(),
      )
      .query(({ input }) =>
        readCatalogue(input.release_id, (q) => {
          const { release_id, ...query } = input;
          return q.results(query);
        }),
      ),
    evidence: t.procedure
      .input(
        z
          .object({
            ...pinned,
            ...pagination,
            id,
            q: z.string().max(300).optional(),
            scope: z
              .enum([
                "individual_claim",
                "record_context",
                "catalogue_metadata",
                "source_metadata",
              ])
              .optional(),
          })
          .strict(),
      )
      .query(({ input }) =>
        readCatalogue(input.release_id, (q) => {
          const { release_id, ...filters } = input;
          return q.evidence(filters);
        }),
      ),
    auditRuns: t.procedure.input(z.object({...pinned,...pagination}).strict()).query(({input})=>auditRuns(firebase().db,input)),
    auditRecords: t.procedure.input(z.object({...pinned,...pagination,run_id:id.optional(),kind:z.string().max(100).optional(),date_from:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),date_to:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),q:z.string().max(300).optional(),outcome:z.enum(auditOutcomes).optional(),category:z.enum(auditCategories).optional()}).strict()).query(({input})=>auditRecords(firebase().db,input)),
    auditChecks: t.procedure.input(z.object({...pinned,...pagination,record_id:id,run_id:id.optional(),outcome:z.enum(auditOutcomes).optional(),category:z.enum(auditCategories).optional()}).strict()).query(({input})=>auditChecks(firebase().db,input)),
    compare: t.procedure
      .input(z.object({ ...pinned, ids: z.array(id).min(2).max(20) }).strict())
      .query(({ input }) =>
        readCatalogue(input.release_id, (q) => q.compare(input)),
      ),
  }),
  submission: t.router({
    create: authenticated
      .input(
        z
          .object({ contribution, idempotencyKey: z.string().min(16).max(128) })
          .strict(),
      )
      .mutation(({ ctx, input }) =>
        store.createSubmission(
          firebase().db,
          ctx.user,
          input.contribution,
          input.idempotencyKey,
        ),
      ),
    list: authenticated
      .input(z.object(privatePagination).strict().default({}))
      .query(({ ctx, input }) => store.listOwn(firebase().db, ctx.user.uid, input)),
    get: authenticated
      .input(z.object({ id }))
      .query(({ ctx, input }) =>
        store.getOwn(firebase().db, ctx.user.uid, input.id),
      ),
    update: authenticated
      .input(z.object({ id, patch }).strict())
      .mutation(({ ctx, input }) =>
        store.updateOwn(firebase().db, ctx.user, input.id, input.patch),
      ),
  }),
  curator: t.router({
    list: curator
      .input(
        z.object({ status: z.enum(store.statuses).optional(), ...privatePagination }).strict().default({}),
      )
      .query(({ input }) => store.curatorList(firebase().db, input.status, input)),
    transition: curator
      .input(
        z
          .object({
            id,
            status: z.enum(store.statuses),
            note: z.string().trim().min(1).max(10_000),
            publishedIds: z.array(id).max(100).optional(),
            releaseId: id.optional(),
          })
          .strict(),
      )
      .mutation(({ input }) =>
        store.transition(
          firebase().db,
          input.id,
          input.status,
          input.note,
          input.publishedIds,
          input.releaseId,
        ),
      ),
    proposal: curator
      .input(z.object({ id }))
      .query(({ input }) => store.proposal(firebase().db, input.id)),
  }),
});
export type AppRouter = typeof appRouter;
