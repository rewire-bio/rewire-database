import test, { after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { importRelease } from "../src/catalogue.js";
import { activateRelease } from "../src/catalogue-service.js";
import {
  importUseCaseFiles,
  readStoredUseCases,
} from "../src/use-case-import.js";
import { useCaseQuery } from "../src/use-case-service.js";
import { createUseCaseQuery } from "../src/use-cases.js";
import { deployedContributionHttpHandler } from "../src/http-handler.js";
import { fixture } from "./fixtures.js";
import { sha, useCaseFixture, useCaseRelease } from "./use-case-fixtures.js";

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const app = enabled
  ? initializeApp({ projectId: "demo-rewire-usecases-isolated" })
  : null;
const db = app ? getFirestore(app) : null;
const emulatorTest = (name: string, fn: () => Promise<void>) =>
  test(name, { skip: !enabled }, fn);
after(async () => {
  if (db) await db.terminate();
  if (app) await deleteApp(app);
});
async function seed(value = useCaseFixture()) {
  await importRelease(db!, value.bytes, value.manifest);
  return value;
}
const refFor = (id: string) => db!.collection("catalogueReleases").doc(id);

emulatorTest(
  "use-case import is publication-gated, immutable and release-pinned with bounded queries",
  async () => {
    const value = await seed();
    await assert.rejects(() => useCaseQuery(db!, value.id), /not found/);
    await assert.rejects(() => activateRelease(db!, value.id), /must complete/);
    await importUseCaseFiles(db!, value.id, value.manifest, value.files);
    await assert.rejects(() => useCaseQuery(db!, value.id), /not found/);
    await activateRelease(db!, value.id);
    await importUseCaseFiles(db!, value.id, value.manifest, value.files);
    const query = await useCaseQuery(db!, value.id);
    assert.equal(
      query,
      await useCaseQuery(db!, value.id),
      "Reuse one validated resolver",
    );
    const first = query.list({ limit: 1 });
    assert.equal(first.total, 2);
    assert.equal(first.items.length, 1);
    assert.ok(first.next_cursor);
    const second = query.list({ limit: 1, cursor: first.next_cursor! });
    assert.notEqual(first.items[0].id, second.items[0].id);
    assert.throws(() =>
      query.list({ cursor: first.next_cursor!, q: "different question" }),
    );
    const local = createUseCaseQuery(
      value.snapshot,
      value.artifact,
      value.declaration,
    );
    assert.deepEqual(
      query.get({ slug: first.items[0].slug }),
      local.get({ slug: first.items[0].slug }),
    );
    assert.deepEqual(
      query.links({ id: "model-one" }),
      local.links({ id: "model-one" }),
    );
    assert.ok(query.links({ id: "model-one" }).items.length);
    assert.equal(query.get({ slug: "not-recorded" }), null);
    const newer = await seed();
    await importUseCaseFiles(db!, newer.id, newer.manifest, newer.files);
    await activateRelease(db!, newer.id);
    const newerQuery = await useCaseQuery(db!, newer.id);
    assert.throws(() => newerQuery.list({ cursor: first.next_cursor! }));
    assert.equal(
      (await useCaseQuery(db!, value.id)).list().release_id,
      value.id,
    );
    await activateRelease(db!, value.id);
    assert.equal(
      (await db!.doc("cataloguePublication/active").get()).data()?.release_id,
      value.id,
    );
  },
);

emulatorTest(
  "legacy releases expose empty use-case collections and reject undeclared attachment",
  async () => {
    const snapshot = fixture();
    snapshot.release_id = `legacy-${randomUUID()}`;
    const bytes = Buffer.from(JSON.stringify(snapshot));
    const manifest = {
      release_id: snapshot.release_id,
      schema_version: snapshot.schema_version,
      files: { "catalogue.json": sha(bytes) },
    };
    await importRelease(db!, bytes, manifest);
    await importUseCaseFiles(db!, snapshot.release_id, manifest, {});
    await assert.rejects(
      () =>
        importUseCaseFiles(db!, snapshot.release_id, manifest, {
          "use-cases.json": Buffer.from("{}"),
        }),
      /undeclared/,
    );
    await activateRelease(db!, snapshot.release_id);
    const query = await useCaseQuery(db!, snapshot.release_id);
    assert.equal(query.list().total, 0);
    assert.equal(query.get({ slug: "missing" }), null);
    assert.deepEqual(query.links({ id: "model-one" }).items, []);
  },
);

emulatorTest(
  "foreign manifests, altered bytes and incomplete declarations cannot attach use cases",
  async () => {
    for (const mode of [
      "foreign",
      "schema",
      "release",
      "bytes",
      "file-only",
      "coverage-only",
      "snapshot-coverage",
    ]) {
      const value = await seed();
      const manifest: any = structuredClone(value.manifest),
        files = { ...value.files };
      if (mode === "foreign") manifest.files["use-cases.json"] = "a".repeat(64);
      if (mode === "schema") manifest.schema_version = "1.0";
      if (mode === "release") manifest.release_id = "another-release";
      if (mode === "bytes") files["use-cases.json"] = Buffer.from("{}");
      if (mode === "file-only") {
        delete manifest.coverage.use_cases;
        await refFor(value.id).update({ manifest, coverage: {} });
      }
      if (mode === "coverage-only") {
        delete manifest.files["use-cases.json"];
        await refFor(value.id).update({ manifest });
      }
      if (mode === "snapshot-coverage")
        await refFor(value.id).update({ coverage: {} });
      await assert.rejects(
        () => importUseCaseFiles(db!, value.id, manifest, files),
        undefined,
        mode,
      );
      assert.equal(
        (await refFor(value.id).get()).data()?.use_case_manifest,
        undefined,
      );
      assert.equal(
        (await refFor(value.id).collection("useCaseChunks").get()).size,
        0,
      );
    }
  },
);

emulatorTest(
  "matching manifest hashes cannot admit private content or a foreign artifact release",
  async () => {
    for (const mode of ["private", "release", "mapping"]) {
      const value = useCaseFixture();
      const changed: any = structuredClone(value.artifact);
      if (mode === "private")
        changed.use_cases[0].private_notes = "PRIVATE_SENTINEL";
      if (mode === "release") changed.release_id = "another-release";
      if (mode === "mapping")
        changed.mappings[0].evaluation_ids = ["source-one"];
      value.files["use-cases.json"] = Buffer.from(JSON.stringify(changed));
      value.manifest.files["use-cases.json"] = sha(
        value.files["use-cases.json"],
      );
      await seed(value);
      await assert.rejects(
        () => importUseCaseFiles(db!, value.id, value.manifest, value.files),
        (error) =>
          error instanceof Error && !error.message.includes("PRIVATE_SENTINEL"),
      );
      assert.equal(
        (await refFor(value.id).get()).data()?.use_case_manifest,
        undefined,
      );
    }
  },
);

emulatorTest(
  "missing or damaged imported chunks prevent activation and public serving",
  async () => {
    for (const mode of ["missing", "bytes", "ready", "hash"]) {
      const value = await seed();
      await importUseCaseFiles(db!, value.id, value.manifest, value.files);
      const ref = refFor(value.id),
        chunk = ref.collection("useCaseChunks").doc("000000");
      if (mode === "missing") await chunk.delete();
      if (mode === "bytes")
        await chunk.update({
          bytes_base64: Buffer.from("{}").toString("base64"),
        });
      if (mode === "ready") await ref.update({ use_case_manifest: null });
      if (mode === "hash")
        await ref.update({ "use_case_manifest.file_sha256": "a".repeat(64) });
      await assert.rejects(() => activateRelease(db!, value.id));
      assert.equal((await ref.get()).data()?.published_at, undefined);
      await ref.update({ published_at: "2026-09-25T00:00:00Z" });
      await assert.rejects(() => useCaseQuery(db!, value.id));
    }
  },
);

// Keep races in the real emulator; intercept only batch commit or transaction entry.
function interceptCommit(
  action: () => Promise<void>,
  afterCommit = false,
): Firestore {
  return {
    collection: db!.collection.bind(db),
    runTransaction: db!.runTransaction.bind(db),
    batch: () => {
      const batch = db!.batch();
      return {
        set: batch.set.bind(batch),
        commit: async () => {
          if (afterCommit) {
            const result = await batch.commit();
            await action();
            return result;
          }
          await action();
          return batch.commit();
        },
      };
    },
  } as unknown as Firestore;
}

emulatorTest(
  "concurrent and partial imports remain invisible and are safely retryable",
  async () => {
    const value = await seed();
    let entered!: () => void, resume!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      resume = resolve;
    });
    const first = importUseCaseFiles(
      interceptCommit(async () => {
        entered();
        await gate;
      }),
      value.id,
      value.manifest,
      value.files,
    );
    await started;
    try {
      await assert.rejects(
        () => importUseCaseFiles(db!, value.id, value.manifest, value.files),
        /already in progress/,
      );
      await assert.rejects(
        () => activateRelease(db!, value.id),
        /must complete/,
      );
    } finally {
      resume();
    }
    await first;
    const partial = await seed();
    await assert.rejects(
      () =>
        importUseCaseFiles(
          interceptCommit(async () => {
            throw Error("simulated write failure");
          }, true),
          partial.id,
          partial.manifest,
          partial.files,
        ),
      /simulated/,
    );
    assert.ok(
      (await refFor(partial.id).collection("useCaseChunks").get()).size > 0,
      "Written chunks alone never mark an import complete",
    );
    assert.equal(
      (await refFor(partial.id).get()).data()?.use_case_manifest,
      undefined,
    );
    assert.equal(
      (await refFor(partial.id).get()).data()?.use_case_lease,
      undefined,
    );
    await assert.rejects(
      () => activateRelease(db!, partial.id),
      /must complete/,
    );
    await importUseCaseFiles(db!, partial.id, partial.manifest, partial.files);
    await activateRelease(db!, partial.id);
    assert.equal((await useCaseQuery(db!, partial.id)).list().total, 2);
  },
);

