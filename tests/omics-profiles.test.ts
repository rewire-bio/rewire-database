import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { enrichProfiles, profileSchema } from "../lib/omics-profile";
import { enrichAssociations } from "../scripts/omics/enrich";
import { buildRelease } from "../scripts/omics/release";
import { publicRecords, type RecordEntry } from "../scripts/omics/schema";
import { createCatalogueQuery } from "../services/omics/src/catalogue-query";

function jsonl<T>(file: string): T[] {
  return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line));
}
const base = ["migrated", "discovery"].flatMap(name => jsonl<RecordEntry>(`data/omics/${name}.jsonl`));
const profiles = ["model", "benchmark"].flatMap(name => jsonl<{id: string; profile: unknown}>(`data/omics/${name}-profiles.jsonl`));
const associations = ["model", "benchmark"].flatMap(name => jsonl<unknown>(`data/omics/${name}-profile-associations.jsonl`));
const enriched = enrichProfiles(enrichAssociations(base, associations), profiles);
const published = buildRelease(enriched, "2026-09-16T10:50:02Z").snapshot;
const query = createCatalogueQuery(published);
// Reconstruct the historical release from tracked inputs. CI runs tests before
// any public exports exist, so ignored build products cannot serve as fixtures.
const archiveReceiptBytes = fs.readFileSync("data/omics/releases/2026-09-16-b5213be10a49.json");
const archiveReceipt = JSON.parse(archiveReceiptBytes.toString()) as {
  release_id: string;
  released_at: string;
  coverage: Record<string, unknown>;
  files: Record<string, string>;
};
const archivedRelease = buildRelease(base, archiveReceipt.released_at, {
  research_lanes: archiveReceipt.coverage.research_lanes,
  search_entries: archiveReceipt.coverage.search_entries,
  legacy_papers: archiveReceipt.coverage.legacy_papers,
  legacy_result_rows: archiveReceipt.coverage.legacy_result_rows,
  source_inputs: archiveReceipt.coverage.source_inputs,
});
const archive = archivedRelease.snapshot;
const sourceId = "barcodebert-2026";
const barcodeId = "reported-model-05103f72325fe5";
const benchmarkId = "reported-task-4a54ce01b5a855";
const review = {method: "automated_source_review", date: "2026-09-16", note: "Synthetic relationship fixture; not a scientific claim."};
const link = (relation: string, target_id: string, source_ids = [sourceId]) => ({relation, target_id, source_ids, source_locator: "Synthetic fixture location", review});
function resultIds(id: string) {
  const ids: string[] = [];
  let cursor: string | undefined;
  do {
    const page = query.results({id, limit: 100, cursor});
    ids.push(...page.items.map(row => row.result.id));
    cursor = page.next_cursor || undefined;
  } while (cursor);
  return ids;
}

