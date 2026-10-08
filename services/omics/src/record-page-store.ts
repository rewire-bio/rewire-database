import { createHash, randomUUID } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import {
  FieldValue,
  type DocumentReference,
  type Firestore,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import { TRPCError } from "@trpc/server";
import { commitInBatches } from "./catalogue.js";
import { recordsDigest } from "./catalogue-integrity.js";
import { createCatalogueQuery, type CatalogueRecord, type CatalogueSnapshot } from "./catalogue-query.js";
import { recordRouteKinds } from "./entity-kinds.js";
import {
  MAX_RECORD_PAGE_BYTES,
  RECORD_PAGE_SCHEMA,
  recordPageBuilder,
  recordPageDocumentId,
  recordPageRoutes,
  recordPagesDigest,
  sha256,
  validRecordPage,
  type RecordPage,
  type RecordPageKind,
} from "./record-pages.js";
import { readStoredUseCases } from "./use-case-import.js";
import { createUseCaseQuery } from "./use-cases.js";
import { validateSnapshot } from "./validation.js";

/** One subcollection and manifest field per page contract version. A new
 * contract is materialized beside the old one, never over it. */
export const RECORD_PAGE_COLLECTION = "recordPagesV1";
export const RECORD_PAGE_MANIFEST = "record_pages_v1";
const LEASE = `${RECORD_PAGE_MANIFEST}_lease`;
/** Firestore caps a document at 1 MiB including field names. */
const MAX_COMPRESSED_BYTES = 900_000;

export interface RecordPageManifest {
  schema_version: typeof RECORD_PAGE_SCHEMA;
  count: number;
  digest: string;
  kinds: Record<RecordPageKind, number>;
  records_digest: string;
  max_bytes: number;
}

export function encodeRecordPage(page: RecordPage) {
  const payload = JSON.stringify(page);
  const bytes = Buffer.byteLength(payload);
  const compressed = gzipSync(payload, { level: 9 });
  // Reject, never truncate: a smaller document would silently drop facts.
  if (bytes > MAX_RECORD_PAGE_BYTES || compressed.length > MAX_COMPRESSED_BYTES)
    throw new Error(
      `Record page ${page.route_kind}/${page.detail.record.id} exceeds the serving limit (${bytes} bytes, ${compressed.length} compressed)`,
    );
  return {
    doc_id: recordPageDocumentId(page.route_kind, page.detail.record.id),
    bytes,
    data: {
      schema_version: RECORD_PAGE_SCHEMA,
      release_id: page.release_id,
      kind: page.route_kind,
      id: page.detail.record.id,
      sha256: sha256(payload),
      bytes,
      payload_gzip: compressed,
    },
  };
}

export function decodeRecordPage(
  data: Record<string, unknown> | undefined,
  releaseId: string,
  kind: RecordPageKind,
  id: string,
): RecordPage {
  if (
    !data ||
    data.schema_version !== RECORD_PAGE_SCHEMA ||
    data.release_id !== releaseId ||
    data.kind !== kind ||
    data.id !== id ||
    !(data.payload_gzip instanceof Uint8Array) ||
    typeof data.sha256 !== "string"
  )
    throw new Error("Record page document does not match its route");
  const payload = gunzipSync(Buffer.from(data.payload_gzip), {
    maxOutputLength: MAX_RECORD_PAGE_BYTES,
  }).toString("utf8");
  if (sha256(payload) !== data.sha256) throw new Error("Record page integrity failure");
  const page: unknown = JSON.parse(payload);
  if (!validRecordPage(page, kind, id, releaseId))
    throw new Error("Record page document does not match its route");
  return page;
}

/** Every page of a validated release, built one at a time. */
function* releasePages(snapshot: CatalogueSnapshot, useCases: Parameters<typeof recordPageBuilder>[1]) {
  const query = createCatalogueQuery(snapshot);
  const build = recordPageBuilder(query, useCases);
  for (const { kind, record } of recordPageRoutes(snapshot)) {
    const page = build(kind, record.id);
    if (!page) throw new Error(`Record page ${kind}/${record.id} could not be built`);
    yield page;
  }
}
/** Pages per write flush: memory holds one bounded batch of compressed payloads, not the release. */
const FLUSH = { documents: 200, bytes: 6_000_000 } as const;

/** Counts and hashes the stored documents without downloading payloads. */
export async function storedRecordPages(ref: DocumentReference) {
  const entries: { doc_id: string; sha256: string }[] = [];
  for await (const doc of ref
    .collection(RECORD_PAGE_COLLECTION)
    .select("sha256")
    .stream() as unknown as AsyncIterable<QueryDocumentSnapshot>)
    entries.push({ doc_id: doc.id, sha256: String(doc.data().sha256) });
  return { count: entries.length, digest: recordPagesDigest(entries) };
}

export async function verifyStoredRecordPages(ref: DocumentReference, meta: Record<string, unknown>) {
  const manifest = meta[RECORD_PAGE_MANIFEST] as RecordPageManifest | undefined;
  if (!manifest || manifest.schema_version !== RECORD_PAGE_SCHEMA)
    throw new Error("Record page import must complete before publication");
  if (manifest.records_digest !== meta.records_digest)
    throw new Error("Record pages belong to different catalogue records");
  const stored = await storedRecordPages(ref);
  if (stored.count !== manifest.count || stored.digest !== manifest.digest)
    throw new Error("Stored record pages differ from their manifest");
  return manifest;
}

/**
 * Materializes page documents for an imported release. Pages are a derived
 * serving index: they may be attached after publication because they are
 * rebuilt from, and bound to, the release's immutable records and use cases.
 * The manifest is written only after the stored documents verify.
 */
export async function importRecordPages(db: Firestore, releaseId: string, catalogueBytes: Buffer) {
  const ref = db.collection("catalogueReleases").doc(releaseId);
  const meta = (await ref.get()).data();
  if (meta?.state !== "ready") throw new Error("Catalogue must be imported before its record pages");
  if (createHash("sha256").update(catalogueBytes).digest("hex") !== meta.digest)
    throw new Error("Catalogue bytes differ from the imported release");
  return materializeRecordPages(db, releaseId, meta, validateSnapshot(JSON.parse(catalogueBytes.toString("utf8"))));
}

/** Builds and stores pages from a validated snapshot bound to the release's records. */
export async function materializeRecordPages(db: Firestore, releaseId: string, meta: Record<string, any>, snapshot: CatalogueSnapshot) {
  const ref = db.collection("catalogueReleases").doc(releaseId);
  if (snapshot.release_id !== releaseId || (meta.records_digest && recordsDigest(snapshot.records) !== meta.records_digest))
    throw new Error("Catalogue records differ from the imported release");
  const stored = await readStoredUseCases(db, releaseId, meta, snapshot);
  const useCases = createUseCaseQuery(snapshot, stored.artifact, stored.declaration, createCatalogueQuery(snapshot));
  const existing = meta[RECORD_PAGE_MANIFEST] as RecordPageManifest | undefined;
  if (existing) {
    // Rebuild only the digests; nothing is compressed or written.
    const entries = [...releasePages(snapshot, useCases)].map((page) => ({
      doc_id: recordPageDocumentId(page.route_kind, page.detail.record.id), sha256: sha256(JSON.stringify(page)),
    }));
    if (existing.digest !== recordPagesDigest(entries) || existing.count !== entries.length)
      throw new Error("Record pages for this release are immutable and differ from this build");
    // A manifest alone is not proof: the documents it describes must all still be present.
    await verifyStoredRecordPages(ref, meta);
    return { release_id: releaseId, imported: false, pages: entries.length };
  }
  const owner = randomUUID();
  await db.runTransaction(async (tx) => {
    const current = (await tx.get(ref)).data();
    if (current?.[RECORD_PAGE_MANIFEST]) throw new Error("Record pages were imported concurrently; rerun to verify");
    if (Date.parse(current?.[LEASE]?.until || "") > Date.now()) throw new Error("Record page import already in progress");
    tx.update(ref, { [LEASE]: { owner, until: new Date(Date.now() + 30 * 60_000).toISOString() } });
  });
  let pages = 0;
  try {
    const entries: { doc_id: string; sha256: string }[] = [];
    const kinds: Record<RecordPageKind, number> = { result: 0, evaluation: 0 };
    let maxBytes = 0;
    let batch: Parameters<typeof commitInBatches>[1] = [];
    let batchBytes = 0;
    const flush = async () => { if (batch.length) await commitInBatches(db, batch); batch = []; batchBytes = 0; };
    for (const page of releasePages(snapshot, useCases)) {
      const encoded = encodeRecordPage(page);
      entries.push({ doc_id: encoded.doc_id, sha256: encoded.data.sha256 });
      kinds[encoded.data.kind]++;
      maxBytes = Math.max(maxBytes, encoded.bytes);
      batch.push({ ref: ref.collection(RECORD_PAGE_COLLECTION).doc(encoded.doc_id), data: encoded.data });
      batchBytes += encoded.data.payload_gzip.length;
      if (batch.length >= FLUSH.documents || batchBytes >= FLUSH.bytes) await flush();
    }
    await flush();
    const manifest: RecordPageManifest = {
      schema_version: RECORD_PAGE_SCHEMA, count: entries.length, digest: recordPagesDigest(entries),
      kinds, records_digest: meta.records_digest, max_bytes: maxBytes,
    };
    const written = await storedRecordPages(ref);
    if (written.count !== manifest.count || written.digest !== manifest.digest)
      throw new Error("Stored record pages differ from this import; no manifest written");
    await db.runTransaction(async (tx) => {
      const current = (await tx.get(ref)).data();
      if (current?.[LEASE]?.owner !== owner) throw new Error("Record page import lease replaced; cannot finalize");
      if (current.digest !== meta.digest || current.records_digest !== meta.records_digest)
        throw new Error("Release changed during record page import");
      tx.update(ref, { [RECORD_PAGE_MANIFEST]: manifest, [LEASE]: FieldValue.delete() });
    });
    pages = manifest.count;
  } catch (error) {
    // Documents without a manifest are never served. A retry rewrites the same bytes.
    await db.runTransaction(async (tx) => {
      if ((await tx.get(ref)).data()?.[LEASE]?.owner === owner) tx.update(ref, { [LEASE]: FieldValue.delete() });
    });
    throw error;
  }
  return { release_id: releaseId, imported: true, pages };
}

// Published release metadata never changes, so a positive check is reused by
// later requests on a warm instance. Failures are rechecked every time.
const readyReleases = new WeakMap<Firestore, Map<string, true>>();

/**
 * Bounded page read: the release document (once per warm instance) and the
 * page document. When the page document is absent, the stored record decides:
 * no record, an excluded record or another route kind is a genuine absence
 * (null); a renderable record without its page is broken materialization and
 * an error, never a 404. Unpublished releases are errors too.
 */
export async function readRecordPage(
  db: Firestore,
  releaseId: string,
  kind: RecordPageKind,
  id: string,
): Promise<RecordPage | null> {
  const ref = db.collection("catalogueReleases").doc(releaseId);
  let ready = readyReleases.get(db);
  if (!ready) readyReleases.set(db, (ready = new Map()));
  if (!ready.has(releaseId)) {
    const meta = (await ref.get()).data();
    if (meta?.state !== "ready" || !meta.published_at)
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Pinned catalogue release is not published." });
    const manifest = meta[RECORD_PAGE_MANIFEST] as RecordPageManifest | undefined;
    if (manifest?.schema_version !== RECORD_PAGE_SCHEMA || manifest.records_digest !== meta.records_digest)
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Record pages are not materialized for this release." });
    ready.set(releaseId, true);
    while (ready.size > 8) ready.delete(ready.keys().next().value!);
  }
  const doc = await ref.collection(RECORD_PAGE_COLLECTION).doc(recordPageDocumentId(kind, id)).get();
  if (!doc.exists) {
    const record = (await ref.collection("records").doc(id).get()).data() as CatalogueRecord | undefined;
    if (!record || record.status === "excluded" || !recordRouteKinds(record).includes(kind)) return null;
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Record page is missing for a published record." });
  }
  try {
    return decodeRecordPage(doc.data(), releaseId, kind, id);
  } catch (error) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: error instanceof Error ? error.message : "Invalid record page",
    });
  }
}
