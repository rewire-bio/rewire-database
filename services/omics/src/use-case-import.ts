import { createHash, randomUUID } from "node:crypto";
import {
  FieldValue,
  type Firestore,
  type DocumentData,
} from "firebase-admin/firestore";
import { z } from "zod";
import { commitInBatches } from "./catalogue.js";
import { recordsDigest } from "./catalogue-integrity.js";
import type { CatalogueSnapshot } from "./catalogue-query.js";
import { validateSnapshot } from "./validation.js";
import {
  useCaseHash,
  MAX_USE_CASE_BYTES,
  validateUseCaseArtifact,
  type UseCaseArtifact,
  type UseCaseDeclaration,
} from "./use-cases.js";

const FILE = "use-cases.json";
const CHUNK_BYTES = 400_000;
export { MAX_USE_CASE_BYTES } from "./use-cases.js";
const sha = (value: Buffer) => createHash("sha256").update(value).digest("hex");
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const declarationSchema = z
  .object({
    schema_version: z.literal("1.0"),
    input_sha256: digest,
    use_cases: z.number().int().nonnegative().max(500),
    mappings: z.number().int().nonnegative().max(2000),
  })
  .strict();
const storageSchema = z
  .object({
    schema_version: z.literal("1.0"),
    file_sha256: digest,
    input_sha256: digest,
    bytes: z.number().int().min(1).max(MAX_USE_CASE_BYTES),
    chunks: z
      .array(digest)
      .min(1)
      .max(Math.ceil(MAX_USE_CASE_BYTES / CHUNK_BYTES)),
  })
  .strict();

/** The optional file and declaration must agree in both immutable inputs. */
export function useCaseReleaseBinding(meta: DocumentData): {
  declaration?: UseCaseDeclaration;
  file_sha256?: string;
} {
  const declared = meta.manifest?.coverage?.use_cases;
  const covered = meta.coverage?.use_cases;
  const file = meta.manifest?.files?.[FILE];
  if (declared === undefined && covered === undefined && file === undefined) {
    if (meta.use_case_manifest || meta.use_case_lease)
      throw Error(
        "Undeclared use-case artifact cannot be attached to a release",
      );
    return {};
  }
  if (declared === undefined || covered === undefined || file === undefined)
    throw Error("Use-case declaration and manifest file must both be present");
  const declaration = declarationSchema.parse(declared);
  if (
    useCaseHash(declarationSchema.parse(covered)) !== useCaseHash(declaration)
  )
    throw Error(
      "Use-case declaration differs from immutable catalogue coverage",
    );
  const file_sha256 = digest.parse(
    typeof file === "string" ? file : file?.sha256,
  );
  return { declaration, file_sha256 };
}

/** Rechecked in the publication transaction after the complete artifact is read. */
export function useCasePublicationIdentity(meta: DocumentData): string {
  const binding = useCaseReleaseBinding(meta);
  if (binding.declaration) {
    if (!meta.use_case_manifest || meta.use_case_lease)
      throw Error("Use-case import must complete before publication");
    const stored = storageSchema.parse(meta.use_case_manifest);
    if (
      stored.file_sha256 !== binding.file_sha256 ||
      stored.input_sha256 !== binding.declaration.input_sha256
    )
      throw Error(
        "Use-case import metadata differs from immutable release manifest",
      );
  }
  return useCaseHash({
    manifest: meta.manifest ?? null,
    coverage: meta.coverage ?? null,
    stored: meta.use_case_manifest ?? null,
  });
}

/** Reads only a declared, completely imported artifact, never staging chunks. */
export async function readStoredUseCases(
  db: Firestore,
  releaseId: string,
  meta: DocumentData,
  snapshot: CatalogueSnapshot,
): Promise<{ artifact?: UseCaseArtifact; declaration?: UseCaseDeclaration }> {
  const binding = useCaseReleaseBinding(meta);
  if (!binding.declaration) return {};
  useCasePublicationIdentity(meta);
  const stored = storageSchema.parse(meta.use_case_manifest);
  const ref = db.collection("catalogueReleases").doc(releaseId);
  const chunks: Buffer[] = [];
  let length = 0;
  // Fetch only the bounded, manifest-listed chunks. Extra staging documents
  // cannot become part of a published artifact.
  for (const [index, hash] of stored.chunks.entries()) {
    const value = (
      await ref
        .collection("useCaseChunks")
        .doc(String(index).padStart(6, "0"))
        .get()
    ).data();
    if (
      !value ||
      value.index !== index ||
      typeof value.bytes_base64 !== "string" ||
      value.bytes_base64.length > Math.ceil(CHUNK_BYTES / 3) * 4
    )
      throw Error("Incomplete or invalid use-case artifact chunk");
    const bytes = Buffer.from(value.bytes_base64, "base64");
    if (bytes.toString("base64") !== value.bytes_base64 || sha(bytes) !== hash)
      throw Error("Use-case artifact chunk integrity failure");
    length += bytes.length;
    if (length > stored.bytes) throw Error("Use-case artifact length mismatch");
    chunks.push(bytes);
  }
  const bytes = Buffer.concat(chunks);
  if (bytes.length !== stored.bytes || sha(bytes) !== binding.file_sha256)
    throw Error("Use-case artifact integrity failure");
  if (
    snapshot.release_id !== releaseId ||
    useCaseHash(snapshot.coverage.use_cases) !==
      useCaseHash(binding.declaration)
  )
    throw Error("Use-case artifact snapshot binding mismatch");
  return {
    declaration: binding.declaration,
    artifact: validateUseCaseArtifact(
      snapshot,
      JSON.parse(bytes.toString("utf8")),
      binding.declaration,
    ),
  };
}

