import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  addEvaluationGroups,
  applyEvaluationGroups,
  evaluationRecordDigest,
} from "../scripts/omics/evaluation-groups";
import type { RecordEntry } from "../scripts/omics/schema";

const read = (file: string): RecordEntry[] =>
  fs
    .readFileSync(file, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
const records = [
  ...read("data/omics/reviewed/benchmark-evidence-2026.jsonl").filter(
    (record) =>
      [
        "expansion-p3-genomic-benchmarks",
        "evidence-expansion-proteingym-a3b08cc4",
      ].includes(record.id),
  ),
  ...read("data/omics/reviewed/genomic-benchmarks-2026.jsonl"),
  ...read("data/omics/reviewed/proteingym-2026.jsonl"),
];
const mapping = JSON.parse(
  fs.readFileSync("data/omics/evaluation-groups.json", "utf8"),
);
const grouped = addEvaluationGroups(records);

describe("reviewed source evaluation scopes", () => {
  it("preserves every record, ID, link, result and value, adding only scope metadata", () => {
    expect(grouped.length).toBe(records.length);
    const restored = grouped.map((record) => {
      const {
        evaluation_group_id,
        evaluation_group_name,
        evaluation_group_note,
        ...attributes
      } = record.attributes;
      if (evaluation_group_id) {
        expect(record.kind).toBe("evaluation");
        expect(evaluation_group_name).toBeTruthy();
        expect(evaluation_group_note).toContain("not individual runs");
      }
      return { ...record, attributes };
    });
    expect(restored).toEqual(records);
  });
  it("counts 18 Genomic Benchmarks scopes and 88 ProteinGym scopes without losing metrics", () => {
    for (const [prefix, results, scopes] of [
      ["genomic-benchmarks", 36, 18],
      ["proteingym", 221, 88],
    ] as const) {
      const evaluations = grouped.filter(
        (r) => r.kind === "evaluation" && r.id.startsWith(prefix),
      );
      expect(evaluations).toHaveLength(results);
      expect(
        new Set(
          evaluations.map((r) => r.attributes.evaluation_group_id || r.id),
        ).size,
      ).toBe(scopes);
      expect(
        grouped.filter((r) => r.kind === "result" && r.id.startsWith(prefix)),
      ).toHaveLength(results);
    }
  });
  it("never merges frameworks, datasets, model representations, splits, regimes or indel subsets", () => {
    const byId = new Map(grouped.map((record) => [record.id, record]));
    for (const group of mapping.groups) {
      const members = group.members.map((m: { evaluation_id: string }) =>
        byId.get(m.evaluation_id)!,
      );
      expect(
        new Set(
          members.map(
            (r: RecordEntry) =>
              r.links.find((l) => l.relation === "model")!.target_id,
          ),
        ).size,
      ).toBe(1);
      expect(
        new Set(
          members.map(
            (r: RecordEntry) =>
              r.links.find((l) => l.relation === "dataset")!.target_id,
          ),
        ).size,
      ).toBe(1);
      const tasks = members.map(
        (r: RecordEntry) =>
          r.links.find((l) => l.relation === "benchmark")!.target_id,
      );
      if (group.id.includes("table-3")) {
        expect(
          new Set(tasks.map((task: string) => task.split("-").at(-1))).size,
        ).toBe(1);
        expect(
          tasks.every((task: string) =>
            task.startsWith("proteingym-task-sup-sub-"),
          ),
        ).toBe(true);
      }
      if (group.id.includes("table-4"))
        expect(tasks.sort()).toEqual([
          "proteingym-task-zs-indel-auc",
          "proteingym-task-zs-indel-spearman-all",
        ]);
    }
    const subsetEvaluations = grouped.filter(
      (r) =>
        r.kind === "evaluation" &&
        /proteingym-evaluation-.*-zs-indel-spearman-(library|designed)$/.test(
          r.id,
        ),
    );
    expect(subsetEvaluations).toHaveLength(18);
    expect(
      subsetEvaluations.every((r) => !r.attributes.evaluation_group_id),
    ).toBe(true);
  });
  it("rejects changed evaluation identity, evidence, missing members or duplicate assignments", () => {
    const first = mapping.groups[0].members[0].evaluation_id;
    const changed = structuredClone(records);
    changed.find((r) => r.id === first)!.attributes.protocol =
      "A different training protocol";
    expect(() => applyEvaluationGroups(changed, mapping)).toThrow(
      "record changed",
    );
    expect(() =>
      applyEvaluationGroups(
        records.filter((r) => r.id !== first),
        mapping,
      ),
    ).toThrow("record changed");
    const duplicate = structuredClone(mapping);
    duplicate.groups[0].members.push(duplicate.groups[0].members[0]);
    expect(() => applyEvaluationGroups(records, duplicate)).toThrow("Repeated");
    const badSource = structuredClone(records);
    badSource.find(
      (r) => r.id === mapping.groups[0].source_id,
    )!.attributes.artifact_sha256 = "0".repeat(64);
    expect(() => applyEvaluationGroups(badSource, mapping)).toThrow(
      "source/hash mismatch",
    );
    const badIdentity = structuredClone(mapping);
    badIdentity.groups[0].model_id = "another-model";
    expect(() => applyEvaluationGroups(records, badIdentity)).toThrow(
      "identity mismatch",
    );
  });
  it("hashes identities independently of object property order", () => {
    const record = records.find((r) => r.kind === "evaluation")!;
    expect(
      evaluationRecordDigest(
        Object.fromEntries(Object.entries(record).reverse()) as RecordEntry,
      ),
    ).toBe(evaluationRecordDigest(record));
  });
});
