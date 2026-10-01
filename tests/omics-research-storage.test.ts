import crypto from "node:crypto";
import { expect, it } from "vitest";
import type { CatalogueSnapshot } from "../services/omics/src/catalogue-query";
import { deriveResearchReadiness, type ResearchData, type ResearchManifest } from "../services/omics/src/research";
import type { RecordEntry } from "../scripts/omics/schema";
import { researchChunks, researchDigest, readResearchChunks } from "../services/omics/src/research-store";
const sourceRelease = "2026-09-20-0123456789ab";
const date = "2026-09-23T10:00:00+00:00";
const fileBytes = "synthetic table fixture\n";
const fileHash = crypto.createHash("sha256").update(fileBytes).digest("hex");
const hash = "a".repeat(64);
const makeRecord = (id: string, kind: RecordEntry["kind"], attributes: Record<string, unknown> = {}): RecordEntry => ({
  id, kind, name: id, description: "Fixture", status: "source_checked", facets: {}, source_ids: [], links: [], attributes,
});
function fixture() {
  const records = [
    makeRecord("dataset", "dataset", { provenance: { nested: [{ source_ids: ["source"] }] } }),
    makeRecord("protocol", "protocol", { protocol_id: "sdk-protocol-v1" }),
    makeRecord("model", "model", { entity_level: "checkpoint" }),
    { ...makeRecord("evaluation", "evaluation", { origin: "rewire_run", comparison: { protocol_id: "protocol" } }),
      links: [{ relation: "dataset", target_id: "dataset" }, { relation: "protocol", target_id: "protocol" }, { relation: "model", target_id: "model" }] },
    makeRecord("source", "source", { url: "https://example.org/source", retrieved_at: date, version: "1" }),
  ];
  const snapshot: CatalogueSnapshot = { schema_version: "1.1", release_id: sourceRelease, released_at: "2026-09-23T10:00:00Z", records, coverage: {} };
  const manifest: ResearchManifest = {
    schema_version: "1.0", id: "manifest", title: "Synthetic manifest", question: "Does the fixed model reproduce the fixture?",
    catalogue_release_id: sourceRelease, dataset_id: "dataset", evaluation_ids: ["evaluation"], protocol_id: "protocol", sdk_protocol_id: "sdk-protocol-v1",
    artifacts: [{ id: "table", role: "table", sha256: fileHash, format: "json", uri: null }], table_artifact_id: "table",
    semantics: { target: "continuous", outcome: "y", unit: "fixture units", score_direction: "higher", join_key: "id", independent_unit: null,
      subgroup_fields: ["category"], exposed: true, split: "test" }, expected_metrics: { baseline: { pearson: null, mse: 1 } }, metric_tolerance: .001,
    verification: { verified_at: date, checks: ["artifact_hashes", "join_integrity", "score_semantics", "metric_replay", "annotations", "dependence"].map(check => ({ check, status: "passed", detail: "Fixture evidence checked" })), limitations: ["Synthetic fixture only"] }, local_recipes: [],
  };
  return { records, snapshot, manifest };
}
  it("serves identical checked research through bounded immutable storage chunks", async () => {
    const { manifest } = fixture();
    const data: ResearchData = { schema_version: "1.0", manifests: [manifest], investigations: [] };
    const snapshot = fixture().snapshot;
    snapshot.research = data; data.readiness = deriveResearchReadiness(snapshot);
    const chunks = researchChunks(data);
    const ref = { collection: () => ({ orderBy: () => ({ get: async () => ({ size: chunks.length, docs: chunks.map((items_json, index) => ({ data: () => ({ index, items_json }) })) }) }) }) };
    const meta = { research_schema_version: "1.0", research_chunks: chunks.length, research_digest: researchDigest(data), research_frozen_readiness: true };
    expect(await readResearchChunks(ref as any, meta)).toEqual(data);
    await expect(readResearchChunks(ref as any, { ...meta, research_digest: hash })).rejects.toThrow(/integrity/);
    await expect(readResearchChunks(ref as any, { ...meta, research_chunks: 2 })).rejects.toThrow(/Incomplete/);
    await expect(readResearchChunks(ref as any, { coverage: { research_schema_version: "1.0" } })).rejects.toThrow(/must complete/);
  });