describe("source-backed profile publication", () => {
  it("covers every public model and benchmark without changing identity or numerical review", () => {
    const targets = publicRecords(base).filter(record => ["model", "benchmark"].includes(record.kind));
    expect(targets.filter(record => record.kind === "model")).toHaveLength(226);
    expect(targets.filter(record => record.kind === "benchmark")).toHaveLength(170);
    expect(new Set(profiles.map(profile => profile.id))).toEqual(new Set(targets.map(record => record.id)));
    for (const original of targets) {
      const current = query.get({id: original.id})!.record;
      expect(current.name).toBe(original.name);
      expect(current.status).toBe(original.status);
      const profile = profileSchema.parse(current.attributes.profile);
      if (profile.coverage === "limited") expect(profile.gaps.length).toBeGreaterThan(0);
      if (profile.coverage === "reviewed") expect(profile.sections.length).toBeGreaterThan(0);
      expect(profile.review.method).toBe("automated_source_review");
    }
  });

  it("rejects missing and non-source evidence, empty locators and unsupported profile targets", () => {
    const item = structuredClone(profiles.find(profile => profile.id === barcodeId)!);
    const profile = profileSchema.parse(item.profile);
    profile.sections[0].source_ids = ["missing-source"];
    expect(() => enrichProfiles(base, [{...item, profile}])).toThrow("missing source");
    profile.sections[0].source_ids = [barcodeId];
    expect(() => enrichProfiles(base, [{...item, profile}])).toThrow("missing source");
    profile.sections[0].source_ids = [sourceId];
    profile.sections[0].source_locator = " ";
    expect(() => enrichProfiles(base, [{...item, profile}])).toThrow();
    expect(() => enrichProfiles(base, [{...item, id: "b2-barcodebert-2026"}])).toThrow("no model or benchmark");
    expect(() => enrichProfiles(base, [item, item])).toThrow("Duplicate profile");
  });

  it("requires explicit gaps for limited profiles and cited explanation for reviewed coverage", () => {
    const limited = profileSchema.parse(profiles.find(item => profileSchema.parse(item.profile).coverage === "limited")!.profile);
    expect(() => profileSchema.parse({...limited, gaps: []})).toThrow("evidence gaps");
    const reviewed = profileSchema.parse(profiles.find(item => profileSchema.parse(item.profile).coverage === "reviewed")!.profile);
    expect(() => profileSchema.parse({...reviewed, sections: []})).toThrow("sourced explanation");
  });

  it("rejects invalid relationship targets, wrong entity kinds and absent evidence", () => {
    expect(() => enrichAssociations(base, [{id: barcodeId, links: [link("family", "missing-model")]}])).toThrow("Invalid association target");
    expect(() => enrichAssociations(base, [{id: barcodeId, links: [link("family", benchmarkId)]}])).toThrow("connect models");
    expect(() => enrichAssociations(base, [{id: barcodeId, links: [link("alias_of", benchmarkId)]}])).toThrow("kind mismatch");
    expect(() => enrichAssociations(base, [{id: barcodeId, links: [link("uses_model", "discovery-model-dnabert-2", ["missing-source"])]}])).toThrow("Unknown association source");
    const item = {id: barcodeId, links: [link("uses_model", "discovery-model-dnabert-2")]};
    expect(() => enrichAssociations(base, [item, item])).toThrow("Duplicate association");
  });

  it("preserves all 167 historical result records byte-for-field through enrichment", () => {
    const results = archive.records.filter(record => record.kind === "result");
    expect(results).toHaveLength(167);
    expect(published.records.filter(record => record.kind === "result")).toHaveLength(167);
    for (const original of results) expect(query.get({id: original.id})?.record).toEqual(original);
  });

  it("makes every result reachable through its exact model, benchmark and evaluation", () => {
    for (const result of published.records.filter(record => record.kind === "result")) {
      const detail = query.get({id: result.id})!;
      const evaluation = detail.direct.find(item => item.relation === "evaluation")!.record;
      expect(query.get({id: evaluation.id})!.reverse.some(item => item.record.id === result.id)).toBe(true);
      const row = query.results({id: result.id}).items[0];
      expect(row.result.id).toBe(result.id);
      expect(row.evaluation?.id).toBe(evaluation.id);
      expect(row.models.length).toBeGreaterThan(0);
      expect(row.benchmarks.length).toBeGreaterThan(0);
      expect(row.sources.length).toBeGreaterThan(0);
      expect(row.review_status).toBe(result.status);
      for (const linked of [...row.models, ...row.benchmarks]) {
        expect(resultIds(linked.id)).toContain(result.id);
        expect(query.get({id: linked.id})!.reverse.some(item => item.record.id === evaluation.id)).toBe(true);
      }
    }
  });

  it("exposes BarcodeBERT's 78.5 percent genus result on both exact detail pages", () => {
    const row = query.results({id: "b2-barcodebert-2026"}).items[0];
    expect(row.result.attributes.printed_value).toBe("78.5");
    expect(row.result.attributes.unit).toBe("percent");
    expect(row.models.map(record => record.id)).toEqual([barcodeId]);
    expect(row.benchmarks.map(record => record.id)).toEqual([benchmarkId]);
    expect(String(row.evaluation!.attributes.protocol)).toContain("genus-level nearest-neighbor");
    expect(resultIds(barcodeId)).toContain(row.result.id);
    expect(resultIds(benchmarkId)).toContain(row.result.id);
    expect(profileSchema.parse(query.get({id: barcodeId})!.record.attributes.profile).summary).toContain("four-layer");
  });

  it("keeps the frozen DNABERT logistic pipeline separate from base-model performance", () => {
    const pipeline = "rewire-model-dnabert2-117m-frozen-pair-logreg";
    const family = "discovery-model-dnabert-2";
    const pipelineResults = resultIds(pipeline);
    expect(pipelineResults).toHaveLength(3);
    expect(query.get({id: pipeline})!.direct).toContainEqual(expect.objectContaining({relation: "uses_model", record: expect.objectContaining({id: family})}));
    expect(resultIds(family).filter(id => pipelineResults.includes(id))).toEqual([]);
    expect(query.get({id: pipeline})!.record.attributes.entity_level).toBe("method");
    expect(query.get({id: family})!.record.attributes.entity_level).toBe("family");
    expect(profileSchema.parse(query.get({id: pipeline})!.record.attributes.profile).summary).toContain("logistic-regression");
  });

  it("rolls up verified family members but never a pipeline merely using the family", () => {
    function fixtureRecord(id: string, kind: RecordEntry["kind"], links: RecordEntry["links"] = []): RecordEntry {
      return {id, kind, name: id, description: "Synthetic test fixture", status: "source_checked", facets: {}, source_ids: kind === "source" ? [] : ["test-source"], links, attributes: {}};
    }
    const records = [fixtureRecord("test-source", "source"), fixtureRecord("test-family", "model"), fixtureRecord("test-variant", "model"), fixtureRecord("test-pipeline", "model"), ...["variant", "pipeline"].flatMap(kind => [
      fixtureRecord(`test-evaluation-${kind}`, "evaluation", [{relation: "model", target_id: `test-${kind}`}]),
      fixtureRecord(`test-result-${kind}`, "result", [{relation: "evaluation", target_id: `test-evaluation-${kind}`}]),
    ])];
    const linked = enrichAssociations(records, [
      {id: "test-variant", links: [link("variant_of", "test-family", ["test-source"])]},
      {id: "test-pipeline", links: [link("uses_model", "test-family", ["test-source"])]},
    ]);
    const snapshot = {...published, records: linked};
    expect(createCatalogueQuery(snapshot).results({id: "test-family"}).items.map(row => row.result.id)).toEqual(["test-result-variant"]);
    const unverified = {...snapshot, records: linked.filter(record => record.kind !== "claim")};
    expect(createCatalogueQuery(unverified).results({id: "test-family"}).items).toEqual([]);
    expect(createCatalogueQuery(unverified).results({id: "test-variant"}).items).toHaveLength(1);
  });

  it("preserves the immutable prior release and every manifest-listed export", () => {
    expect(createHash("sha256").update(archiveReceiptBytes).digest("hex")).toBe("996ce9f9b7ea8688a6778790b073b34ad1b42b6906332c3c85f24708165a05f6");
    expect(archiveReceipt.release_id).toBe("2026-09-16-b5213be10a49");
    expect(archivedRelease.manifest).toEqual(archiveReceipt);
    for (const [file, digest] of Object.entries(archiveReceipt.files)) {
      expect(createHash("sha256").update(archivedRelease.files[file]).digest("hex")).toBe(digest);
    }
    expect(archive.records.some(record => record.attributes.profile !== undefined)).toBe(false);
    expect(query.get({id: "rewire-mfass-v1"})!.record.status).toBe("superseded");
    expect(query.get({id: "rewire-mfass-v2"})!.record.links).toContainEqual({relation: "supersedes", target_id: "rewire-mfass-v1"});
  });
});
