import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { buildRelease } from "../scripts/omics/release";
import { createCatalogueQuery } from "../services/omics/src/catalogue-query";
import { compareResults, parseCatalogue } from "../lib/omics";
import { fixture } from "../services/omics/test/fixtures";

function typedFixture() {
  const snapshot = fixture();
  snapshot.schema_version = "1.1";
  snapshot.records.find((r: any) => r.id === "model-one").kind =
    "configuration";
  snapshot.records.find((r: any) => r.id === "benchmark-one").kind = "protocol";
  snapshot.records.find((r: any) => r.id === "dataset-one").kind =
    "dataset_subset";
  return snapshot;
}
function pair() {
  const snapshot = typedFixture();
  const evaluation = structuredClone(
    snapshot.records.find((r: any) => r.kind === "evaluation"),
  );
  evaluation.id = "evaluation-two";
  const result = structuredClone(
    snapshot.records.find((r: any) => r.kind === "result"),
  );
  result.id = "result-two";
  result.links = [{ relation: "evaluation", target_id: evaluation.id }];
  snapshot.records.push(evaluation, result);
  return snapshot;
}
function legacyCompare(snapshot: ReturnType<typeof fixture>) {
  return compareResults(
    snapshot.records.filter((r: any) => r.kind === "result"),
    snapshot.records,
  );
}
const ids = ["result-one", "result-two"];

describe("entity schema version boundaries", () => {
  it("rejects new kinds labelled as schema 1.0 in release and static readers", () => {
    const snapshot = typedFixture();
    snapshot.schema_version = "1.0";
    expect(() => buildRelease(snapshot.records, snapshot.released_at)).toThrow(
      /require schema version 1.1/,
    );
    expect(() => parseCatalogue(snapshot)).toThrow(
      /require schema version 1.1/,
    );
  });
  it("counts new kinds in a correctly declared 1.1 release", () => {
    const snapshot = typedFixture();
    const release = buildRelease(snapshot.records, snapshot.released_at, {
      entity_schema_version: "1.1",
    });
    expect(release.snapshot.schema_version).toBe("1.1");
    expect(release.manifest.counts.configuration).toBe(1);
    expect(release.manifest.counts.protocol).toBe(1);
    expect(release.manifest.counts.dataset_subset).toBe(1);
    expect(
      Object.values(release.manifest.counts).reduce(
        (sum, count) => sum + count,
        0,
      ),
    ).toBe(release.snapshot.records.length);
    expect(() => parseCatalogue(release.snapshot)).not.toThrow();
  });
  it("reconstructs the initial schema 1.0 receipt without changing any hashes", () => {
    const manifest = JSON.parse(
      fs.readFileSync(
        "data/omics/releases/2026-09-16-b5213be10a49.json",
        "utf8",
      ),
    );
    const records = [
      "data/omics/migrated.jsonl",
      "data/omics/discovery.jsonl",
    ].flatMap((file) =>
      fs
        .readFileSync(file, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line)),
    );
    const {
      research_lanes,
      search_entries,
      legacy_papers,
      legacy_result_rows,
      source_inputs,
    } = manifest.coverage;
    const rebuilt = buildRelease(records, manifest.released_at, {
      research_lanes,
      search_entries,
      legacy_papers,
      legacy_result_rows,
      source_inputs,
    });
    expect(JSON.stringify(rebuilt.manifest)).toBe(JSON.stringify(manifest));
  });
});

describe("comparison assessment and dataset identities", () => {
  it.each(["dataset", "dataset_subset"])(
    "supports %s targets via legacy and typed relations",
    (kind) => {
      for (const relation of ["dataset", kind]) {
        const snapshot = pair();
        snapshot.records.find((r: any) => r.id === "dataset-one").kind = kind;
        for (const evaluation of snapshot.records.filter(
          (r: any) => r.kind === "evaluation",
        ))
          evaluation.links[2].relation = relation;
        expect(createCatalogueQuery(snapshot).compare({ ids }).compatible).toBe(
          true,
        );
        expect(legacyCompare(snapshot).compatible).toBe(true);
      }
    },
  );
  it.each(["superseded", "disputed", "excluded"])(
    "rejects %s assessments and datasets in both comparison paths",
    (status) => {
      for (const kind of [
        "benchmark",
        "task",
        "protocol",
        "evaluator",
        "dataset",
        "dataset_subset",
      ]) {
        const snapshot = pair();
        const dataset = kind.startsWith("dataset");
        const subject = snapshot.records.find(
          (r: any) => r.id === (dataset ? "dataset-one" : "benchmark-one"),
        );
        subject.kind = kind;
        subject.status = status;
        for (const evaluation of snapshot.records.filter(
          (r: any) => r.kind === "evaluation",
        ))
          evaluation.links[dataset ? 2 : 1].relation = kind;
        expect(
          createCatalogueQuery(snapshot).compare({ ids }).reasons,
        ).toContain(
          "A linked assessment or dataset is disputed, superseded or excluded.",
        );
        expect(legacyCompare(snapshot).reasons).toContain(
          "A linked assessment or dataset is disputed, superseded or excluded.",
        );
      }
    },
  );
  it("keeps excluded assessment records out of API results", () => {
    const snapshot = pair();
    snapshot.records.find((r: any) => r.id === "benchmark-one").status =
      "excluded";
    const query = createCatalogueQuery(snapshot);
    expect(query.get({ id: "benchmark-one" })).toBeNull();
    expect(query.results({ id: "result-one" }).items[0].benchmarks).toEqual([]);
    expect(query.compare({ ids }).compatible).toBe(false);
  });
});
