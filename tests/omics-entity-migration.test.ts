import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { gunzipSync } from "node:zlib";
import { separateEntities } from "../scripts/omics/entity-migration";
import { validateRecords } from "../scripts/omics/schema";
import { createCatalogueQuery } from "../services/omics/src/catalogue-query";
import { createEvidenceIndex } from "../services/omics/src/evidence-table";
import { recordRouteKinds, recordHref, parseCatalogue } from "../lib/omics";
import { runGuideSchema } from "../services/omics/src/run-guide";
const old = JSON.parse(
  JSON.parse(
    gunzipSync(
      fs.readFileSync(
        "data/omics/releases/2026-09-17-5054ddf2a281.bundle.json.gz",
      ),
    ).toString(),
  )["catalogue.json"],
);
const records = separateEntities(old.records);
const snapshot = {
  ...old,
  schema_version: "1.1",
  release_id: "entity-fixture",
  records,
};
const query = createCatalogueQuery(snapshot),
  previous = createCatalogueQuery(old);
const byId = new Map(records.map((r) => [r.id, r]));
describe("first-class entities preserve scientific identity", () => {
  it("validates the complete migrated graph and separates top-level benchmarks", () => {
    validateRecords(records);
    parseCatalogue(snapshot);
    expect(
      query
        .list({ kind: "benchmark", limit: 100 })
        .items.every((r) =>
          ["suite", "challenge"].includes(String(r.attributes.entity_level)),
        ),
    ).toBe(true);
    expect(query.list({ kind: "benchmark", limit: 100 }).total).toBe(30);
    expect(query.list({ kind: "task", limit: 100 }).total).toBeGreaterThan(100);
    expect(query.list({ kind: "protocol", limit: 100 }).total).toBe(95);
    expect(query.list({ kind: "dataset_subset", limit: 100 }).total).toBe(51);
  });
  it("retains all result and evaluation records byte-for-byte and the exact result graph", () => {
    for (const record of old.records.filter((r: { kind: string }) =>
      ["result", "evaluation"].includes(r.kind),
    ))
      expect(byId.get(record.id)).toEqual(record);
    for (const record of old.records.filter(
      (r: { kind: string }) => r.kind === "result",
    )) {
      const before = previous.results({ id: record.id }).items[0],
        after = query.results({ id: record.id }).items[0];
      for (const key of ["models", "benchmarks", "datasets"] as const)
        expect(after[key].map((r) => r.id)).toEqual(
          before[key].map((r) => r.id),
        );
    }
  });
  it("applies the separately reviewed ESM-2 LoRA explanation correction", () => {
    const record = byId.get("reported-model-4c73500c39e9d0")!;
    expect(record.kind).toBe("configuration");
    expect(
      (record.attributes.profile as { summary: string }).summary,
    ).toContain("fine-tuned with LoRA");
    expect(record.attributes.profile_correction).toBeDefined();
  });
  it("preserves historical routes while generating canonical typed URLs", () => {
    for (const record of old.records) {
      const current = byId.get(record.id)!;
      expect(recordRouteKinds(current)).toContain(record.kind);
    }
    const example = byId.get("alphagenome-2026-comparator-008ec353f70606c2")!;
    expect(example.kind).toBe("configuration");
    expect(recordHref(example)).toContain("/configuration/");
    expect(recordRouteKinds(example)).toContain("model");
    const rows = query.results({ id: example.id });
    expect(rows.total).toBeGreaterThan(0);
    expect(
      rows.items.every((r) =>
        r.configurations.some((c) => c.id === example.id),
      ),
    ).toBe(true);
  });
  it("retains all 223 distinct comparison figures after migration", () => {
    const panels = records.flatMap(
      (r) => query.get({ id: r.id })?.published_comparisons || [],
    );
    expect(new Set(panels.map((p) => p.id)).size).toBe(223);
  });
  it("keeps composed pipelines separate from the underlying model's results", () => {
    for (const record of records.filter((r) => r.kind === "pipeline"))
      for (const link of record.links.filter(
        (l) => l.relation === "uses_model",
      )) {
        const exact = new Set(
          query
            .results({ id: record.id, limit: 100 })
            .items.map((r) => r.result.id),
        );
        const underlying = query.results({ id: link.target_id, limit: 100 });
        expect(underlying.items.every((row) => !exact.has(row.result.id))).toBe(
          true,
        );
      }
  });
  it("records source-backed commands as unexecuted instructions with claim-level citations", () => {
    const guides = records.filter((r) => r.attributes.run_guide);
    expect(guides.length).toBeGreaterThanOrEqual(7);
    const evidence = createEvidenceIndex(snapshot);
    for (const record of guides) {
      const guide = runGuideSchema.parse(record.attributes.run_guide);
      expect(guide.status).toBe("source_reviewed_not_executed");
      guide.steps.forEach((step, i) => {
        const rows = evidence
          .forRecord(record.id)
          .filter(
            (r) => r.field_path === `attributes.run_guide.steps.${i}.shell`,
          );
        expect(rows.length).toBeGreaterThan(0);
        expect(
          rows.every(
            (r) =>
              r.evidence_scope === "individual_claim" &&
              r.review_status === "source_checked" &&
              r.source_locator === step.source_locator,
          ),
        ).toBe(true);
        expect(rows.some((r) => r.value === step.shell)).toBe(true);
      });
    }
  });
});
