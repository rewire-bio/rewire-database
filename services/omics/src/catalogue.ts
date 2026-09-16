import { createHash, randomUUID } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { validateSnapshot } from "./validation.js";
import { createCatalogueQuery } from "./catalogue-query.js";
import { recordsDigest } from "./catalogue-integrity.js";

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
  for (let offset = 0; offset < snapshot.records.length; offset += 400) {
    const batch = db.batch();
    for (const record of snapshot.records.slice(offset, offset + 400))
      batch.set(ref.collection("records").doc(record.id), record);
    await batch.commit();
  }
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
  for (let offset = 0; offset < chunks.length; offset += 400) {
    const batch = db.batch();
    chunks
      .slice(offset, offset + 400)
      .forEach((records_json, i) =>
        batch.set(
          ref
            .collection("queryChunks")
            .doc(String(offset + i).padStart(6, "0")),
          { index: offset + i, records_json },
        ),
      );
    await batch.commit();
  }
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
    });
  });
  return {
    release_id: snapshot.release_id,
    imported: true,
    records: snapshot.records.length,
  };
}
