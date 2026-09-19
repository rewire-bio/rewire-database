import test, { after } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { auditFiles } from "../../../scripts/omics/audit/release.js";
import {
  auditTarget,
  type AuditBundle,
  type AuditCheck,
} from "../src/audit.js";
import { importAuditFiles } from "../src/audit-import.js";
import { auditChecks, auditRecords, auditRuns } from "../src/audit-service.js";
const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const app = enabled
  ? initializeApp(
      { projectId: "demo-rewire-audit-isolated" },
      `audit-${randomUUID()}`,
    )
  : null;
const db = app ? getFirestore(app) : null;
const sha = (b: Buffer | string) =>
  createHash("sha256").update(b).digest("hex");
const testEmulator = (name: string, fn: () => Promise<void>) =>
  test(name, { skip: !enabled }, fn);
after(async () => {
  if (db) await db.terminate();
  if (app) await deleteApp(app);
});
function makeBundle(): AuditBundle {
  const checks: AuditCheck[] = [];
  for (let n = 0; n < 3; n++)
    for (const category of ["structure", "source_transcription"] as const) {
      const record = {
        id: `record-${n}`,
        attributes: { numeric_value: String(n) },
      };
      checks.push({
        id: `check-${n}-${category.replaceAll("_", "-")}`,
        run_id: "run-one",
        record_id: record.id,
        record_kind: "result",
        record_name: `Record ${n}`,
        field_paths: ["attributes.numeric_value"],
        target_sha256: auditTarget(record, ["attributes.numeric_value"]),
        category,
        outcome:
          category === "structure" ? "supported" : "insufficient_evidence",
        checked_at: "2026-09-19",
        source_ids: ["source-one"],
        source_hashes: ["a".repeat(64)],
        source_locators: ["Table 1"],
        evidence_row_ids: [],
        receipt_ids: [],
        explanation: "A bounded check",
        prior_check_ids: [],
      });
    }
  return {
    schema_version: "1.0",
    runs: [
      {
        id: "run-one",
        baseline_release_id: "release-baseline",
        inventory_sha256: "a".repeat(64),
        started_at: "2026-09-19",
        completed_at: "2026-09-19",
        reviewer: "test",
        review_method: "automated",
        verifier_revision: "test",
        scope: "fixture",
        limitations: [],
        record_count: 3,
        check_count: 6,
      },
    ],
    checks,
    resolutions: [],
  };
}
function filesFor(releaseId: string, bundle = makeBundle()) {
  const generated = auditFiles(bundle).files;
  const files = Object.fromEntries(
    Object.entries(generated).map(([k, v]) => [k, Buffer.from(v)]),
  );
  const manifest = {
    release_id: releaseId,
    schema_version: "1.0",
    files: Object.fromEntries(
      Object.entries(files).map(([k, v]) => [k, sha(v)]),
    ),
  };
  return { files, manifest };
}
async function seed() {
  const id = `audit-release-${randomUUID()}`;
  await db!
    .collection("catalogueReleases")
    .doc(id)
    .set({
      state: "ready",
      digest: sha(id),
      schema_version: "1.0",
      manifest: filesFor(id).manifest,
    });
  return id;
}
async function publish(id: string) {
  await db!
    .collection("catalogueReleases")
    .doc(id)
    .update({ published_at: "2026-09-19T12:00:00Z" });
}
function change(
  files: Record<string, Buffer>,
  manifest: { files: Record<string, string> },
  name: string,
  edit: (value: any) => void,
) {
  const parsed = JSON.parse(files[name].toString());
  edit(parsed);
  files[name] = Buffer.from(JSON.stringify(parsed));
  manifest.files[name] = sha(files[name]);
}

