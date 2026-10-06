import fs from "node:fs";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  createCatalogueQuery,
  type CatalogueSnapshot,
} from "../services/omics/src/catalogue-query";
import {
  createUseCaseQuery,
  validateUseCaseArtifact,
} from "../services/omics/src/use-cases";
import { entityKinds, legacyKinds } from "../services/omics/src/entity-kinds";
import { recordRouteKinds } from "../lib/omics";
import { legacyAliasRecords } from "../lib/entity-detail";
import { accumulateUseCaseDetail } from "../lib/use-cases-build";
import {
  computeSmokeSelection,
  knownCataloguePaths,
  SMOKE_USE_CASE_SLUG,
  isSmokeExport,
} from "../lib/smoke-selection";

const fixture = vi.hoisted(() => ({
  snapshot: null as CatalogueSnapshot | null,
  query: null as ReturnType<typeof createCatalogueQuery> | null,
}));
vi.mock("../lib/catalogue-build", () => ({
  buildCatalogue: () => ({ catalogue: fixture.snapshot!, query: fixture.query! }),
}));

// The real pinned release, not a synthetic fixture: the point of these tests
// is that the fixed use case and the real legacy-alias shapes in *this*
// catalogue are actually covered, which a hand-built fixture could not prove.
const snapshot: CatalogueSnapshot = JSON.parse(
  fs.readFileSync("public/omics/catalogue.json", "utf8"),
);
const query = createCatalogueQuery(snapshot);
const root = `public/omics/releases/${snapshot.release_id}`;
const manifest = JSON.parse(fs.readFileSync(`${root}/manifest.json`, "utf8"));
const declaration = manifest.coverage.use_cases;
const artifact = validateUseCaseArtifact(
  snapshot,
  JSON.parse(fs.readFileSync(`${root}/use-cases.json`, "utf8")),
  declaration,
);
const useCaseQuery = createUseCaseQuery(snapshot, artifact, declaration, query);
const useCaseDetail = accumulateUseCaseDetail(useCaseQuery, SMOKE_USE_CASE_SLUG)!;
fixture.snapshot = snapshot;
fixture.query = query;

describe("smoke export selection", () => {
  it("has the fixed use case published in this release", () => {
    expect(useCaseDetail).toBeTruthy();
    expect(useCaseDetail.use_case.slug).toBe(SMOKE_USE_CASE_SLUG);
  });

  it("is deterministic: the same catalogue and use-case detail always select the same ids", () => {
    const a = computeSmokeSelection(snapshot, useCaseDetail);
    const b = computeSmokeSelection(snapshot, useCaseDetail);
    for (const kind of entityKinds) {
      expect([...a.idsByKind[kind]].sort(), kind).toEqual([...b.idsByKind[kind]].sort());
    }
    expect([...a.useCaseSlugs]).toEqual([...b.useCaseSlugs]);
  });

  it("selects at least one representative for every one of the 16 entity kinds", () => {
    const selection = computeSmokeSelection(snapshot, useCaseDetail);
    for (const kind of entityKinds) {
      expect(selection.idsByKind[kind].size, `no routes selected for ${kind}`).toBeGreaterThan(0);
    }
  });

  it("selects exactly the fixed use case, not every published use case", () => {
    const selection = computeSmokeSelection(snapshot, useCaseDetail);
    expect([...selection.useCaseSlugs]).toEqual([SMOKE_USE_CASE_SLUG]);
    expect(artifact.use_cases.length).toBeGreaterThan(1);
  });

  it("covers every legacy-alias route shape actually present in this release", () => {
    const selection = computeSmokeSelection(snapshot, useCaseDetail);
    const shapesPresent = new Map<string, string[]>();
    for (const segment of legacyKinds) {
      for (const record of legacyAliasRecords(snapshot, segment)) {
        const key = `${segment}<-${record.kind}`;
        (shapesPresent.get(key) || shapesPresent.set(key, []).get(key)!).push(record.id);
      }
    }
    expect(shapesPresent.size).toBeGreaterThan(0);
    for (const [shape, ids] of shapesPresent) {
      const [segment] = shape.split("<-") as [typeof legacyKinds[number]];
      const covered = ids.some((id) => selection.idsByKind[segment].has(id));
      expect(covered, `no representative selected for alias shape ${shape}`).toBe(true);
    }
    // And the representative's own canonical page is included too, so the
    // alias path never renders without its canonical counterpart existing.
    for (const { segment, sourceKind, id } of selection.reasons.aliasShapeRepresentatives) {
      expect(selection.idsByKind[segment].has(id), `${segment} alias page for ${id}`).toBe(true);
      expect(selection.idsByKind[sourceKind].has(id), `${sourceKind} canonical page for ${id}`).toBe(true);
    }
  });

  it("includes the fixed use case's full evidence graph: mappings' protocols/tasks, evaluations, configurations, result rows and every cited source", () => {
    const selection = computeSmokeSelection(snapshot, useCaseDetail);
    const expected: { kind: string; id: string }[] = [];
    for (const citation of useCaseDetail.use_case.citations) expected.push({ kind: "source", id: citation.source_id });
    for (const mapping of useCaseDetail.mappings) {
      for (const citation of mapping.citations) expected.push({ kind: "source", id: citation.source_id });
      if (mapping.protocol) expected.push({ kind: mapping.protocol.kind, id: mapping.protocol.id });
      if (mapping.task) expected.push({ kind: mapping.task.kind, id: mapping.task.id });
      for (const source of mapping.sources) expected.push({ kind: source.kind, id: source.id });
      for (const evaluation of mapping.evaluations) {
        expected.push({ kind: evaluation.evaluation.kind, id: evaluation.evaluation.id });
        for (const configuration of evaluation.configurations)
          expected.push({ kind: configuration.kind, id: configuration.id });
        for (const row of evaluation.results) {
          expected.push({ kind: row.result.kind, id: row.result.id });
          for (const groupKind of [
            "models", "benchmarks", "methods", "configurations", "pipelines",
            "services", "tasks", "protocols", "evaluators", "datasets",
            "dataset_subsets", "sources",
          ] as const) {
            for (const linked of row[groupKind] || []) expected.push({ kind: linked.kind, id: linked.id });
          }
        }
      }
    }
    expect(expected.length).toBeGreaterThan(50); // sanity: this use case has real evidence, not a trivial stub
    for (const { kind, id } of expected) {
      expect(selection.idsByKind[kind as typeof entityKinds[number]].has(id), `${kind}/${id} from the use-case graph`).toBe(true);
    }
  });

  it("never grows the fixed use case's evidence graph through reverse links: selected ids for use-case kinds are exactly the forward graph plus small fixed representatives, not the whole catalogue", () => {
    const selection = computeSmokeSelection(snapshot, useCaseDetail);
    // Representatives are capped at 2 per kind; the use-case graph is capped
    // by this release's own curated mapping/result counts. If a reverse-link
    // walk ever got introduced here, kinds like "result" or "evaluation"
    // (tens of thousands of records) would balloon far past this.
    for (const kind of entityKinds) {
      expect(selection.idsByKind[kind].size, kind).toBeLessThan(100);
    }
  });
});