export async function importUseCaseFiles(
  db: Firestore,
  releaseId: string,
  manifest: Record<string, unknown>,
  files: Record<string, Buffer>,
) {
  const ref = db.collection("catalogueReleases").doc(releaseId);
  const assertBound = (meta: DocumentData | undefined) => {
    if (!meta || meta.state !== "ready")
      throw Error("Catalogue must be imported before its use cases");
    if (
      manifest.release_id !== releaseId ||
      manifest.schema_version !== meta.schema_version ||
      !meta.manifest ||
      useCaseHash(manifest) !== useCaseHash(meta.manifest)
    )
      throw Error(
        "Use-case manifest differs from immutable catalogue release manifest",
      );
    useCaseReleaseBinding(meta);
    return meta;
  };
  const meta = assertBound((await ref.get()).data());
  const binding = useCaseReleaseBinding(meta);
  if (!binding.declaration) {
    if (files[FILE])
      throw Error("Cannot import an undeclared use-case artifact");
    return;
  }
  const bytes = files[FILE];
  if (
    !bytes ||
    bytes.length > MAX_USE_CASE_BYTES ||
    sha(bytes) !== binding.file_sha256
  )
    throw Error("Use-case manifest mismatch or artifact exceeds serving limit");
  const chunks: Buffer[] = [];
  for (let offset = 0; offset < bytes.length; offset += CHUNK_BYTES)
    chunks.push(bytes.subarray(offset, offset + CHUNK_BYTES));
  const stored = storageSchema.parse({
    schema_version: "1.0",
    file_sha256: binding.file_sha256,
    input_sha256: binding.declaration.input_sha256,
    bytes: bytes.length,
    chunks: chunks.map(sha),
  });
  const alreadyImported = (value: DocumentData) => {
    if (!value.use_case_manifest) return false;
    if (useCaseHash(value.use_case_manifest) !== useCaseHash(stored))
      throw Error("Published use-case artifact is immutable");
    return true;
  };
  if (alreadyImported(meta)) return;
  if (meta.published_at)
    throw Error("Cannot attach new use cases to a published release");

  // Validate references against the stored catalogue, not a caller's snapshot.
  const records = (await ref.collection("records").get()).docs.map((doc) =>
    doc.data(),
  );
  const snapshot = validateSnapshot({
    schema_version: meta.schema_version,
    release_id: releaseId,
    released_at: meta.released_at,
    coverage: meta.coverage,
    records,
  });
  if (
    records.length !== meta.record_count ||
    (meta.records_digest &&
      recordsDigest(snapshot.records) !== meta.records_digest)
  )
    throw Error("Catalogue record integrity failure during use-case import");
  validateUseCaseArtifact(
    snapshot,
    JSON.parse(bytes.toString("utf8")),
    binding.declaration,
  );
  const owner = randomUUID();
  const proceed = await db.runTransaction(async (tx) => {
    const current = assertBound((await tx.get(ref)).data());
    if (alreadyImported(current)) return false;
    if (current.published_at)
      throw Error("Cannot attach new use cases to a published release");
    if (Date.parse(current.use_case_lease?.until || "") > Date.now())
      throw Error("Use-case import already in progress");
    tx.update(ref, {
      use_case_lease: {
        owner,
        file_sha256: binding.file_sha256,
        until: new Date(Date.now() + 15 * 60_000).toISOString(),
      },
    });
    return true;
  });
  if (!proceed) return;
  try {
    await commitInBatches(
      db,
      chunks.map((chunk, index) => ({
        ref: ref
          .collection("useCaseChunks")
          .doc(String(index).padStart(6, "0")),
        data: { index, bytes_base64: chunk.toString("base64") },
      })),
    );
    await db.runTransaction(async (tx) => {
      const current = assertBound((await tx.get(ref)).data());
      if (current.use_case_lease?.owner !== owner)
        throw Error("Use-case import lease replaced; cannot finalize");
      if (current.published_at)
        throw Error("Cannot attach new use cases to a published release");
      if (current.use_case_manifest)
        throw Error("Published use-case artifact is immutable");
      tx.update(ref, {
        use_case_manifest: stored,
        use_case_lease: FieldValue.delete(),
      });
    });
  } catch (error) {
    // Partial chunks remain invisible. A retry writes the same immutable bytes.
    await db.runTransaction(async (tx) => {
      if ((await tx.get(ref)).data()?.use_case_lease?.owner === owner)
        tx.update(ref, { use_case_lease: FieldValue.delete() });
    });
    throw error;
  }
}
