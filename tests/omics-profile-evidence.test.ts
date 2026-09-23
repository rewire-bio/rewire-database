import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { gunzipSync } from "node:zlib";
import { applyProfileEvidence } from "../scripts/omics/profile-evidence";
import { profileGapAudit } from "../scripts/omics/profile-gap-audit";
import type { RecordEntry } from "../scripts/omics/schema";

const profile = {
  summary: "A model", sections: [], strengths: [], limitations: [],
  facts: [{ label: "Training cutoff", value: "Not established", status: "unreported", source_ids: ["source"], source_locator: "Methods" }],
  coverage: "limited", gaps: ["Training cutoff remains unknown"],
  review: { method: "automated_source_review", date: "2026-09-23", note: "Bounded source review" },
};
const record = (id: string, kind: RecordEntry["kind"], attributes = {}): RecordEntry => ({
  id, kind, name: id, description: "", status: "source_checked", facets: {}, source_ids: [], links: [], attributes,
});
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const patch = () => ({ id: "model", previous_profile_sha256: hash(profile), profile: { ...profile, summary: "A clarified model" } });
const records = () => [record("source", "source"), record("model", "model", { profile }), record("result", "result", { numeric_value: "0.75", printed_value: "0.750", eligible_count: 12, scored_count: 10, uncertainty: null, missing_metadata: {} })];

describe("reviewed profile evidence patches", () => {
  it("changes only descriptive profiles, preserving result bytes and record status", () => {
    const input = records(); input[1].status = "superseded";
    const before = JSON.stringify(input);
    const output = applyProfileEvidence(input, [patch()], []);
    expect(output[1].attributes.profile).toEqual(patch().profile);
    expect(output[1].status).toBe("superseded");
    expect(output[2]).toBe(input[2]);
    expect(JSON.stringify(input)).toBe(before);
  });
  it("rejects stale profile baselines and duplicate patches", () => {
    expect(() => applyProfileEvidence(records(), [{ ...patch(), previous_profile_sha256: "0".repeat(64) }], [])).toThrow("precondition changed");
    expect(() => applyProfileEvidence(records(), [patch(), patch()], [])).toThrow("Duplicate");
  });
  it("rejects numerical subjects and fields outside a profile", () => {
    expect(() => applyProfileEvidence(records(), [{ ...patch(), id: "result" }], [])).toThrow("Invalid profile evidence subject");
    expect(() => applyProfileEvidence(records(), [{ ...patch(), numeric_value: "0.8" }], [])).toThrow();
  });
  it("rejects missing citations, unpinned sources and conflicting source IDs", () => {
    const bad = patch(); bad.profile.facts = [{ ...profile.facts[0], source_ids: ["missing"] }];
    expect(() => applyProfileEvidence(records(), [bad], [])).toThrow("missing source");
    expect(() => applyProfileEvidence(records(), [], [record("extra", "source")])).toThrow("Unpinned");
    expect(() => applyProfileEvidence(records(), [], [record("source", "source")])).toThrow("duplicate");
  });
  it("creates only an absent protocol profile under a whole-record precondition", () => {
    const protocol = record("protocol", "protocol", { protocol_version: "1.3", procedure: { assay_count: 217 } });
    const input = [...records(), protocol];
    const creation = { id: protocol.id, previous_profile_sha256: null, previous_record_sha256: hash(protocol), profile };
    const before = JSON.stringify(input);
    const output = applyProfileEvidence(input, [creation], []);
    expect(output[3]).toEqual({ ...protocol, attributes: { ...protocol.attributes, profile } });
    expect(output.slice(0, 3)).toEqual(input.slice(0, 3));
    expect(output[2]).toBe(input[2]);
    expect(JSON.stringify(input)).toBe(before);
    expect(() => applyProfileEvidence(output, [creation], [])).toThrow("creation precondition changed");
    expect(() => applyProfileEvidence([...records(), { ...protocol, name: "Changed protocol" }], [creation], [])).toThrow("creation precondition changed");
    expect(() => applyProfileEvidence(input, [creation, creation], [])).toThrow("Duplicate");
  });
  it("rejects unpinned creation, null profiles, wrong subjects and missing citations", () => {
    const protocol = record("protocol", "protocol");
    const create = (r: RecordEntry) => ({ id: r.id, previous_profile_sha256: null, previous_record_sha256: hash(r), profile });
    expect(() => applyProfileEvidence([record("source", "source"), protocol], [{ id: protocol.id, previous_profile_sha256: null, profile }], [])).toThrow();
    for (const invalid of [record("null-profile", "protocol", { profile: null }), record("model", "model"), record("result", "result"), record("dataset", "dataset")]) {
      expect(() => applyProfileEvidence([record("source", "source"), invalid], [create(invalid)], [])).toThrow();
    }
    expect(() => applyProfileEvidence([protocol], [create(protocol)], [])).toThrow("missing source");
    expect(() => applyProfileEvidence(records(), [create(protocol)], [])).toThrow("Invalid profile evidence subject");
    expect(() => applyProfileEvidence([record("source", "source"), protocol], [{ ...create(protocol), status: "reproduced" }], [])).toThrow();
  });
  it("does not turn absent fields into claims that a source failed to report them", () => {
    const result = profileGapAudit({ schema_version: "1.1", release_id: "test", released_at: "2026-09-23", coverage: {}, records: records() });
    expect(result.facts[0].status).toBe("unreported");
    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0]).toMatchObject({ field: "uncertainty", status: "unextracted" });
    expect(result.summary.independent_scientific_review).toBe(false);
  });
  it("retains original source bytes behind every newly published evidence hash", () => {
    const directory = "data/omics/reviewed/profile-evidence-2026-09-23";
    const review = JSON.parse(fs.readFileSync(`${directory}/review.json`, "utf8"));
    expect(review.human_scientific_review).toBe("not_performed");
    for (const [file, expected] of Object.entries(review.files)) {
      expect(createHash("sha256").update(fs.readFileSync(`${directory}/${file}`)).digest("hex")).toBe(expected);
    }
    const sources = fs.readFileSync(`${directory}/sources.jsonl`, "utf8").trim().split("\n").map(line => JSON.parse(line));
    expect(sources).toHaveLength(21);
    for (const source of sources) {
      const original = gunzipSync(fs.readFileSync(source.attributes.review_artifact));
      expect(createHash("sha256").update(original).digest("hex")).toBe(source.attributes.artifact_sha256);
    }
  });
  it("retains the original bytes of every protocol follow-up retrieval", () => {
    const directory = "data/omics/reviewed/protocol-evidence-2026-09-23";
    const retrievals = JSON.parse(fs.readFileSync(`${directory}/retrievals.json`, "utf8"));
    const additions = fs.readFileSync(`${directory}/sources.jsonl`, "utf8").trim().split("\n").map(line => JSON.parse(line));
    const byId = new Map(retrievals.filter((item: { source_id: string | null }) => item.source_id).map((item: { source_id: string; artifact_sha256: string }) => [item.source_id, item.artifact_sha256]));
    for (const retrieval of retrievals) {
      const original = gunzipSync(fs.readFileSync(retrieval.review_artifact));
      expect(createHash("sha256").update(original).digest("hex")).toBe(retrieval.artifact_sha256);
    }
    for (const addition of additions)
      expect(byId.get(addition.id)).toBe(addition.attributes.artifact_sha256);
  });
});
