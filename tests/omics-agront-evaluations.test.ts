import fs from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { addAgroEvaluations, agroBenchmark, agroFamily, agroRoot } from "../scripts/omics/agront-evaluations";
import { validateRecords, type RecordEntry } from "../scripts/omics/schema";
import { createCatalogueQuery } from "../services/omics/src/catalogue-query";

const catalogue = JSON.parse(gunzipSync(fs.readFileSync("data/omics/releases/2026-09-22-f58a0f1d267f/catalogue.json.gz")).toString());
const records = validateRecords(addAgroEvaluations(catalogue.records));
const added = records.slice(catalogue.records.length);
const query = createCatalogueQuery({ ...catalogue, records });

describe("AgroNT complete Figure 3 source tables", () => {
  it("preserves every existing record and prohibits replacing one", () => {
    expect(records.slice(0, catalogue.records.length)).toEqual(catalogue.records);
    expect(() => addAgroEvaluations([added[0]])).toThrow(/cannot replace/);
  });
  it("links 12 author-reported scores to the existing family, with distinct fitted configurations", () => {
    const result = query.results({ id: agroFamily, limit: 100 });
    expect(result.items).toHaveLength(12);
    expect(result.evaluation_count).toBe(12);
    expect(new Set(result.items.flatMap(row => row.configurations.map(config => config.id))).size).toBe(4);
    expect(result.items.every(row => row.origin === "author_reported" && row.result.status === "source_checked")).toBe(true);
    expect(query.results({ id: agroBenchmark, limit: 100 }).items).toHaveLength(24);
  });
  it("keeps both methods in each of 12 separate assay and sequence comparisons", () => {
    const protocols = added.filter(record => record.kind === "protocol");
    expect(protocols).toHaveLength(12);
    for (const protocol of protocols) {
      const result = query.results({ id: protocol.id, limit: 100 });
      expect(result.items).toHaveLength(2);
      expect(result.items.filter(row => row.configurations.some(config => config.name.startsWith("AgroNT:")))).toHaveLength(1);
      expect(result.items.filter(row => row.configurations.some(config => config.name.startsWith("CNN")))).toHaveLength(1);
      const panels = protocol.attributes.comparison_panels as { id: string }[];
      expect(query.comparison({ id: agroBenchmark, panel_id: panels[0].id }).panel).not.toBeNull();
    }
  });
  it("preserves source strings, negative findings and ties without inventing uncertainty or coverage", () => {
    const sourceRows = JSON.parse(fs.readFileSync(`${agroRoot}/rows.json`, "utf8")) as { source_locator: string; printed_value: string }[];
    const results = added.filter(record => record.kind === "result");
    expect(results).toHaveLength(24);
    for (const row of sourceRows) {
      const result = results.find(record => record.attributes.source_locator === row.source_locator)!;
      expect(result.attributes.printed_value).toBe(row.printed_value);
      expect(result.attributes.numeric_value).toBe(row.printed_value);
      expect(result.attributes.uncertainty).toBeNull();
      expect(result.attributes.scored_count).toBeUndefined();
    }
    const gc = added.filter(record => record.kind === "protocol" && record.name.includes("randomized GC sequences"));
    expect(gc).toHaveLength(2);
    expect(added.some(record => record.id.includes("fig4"))).toBe(false);
    for (const evaluation of added.filter(record => record.kind === "evaluation")) {
      expect(evaluation.attributes.published_score_reproduction).toBe(false);
      expect(evaluation.attributes.suite_complete).toBe(false);
      if (evaluation.name.startsWith("CNN")) expect(evaluation.attributes.adaptation).not.toMatch(/IA3/);
    }
  });
  it("does not roll up results when source-backed family claims are removed", () => {
    const unverified = records.filter((record: RecordEntry) => !record.id.endsWith("-family-claim"));
    expect(createCatalogueQuery({ ...catalogue, records: unverified }).results({ id: agroFamily, limit: 100 }).items).toHaveLength(0);
  });
});
