import { createHash, randomUUID } from "node:crypto";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import {
  auditRunSchema,
  auditCheckSchema,
  auditResolutionSchema,
  validateAudit,
  auditIndex,
  canonicalAudit,
  type AuditCheck,
  type AuditIndexRow,
} from "./audit.js";
import { commitInBatches } from "./catalogue.js";
const sha = (s: string | Buffer) =>
  createHash("sha256").update(s).digest("hex");
export async function importAuditFiles(
  db: Firestore,
  releaseId: string,
  manifest: Record<string, unknown>,
  files: Record<string, Buffer>,
) {
  const ref = db.collection("catalogueReleases").doc(releaseId);
  const auditHashes = (value: Record<string, unknown>) => {
    const entries = value.files;
    if (!entries || typeof entries !== "object" || Array.isArray(entries))
      throw Error("Audit manifest files are missing");
    return Object.fromEntries(
      Object.entries(entries)
        .filter(([name]) => name.startsWith("audit-") && name.endsWith(".json"))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, entry]) => {
          const hash = typeof entry === "string" ? entry : entry?.sha256;
          if (typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash))
            throw Error(`Invalid audit manifest hash: ${name}`);
          return [name, hash];
        }),
    );
  };
  const hashes = auditHashes(manifest);
  const required = Object.keys(hashes);
  const filesDigest = sha(
    JSON.stringify(required.map((name) => [name, hashes[name]])),
  );
  // The stored catalogue manifest is the trust boundary, not a supplied set of
  // mutually consistent files and hashes. Recheck it inside both transactions.
  const assertBound = (release: FirebaseFirestore.DocumentData | undefined) => {
    if (!release || release.state !== "ready")
      throw Error("Catalogue must be imported before its audit");
    if (
      manifest.release_id !== releaseId ||
      manifest.schema_version !== release.schema_version ||
      !release.manifest ||
      canonicalAudit(manifest) !== canonicalAudit(release.manifest)
    )
      throw Error(
        "Audit manifest differs from immutable catalogue release manifest",
      );
    return release;
  };
  const release = assertBound((await ref.get()).data());
  if (!required.length) return;
  for (const name of required)
    if (!files[name] || sha(files[name]) !== hashes[name])
      throw Error(`Audit manifest mismatch: ${name}`);
  const alreadyImported = (value: FirebaseFirestore.DocumentData) => {
    if (!value.audit_manifest) return false;
    if (value.audit_manifest.files_digest !== filesDigest)
      throw Error("Published audit is immutable");
    return true;
  };
  if (alreadyImported(release)) return;
  if (release.published_at)
    throw Error("Cannot attach new audit to a published release");
  const parse = (name: string) => JSON.parse(files[name].toString());
  const runs = parse("audit-runs.json").map((r: unknown) =>
    auditRunSchema.parse(r),
  );
  const resolutions = parse("audit-resolutions.json").map((r: unknown) =>
    auditResolutionSchema.parse(r),
  );
  const rows: AuditIndexRow[] = parse("audit-index.json");
  const checkChunks: Record<string, string> = {};
  const writes = [];
  const allChecks: AuditCheck[] = [];
  const membership = new Map<string, string[]>();
  for (const name of required.filter((n) => n.startsWith("audit-checks-"))) {
    const id = name.slice(13, -5);
    const checks = parse(name).map((c: unknown) => auditCheckSchema.parse(c));
    allChecks.push(...checks);
    for (const c of checks) {
      const ids = membership.get(c.record_id) || [];
      if (!ids.includes(id)) ids.push(id);
      membership.set(c.record_id, ids);
    }
    const checks_json = JSON.stringify(checks);
    checkChunks[id] = sha(checks_json);
    writes.push({
      ref: ref.collection("auditCheckChunks").doc(id),
      data: { checks_json },
    });
  }
  validateAudit({
    schema_version: "1.0",
    runs,
    checks: allChecks,
    resolutions,
  });
  const expected = auditIndex(allChecks);
  const observed = rows.map(({ chunk_ids, ...row }) => row);
  if (
    canonicalAudit(expected.map(({ chunk_ids, ...row }) => row)) !==
    canonicalAudit(observed)
  )
    throw Error("Audit index does not match checks");
  for (const row of rows)
    if (
      canonicalAudit([...row.chunk_ids].sort()) !==
      canonicalAudit((membership.get(row.record_id) || []).sort())
    )
      throw Error("Audit chunk membership differs");
  const chunks: string[] = [];
  let group: AuditIndexRow[] = [];
  let size = 2;
  for (const row of rows) {
    const bytes = Buffer.byteLength(JSON.stringify(row)) + 1;
    if (size + bytes > 550_000 && group.length) {
      chunks.push(JSON.stringify(group));
      group = [];
      size = 2;
    }
    group.push(row);
    size += bytes;
  }
  if (group.length) chunks.push(JSON.stringify(group));
  chunks.forEach((rows_json, index) =>
    writes.push({
      ref: ref
        .collection("auditIndexChunks")
        .doc(String(index).padStart(6, "0")),
      data: { index, rows_json },
    }),
  );
  const owner = randomUUID();
  const proceed = await db.runTransaction(async (tx) => {
    const current = assertBound((await tx.get(ref)).data());
    if (alreadyImported(current)) return false;
    if (current.published_at)
      throw Error("Cannot attach new audit to a published release");
    if (Date.parse(current.audit_lease?.until || "") > Date.now())
      throw Error("Audit import already in progress");
    tx.update(ref, {
      audit_lease: {
        owner,
        files_digest: filesDigest,
        until: new Date(Date.now() + 15 * 60_000).toISOString(),
      },
    });
    return true;
  });
  if (!proceed) return;
  try {
    await commitInBatches(db, writes);
    await db.runTransaction(async (tx) => {
      const current = assertBound((await tx.get(ref)).data());
      if (current.audit_lease?.owner !== owner)
        throw Error("Audit import lease replaced; cannot finalize");
      if (current.published_at)
        throw Error("Cannot attach new audit to a published release");
      if (current.audit_manifest) throw Error("Published audit is immutable");
      tx.update(ref, {
        audit_manifest: {
          files_digest: filesDigest,
          records: rows.length,
          runs,
          resolutions,
          index_chunks: chunks.map(sha),
          check_chunks: checkChunks,
        },
        audit_lease: FieldValue.delete(),
      });
    });
  } catch (error) {
    // Partial chunks are not served without audit_manifest. A retry writes the
    // same pinned content. Never release a newer importer's lease.
    await db.runTransaction(async (tx) => {
      const current = (await tx.get(ref)).data();
      if (current?.audit_lease?.owner === owner)
        tx.update(ref, { audit_lease: FieldValue.delete() });
    });
    throw error;
  }
}