testEmulator(
  "audit import serves release-pinned bounded queries and paired outcome filters",
  async () => {
    const id = await seed();
    const { files, manifest } = filesFor(id);
    await importAuditFiles(db!, id, manifest, files);
    await assert.rejects(() => auditRuns(db!, { release_id: id }));
    await publish(id);
    assert.equal((await auditRuns(db!, { release_id: id })).items.length, 1);
    const first = await auditRecords(db!, { release_id: id, limit: 1 });
    assert.equal(first.total, 3);
    assert.equal(first.items.length, 1);
    assert.ok(first.next_cursor);
    const next = await auditRecords(db!, {
      release_id: id,
      limit: 1,
      cursor: first.next_cursor!,
    });
    assert.equal(next.items[0].record_id, "record-1");
    assert.equal(
      (
        await auditRecords(db!, {
          release_id: id,
          category: "source_transcription",
          outcome: "supported",
        })
      ).total,
      0,
    );
    assert.equal(
      (
        await auditRecords(db!, {
          release_id: id,
          category: "structure",
          outcome: "supported",
        })
      ).total,
      3,
    );
    await assert.rejects(() =>
      auditRecords(db!, {
        release_id: id,
        category: "source_transcription",
        cursor: first.next_cursor!,
      }),
    );
    const another = await seed();
    await importAuditFiles(db!, another, filesFor(another).manifest, files);
    await publish(another);
    await assert.rejects(() =>
      auditRecords(db!, { release_id: another, cursor: first.next_cursor! }),
    );
    const page = await auditChecks(db!, {
      release_id: id,
      record_id: "record-0",
      limit: 1,
    });
    assert.equal(page.total, 2);
    assert.ok(page.next_cursor);
    assert.equal(
      (
        await auditChecks(db!, {
          release_id: id,
          record_id: "record-0",
          cursor: page.next_cursor!,
          limit: 1,
        })
      ).items.length,
      1,
    );
    assert.equal(
      (await auditChecks(db!, { release_id: id, record_id: "missing-record" }))
        .total,
      0,
    );
  },
);
testEmulator(
  "audit imports reject source file tampering and preserve an existing immutable audit",
  async () => {
    const id = await seed();
    const { files, manifest } = filesFor(id);
    const damaged = { ...files, "audit-runs.json": Buffer.from("[]") };
    await assert.rejects(
      () => importAuditFiles(db!, id, manifest, damaged),
      /manifest mismatch/,
    );
    await importAuditFiles(db!, id, manifest, files);
    await publish(id);
    await importAuditFiles(db!, id, manifest, files);
    change(
      files,
      manifest,
      "audit-runs.json",
      (r) => (r[0].reviewer = "Changed after publication"),
    );
    await assert.rejects(
      () => importAuditFiles(db!, id, manifest, files),
      /immutable/,
    );
    const fresh = await seed();
    await publish(fresh);
    const pristine = filesFor(fresh);
    await assert.rejects(
      () => importAuditFiles(db!, fresh, pristine.manifest, pristine.files),
      /published/,
    );
  },
);
testEmulator(
  "audit importer rejects private index data even with matching file hashes",
  async () => {
    const id = await seed();
    const { files, manifest } = filesFor(id);
    change(
      files,
      manifest,
      "audit-index.json",
      (r) => (r[0].private_notes = "PRIVATE_SENTINEL"),
    );
    await db!.collection("catalogueReleases").doc(id).update({ manifest });
    await assert.rejects(
      () => importAuditFiles(db!, id, manifest, files),
      (e) => e instanceof Error && !e.message.includes("PRIVATE_SENTINEL"),
    );
    assert.equal(
      (await db!.collection("catalogueReleases").doc(id).get()).data()
        ?.audit_manifest,
      undefined,
    );
  },
);
testEmulator(
  "audit importer rejects orphan checks, mismatched inventory, and dangling chunk identities",
  async () => {
    for (const issue of ["orphan", "inventory", "chunk"]) {
      const id = await seed();
      const { files, manifest } = filesFor(id);
      if (issue === "orphan")
        change(
          files,
          manifest,
          "audit-checks-000000.json",
          (r) => (r[0].run_id = "missing-run"),
        );
      if (issue === "inventory")
        change(files, manifest, "audit-runs.json", (r) => r[0].check_count++);
      if (issue === "chunk")
        change(
          files,
          manifest,
          "audit-index.json",
          (r) => (r[0].chunk_ids = ["missing-chunk"]),
        );
      await db!.collection("catalogueReleases").doc(id).update({ manifest });
      await assert.rejects(
        () => importAuditFiles(db!, id, manifest, files),
        undefined,
        issue,
      );
    }
  },
);
testEmulator(
  "audit API rejects corrupted check chunks after publication",
  async () => {
    const id = await seed();
    const { files, manifest } = filesFor(id);
    await importAuditFiles(db!, id, manifest, files);
    await publish(id);
    await db!
      .collection("catalogueReleases")
      .doc(id)
      .collection("auditCheckChunks")
      .doc("000000")
      .update({ checks_json: "[]" });
    await assert.rejects(
      () => auditChecks(db!, { release_id: id, record_id: "record-0" }),
      /integrity/,
    );
  },
);

