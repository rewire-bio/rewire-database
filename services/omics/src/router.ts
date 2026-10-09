import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";
import type { Context } from "./auth.js";
import { firebase } from "./firebase.js";
import { contribution, patch, id } from "./validation.js";
import * as store from "./store.js";
// Submissions and curation. The public catalogue API is served by the
// website from the release its image embeds (lib/catalogue-api.ts there).
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
const privatePagination = {
  cursor: z.string().max(2000).optional(),
  limit: z.number().int().min(1).max(200).optional(),
};
export const appRouter = t.router({
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
      .query(({ ctx, input }) =>
        store.listOwn(firebase().db, ctx.user.uid, input),
      ),
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
        z
          .object({
            status: z.enum(store.statuses).optional(),
            ...privatePagination,
          })
          .strict()
          .default({}),
      )
      .query(({ input }) =>
        store.curatorList(firebase().db, input.status, input),
      ),
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