emulatorTest(
  "publication and manifest races cannot finalize or attach new use-case content",
  async () => {
    const published = await seed();
    await refFor(published.id).update({ published_at: "2026-09-25T00:00:00Z" });
    await assert.rejects(
      () =>
        importUseCaseFiles(
          db!,
          published.id,
          published.manifest,
          published.files,
        ),
      /published/,
    );
    for (const mode of ["publish", "manifest", "lease"]) {
      const value = await seed();
      const wrapper = interceptCommit(async () => {
        if (mode === "publish")
          await refFor(value.id).update({
            published_at: "2026-09-25T00:00:00Z",
          });
        if (mode === "manifest")
          await refFor(value.id).update({
            manifest: {
              ...value.manifest,
              files: {
                ...value.manifest.files,
                "use-cases.json": "b".repeat(64),
              },
            },
          });
        if (mode === "lease")
          await refFor(value.id).update({
            "use_case_lease.owner": "another-importer",
          });
      });
      await assert.rejects(() =>
        importUseCaseFiles(wrapper, value.id, value.manifest, value.files),
      );
      assert.equal(
        (await refFor(value.id).get()).data()?.use_case_manifest,
        undefined,
      );
      if (mode === "lease")
        assert.equal(
          (await refFor(value.id).get()).data()?.use_case_lease.owner,
          "another-importer",
        );
    }
  },
);

