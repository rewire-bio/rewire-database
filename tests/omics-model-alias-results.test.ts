import { describe, expect, it } from "vitest";
import { createCatalogueQuery } from "../services/omics/src/catalogue-query";
import { applyModelEvaluationLinks } from "../scripts/omics/model-evaluation-links";

import type { RecordEntry as CatalogueRecord } from "../scripts/omics/schema";

const record = (id: string, kind: CatalogueRecord["kind"], links: CatalogueRecord["links"] = []): CatalogueRecord => ({ id, kind, name: id, description: "", status: "source_checked", facets: {}, source_ids: [], links, attributes: {} });
const input = [record("source", "source"), record("canonical", "model"), record("alias", "model"), record("old-alias", "model"), record("configuration", "configuration"), record("sibling", "configuration"), record("pipeline", "pipeline"), record("evaluation", "evaluation", [{ relation: "model", target_id: "configuration" }]), { ...record("result", "result", [{ relation: "evaluation", target_id: "evaluation" }]), attributes: { metric: "accuracy" } }];
const edge = (subject_id: string, relation: string, target_id: string) => ({ subject_id, relation, target_id, source_ids: ["source"], source_locator: "Primary source table", explanation: "Test fixture for verified identity" });
const edges = [edge("configuration", "family", "canonical"), edge("sibling", "family", "canonical"), edge("alias", "alias_of", "canonical"), edge("old-alias", "alias_of", "alias"), edge("pipeline", "uses_model", "canonical")];
const snapshot = (records: CatalogueRecord[]) => ({ schema_version: "1.1", release_id: "test", released_at: "2026-09-23", coverage: {}, records });

describe("verified aliases retain historical result navigation", () => {
  it("shares deduplicated results through verified aliases, never across siblings or pipelines", () => {
    const query = createCatalogueQuery(snapshot(applyModelEvaluationLinks(input, edges)));
    for (const id of ["canonical", "alias", "old-alias", "configuration"]) expect(query.results({ id }).items.map(row => row.result.id)).toEqual(["result"]);
    for (const id of ["sibling", "pipeline"]) expect(query.results({ id }).items).toHaveLength(0);
    expect(query.list({ kind: "model" }).items.map(item => item.id)).toEqual(["canonical"]);
  });
  it("requires an evidenced claim and matching entity kinds", () => {
    const reviewed = applyModelEvaluationLinks(input, edges);
    const unverified = reviewed.filter(record => !(record.kind === "claim" && String(record.attributes.field).includes("alias_of")));
    const query = createCatalogueQuery(snapshot(unverified));
    expect(query.results({ id: "alias" }).items).toHaveLength(0);
    expect(query.list({ kind: "model" }).items).toHaveLength(3);
    expect(() => applyModelEvaluationLinks(input, [edge("pipeline", "alias_of", "canonical")])).toThrow(/Alias/);
    expect(() => applyModelEvaluationLinks(input, [edge("pipeline", "family", "canonical")])).toThrow(/pipeline/);
  });
  it("rejects cycles, duplicate edges and absent evidence", () => {
    expect(() => applyModelEvaluationLinks(input, [edge("alias", "alias_of", "canonical"), edge("canonical", "alias_of", "alias")])).toThrow(/Cyclic/);
    expect(() => applyModelEvaluationLinks(input, [edges[0], edges[0]])).toThrow(/Duplicate/);
    expect(() => applyModelEvaluationLinks(input, [{ ...edges[0], source_ids: ["missing"] }])).toThrow(/Missing identity source/);
  });
});
