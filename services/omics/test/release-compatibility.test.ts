import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { validateSnapshot } from "../src/validation.js";
import { createCatalogueQuery } from "../src/catalogue-query.js";

// Tracked immutable archive makes this run on a clean checkout, before export.
const snapshot = JSON.parse(gunzipSync(readFileSync(new URL(
  "../../../data/omics/releases/2026-09-22-f58a0f1d267f/catalogue.json.gz", import.meta.url,
))).toString());
const id = "rewire-dataset-proteingym-amfr-random-v13";
const targetId = "rewire-dataset-proteingym-amfr-v13";

test("the complete reviewed release is accepted by service ingestion", () => {
  const validated = validateSnapshot(snapshot);
  assert.equal(validated.records.length, 21974);
  assert.deepEqual(validated.records.find(r => r.id === id)?.links,
    [{ relation: "same_data_as", target_id: targetId }]);
});

for (const change of ["source-kind", "target-kind", "self", "missing"] as const) {
  test(`data-reuse links reject ${change}`, () => {
    // Actual source-reviewed relationship, with only one invalid property changed.
    const copy = structuredClone(snapshot);
    const source = copy.records.find((r: any) => r.id === id);
    if (change === "source-kind") source.kind = "method";
    if (change === "target-kind") copy.records.find((r: any) => r.id === targetId).kind = "method";
    if (change === "self") source.links[0].target_id = id;
    if (change === "missing") source.links[0].target_id = "missing-dataset";
    assert.throws(() => validateSnapshot(copy), /dataset reuse|Unresolved link|Invalid evaluation dataset/);
  });
}

test("data reuse does not merge result rollups or comparison identities", () => {
  const query = createCatalogueQuery(snapshot);
  const first = query.results({ id, limit: 100 }).items;
  const prior = query.results({ id: targetId, limit: 100 }).items;
  assert.equal(first.length, 5);
  assert.equal(prior.length, 5);
  assert.ok(first.every(r => r.evaluation?.id === "rewire-local-20260921-evaluation-proteingym-random"));
  assert.ok(prior.every(r => r.evaluation?.id === "rewire-local-20260920-evaluation-proteingym-esm2"));
  assert.equal(first.some(a => prior.some(b => a.result.id === b.result.id)), false);
});
