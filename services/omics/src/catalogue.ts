import { createHash, randomUUID } from "node:crypto";
import type { DocumentReference, Firestore } from "firebase-admin/firestore";
import { validateSnapshot } from "./validation.js";
import { createCatalogueQuery } from "./catalogue-query.js";
import { recordsDigest } from "./catalogue-integrity.js";
import { researchChunks, researchDigest } from "./research-store.js";

/**
 * Commit writes in batches bounded by bytes as well as by count.
 *
 * Firestore caps a batch at 500 writes and a request at about 11 MB, and the
 * second limit is the one a growing catalogue reaches first: a query chunk
 * holds up to 700 KB, so a few dozen of them in one batch is already over. A
 * fixed document count cannot express that, and the failure arrives as an
 * opaque INVALID_ARGUMENT partway through an import.
 */
export const BATCH_LIMITS = { writes: 400, bytes: 8_000_000 } as const;

export async function commitInBatches(
  db: Firestore,
  writes: { ref: DocumentReference; data: Record<string, unknown> }[],
) {
  const { writes: maxWrites, bytes: maxBytes } = BATCH_LIMITS;
  let batch = db.batch();
  let count = 0;
  let bytes = 0;
  for (const write of writes) {
    const size = Buffer.byteLength(JSON.stringify(write.data));
    if (count && (count >= maxWrites || bytes + size > maxBytes)) {
      await batch.commit();
      batch = db.batch();
      count = 0;
      bytes = 0;
    }
    batch.set(write.ref, write.data);
    count += 1;
    bytes += size;
  }
  if (count) await batch.commit();
}

export async function importRelease(
  db: Firestore,
  bytes: Buffer,
  manifest: Record<string, unknown>,
) {
  const snapshot = validateSnapshot(JSON.parse(bytes.toString("utf8")));
  if (
    manifest.release_id !== snapshot.release_id ||
    manifest.schema_version !== snapshot.schema_version
  )
    throw new Error("Manifest release/schema mismatch");
  const digest = createHash("sha256").update(bytes).digest("hex");
  // The snapshot digest is a required trust boundary: an arbitrary local file cannot be imported under a release manifest.
  const hashes = manifest.files as
    Record<string, string | { sha256: string }> | undefined;
  const expected = manifest.catalogue_sha256 || hashes?.["catalogue.json"];
  const expectedDigest =
    typeof expected === "object" && expected !== null
      ? (expected as { sha256: string }).sha256
      : expected;
  if (expectedDigest !== digest)
    throw new Error(
      'Manifest must contain the matching catalogue_sha256 or files["catalogue.json"] hash',
    );
  createCatalogueQuery(snapshot); // Prepare and validate relationship indexes before accepting an import.
  const ref = db.collection("catalogueReleases").doc(snapshot.release_id);
  const owner = randomUUID();
  const proceed = await db.runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists) {
      if (existing.data()?.digest !== digest)
        throw new Error("Release IDs are immutable");
      if (existing.data()?.state === "ready") return false;
      if (Date.parse(existing.data()?.lease_until || "") > Date.now())
        throw new Error("Release import already in progress");
    }
    tx.set(ref, {
      state: "staging",
      digest,
      owner,
      lease_until: new Date(Date.now() + 15 * 60_000).toISOString(),
      schema_version: snapshot.schema_version,
      released_at: snapshot.released_at,
      manifest,
      coverage: snapshot.coverage,
    });
    return true;
  });
  if (!proceed)
    return {
      release_id: snapshot.release_id,
      imported: false,
      records: snapshot.records.length,
    };
  await commitInBatches(
    db,
    snapshot.records.map((record) => ({
      ref: ref.collection("records").doc(record.id),
      data: record as Record<string, unknown>,
    })),
  );
  // Compact immutable read snapshots avoid a Firestore read per record on cold requests.
  const chunks: string[] = [];
  let group: typeof snapshot.records = [];
  let size = 2;
  for (const record of snapshot.records) {
    const bytes = Buffer.byteLength(JSON.stringify(record)) + 1;
    if (bytes > 700_000)
      throw new Error("Catalogue record exceeds serving limit");
    if (size + bytes > 700_000 && group.length) {
      chunks.push(JSON.stringify(group));
      group = [];
      size = 2;
    }
    group.push(record);
    size += bytes;
  }
  if (group.length) chunks.push(JSON.stringify(group));
  const research = snapshot.research ? researchChunks(snapshot.research) : undefined;
  if (research) await commitInBatches(db, research.map((items_json, index) => ({
    ref: ref.collection("researchChunks").doc(String(index).padStart(6, "0")), data: { index, items_json },
  })));
  await commitInBatches(
    db,
    chunks.map((records_json, index) => ({
      ref: ref.collection("queryChunks").doc(String(index).padStart(6, "0")),
      data: { index, records_json },
    })),
  );
  await db.runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.data()?.owner !== owner)
      throw new Error("Import lease replaced; cannot publish");
    tx.update(ref, {
      state: "ready",
      query_chunks: chunks.length,
      records_digest: recordsDigest(snapshot.records),
      record_count: snapshot.records.length,
      imported_at: new Date().toISOString(),
      ...(snapshot.research ? { research_schema_version: "1.0", research_chunks: research!.length, research_digest: researchDigest(snapshot.research), research_frozen_readiness: snapshot.research.readiness !== undefined } : {}),
    });
  });
  return {
    release_id: snapshot.release_id,
    imported: true,
    records: snapshot.records.length,
  };
}
