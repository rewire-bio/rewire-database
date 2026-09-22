import { describe, it, expect } from "vitest";
import { recordSchema as websiteRecord, validateRecords } from "../scripts/omics/schema";
import { recordSchema as serviceRecord, validateSnapshot } from "../services/omics/src/validation";
import { catalogueRelations } from "../services/omics/src/entity-kinds";
import { readFileSync } from "node:fs";

const source = JSON.parse(readFileSync("data/omics/reviewed/baseline-runs-2026-09-22/records.jsonl", "utf8").trim().split("\n").find(line => JSON.parse(line).id === "rewire-dataset-proteingym-amfr-random-v13")!);
describe("website and API relationship contract", () => {
  it("accepts the same relation vocabulary and rejects unknown relations", () => {
    for (const relation of [...catalogueRelations, "unknown_relation"]) {
      const record = { ...source, links: [{ relation, target_id: "other-dataset" }] };
      expect(websiteRecord.safeParse(record).success).toBe(serviceRecord.safeParse(record).success);
      expect(websiteRecord.safeParse(record).success).toBe(relation !== "unknown_relation");
    }
  });
  it("enforces the same endpoint and self-link constraints", () => {
    for (const [kind, targetKind, self] of [["dataset_subset", "dataset", false], ["method", "dataset", false], ["dataset", "method", false], ["dataset", "dataset", true]] as const) {
      const records = [{ ...source, source_ids: [], kind, id: "one", links: [{ relation: "same_data_as", target_id: self ? "one" : "two" }] }, { ...source, source_ids: [], kind: targetKind, id: "two", links: [] }];
      const snapshot = { schema_version: "1.1", release_id: "test", released_at: "2026-09-22T00:00:00Z", coverage: {}, records };
      const valid = kind === "dataset_subset";
      if (valid) { expect(() => validateRecords(records)).not.toThrow(); expect(() => validateSnapshot(snapshot)).not.toThrow(); }
      else { expect(() => validateRecords(records)).toThrow(/dataset reuse/); expect(() => validateSnapshot(snapshot)).toThrow(/dataset reuse/); }
    }
  });
});
