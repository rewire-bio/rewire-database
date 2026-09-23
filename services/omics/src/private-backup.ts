/** Private operational snapshot. Never use this for public release exports. */
import { createHash } from "node:crypto";
import { open, readFile, realpath, stat, unlink } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { initializeApp, deleteApp } from "firebase-admin/app";
import {
  DocumentReference,
  GeoPoint,
  Timestamp,
  getFirestore,
  type Firestore,
} from "firebase-admin/firestore";

export const privateCollections = [
  "privateSubmissions",
  "privateIdempotency",
  "privateOutbox",
  "privateRateLimits",
  "privateMailQuota",
] as const;
type Encoded = { type: string; value: unknown };
type Snapshot = {
  schema: 1;
  project: string;
  captured_at: string;
  documents: { path: string; data: Encoded }[];
};
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function encode(value: unknown, db?: Firestore): Encoded {
  if (value instanceof Timestamp)
    return { type: "timestamp", value: [value.seconds, value.nanoseconds] };
  if (value instanceof Date) return encode(Timestamp.fromDate(value), db);
  if (value instanceof GeoPoint)
    return { type: "geopoint", value: [value.latitude, value.longitude] };
  if (value instanceof DocumentReference) {
    // Firestore's decoder discards the origin project from reference values.
    // Reject all references in portable snapshots rather than silently rebind one.
    if (db) throw new Error("Document references are unsupported in private backups");
    return { type: "reference", value: value.path };
  }
  if (Buffer.isBuffer(value) || value instanceof Uint8Array)
    return { type: "bytes", value: Buffer.from(value).toString("base64") };
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return { type: "scalar", value };
  if (typeof value === "number")
    return {
      type: "number",
      value: Number.isFinite(value) ? value : String(value),
    };
  if (Array.isArray(value)) return { type: "array", value: value.map(item => encode(item, db)) };
  if (
    value &&
    typeof value === "object" &&
    Object.getPrototypeOf(value) === Object.prototype
  )
    return {
      type: "map",
      value: Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, encode(v, db)]),
      ),
    };
  throw new Error("Unsupported Firestore value; no snapshot written");
}
export function decode(node: Encoded, db: Firestore): unknown {
  if (!node || typeof node !== "object")
    throw new Error("Invalid encoded value");
  const value = node.value;
  switch (node.type) {
    case "scalar":
      if (
        value === null ||
        typeof value === "string" ||
        typeof value === "boolean"
      )
        return value;
      break;
    case "number":
      if (typeof value === "number" && Number.isFinite(value)) return value;
      if (value === "NaN") return NaN;
      if (value === "Infinity") return Infinity;
      if (value === "-Infinity") return -Infinity;
      break;
    case "timestamp":
      if (
        Array.isArray(value) &&
        value.length === 2 &&
        value.every(Number.isInteger)
      )
        return new Timestamp(value[0], value[1]);
      break;
    case "geopoint":
      if (
        Array.isArray(value) &&
        value.length === 2 &&
        value.every((v) => typeof v === "number")
      )
        return new GeoPoint(value[0], value[1]);
      break;
    case "reference":
      if (typeof value === "string") return db.doc(value);
      break;
    case "bytes":
      if (
        typeof value === "string" &&
        Buffer.from(value, "base64").toString("base64") === value
      )
        return Buffer.from(value, "base64");
      break;
    case "array":
      if (Array.isArray(value)) return value.map((v) => decode(v, db));
      break;
    case "map":
      if (value && typeof value === "object" && !Array.isArray(value))
        return Object.fromEntries(
          Object.entries(value).map(([k, v]) => [k, decode(v as Encoded, db)]),
        );
      break;
  }
  throw new Error("Invalid encoded value");
}
function privatePath(path: string): boolean {
  const parts = path.split("/");
  return (
    parts.every(Boolean) &&
    ((parts.length === 2 &&
      privateCollections.includes(
        parts[0] as (typeof privateCollections)[number],
      )) ||
      (parts.length === 4 &&
        parts[0] === "privateSubmissions" &&
        parts[2] === "revisions"))
  );
}
async function outsideRepository(path: string) {
  if (!isAbsolute(path))
    throw new Error(
      "Use an absolute path on private encrypted storage outside Git",
    );
  let dir = await realpath(dirname(path));
  for (;;) {
    try {
      await stat(join(dir, ".git"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const parent = dirname(dir);
      if (parent === dir) return;
      dir = parent;
      continue;
    }
    throw new Error("Private snapshots must be outside Git repositories");
  }
}
async function privateDirectory(path: string) {
  await outsideRepository(path);
  if ((await stat(dirname(path))).mode & 0o077)
    throw new Error("Private snapshot directory must exclude group and other access (0700)");
}
async function privateInput(path: string) {
  if (!isAbsolute(path)) throw new Error("Use an absolute private snapshot path");
  const actual = await realpath(path);
  await privateDirectory(actual);
  const info = await stat(actual);
  if (!info.isFile() || (info.mode & 0o077))
    throw new Error("Private snapshot and checksum must be regular restricted files (0600)");
}
export async function backupPrivate(
  db: Firestore,
  project: string,
  output: string,
) {
  if (
    !project ||
    (db as Firestore & { readonly projectId: string }).projectId !== project
  )
    throw new Error("Explicit project must match Firestore project");
  await privateDirectory(output);
  const documents: Snapshot["documents"] = [];
  for (const collection of privateCollections) {
    // listDocuments includes missing parent documents with surviving revision subcollections.
    for (const ref of await db.collection(collection).listDocuments()) {
      const doc = await ref.get();
      if (doc.exists)
        documents.push({ path: ref.path, data: encode(doc.data(), db) });
      for (const child of await ref.listCollections()) {
        if (collection !== "privateSubmissions" || child.id !== "revisions")
          throw new Error(
            "Unrecognised private subcollection; update the backup allowlist before proceeding",
          );
        for (const revision of (await child.get()).docs) {
          if ((await revision.ref.listCollections()).length)
            throw new Error("Nested revision collections are not supported");
          documents.push({
            path: revision.ref.path,
            data: encode(revision.data(), db),
          });
        }
      }
    }
  }
  documents.sort((a, b) => a.path.localeCompare(b.path));
  const content =
    JSON.stringify({
      schema: 1,
      project,
      captured_at: new Date().toISOString(),
      documents,
    } satisfies Snapshot) + "\n";
  const checksum = digest(content);
  const file = await open(output, "wx", 0o600);
  let checksumCreated = false;
  try {
    const sum = await open(`${output}.sha256`, "wx", 0o600);
    checksumCreated = true;
    try {
      await sum.writeFile(`${checksum}\n`);
      await sum.sync();
    } finally {
      await sum.close();
    }
    await file.writeFile(content);
    await file.sync();
  } catch (error) {
    await file.close();
    await unlink(output);
    if (checksumCreated) await unlink(`${output}.sha256`);
    throw error;
  }
  await file.close();
  return { documents: documents.length, sha256: checksum };
}
export async function restorePrivate(
  db: Firestore,
  project: string,
  input: string,
  options: { allowProduction?: boolean } = {},
) {
  if (
    !project ||
    (db as Firestore & { readonly projectId: string }).projectId !== project
  )
    throw new Error("Explicit project must match Firestore project");
  if (!process.env.FIRESTORE_EMULATOR_HOST && !options.allowProduction)
    throw new Error(
      "Restore defaults to emulator-only; production requires --allow-production-restore",
    );
  await privateInput(input);
  await privateInput(`${input}.sha256`);
  const content = await readFile(input, "utf8");
  if (digest(content) !== (await readFile(`${input}.sha256`, "utf8")).trim())
    throw new Error("Snapshot checksum mismatch");
  const snapshot = JSON.parse(content) as Snapshot;
  if (
    snapshot.schema !== 1 ||
    typeof snapshot.project !== "string" ||
    !Array.isArray(snapshot.documents)
  )
    throw new Error("Invalid private snapshot");
  const seen = new Set<string>();
  const decoded = snapshot.documents.map((doc) => {
    if (
      typeof doc.path !== "string" ||
      !privatePath(doc.path) ||
      seen.has(doc.path)
    )
      throw new Error("Snapshot contains duplicate or non-private paths");
    seen.add(doc.path);
    if (doc.data?.type !== "map")
      throw new Error("Document must be an encoded map");
    return {
      path: doc.path,
      data: decode(doc.data, db) as Record<string, unknown>,
    };
  });
  for (const collection of privateCollections)
    if ((await db.collection(collection).listDocuments()).length)
      throw new Error(
        "Destination private collections must be empty; restore never overwrites",
      );
  // create, never set: concurrent writes cannot be silently replaced. On a partial
  // failure use a new empty recovery database, do not retry over partial data.
  for (let offset = 0; offset < decoded.length; offset += 300) {
    const batch = db.batch();
    for (const doc of decoded.slice(offset, offset + 300))
      batch.create(db.doc(doc.path), doc.data);
    await batch.commit();
  }
  return {
    documents: decoded.length,
    source_project: snapshot.project,
    destination_project: project,
  };
}
async function main() {
  const { values, positionals } = parseArgs({
    options: {
      project: { type: "string" },
      file: { type: "string" },
      "allow-production-restore": { type: "boolean", default: false },
      "writes-paused": { type: "boolean", default: false },
    },
    allowPositionals: true,
  });
  if (
    positionals.length !== 1 ||
    !["backup", "restore"].includes(positionals[0]) ||
    !values.project ||
    !values.file
  )
    throw new Error(
      "Usage: private-backup.ts backup|restore --project ID --file /private/path/snapshot.json [--writes-paused] [--allow-production-restore]",
    );
  if (!process.env.FIRESTORE_EMULATOR_HOST && !values["writes-paused"])
    throw new Error(
      "Pause intake, curator writes and mail dispatch first; acknowledge with --writes-paused",
    );
  const app = initializeApp({ projectId: values.project }, "private-backup");
  try {
    const db = getFirestore(app);
    const result =
      positionals[0] === "backup"
        ? await backupPrivate(db, values.project, values.file)
        : await restorePrivate(db, values.project, values.file, {
            allowProduction: values["allow-production-restore"],
          });
    console.log(JSON.stringify(result)); // Counts, projects and hash only. Never payloads or paths.
  } finally {
    await deleteApp(app);
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  main().catch(() => {
    console.error(
      "Private snapshot operation failed. Check flags, permissions, checksum and empty destination; no payload was logged.",
    );
    process.exitCode = 1;
  });
