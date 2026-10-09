import test from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore, Timestamp, GeoPoint } from "firebase-admin/firestore";
import {
  backupPrivate,
  planPrivateRestore,
  PRIVATE_RESTORE_LIMITS,
  restorePrivate,
  encode,
  decode,
  privateCollections,
} from "../src/private-backup.js";

test("snapshot codec preserves nanoseconds, typed values and tag-shaped maps", async () => {
  const app = initializeApp({ projectId: "demo-backup-codec" }, randomUUID());
  try {
    const db = getFirestore(app);
    const data = {
      time: new Timestamp(123, 456789),
      map: { type: "timestamp", value: [1, 2] },
      bytes: Buffer.from("private"),
      point: new GeoPoint(1, 2),
      ref: db.doc("privateSubmissions/a"),
      array: [null, false, "text", Infinity, -Infinity, NaN],
    };
    const result = decode(
      JSON.parse(JSON.stringify(encode(data))),
      db,
    ) as typeof data;
    assert.ok(result.time.isEqual(data.time));
    assert.deepEqual(result.map, data.map);
    assert.deepEqual(result.bytes, data.bytes);
    assert.ok(result.point.isEqual(data.point));
    assert.equal(result.ref.path, data.ref.path);
    assert.deepEqual(result.array, data.array);
    assert.throws(
      () => decode({ type: "number", value: "secret" }, db),
      /Invalid/,
    );
    assert.throws(() => encode(undefined), /Unsupported/);
  } finally {
    await deleteApp(app);
  }
});

test(
  "private snapshot roundtrip preserves all private collections and orphan revisions, excludes catalogue, refuses overwrite and corruption",
  { skip: !process.env.FIRESTORE_EMULATOR_HOST },
  async () => {
    const suffix = randomUUID().slice(0, 8);
    const sourceProject = `demo-backup-src-${suffix}`;
    const targetProject = `demo-backup-dst-${suffix}`;
    const sourceApp = initializeApp(
      { projectId: sourceProject },
      `src-${suffix}`,
    );
    const targetApp = initializeApp(
      { projectId: targetProject },
      `dst-${suffix}`,
    );
    const source = getFirestore(sourceApp),
      target = getFirestore(targetApp);
    const dir = await mkdtemp(join(tmpdir(), "rewire-private-test-"));
    const file = join(dir, "backup.json");
    try {
      for (const collection of privateCollections)
        await source
          .doc(`${collection}/record`)
          .set({
            email: "private@example.org",
            expiresAt: new Timestamp(123456, 123),
            data: { type: "timestamp", value: "literal" },
          });
      await source
        .doc("privateSubmissions/record/revisions/revision")
        .set({ previous: "private value" });
      await source
        .doc("privateSubmissions/orphan/revisions/revision")
        .set({ previous: "orphan private value" });
      await source.doc("catalogueReleases/public").set({ must_not_copy: true });
      await source.doc("privateSubmissions/foreign").set({ nested: [target.doc("privateSubmissions/record")] });
      await assert.rejects(backupPrivate(source, sourceProject, file), /Document references are unsupported/);
      await source.doc("privateSubmissions/foreign").delete();
      const saved = await backupPrivate(source, sourceProject, file);
      assert.equal(saved.documents, privateCollections.length + 2);
      assert.equal((await stat(file)).mode & 0o777, 0o600);
      assert.equal((await stat(`${file}.sha256`)).mode & 0o777, 0o600);
      assert.equal(
        (await readFile(file, "utf8")).includes("catalogueReleases"),
        false,
      );
      await assert.rejects(
        backupPrivate(source, sourceProject, file),
        /EEXIST/,
      );
      await assert.rejects(
        backupPrivate(source, "wrong-project", join(dir, "wrong.json")),
        /project/,
      );
      await chmod(file, 0o644);
      await assert.rejects(restorePrivate(target, targetProject, file), /restricted files/);
      await chmod(file, 0o600);
      await chmod(`${file}.sha256`, 0o644);
      await assert.rejects(restorePrivate(target, targetProject, file), /restricted files/);
      await chmod(`${file}.sha256`, 0o600);
      await chmod(dir, 0o755);
      await assert.rejects(backupPrivate(source, sourceProject, join(dir, "public.json")), /0700/);
      await assert.rejects(restorePrivate(target, targetProject, file), /0700/);
      await chmod(dir, 0o700);
      const checkout = join(dir, "fake-checkout");
      await mkdir(join(checkout, ".git"), { recursive: true, mode: 0o700 });
      await chmod(checkout, 0o700);
      await writeFile(join(checkout, "private.json"), await readFile(file), { mode: 0o600 });
      await writeFile(join(checkout, "private.json.sha256"), await readFile(`${file}.sha256`), { mode: 0o600 });
      await assert.rejects(restorePrivate(target, targetProject, join(checkout, "private.json")), /outside Git/);
      const restored = await restorePrivate(target, targetProject, file);
      assert.equal(restored.documents, saved.documents);
      for (const collection of privateCollections)
        assert.deepEqual(
          (await target.doc(`${collection}/record`).get()).data(),
          (await source.doc(`${collection}/record`).get()).data(),
        );
      assert.equal(
        (
          await target.doc("privateSubmissions/orphan/revisions/revision").get()
        ).data()?.previous,
        "orphan private value",
      );
      assert.equal(
        (await target.doc("catalogueReleases/public").get()).exists,
        false,
      );
      await assert.rejects(
        restorePrivate(target, targetProject, file),
        /empty/,
      );
      const original = await readFile(file, "utf8");
      await writeFile(file, original + " ");
      await assert.rejects(
        restorePrivate(target, targetProject, file),
        /checksum/,
      );
      const malformed = JSON.stringify({
        schema: 1,
        project: sourceProject,
        documents: [
          { path: "catalogueReleases/public", data: encode({ secret: true }) },
        ],
      });
      await writeFile(file, malformed);
      await writeFile(
        `${file}.sha256`,
        createHash("sha256").update(malformed).digest("hex"),
      );
      await assert.rejects(
        restorePrivate(target, targetProject, file),
        /non-private/,
      );
    } finally {
      await Promise.all([
        source.recursiveDelete(source.collection("privateSubmissions")),
        ...privateCollections
          .filter((x) => x !== "privateSubmissions")
          .map((x) => source.recursiveDelete(source.collection(x))),
        source.recursiveDelete(source.collection("catalogueReleases")),
        ...privateCollections.map((x) =>
          target.recursiveDelete(target.collection(x)),
        ),
      ]);
      await Promise.all([deleteApp(sourceApp), deleteApp(targetApp)]);
      await rm(dir, { recursive: true, force: true });
    }
  },
);


