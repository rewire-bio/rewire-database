import test, { after } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore, FieldValue, type Firestore } from "firebase-admin/firestore";
import { fixture } from "./fixtures.js";
import { importRelease } from "../src/catalogue.js";
import { activateRelease, catalogueQuery } from "../src/catalogue-service.js";
import { createCatalogueQuery } from "../src/catalogue-query.js";
import { deriveResearchReadiness, type ResearchManifest } from "../src/research.js";

const enabled = !!process.env.FIRESTORE_EMULATOR_HOST;
const app = enabled ? initializeApp({ projectId: "demo-rewire-research-isolated" }, `research-${randomUUID()}`) : null;
const db = app ? getFirestore(app) : null;
const emulatorTest = (name: string, run: () => Promise<void>) => test(name, { skip: !enabled }, run);
after(async () => { if (db) await db.terminate(); if (app) await deleteApp(app); });
function researchFixture() {
  const snapshot = fixture();
  snapshot.release_id = `2026-09-23-${createHash("sha256").update(randomUUID()).digest("hex").slice(0, 12)}`;
  snapshot.coverage = { research_schema_version: "1.0" };
  const manifest: ResearchManifest = {
    schema_version: "1.0", id: "research-fixture", title: "Synthetic research", question: "Can this synthetic fixture replay?",
    catalogue_release_id: "2026-09-20-0123456789ab", dataset_id: "dataset-one", evaluation_ids: ["evaluation-one"], protocol_id: "benchmark-one",
    artifacts: [{ id: "table", role: "table", sha256: "a".repeat(64), format: "json", uri: null }], table_artifact_id: "table",
    semantics: { target: "binary", outcome: "y", unit: "binary", score_direction: "higher", join_key: "id", independent_unit: null, subgroup_fields: ["annotation"], exposed: true, split: "test" },
    expected_metrics: { model: { auroc: .8 } }, metric_tolerance: .001,
    verification: { verified_at: "2026-09-23T00:00:00Z", checks: ["artifact_hashes", "join_integrity", "score_semantics", "metric_replay", "annotations", "dependence"].map(check => ({ check, status: "passed", detail: "Synthetic check" })), limitations: ["Synthetic fixture only"] }, local_recipes: [],
  };
  snapshot.research = { schema_version: "1.0", manifests: [manifest], investigations: [] };
  snapshot.research.readiness = deriveResearchReadiness(snapshot);
  const bytes = Buffer.from(JSON.stringify(snapshot));
  return { snapshot, bytes, receipt: { schema_version: snapshot.schema_version, release_id: snapshot.release_id, catalogue_sha256: createHash("sha256").update(bytes).digest("hex") } };
}
// A cold serving instance checks stored bytes; warm instances intentionally
// retain one immutable, previously validated release snapshot.
function freshReader(): Firestore {
  return { doc: db!.doc.bind(db), collection: db!.collection.bind(db) } as Firestore;
}

emulatorTest("research import persists bounded evidence and serves static/API parity only after activation", async () => {
  const { snapshot, bytes, receipt } = researchFixture();
  assert.equal((await importRelease(db!, bytes, receipt)).imported, true);
  const ref = db!.collection("catalogueReleases").doc(snapshot.release_id);
  const meta = (await ref.get()).data()!;
  assert.equal(meta.research_schema_version, "1.0");
  assert.equal(meta.research_frozen_readiness, true);
  assert.equal(meta.research_chunks, 1);
  assert.equal((await ref.collection("researchChunks").get()).size, 1);
  await assert.rejects(() => catalogueQuery(freshReader(), snapshot.release_id), /not found/);
  await activateRelease(db!, snapshot.release_id);
  const query = await catalogueQuery(freshReader(), snapshot.release_id);
  const expected = createCatalogueQuery(snapshot);
  assert.deepEqual(query.researchReadiness({ capability: "replay", ready: true }), expected.researchReadiness({ capability: "replay", ready: true }));
  assert.deepEqual(query.investigations(), expected.investigations());
  assert.equal(query.list({ readiness: "analysis" }).total, 2);
  assert.equal(query.list({ readiness: "validation" }).total, 0);
  assert.equal((await importRelease(db!, bytes, receipt)).imported, false);
  const changed = structuredClone(snapshot); changed.research.manifests[0].question += " mutated";
  const changedBytes = Buffer.from(JSON.stringify(changed));
  await assert.rejects(() => importRelease(db!, changedBytes, { ...receipt, catalogue_sha256: createHash("sha256").update(changedBytes).digest("hex") }), /immutable/);
});

emulatorTest("research integrity rejects altered or missing chunks before publication and on cold reads", async () => {
  for (const mutation of ["changed", "deleted", "index", "metadata"] as const) {
    const { snapshot, bytes, receipt } = researchFixture();
    await importRelease(db!, bytes, receipt);
    await activateRelease(db!, snapshot.release_id);
    const ref = db!.collection("catalogueReleases").doc(snapshot.release_id);
    const chunk = ref.collection("researchChunks").doc("000000");
    if (mutation === "changed") await chunk.update({ items_json: "[]" });
    if (mutation === "deleted") await chunk.delete();
    if (mutation === "index") await chunk.update({ index: 3 });
    if (mutation === "metadata") await ref.update({ research_schema_version: FieldValue.delete() });
    await assert.rejects(() => activateRelease(db!, snapshot.release_id), /integrity|Incomplete|Non-contiguous|must complete/);
    await assert.rejects(() => catalogueQuery(freshReader(), snapshot.release_id), /integrity|Incomplete|Non-contiguous|must complete/);
  }
});
