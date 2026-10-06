import { describe, expect, it } from "vitest";
import { buildDetailDependencies } from "../lib/detail-cache/dependencies";
import { createCatalogueQuery, type CatalogueRecord, type CatalogueSnapshot } from "../services/omics/src/catalogue-query";

function record(id: string, kind: CatalogueRecord["kind"], extra: Partial<CatalogueRecord> = {}): CatalogueRecord {
  return { id, kind, name: id, description: "", status: "source_checked", facets: {}, attributes: {}, links: [], source_ids: [], ...extra };
}
function fixture(): CatalogueSnapshot {
  return { schema_version: "1.1", release_id: "2026-10-06-aaaaaaaaaaaa", released_at: "2026-10-06", coverage: {}, records: [
    record("source", "source", { attributes: { url: "https://example.org/paper" } }),
    record("result", "result", { source_ids: ["source"], links: [{ relation: "evaluation", target_id: "evaluation" }], attributes: { printed_value: "1", metric: "accuracy", source_locator: "Table 1" } }),
    record("evaluation", "evaluation", { links: [{ relation: "model", target_id: "model" }, { relation: "baseline", target_id: "baseline" }] }),
    record("model", "model", { links: [{ relation: "family", target_id: "family" }] }),
    record("family", "model"), record("baseline", "baseline"), record("unrelated", "dataset"),
  ] };
}
const manifest = (s: CatalogueSnapshot, id = "result") => buildDetailDependencies(s, id === "source" ? "source" : "result", id);
const find = (s: CatalogueSnapshot, id: string) => s.records.find((r) => r.id === id)!;