function largePermittedContribution() {
  return {
    type: "model", title: "Synthetic recovery model", summary: "s".repeat(10_000),
    source_urls: Array.from({ length: 20 }, (_, i) => `https://example.org/${i}/${"x".repeat(500)}`),
    public_credit: false, details: { description: "d".repeat(23_500) },
  };
}

test("restore plans respect byte and document limits for permitted large contributions", async () => {
  const { contribution } = await import("../src/contribution.js");
  const data = contribution.parse(largePermittedContribution());
  const documents = Array.from({ length: 300 }, (_, i) => ({ path: `privateSubmissions/item-${i}`, data }));
  assert.ok(Buffer.byteLength(JSON.stringify(documents)) > 10 * 1024 * 1024);
  const batches = planPrivateRestore(documents);
  assert.ok(batches.length > 1);
  assert.deepEqual(batches.flatMap(b => b.documents), documents);
  assert.ok(batches.every(b => b.estimatedBytes <= PRIVATE_RESTORE_LIMITS.bytes && b.documents.length <= 300));
  assert.deepEqual(planPrivateRestore(Array.from({ length: 301 }, (_, i) => ({ path: `privateRateLimits/item-${i}`, data: { count: i } }))).map(b => b.documents.length), [300, 1]);
  assert.deepEqual(planPrivateRestore([]), []);
});

test("restore planning rejects oversized documents before committing any batch", () => {
  assert.throws(() => planPrivateRestore([
    { path: "privateSubmissions/small", data: { title: "safe" } },
    { path: "privateSubmissions/large", data: { value: "x".repeat(PRIVATE_RESTORE_LIMITS.bytes) } },
  ]), /restore request budget/);
});

test("large private recovery crosses byte-bounded batches without overwriting", { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  const project = `demo-large-recovery-${randomUUID().slice(0, 8)}`;
  const app = initializeApp({ projectId: project }, randomUUID());
  const db = getFirestore(app);
  const dir = await mkdtemp(join(tmpdir(), "rewire-large-recovery-"));
  const file = join(dir, "snapshot.json");
  const documents = Array.from({ length: 240 }, (_, i) => ({ path: `privateSubmissions/item-${i}`, data: largePermittedContribution() }));
  assert.ok(planPrivateRestore(documents).length > 1);
  const content = JSON.stringify({ schema: 1, project, captured_at: new Date().toISOString(), documents: documents.map(d => ({ path: d.path, data: encode(d.data) })) });
  try {
    await writeFile(file, content, { mode: 0o600 });
    await writeFile(`${file}.sha256`, createHash("sha256").update(content).digest("hex"), { mode: 0o600 });
    assert.equal((await restorePrivate(db, project, file)).documents, 240);
    const restored = await db.collection("privateSubmissions").get();
    assert.equal(restored.size, 240);
    for (const doc of restored.docs) assert.deepEqual(doc.data(), largePermittedContribution());
    await assert.rejects(restorePrivate(db, project, file), /empty/);
  } finally {
    await db.recursiveDelete(db.collection("privateSubmissions"));
    await deleteApp(app); await rm(dir, { recursive: true, force: true });
  }
});