// Exercise races against the real emulator while gating only the batch commit.
function interceptCommit(action: () => Promise<void>): Firestore {
  return {
    collection: db!.collection.bind(db),
    runTransaction: db!.runTransaction.bind(db),
    batch: () => {
      const batch = db!.batch();
      return {
        set: batch.set.bind(batch),
        commit: async () => {
          await action();
          return batch.commit();
        },
      };
    },
  } as unknown as Firestore;
}
testEmulator(
  "foreign or incomplete self-consistent audit manifests cannot attach to a catalogue",
  async () => {
    for (const kind of ["content", "identity", "schema", "missing"]) {
      const id = await seed();
      const { files, manifest } = filesFor(id);
      if (kind === "content")
        change(
          files,
          manifest,
          "audit-runs.json",
          (r) => (r[0].reviewer = "Another audit"),
        );
      if (kind === "identity") manifest.release_id = "another-release";
      if (kind === "schema") manifest.schema_version = "another-schema";
      if (kind === "missing") delete manifest.files["audit-checks-000000.json"];
      await assert.rejects(
        () => importAuditFiles(db!, id, manifest, files),
        /immutable catalogue release manifest/,
      );
      const ref = db!.collection("catalogueReleases").doc(id);
      assert.equal((await ref.get()).data()?.audit_manifest, undefined);
      assert.equal((await ref.collection("auditCheckChunks").get()).size, 0);
    }
  },
);
testEmulator(
  "concurrent audit imports cannot overlap and successful imports remain idempotent",
  async () => {
    const id = await seed();
    const { files, manifest } = filesFor(id);
    let signal!: () => void;
    const entered = new Promise<void>((resolve) => (signal = resolve));
    let resume!: () => void;
    const gate = new Promise<void>((resolve) => (resume = resolve));
    const first = importAuditFiles(
      interceptCommit(async () => {
        signal();
        await gate;
      }),
      id,
      manifest,
      files,
    );
    await entered;
    try {
      await assert.rejects(
        () => importAuditFiles(db!, id, manifest, files),
        /already in progress/,
      );
    } finally {
      resume();
    }
    await first;
    await importAuditFiles(db!, id, manifest, files);
    await publish(id);
    assert.equal((await auditRecords(db!, { release_id: id })).total, 3);
    assert.equal(
      (await db!.collection("catalogueReleases").doc(id).get()).data()
        ?.audit_lease,
      undefined,
    );
  },
);
testEmulator(
  "failed writes release their lease and expired pinned imports can retry",
  async () => {
    const id = await seed();
    const { files, manifest } = filesFor(id);
    await assert.rejects(
      () =>
        importAuditFiles(
          interceptCommit(async () => {
            throw Error("Injected write failure");
          }),
          id,
          manifest,
          files,
        ),
      /Injected write failure/,
    );
    const ref = db!.collection("catalogueReleases").doc(id);
    assert.equal((await ref.get()).data()?.audit_manifest, undefined);
    assert.equal((await ref.get()).data()?.audit_lease, undefined);
    await ref.update({
      audit_lease: { owner: "expired-owner", until: "2020-01-01T00:00:00Z" },
    });
    await importAuditFiles(db!, id, manifest, files);
    await publish(id);
    assert.equal((await auditRecords(db!, { release_id: id })).total, 3);
  },
);
testEmulator(
  "publication during writes prevents attaching new audit metadata",
  async () => {
    const id = await seed();
    const { files, manifest } = filesFor(id);
    await assert.rejects(
      () =>
        importAuditFiles(
          interceptCommit(() => publish(id)),
          id,
          manifest,
          files,
        ),
      /published release/,
    );
    const current = (
      await db!.collection("catalogueReleases").doc(id).get()
    ).data();
    assert.equal(current?.audit_manifest, undefined);
    assert.equal(current?.audit_lease, undefined);
  },
);
testEmulator(
  "a replaced lease cannot finalize or clear the newer owner",
  async () => {
    const id = await seed();
    const { files, manifest } = filesFor(id);
    const ref = db!.collection("catalogueReleases").doc(id);
    await assert.rejects(
      () =>
        importAuditFiles(
          interceptCommit(async () => {
            await ref.update({
              audit_lease: {
                owner: "replacement",
                until: "2099-01-01T00:00:00Z",
              },
            });
          }),
          id,
          manifest,
          files,
        ),
      /lease replaced/,
    );
    const current = (await ref.get()).data();
    assert.equal(current?.audit_manifest, undefined);
    assert.equal(current?.audit_lease.owner, "replacement");
  },
);
