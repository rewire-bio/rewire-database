import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { createCatalogueQuery } from "../services/omics/src/catalogue-query";
const snapshot = JSON.parse(fs.readFileSync("public/omics/catalogue.json").toString());
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
});
