import fs from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { createCatalogueQuery } from "../services/omics/src/catalogue-query";
import { benchmarkCoverage, assertCoverageFloor } from "../scripts/omics/audit-benchmark-evidence";
const snapshot = JSON.parse(gunzipSync(fs.readFileSync("data/omics/releases/2026-09-17-26ec7db1590e/catalogue.json.gz")).toString());
const query = createCatalogueQuery(snapshot);
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value));
describe("bounded public catalogue responses", () => {
  it("serves the largest benchmark without a nested or pooled result graph", () => {
    const id = "discovery-benchmark-nabench";
    const detail = query.get({ id, include_comparisons: false })!;
    expect(detail.published_comparisons).toHaveLength(1);
    expect(detail.comparison_options.length).toBeGreaterThan(40);
    expect(detail.aggregate_comparisons).toEqual([]);
    expect(bytes(detail)).toBeLessThan(500_000);
    expect(bytes(query.results({ id, limit: 25 }))).toBeLessThan(500_000);
    for (const option of detail.comparison_options) {
      const response = query.comparison({ id, panel_id: option.id });
      expect(response.release_id).toBe(snapshot.release_id);
      expect(response.panel?.id).toBe(option.id);
      expect(bytes(response)).toBeLessThan(1_000_000);
    }
    expect(query.comparison({ id, panel_id: "unknown" }).panel).toBeNull();
  });
  it("uses the production graph and detects per-benchmark regressions", () => {
    const coverage = benchmarkCoverage(snapshot.records);
    for (const row of coverage) {
      expect(row.results).toBe(query.results({id: row.id}).total);
      expect(row.charts).toBe(query.get({id: row.id})!.comparison_options.length);
    }
    const floor = JSON.parse(fs.readFileSync("data/omics/benchmark-evidence-floor.json", "utf8"));
    expect(() => assertCoverageFloor(coverage, floor)).not.toThrow();
    const damaged = coverage.map(row => ({...row}));
    damaged.find(row => row.results > 0)!.charts = 0;
    expect(() => assertCoverageFloor(damaged, floor)).toThrow("regressed");
    expect(() => benchmarkCoverage(snapshot.records.filter((r: {kind: string}) => r.kind !== "claim")))
      .toThrow("unverified protocol association");
  });
});