describe("detail cache rendering dependencies", () => {
  it("is deterministic, detached and ignores unrelated records", () => {
    const s = fixture(); const before = manifest(s);
    expect(manifest(s)).toEqual(before);
    find(s, "unrelated").name = "Unrelated edit";
    expect(manifest(s)).toEqual(before);
    find(s, "result").attributes.printed_value = "2";
    expect(manifest(s)).not.toEqual(before);
    expect((before!.detail as { record: CatalogueRecord }).record.attributes.printed_value).toBe("1");
  });
  it.each(["source", "evaluation", "baseline"])("tracks transitive %s edits and deletion", (id) => {
    const s = fixture(); const before = manifest(s);
    find(s, id).name = "Changed name";
    expect(manifest(s)).not.toEqual(before);
    if (id !== "source") { s.records = s.records.filter((r) => r.id !== id); expect(manifest(s)).not.toEqual(before); }
  });
  it("tracks previously missing link targets appearing and reverse links", () => {
    const s = fixture(); find(s, "evaluation").links.push({ relation: "baseline", target_id: "new-baseline" });
    const before = manifest(s);
    s.records.push(record("new-baseline", "baseline")); expect(manifest(s)).not.toEqual(before);
    const next = manifest(s);
    s.records.push(record("reverse", "claim", { links: [{ relation: "subject", target_id: "result" }] }));
    expect(manifest(s)).not.toEqual(next);
  });
  it("tracks verified family membership and raw family target attributes", () => {
    const s = fixture(); const before = manifest(s);
    s.records.push(record("claim", "claim", { source_ids: ["source"], links: [{ relation: "subject", target_id: "model" }], attributes: { field: "links:family:family", source_locator: "p1" } }));
    const verified = manifest(s); expect(verified).not.toEqual(before);
    find(s, "family").attributes.profile = { summary: "Updated raw profile" };
    expect(manifest(s)).not.toEqual(verified);
  });
  it("tracks evidence beyond the first ten rows through pagination totals", () => {
    const s = fixture();
    for (let i = 0; i < 12; i++) s.records.push(record(`claim-${String(i).padStart(2, "0")}`, "claim", {
      source_ids: ["source"], links: [{ relation: "subject", target_id: "result" }],
      attributes: { field: "attributes.printed_value", value: "1", source_locator: "Table 1" },
    }));
    const before = manifest(s)!; const evidence = before.evidence as { items: unknown[]; total: number };
    expect(evidence.items).toHaveLength(10);
    s.records.push(record("claim-zz", "claim", { source_ids: ["source"], links: [{ relation: "subject", target_id: "result" }], attributes: { field: "attributes.printed_value", value: "1", source_locator: "Table 1" } }));
    const after = manifest(s)!;
    expect((after.evidence as typeof evidence).items).toEqual(evidence.items);
    expect((after.evidence as typeof evidence).total).toBe(evidence.total + 1);
  });
  it("uses source_metadata scope and tracks raw source attributes", () => {
    const s = fixture(); const before = manifest(s, "source")!;
    expect(before.evidence).toEqual(createCatalogueQuery(s).evidence({ id: "source", scope: "source_metadata", limit: 10 }));
    find(s, "source").attributes.version = "2"; expect(manifest(s, "source")).not.toEqual(before);
  });
  it("tracks identity subjects, release and coverage", () => {
    const s = fixture(); find(s, "result").attributes.source_identity = { subject_id: "unrelated" };
    const before = manifest(s); find(s, "unrelated").name = "Identity changed";
    expect(manifest(s)).not.toEqual(before);
    const next = manifest(s); s.release_id += "-new"; expect(manifest(s)).not.toEqual(next);
    const released = manifest(s); s.coverage.audit_history = true; expect(manifest(s)).not.toEqual(released);
  });
  it("tracks reproduction recipe owners outside evaluation links", () => {
    const s = fixture();
    find(s, "evaluation").attributes.reproduction = {
      recipe_owner_id: "unrelated", recipe_id: "recipe", applicability: "rescore_predictions",
      explanation: "Recorded procedure", source_ids: ["source"], source_locator: "Methods",
    };
    const before = manifest(s)!;
    expect((before.recipeOwner as CatalogueRecord).id).toBe("unrelated");
    find(s, "unrelated").kind = "benchmark";
    expect(manifest(s)).not.toEqual(before);
    s.records = s.records.filter((r) => r.id !== "unrelated");
    expect(manifest(s)!.recipeOwner).toBeNull();
  });
  it("fails closed without use-case resolution and captures configuration names", () => {
    const s = fixture(); s.coverage.use_cases = {};
    expect(() => manifest(s)).toThrow(/resolved use-case query/);
    const options = { useCaseQuery: { links: () => ({ release_id: s.release_id, input_sha256: null, items: [{ use_case_id: "case", slug: "case", title: "Case", mapping_id: "mapping", configuration_ids: ["unrelated"] }] }) } };
    const before = buildDetailDependencies(s, "result", "result", options);
    find(s, "unrelated").name = "Configuration changed";
    expect(buildDetailDependencies(s, "result", "result", options)).not.toEqual(before);
  });
  it("tracks reproduction citations absent from ordinary source links", () => {
    const s = fixture();
    s.records.push(record("recipe-source", "source", { attributes: { url: "https://example.org/recipe" } }));
    find(s, "evaluation").attributes.reproduction = {
      recipe_owner_id: "unrelated", recipe_id: "recipe", applicability: "rescore_predictions",
      explanation: "Recorded procedure", source_ids: ["recipe-source"], source_locator: "Methods",
    };
    const before = manifest(s)!;
    expect((before.reproductionSources as CatalogueRecord[]).map((source) => source.id)).toEqual(["recipe-source"]);
    expect((before.detail as { sources: CatalogueRecord[] }).sources.map((source) => source.id)).not.toContain("recipe-source");
    find(s, "recipe-source").name = "Revised recipe citation";
    const renamed = manifest(s)!;
    expect(renamed).not.toEqual(before);
    find(s, "recipe-source").attributes.url = "https://example.org/revised-recipe";
    expect(manifest(s)).not.toEqual(renamed);
  });
  it("renders aliases, excluded and missing records normally", () => {
    const s = fixture(); find(s, "model").attributes.legacy_kinds = ["result"];
    expect(buildDetailDependencies(s, "result", "model")).toBeNull();
    expect(manifest(s, "missing")).toBeNull();
    find(s, "result").status = "excluded"; expect(manifest(s)).toBeNull();
  });
});