emulatorTest(
  "activation rechecks sidecar readiness and digest inside its publication transaction",
  async () => {
    for (const mode of ["ready", "hash", "lease"]) {
      const value = await seed();
      await importUseCaseFiles(db!, value.id, value.manifest, value.files);
      const wrapped = {
        collection: db!.collection.bind(db),
        doc: db!.doc.bind(db),
        runTransaction: async (
          update: Parameters<Firestore["runTransaction"]>[0],
        ) => {
          if (mode === "ready")
            await refFor(value.id).update({ use_case_manifest: null });
          if (mode === "hash")
            await refFor(value.id).update({
              "use_case_manifest.file_sha256": "c".repeat(64),
            });
          if (mode === "lease")
            await refFor(value.id).update({
              use_case_lease: { owner: "another-importer" },
            });
          return db!.runTransaction(update);
        },
      } as unknown as Firestore;
      await assert.rejects(() => activateRelease(wrapped, value.id));
      assert.equal(
        (await refFor(value.id).get()).data()?.published_at,
        undefined,
      );
    }
  },
);

emulatorTest(
  "multi-chunk sidecars preserve exact bytes across Unicode boundaries",
  async () => {
    const original = useCaseFixture(200);
    // Repeated bounded fields enlarge the artifact without exceeding entry limits.
    for (const entry of original.inputs.use_cases)
      entry.evidence_gaps = Array.from({ length: 12 }, () =>
        "Synthetic 未評価 evidence gap. ".repeat(12),
      );
    const value = await seed(
      useCaseRelease(original.snapshot, original.inputs),
    );
    assert.ok(value.files["use-cases.json"].length > 400_000);
    await importUseCaseFiles(db!, value.id, value.manifest, value.files);
    const meta = (await refFor(value.id).get()).data()!;
    assert.ok(meta.use_case_manifest.chunks.length > 1);
    const stored = await readStoredUseCases(
      db!,
      value.id,
      meta,
      value.snapshot,
    );
    assert.deepEqual(stored.artifact, value.artifact);
    for (const chunk of (
      await refFor(value.id).collection("useCaseChunks").get()
    ).docs)
      assert.ok(Buffer.byteLength(JSON.stringify(chunk.data())) < 600_000);
  },
);

