import fs from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, it, expect } from "vitest";
import { validateSnapshot } from "../services/omics/src/validation";
import {
  createCatalogueQuery,
  type CatalogueSnapshot,
} from "../services/omics/src/catalogue-query";
const current = JSON.parse(
  fs.readFileSync("public/omics/catalogue.json", "utf8"),
) as CatalogueSnapshot;
const oldFiles = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      "data/omics/releases/2026-09-17-d277315f7d76.bundle.json.gz",
    ),
  ).toString(),
);
const previous = JSON.parse(oldFiles["catalogue.json"]) as CatalogueSnapshot;
describe("runner recipe release integrity", () => {
  it("preserves every existing result byte-for-byte and scientific evaluation metadata", () => {
    const now = new Map(current.records.map((r) => [r.id, r]));
    for (const record of previous.records.filter((r) => r.kind === "result"))
      expect(now.get(record.id)).toEqual(record);
    for (const record of previous.records.filter(
      (r) => r.kind === "evaluation",
    )) {
      const latest = structuredClone(now.get(record.id)!);
      delete latest.attributes.reproduction;
      latest.source_ids = record.source_ids;
      expect(latest).toEqual(record);
    }
    expect(current.records.filter((r) => r.kind === "result")).toHaveLength(
      previous.records.filter((r) => r.kind === "result").length,
    );
  });
  it("has one protocol-specific ProteinGym entry without migrating older uncertain results", () => {
    const protocol = current.records.find(
      (r) => r.id === "rewire-proteingym-v1-3-dms-substitutions",
    )!;
    expect(protocol.kind).toBe("protocol");
    expect(protocol.links).toContainEqual({
      relation: "part_of",
      target_id: "discovery-benchmark-proteingym",
    });
    expect(
      createCatalogueQuery(current).results({ id: protocol.id }).total,
    ).toBe(0);
    const suite = createCatalogueQuery(current).get({
      id: "discovery-benchmark-proteingym",
    })!;
    expect(suite.reverse.some((r) => r.record.id === protocol.id)).toBe(true);
  });
  it("covers every top-level benchmark with official guidance and links only exact MFASS evaluations", () => {
    const coverage = current.coverage as Record<string, unknown>;
    const recipes = coverage.run_recipe_coverage as Record<string, number>;
    const benchmarks = current.records.filter((r) => r.kind === "benchmark");
    expect(recipes.top_level_benchmarks).toBe(benchmarks.length);
    expect(recipes.official_documentation_or_gap).toBe(benchmarks.length);
    for (const record of benchmarks)
      expect(record.attributes.run_documentation).toBeTruthy();
    const linked = current.records.filter((r) => r.attributes.reproduction);
    expect(linked).toHaveLength(4);
    for (const record of linked) {
      expect(record.attributes.origin).toBe("rewire_run");
      expect(
        (record.attributes.reproduction as Record<string, unknown>)
          .applicability,
      ).toBe("rescore_predictions");
    }
    expect(() => validateSnapshot(current)).not.toThrow();
  });
});