describe("known catalogue paths (omitted vs. invalid links)", () => {
  const paths = knownCataloguePaths(snapshot.records, artifact.use_cases.map((entry) => entry.slug));

  it("includes every record's canonical path", () => {
    const sample = snapshot.records[0];
    expect(paths.has(`/database/${sample.kind}/${sample.id}/`)).toBe(true);
  });

  it("includes a legacy-alias path for a record that actually has one", () => {
    const aliased = snapshot.records.find(
      (record) => Array.isArray(record.attributes.legacy_kinds) && record.attributes.legacy_kinds.length > 0,
    )!;
    for (const kind of recordRouteKinds(aliased)) {
      expect(paths.has(`/database/${kind}/${aliased.id}/`), `${kind}/${aliased.id}`).toBe(true);
    }
  });

  it("includes every published use-case path, not only the sampled one", () => {
    for (const entry of artifact.use_cases) expect(paths.has(`/use-cases/${entry.slug}/`)).toBe(true);
  });

  it("does not include a path for an id that does not exist in the catalogue", () => {
    expect(paths.has("/database/result/this-id-does-not-exist-anywhere/")).toBe(false);
    expect(paths.has("/use-cases/this-slug-does-not-exist/")).toBe(false);
  });
});

describe("isSmokeExport", () => {
  it("reads OMICS_SMOKE_EXPORT literally, not any other env state", () => {
    const env = (value?: string) => ({ OMICS_SMOKE_EXPORT: value }) as unknown as NodeJS.ProcessEnv;
    expect(isSmokeExport(env(undefined))).toBe(false);
    expect(isSmokeExport(env("false"))).toBe(false);
    expect(isSmokeExport(env("1"))).toBe(false);
    expect(isSmokeExport(env("true"))).toBe(true);
  });
});

describe("filterIdsForSmoke / filterSlugsForSmoke", () => {
  beforeEach(() => {
    fixture.snapshot = snapshot;
    fixture.query = query;
  });
  afterEach(() => {
    delete process.env.OMICS_SMOKE_EXPORT;
    vi.resetModules();
  });

  it("passes every id through unchanged when not a smoke export", async () => {
    delete process.env.OMICS_SMOKE_EXPORT;
    const { filterIdsForSmoke, filterSlugsForSmoke } = await import("../lib/smoke-selection");
    const ids = snapshot.records.filter((r) => r.kind === "result").map((r) => r.id);
    expect(filterIdsForSmoke("result", ids)).toEqual(ids);
    expect(filterSlugsForSmoke(["a", "b"])).toEqual(["a", "b"]);
  });

  it("keeps only the selected ids when OMICS_SMOKE_EXPORT=true, and keeps only the fixed use-case slug", async () => {
    process.env.OMICS_SMOKE_EXPORT = "true";
    const { filterIdsForSmoke, filterSlugsForSmoke } = await import("../lib/smoke-selection");
    const allResultIds = snapshot.records.filter((r) => r.kind === "result").map((r) => r.id);
    const filtered = filterIdsForSmoke("result", allResultIds);
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.length).toBeLessThan(allResultIds.length);
    for (const id of filtered) expect(allResultIds).toContain(id);
    const allSlugs = artifact.use_cases.map((entry) => entry.slug);
    expect(filterSlugsForSmoke(allSlugs)).toEqual([SMOKE_USE_CASE_SLUG]);
  });
});