emulatorTest(
  "real public HTTP returns pinned use-case data, validates cursors and blocks private mixed batches",
  async () => {
    const value = await seed();
    await importUseCaseFiles(db!, value.id, value.manifest, value.files);
    await activateRelease(db!, value.id);
    const previous = process.env.OMICS_CONTRIBUTIONS_ENABLED;
    delete process.env.OMICS_CONTRIBUTIONS_ENABLED;
    const server = createServer(deployedContributionHttpHandler);
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/trpc/`;
    const request = (name: string, input: object) =>
      fetch(
        `${base}catalogue.${name}?input=${encodeURIComponent(JSON.stringify(input))}`,
      );
    try {
      for (const [name, input] of [
        ["useCases", { limit: 1 }],
        ["useCase", { slug: value.artifact.use_cases[0].slug }],
        ["useCaseLinks", { id: "model-one" }],
      ] as const) {
        const response = await request(name, {
          release_id: value.id,
          ...input,
        });
        assert.equal(response.status, 200);
        assert.match(response.headers.get("cache-control") || "", /^public/);
        const body = await response.json();
        assert.equal(body.result.data.release_id, value.id);
        assert.equal(
          body.result.data.input_sha256,
          value.declaration.input_sha256,
        );
      }
      const first = (
        await (
          await request("useCases", { release_id: value.id, limit: 1 })
        ).json()
      ).result.data;
      assert.equal(
        (
          await request("useCases", {
            release_id: value.id,
            q: "other",
            cursor: first.next_cursor,
          })
        ).status,
        400,
      );
      assert.equal(
        (await request("useCases", { release_id: value.id, limit: 101 }))
          .status,
        400,
      );
      assert.equal(
        (await request("useCases", { release_id: "not-published" })).status,
        404,
      );
      const mixed = await fetch(
        `${base}catalogue.useCases,submission.list?batch=1&input=${encodeURIComponent(JSON.stringify({ 0: { release_id: value.id }, 1: {} }))}`,
      );
      assert.equal(mixed.status, 503);
      assert.equal(mixed.headers.get("cache-control"), "no-store");
    } finally {
      if (previous === undefined)
        delete process.env.OMICS_CONTRIBUTIONS_ENABLED;
      else process.env.OMICS_CONTRIBUTIONS_ENABLED = previous;
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
);
