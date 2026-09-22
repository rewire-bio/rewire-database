import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";

const review = JSON.parse(readFileSync("data/omics/reviews/local-evaluations-2026-09-22.json", "utf8"));
const prior = JSON.parse(readFileSync("data/omics/reviewed/local-runs-2026-09-20/review.json", "utf8"));
const records = readFileSync("data/omics/reviewed/local-runs-2026-09-20/records.jsonl", "utf8").trim().split("\n").map(line => JSON.parse(line));
const entries = review.evaluations as Array<Record<string, any>>; // Public artifact schema varies by protocol.

describe("ten submitted evaluations, separate from catalogue publication", () => {
  it("maps the original five to existing proposed IDs and leaves the next five out of releases", () => {
    expect(entries).toHaveLength(10);
    expect(new Set(entries.map(entry => entry.evaluation_id)).size).toBe(10);
    expect(entries.filter(entry => entry.catalogue_evaluation_id).map(entry => entry.catalogue_evaluation_id).sort())
      .toEqual([...prior.evaluation_ids].sort());
    const proposed = JSON.parse(gunzipSync(readFileSync("data/omics/releases/2026-09-20-370b30415b09/catalogue.json.gz")).toString("utf8"));
    for (const entry of entries.filter(entry => !entry.catalogue_evaluation_id)) {
      expect(entry.review_disposition).toBe("source_checked_needs_catalogue_ingestion");
      expect(proposed.records.some((record: { id: string }) => record.id === entry.evaluation_id)).toBe(false);
    }
  });
  it("preserves first-batch scores and undefined values exactly", () => {
    for (const entry of entries.filter(entry => entry.catalogue_evaluation_id)) {
      const results = records.filter(record => record.kind === "result" && record.links.some((link: { relation: string; target_id: string }) => link.relation === "evaluation" && link.target_id === entry.evaluation_id));
      for (const result of results) {
        const value = entry.metrics[result.attributes.metric_key];
        expect(value === null ? result.attributes.numeric_value : Number(result.attributes.numeric_value)).toBe(value);
      }
    }
  });
  it("pins every artifact and excludes private identities and publication claims", () => {
    for (const entry of entries) {
      expect(entry.publication_status).toBe("not_published");
      expect(entry.limitations.length).toBeGreaterThan(0);
      for (const source of Object.values(entry.artifacts) as { url: string; sha256: string }[]) {
        expect(source.url).toMatch(/^https:\/\/raw.githubusercontent.com\/rewire-bio\/rewire-benchmarks\/[a-f0-9]{40}\/research\//);
        expect(source.sha256).toMatch(/^[a-f0-9]{64}$/);
      }
    }
    const serialized = JSON.stringify(review);
    expect(serialized).not.toMatch(/"(?:submission_id|idempotency_key|email|token|retry_identity_sha256)"/);
    expect(review.private_reconciliation.private_identifiers_included).toBe(false);
  });
  it("keeps subset and random-control limits explicit", () => {
    for (const entry of entries.filter(entry => entry.protocol_id.startsWith("proteingym"))) {
      expect(entry.scope).toBe("subset");
      expect(entry.completion).toBe("partial");
      expect(entry.data_verification).toBe("local_bytes_hashed_not_independently_source_verified");
    }
    expect(entries.find(entry => entry.evaluation_id.endsWith("mfass-prior"))?.limitations.join(" ")).toContain("tie break");
    expect(review.duplicate_exclusions).toHaveLength(2);
  });
});
