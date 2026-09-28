import type { Firestore } from "firebase-admin/firestore";
import { TRPCError } from "@trpc/server";
import { catalogueQuery } from "./catalogue-service.js";
import {
  readStoredUseCases,
  useCasePublicationIdentity,
} from "./use-case-import.js";
import { createUseCaseQuery } from "./use-cases.js";

type UseCaseQuery = ReturnType<typeof createUseCaseQuery>;
// One validated resolver per warm instance; concurrent reads share construction.
const cache = new WeakMap<
  Firestore,
  {
    release: string;
    identity: string;
    pending: Promise<UseCaseQuery>;
  }
>();

export async function useCaseQuery(
  db: Firestore,
  releaseId: string,
): Promise<UseCaseQuery> {
  const meta = (
    await db.collection("catalogueReleases").doc(releaseId).get()
  ).data();
  if (meta?.state !== "ready" || !meta.published_at)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Published catalogue release not found.",
    });
  const identity = `${meta.digest}:${useCasePublicationIdentity(meta)}`;
  const found = cache.get(db);
  if (found?.release === releaseId && found.identity === identity)
    return found.pending;
  const pending = (async () => {
    const query = await catalogueQuery(db, releaseId);
    const snapshot = query.snapshot();
    const data = await readStoredUseCases(db, releaseId, meta, snapshot);
    return createUseCaseQuery(snapshot, data.artifact, data.declaration, query);
  })();
  const entry = { release: releaseId, identity, pending };
  cache.set(db, entry);
  try {
    return await pending;
  } catch (error) {
    if (cache.get(db) === entry) cache.delete(db);
    throw error;
  }
}
