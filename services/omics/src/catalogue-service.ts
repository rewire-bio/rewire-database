import type {
  Firestore,
  QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import { TRPCError } from "@trpc/server";
import {
  createCatalogueQuery,
  type CatalogueQuery,
} from "./catalogue-query.js";
import { validateSnapshot } from "./validation.js";
import { recordsDigest } from "./catalogue-integrity.js";
import {
  readStoredUseCases,
  useCasePublicationIdentity,
} from "./use-case-import.js";
import { readResearchChunks } from "./research-store.js";

// One bounded, promise-coalesced snapshot per immutable release per warm instance.
// Published releases are never modified. The active pointer itself is read afresh.
const caches = new WeakMap<Firestore, Map<string, Promise<CatalogueQuery>>>();
export async function catalogueQuery(
  db: Firestore,
  pinnedRelease?: string,
): Promise<CatalogueQuery> {
  const releaseId =
    pinnedRelease ||
    (await db.doc("cataloguePublication/active").get()).data()?.release_id;
  if (typeof releaseId !== "string")
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "No catalogue release is published.",
    });
  let cache = caches.get(db);
  if (!cache) {
    cache = new Map();
    caches.set(db, cache);
  }
  const found = cache.get(releaseId);
  if (found) return found;
  // Bounded load-path diagnostics (RCA for catalogue.release failures on large
  // releases): counts, elapsed time and process memory only. Never record
  // contents, error messages or unvalidated caller input. Remove once the
  // production incident is root-caused.
  const loadStart = performance.now();
  let loadStage = "start";
  // Caller-supplied via pinnedRelease; only log it if it matches the same
  // shape the public API already requires release IDs to have (see `id` in
  // validation.ts), so arbitrary request content never reaches the logs.
  const loggableReleaseId = /^[a-z0-9][a-z0-9-]{0,254}$/.test(releaseId)
    ? releaseId
    : null;
  const mem = () => {
    const { heapUsed, rss } = process.memoryUsage();
    return { heap_mb: Math.round(heapUsed / 1048576), rss_mb: Math.round(rss / 1048576) };
  };
  const errorClass = (error: unknown) =>
    error instanceof Error ? error.name : typeof error;
  const markStage = (stage: string, extra: Record<string, unknown> = {}) => {
    loadStage = stage;
    console.log(
      JSON.stringify({
        at: "catalogueQuery",
        release_id: loggableReleaseId,
        stage,
        elapsed_ms: Math.round(performance.now() - loadStart),
        ...mem(),
        ...extra,
      }),
    );
  };
  const pending = (async () => {
    const ref = db.collection("catalogueReleases").doc(releaseId);
    const meta = (await ref.get()).data();
    markStage("meta", { record_count: meta?.record_count, query_chunks: meta?.query_chunks });
    // Import completion alone never makes a release public.
    if (meta?.state !== "ready" || !meta.published_at)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Published catalogue release not found.",
      });
    let records: unknown[];
    if (meta.query_chunks) {
      records = [];
      let chunkCount = 0;
      // Do not retain the complete raw Firestore response alongside its parsed
      // catalogue: expanded releases exceed the function's memory budget.
      for await (const doc of ref
        .collection("queryChunks")
        .orderBy("index")
        .stream() as unknown as AsyncIterable<QueryDocumentSnapshot>) {
        records.push(...JSON.parse(doc.data().records_json));
        chunkCount++;
      }
      if (chunkCount !== meta.query_chunks)
        throw new Error("Incomplete catalogue query snapshot");
    } else {
      records = [];
      for await (const doc of ref
        .collection("records")
        .stream() as unknown as AsyncIterable<QueryDocumentSnapshot>)
        records.push(doc.data());
    }
    markStage("records_loaded", { records_length: records.length });
    if (records.length !== meta.record_count)
      throw new Error("Catalogue record count mismatch");
    const snapshot = validateSnapshot({
      schema_version: meta.schema_version,
      release_id: releaseId,
      released_at: meta.released_at,
      coverage: meta.coverage,
      records,
      ...((meta.research_schema_version || meta.coverage?.research_schema_version) ? { research: await readResearchChunks(ref, meta) } : {}),
    });
    markStage("validated");
    if (
      meta.records_digest &&
      recordsDigest(snapshot.records) !== meta.records_digest
    )
      throw new Error("Catalogue serving snapshot integrity failure");
    markStage("digest_verified");
    const query = createCatalogueQuery(snapshot);
    markStage("query_built");
    return query;
  })().catch((error) => {
    console.error(
      JSON.stringify({
        at: "catalogueQuery",
        release_id: loggableReleaseId,
        stage: "failed",
        failed_after_stage: loadStage,
        elapsed_ms: Math.round(performance.now() - loadStart),
        ...mem(),
        error_class: errorClass(error),
      }),
    );
    throw error;
  });
  cache.set(releaseId, pending);
  // One full release per instance; historical requests remain supported but do
  // not retain several complete catalogues alongside the current release.
  while (cache.size > 1) cache.delete(cache.keys().next().value!);
  try {
    return await pending;
  } catch (error) {
    cache.delete(releaseId);
    throw error;
  }
}
/** Publication and rollback use the same atomic pointer operation. */
export async function activateRelease(db: Firestore, releaseId: string) {
  const ref = db.collection("catalogueReleases").doc(releaseId);
  // Validate complete data before exposing it. No unreviewed source is imported here.
  const meta = (await ref.get()).data();
  if (meta?.state !== "ready")
    throw new Error("Only complete, ready releases can be published");
  if (meta.coverage?.audit_history && !meta.audit_manifest)
    throw new Error("Audit import must complete before publication");
  const useCaseIdentity = useCasePublicationIdentity(meta);
  const records = (await ref.collection("records").get()).docs.map((d) =>
    d.data(),
  );
  if (records.length !== meta.record_count)
    throw new Error("Incomplete release records");
  const snapshot = validateSnapshot({
    schema_version: meta.schema_version,
    release_id: releaseId,
    released_at: meta.released_at,
    coverage: meta.coverage,
    records,
    ...((meta.research_schema_version || meta.coverage?.research_schema_version) ? { research: await readResearchChunks(ref, meta) } : {}),
  });
  createCatalogueQuery(snapshot);
  if (
    meta.records_digest &&
    recordsDigest(snapshot.records) !== meta.records_digest
  )
    throw new Error("Catalogue record integrity failure");
  await readStoredUseCases(db, releaseId, meta, snapshot);
  if (meta.query_chunks) {
    const chunks = await ref.collection("queryChunks").orderBy("index").get();
    if (chunks.size !== meta.query_chunks)
      throw new Error("Incomplete catalogue query snapshot");
    const served = chunks.docs.flatMap((d) =>
      JSON.parse(d.data().records_json),
    );
    if (recordsDigest(served) !== recordsDigest(snapshot.records))
      throw new Error("Catalogue serving snapshot differs from records");
  }
  const previous = await db.runTransaction(async (tx) => {
    const current = await tx.get(db.doc("cataloguePublication/active"));
    const release = await tx.get(ref);
    if (
      release.data()?.state !== "ready" ||
      release.data()?.digest !== meta.digest
    )
      throw new Error("Release changed during activation");
    const currentRelease = release.data()!;
    if (useCasePublicationIdentity(currentRelease) !== useCaseIdentity)
      throw new Error("Use-case release metadata changed during activation");
    if (
      currentRelease.coverage?.audit_history &&
      !currentRelease.audit_manifest
    )
      throw new Error("Audit import must complete before publication");
    const now = new Date().toISOString();
    tx.update(ref, { published_at: release.data()?.published_at || now });
    tx.set(db.doc("cataloguePublication/active"), {
      release_id: releaseId,
      previous_release_id: current.data()?.release_id || null,
      activated_at: now,
    });
    return current.data()?.release_id || null;
  });
  return { release_id: releaseId, previous_release_id: previous };
}
