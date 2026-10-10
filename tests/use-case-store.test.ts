import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { useCaseQueryFrom, type UseCaseState } from "../shared/omics/use-cases";
import { createUseCaseStore } from "../lib/use-case-store";
import { preparedCatalogue, preparedUseCases } from "../lib/prepared";

// Text that a naive byte scan would misread: quotes, escapes, brackets, commas and non-ASCII.
const tricky = 'He said "[x], {y}" \\ ok, naïve ✓ ]}';
const entry = (id: string, slug: string) => ({ id, slug, title: tricky, question: "Q", area: "a", contexts: ["research"], search_terms: [], inputs: [], setting: "", decision: "" });
const mapping = (id: string, evaluations: number) => ({
  id, lifecycle: "active", endpoint: tricky,
  evaluations: Array.from({ length: evaluations }, (_, i) => ({ evaluation: { id: `${id}-e${i}`, name: tricky }, configurations: [], results: [], results_next_cursor: null })),
});
const state = {
  release_id: "fixture", input_sha256: "a".repeat(64),
  entries: [entry("case-1", "first"), entry("case-2", "second")],
  mappings: [["case-1", [mapping("m1", 3), mapping("m2", 1)]], ["case-2", [mapping("m3", 2)]]],
  backlinks: [["config-1", [{ use_case_id: "case-1", slug: "first", title: tricky, mapping_id: "m1", configuration_ids: ["config-1"] }]]],
  results: [["m1|m1-e0", Array.from({ length: 5 }, (_, i) => ({ result: { id: `r${i}`, name: tricky } }))]],
  sources: [["case-1", [{ id: "s1", name: tricky }]]],
} as unknown as UseCaseState;

describe("use-case store", () => {
  it("answers exactly as the full use-case query, parsing one entry at a time", () => {
    const full = useCaseQueryFrom(state);
    const store = createUseCaseStore(gzipSync(JSON.stringify(state, null, 1)));
    expect(store.list({ limit: 1 })).toEqual(full.list({ limit: 1 }));
    expect(store.list({ q: "naïve" })).toEqual(full.list({ q: "naïve" }));
    for (const slug of ["first", "second", "missing"]) expect(store.get({ slug, limit: 1 })).toEqual(full.get({ slug, limit: 1 }));
    const cursor = full.get({ slug: "first", limit: 1 })!.evaluations_next_cursor!;
    expect(store.get({ slug: "first", cursor, limit: 1 })).toEqual(full.get({ slug: "first", cursor, limit: 1 }));
    const results = { mapping_id: "m1", evaluation_id: "m1-e0", limit: 2 };
    expect(store.evaluationResults(results)).toEqual(full.evaluationResults(results));
    const next = full.evaluationResults(results).next_cursor!;
    expect(store.evaluationResults({ ...results, cursor: next })).toEqual(full.evaluationResults({ ...results, cursor: next }));
    expect(store.evaluationResults({ mapping_id: "m9", evaluation_id: "x" })).toEqual(full.evaluationResults({ mapping_id: "m9", evaluation_id: "x" }));
    for (const id of ["config-1", "missing"]) expect(store.links({ id })).toEqual(full.links({ id }));
  });
  it("matches the file reader's own use-case answers for the pinned release", () => {
    const catalogue = preparedCatalogue();
    const store = preparedUseCases(catalogue), full = catalogue.useCases();
    expect(store).not.toBe(full);
    const listed = full.list({ limit: 100 });
    expect(store.list({ limit: 100 })).toEqual(listed);
    for (const { slug } of listed.items) {
      expect(store.get({ slug, limit: 100 }), slug).toEqual(full.get({ slug, limit: 100 }));
      // A repeat comes from the recently parsed entries and must not differ.
      expect(store.get({ slug, limit: 100 }), slug).toEqual(full.get({ slug, limit: 100 }));
    }
    const id = full.get({ slug: listed.items[0].slug })!.mappings[0]?.evaluations[0]?.configurations[0]?.id;
    if (id) expect(store.links({ id })).toEqual(full.links({ id }));
  });
});

describe("use-case index summaries", () => {
  it("count the same as summaries built from the complete evidence, without reading result pages", async () => {
    const { buildUseCases, accumulateUseCaseDetail, useCaseSummaries } = await import("../lib/use-cases-build");
    const { summariseUseCaseEvidence } = await import("../lib/use-case-summary");
    const { query, entries } = buildUseCases();
    const summaries = useCaseSummaries();
    expect(Object.keys(summaries).sort()).toEqual(entries.map((entry) => entry.slug).sort());
    for (const entry of entries)
      expect(summaries[entry.slug], entry.slug).toEqual(summariseUseCaseEvidence(accumulateUseCaseDetail(query, entry.slug)!.mappings, entry.evidence_gaps.length));
    expect(useCaseSummaries()).toBe(summaries);
  });
});
