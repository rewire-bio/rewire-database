import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { createCatalogueQuery, type CatalogueSnapshot } from "../services/omics/src/catalogue-query";
import { deriveResearchReadiness, getResearch, validateResearchData, validateResearchManifest, type ResearchData, type ResearchInvestigation, type ResearchManifest, type ResearchSpec } from "../services/omics/src/research";
import { buildRelease } from "../scripts/omics/release";
import { researchFiles, loadResearchInputs } from "../scripts/omics/research-release";
import { loadPinnedResearchSnapshot, withResearchPins } from "../scripts/omics/research-snapshot";
import { canonicalResearchJson, researchHash, stageResearchBundle, validateInvestigationBundle } from "../scripts/omics/research-import";
import { researchChunks, researchDigest, readResearchChunks } from "../services/omics/src/research-store";
import { restoreReleaseBundles } from "../scripts/omics/archives";
import { parseCatalogue } from "../lib/omics";
import { validateSnapshot } from "../services/omics/src/validation";
import type { RecordEntry } from "../scripts/omics/schema";

const sourceRelease = "2026-09-20-0123456789ab";
const date = "2026-09-23T10:00:00+00:00";
const fileBytes = "synthetic table fixture\n";
const fileHash = crypto.createHash("sha256").update(fileBytes).digest("hex");
const hash = "a".repeat(64);
const makeRecord = (id: string, kind: RecordEntry["kind"], attributes: Record<string, unknown> = {}): RecordEntry => ({
  id, kind, name: id, description: "Fixture", status: "source_checked", facets: {}, source_ids: [], links: [], attributes,
});
function fixture() {
  const records = [
    makeRecord("dataset", "dataset", { provenance: { nested: [{ source_ids: ["source"] }] } }),
    makeRecord("protocol", "protocol", { protocol_id: "sdk-protocol-v1" }),
    makeRecord("model", "model", { entity_level: "checkpoint" }),
    { ...makeRecord("evaluation", "evaluation", { origin: "rewire_run", comparison: { protocol_id: "protocol" } }),
      links: [{ relation: "dataset", target_id: "dataset" }, { relation: "protocol", target_id: "protocol" }, { relation: "model", target_id: "model" }] },
    makeRecord("source", "source", { url: "https://example.org/source", retrieved_at: date, version: "1" }),
  ];
  const snapshot: CatalogueSnapshot = { schema_version: "1.1", release_id: sourceRelease, released_at: "2026-09-23T10:00:00Z", records, coverage: {} };
  const manifest: ResearchManifest = {
    schema_version: "1.0", id: "manifest", title: "Synthetic manifest", question: "Does the fixed model reproduce the fixture?",
    catalogue_release_id: sourceRelease, dataset_id: "dataset", evaluation_ids: ["evaluation"], protocol_id: "protocol", sdk_protocol_id: "sdk-protocol-v1",
    artifacts: [{ id: "table", role: "table", sha256: fileHash, format: "json", uri: null }], table_artifact_id: "table",
    semantics: { target: "continuous", outcome: "y", unit: "fixture units", score_direction: "higher", join_key: "id", independent_unit: null,
      subgroup_fields: ["category"], exposed: true, split: "test" }, expected_metrics: { baseline: { pearson: null, mse: 1 } }, metric_tolerance: .001,
    verification: { verified_at: date, checks: ["artifact_hashes", "join_integrity", "score_semantics", "metric_replay", "annotations", "dependence"].map(check => ({ check, status: "passed", detail: "Fixture evidence checked" })), limitations: ["Synthetic fixture only"] }, local_recipes: [],
  };
  return { records, snapshot, manifest };
}
function reportFixture() {
  const { records, snapshot, manifest } = fixture();
  const operation = { id: "verify-one", kind: "verify" as const, methods: [], metric: null, field: null, recipe: null, expected_observation: "All fixture artifacts match" };
  const spec: ResearchSpec = {
    schema_version: "1.0", id: "spec", manifest_id: manifest.id, manifest_sha256: researchHash(manifest), catalogue_release_id: sourceRelease,
    question: manifest.question, created_at: date, round: 0, evidence: manifest.artifacts,
    plan: { hypotheses: [{ id: "h1", explanation: "The fixture inputs are consistent", tests: [operation] }], multiple_testing: "descriptive_only", stopping_rule: "Stop after verification", requested_tools: [] },
    permitted_actions: ["verify"], exposure: { previously_exposed: true, usage: "exploration", independent_validation: false },
    budget: { campaign_seconds: 28800, experiment_seconds: 3600, codex_seconds: 900, codex_calls: 24, memory_bytes: 8 * 1024 ** 3, workspace_bytes: 20 * 1024 ** 3, followup_rounds: 2 },
  };
  const receipt = { operation_id: operation.id, kind: operation.kind, manifest_sha256: researchHash(manifest), table_sha256: fileHash, code_sha256: hash, numerical: { identifiers_unique: true, rows: 2 }, limitations: ["Synthetic fixture"] };
  const report: ResearchInvestigation = {
    schema_version: "1.0", id: "investigation", catalogue_release_id: sourceRelease, manifest_id: manifest.id, title: "Synthetic report", question: manifest.question,
    status: "completed", claim_level: "exploratory", outcome: "inconclusive", created_at: "2026-09-23T10:02:00Z", plan_sha256: researchHash([spec]),
    attempts: [{ id: "attempt", plan_sha256: researchHash(spec), operation, status: "completed", started_at: "2026-09-23T10:00:01Z", finished_at: "2026-09-23T10:01:00Z", receipt_sha256: researchHash(receipt), receipt, error: null }],
    findings: ["The fixture is consistent"], limitations: ["Synthetic evidence only"], review: { status: "pending", method: "ai_assisted" }, artifacts: manifest.artifacts, specs: [spec],
    execution: { campaign_id: "campaign", code_sha256: hash, codex_calls: 0, reasoning: [] },
  };
  return { records, snapshot, manifest, report };
}
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

describe("research readiness", () => {
  it("audits exact dataset/evaluation records and follows nested provenance without equating source review with execution", () => {
    const { snapshot } = fixture();
    const readiness = deriveResearchReadiness(snapshot);
    expect(readiness.map(item => item.record_id)).toEqual(["dataset", "evaluation"]);
    for (const item of readiness) {
      expect(item.evidence_source_ids).toEqual(["source"]);
      expect(Object.values(item.capabilities).every(capability => !capability.ready && capability.blockers.length > 0)).toBe(true);
      expect(item.verified_at).toBeNull();
    }
  });
  it("separates replay, descriptive analysis, local execution and unexposed independent validation", () => {
    const { snapshot, manifest } = fixture();
    snapshot.research = { schema_version: "1.0", manifests: [manifest], investigations: [] };
    const item = deriveResearchReadiness(snapshot)[0];
    expect(item.capabilities.replay.ready).toBe(true);
    expect(item.capabilities.analysis.ready).toBe(true);
    expect(item.limitations.join(" ")).toMatch(/independence unit is unresolved/);
    expect(item.artifact_availability).toBe("local_resolver_required");
    expect(item.capabilities.local_run.ready).toBe(false);
    expect(item.capabilities.validation.blockers.join(" ")).toMatch(/already been exposed/);
    manifest.local_recipes = ["sdk:train-mean-v1"];
    manifest.runner_code_sha256 = hash;
    manifest.artifacts.push(...["prepared", "recipe_code", "environment"].map(role => ({ id: `artifact-${role}`, role, sha256: hash, format: "json", uri: null })));
    manifest.verification.checks.push(...["recipe_pinned", "resource_estimate", "independent_validation", "overlap_checked"].map(check => ({ check, status: "passed" as const, detail: "Fixture check" })));
    expect(deriveResearchReadiness(snapshot)[0].capabilities.local_run.ready).toBe(true);
    expect(deriveResearchReadiness(snapshot)[0].capabilities.validation.ready).toBe(false);
    manifest.semantics.exposed = false;
    expect(deriveResearchReadiness(snapshot)[0].capabilities.validation.ready).toBe(true);
  });
  it("does not combine incomplete manifests or inherit a subset's coverage into the whole dataset", () => {
    const { snapshot, manifest } = fixture();
    const other = structuredClone(manifest); other.id = "other";
    manifest.verification.checks = manifest.verification.checks.filter(check => check.check !== "metric_replay");
    other.verification.checks = other.verification.checks.filter(check => check.check === "metric_replay");
    expect(deriveResearchReadiness(snapshot, [manifest, other])[0].capabilities.replay.ready).toBe(false);
    const subset = makeRecord("subset", "dataset_subset"); subset.links.push({ relation: "parent", target_id: "dataset" }); snapshot.records.push(subset);
    other.dataset_id = "subset";
    expect(deriveResearchReadiness(snapshot, [other]).find(item => item.record_id === "dataset")?.manifest_ids).toEqual([]);
  });
  it("blocks evaluations whose linked data or protocol is superseded, preserving historical evidence", () => {
    for (const id of ["dataset", "protocol"]) {
      const { snapshot, manifest } = fixture();
      snapshot.records.find(record => record.id === id)!.status = "superseded";
      const item = deriveResearchReadiness(snapshot, [manifest]).find(item => item.record_id === "evaluation")!;
      expect(item.capabilities.replay.ready).toBe(false);
      expect(item.manifest_ids).toEqual([manifest.id]);
      expect(item.capabilities.replay.blockers.join(" ")).toContain(id);
    }
  });
  it("blocks protocol, dataset, SDK, duplicate artifact, stale MFASS and private evidence mismatches", () => {
    const { snapshot, manifest } = fixture();
    expect(validateResearchManifest(manifest, snapshot).sdk_protocol_id).toBe("sdk-protocol-v1");
    for (const edit of [
      (m: ResearchManifest) => { m.protocol_id = "wrong"; },
      (m: ResearchManifest) => { m.dataset_id = "wrong"; },
      (m: ResearchManifest) => { m.sdk_protocol_id = "wrong"; },
      (m: ResearchManifest) => { m.artifacts.push(m.artifacts[0]); },
      (m: ResearchManifest) => { m.artifacts[0].uri = "file:///Users/private/table.json"; },
      (m: ResearchManifest) => { m.artifacts[0].uri = "https://172.16.0.1/data"; },
      (m: ResearchManifest) => { m.artifacts[0].uri = "https://100.64.0.1/data"; },
      (m: ResearchManifest) => { m.verification.limitations.push("Input /Users/private/data.csv"); },
    ]) { const value = structuredClone(manifest); edit(value); expect(() => validateResearchManifest(value, snapshot)).toThrow(); }
  });
  it("pins readiness cursors to the serving release and filters before catalogue pagination", () => {
    const { snapshot, manifest } = fixture(); snapshot.research = { schema_version: "1.0", manifests: [manifest], investigations: [] };
    const query = createCatalogueQuery(snapshot);
    expect(query.list({ readiness: "replay", limit: 1 }).total).toBe(2);
    expect(query.list({ readiness: "validation" }).total).toBe(0);
    const page = query.researchReadiness({ capability: "replay", ready: true, limit: 1 });
    expect(page.items).toHaveLength(1);
    expect(query.researchReadiness({ capability: "replay", ready: true, cursor: page.next_cursor! }).items[0].record_id).toBe("evaluation");
    expect(() => createCatalogueQuery({ ...snapshot, release_id: "2026-09-23-fedcba987654" }).researchReadiness({ capability: "replay", ready: true, cursor: page.next_cursor! })).toThrow(/release or filters/);
    expect(() => query.researchReadiness({ ready: true })).toThrow(/capability/);
  });
});

describe("research releases and review boundary", () => {
  it("creates new content identities without changing scientific rows or legacy releases", () => {
    const { records, manifest } = fixture();
    const legacy = buildRelease(records, date, { entity_schema_version: "1.1" });
    const data: ResearchData = { schema_version: "1.0", manifests: [manifest], investigations: [] };
    const current = buildRelease(records, date, { entity_schema_version: "1.1" }, false, undefined, undefined, data);
    expect(current.snapshot.records).toEqual(legacy.snapshot.records);
    expect(current.files["records.jsonl"]).toEqual(legacy.files["records.jsonl"]);
    expect(current.snapshot.release_id).not.toBe(legacy.snapshot.release_id);
    expect(Object.keys(legacy.files).some(name => name.startsWith("research-"))).toBe(false);
    expect(Object.keys(researchFiles(current.snapshot))).toHaveLength(3);
    expect(current.snapshot.research!.readiness).toHaveLength(2);
    expect(JSON.parse(current.files["research-readiness.json"]).items).toEqual(current.snapshot.research!.readiness);
    expect(createCatalogueQuery(current.snapshot).researchReadiness().items).toEqual(current.snapshot.research!.readiness);
    for (const name of Object.keys(researchFiles(current.snapshot))) expect(current.manifest.files[name]).toBe(crypto.createHash("sha256").update(current.files[name]).digest("hex"));
    const before = current.snapshot.release_id;
    manifest.question += " Changed evidence question.";
    expect(buildRelease(records, date, { entity_schema_version: "1.1" }, false, undefined, undefined, data).snapshot.release_id).not.toBe(before);
    expect(buildRelease(records, date, { entity_schema_version: "1.1" }).files).toEqual(legacy.files);
  });
  it("serves frozen readiness and rejects stale, duplicate or unrelated assessment identities", () => {
    const { snapshot, manifest } = fixture();
    snapshot.research = { schema_version: "1.0", manifests: [manifest], investigations: [] };
    snapshot.research.readiness = deriveResearchReadiness(snapshot);
    expect(deriveResearchReadiness(snapshot)).toBe(snapshot.research.readiness);
    for (const edit of [
      (s: CatalogueSnapshot) => { s.research!.readiness![0].release_id = "2026-09-23-aaaaaaaaaaaa"; },
      (s: CatalogueSnapshot) => { s.research!.readiness!.push(s.research!.readiness![0]); },
      (s: CatalogueSnapshot) => { s.research!.readiness![0].manifest_ids = []; },
    ]) { const value = structuredClone(snapshot); edit(value); expect(() => validateResearchData(value.research, value)).toThrow(); }
  });
  it("keeps pending reports out of every public read and rejects unsupported independent claims", () => {
    const { snapshot, manifest, report } = reportFixture();
    const data: ResearchData = { schema_version: "1.0", manifests: [manifest], investigations: [report] };
    snapshot.research = data;
    expect(getResearch(snapshot).investigations).toEqual([]);
    expect(() => validateResearchData(data, snapshot)).toThrow(/Unreviewed/);
    expect(() => createCatalogueQuery(snapshot)).toThrow(/Unreviewed/);
    report.review = { status: "reviewed", method: "human", reviewer_label: "Fixture curator", reviewed_at: date };
    expect(createCatalogueQuery(snapshot).investigations({ record_id: "dataset" }).items[0].id).toBe(report.id);
    report.claim_level = "independently_supported";
    expect(() => validateResearchData(data, snapshot)).toThrow(/Independent support/);
  });
  it("rejects frozen capability flags that contradict exposure, artifact roles, checks or active linked evidence", () => {
    for (const capability of ["validation", "local_run", "replay", "analysis"] as const) {
      const { snapshot, manifest } = fixture();
      snapshot.research = { schema_version: "1.0", manifests: [manifest], investigations: [] };
      snapshot.research.readiness = deriveResearchReadiness(snapshot);
      if (capability === "validation") manifest.verification.checks.push(...["independent_validation", "overlap_checked"].map(check => ({ check, status: "passed" as const, detail: "Claimed check cannot erase exposure" })));
      if (capability === "local_run") {
        manifest.local_recipes = ["sdk:train-mean-v1"]; manifest.runner_code_sha256 = hash;
        manifest.verification.checks.push(...["recipe_pinned", "resource_estimate"].map(check => ({ check, status: "passed" as const, detail: "Claimed check cannot replace missing artifacts" })));
      }
      if (capability === "replay") manifest.verification.checks.find(check => check.check === "artifact_hashes")!.status = "failed";
      if (capability === "analysis") snapshot.records.find(record => record.id === "dataset")!.status = "superseded";
      const item = snapshot.research.readiness.find(item => item.record_id === "evaluation")!;
      item.capabilities[capability] = { ready: true, blockers: [], evidence: ["An unsupported readiness assertion"], verified_at: manifest.verification.verified_at };
      expect(() => validateResearchData(snapshot.research, snapshot)).toThrow(/contradicts.*v1 evidence/);
      expect(() => createCatalogueQuery(snapshot)).toThrow(/contradicts.*v1 evidence/);
    }
  });
  it("preserves a stricter frozen assessment instead of recomputing its decision or prose", () => {
    const { snapshot, manifest } = fixture();
    snapshot.research = { schema_version: "1.0", manifests: [manifest], investigations: [] };
    snapshot.research.readiness = deriveResearchReadiness(snapshot);
    snapshot.research.readiness[0].capabilities.replay.ready = false;
    snapshot.research.readiness[0].capabilities.replay.blockers = ["Curator requested an additional review before use."];
    const original = structuredClone(snapshot.research);
    expect(validateResearchData(snapshot.research, snapshot)).toEqual(original);
    expect(createCatalogueQuery(snapshot).researchReadiness({ id: "dataset" }).items[0]).toEqual(original.readiness![0]);
  });
  it("checks frozen receipt integrity at every public boundary even when labelled human-reviewed", () => {
    const { snapshot, manifest, report } = reportFixture();
    report.review = { status: "reviewed", method: "human", reviewer_label: "Fixture curator", reviewed_at: date };
    snapshot.research = { schema_version: "1.0", manifests: [manifest], investigations: [report] };
    report.attempts[0].receipt!.numerical.rows = 10;
    for (const check of [() => parseCatalogue(snapshot), () => validateSnapshot(snapshot), () => createCatalogueQuery(snapshot), () => researchFiles(snapshot)])
      expect(check).toThrow(/receipt checksum/);
  });
  it("restores research archive bytes exactly and rejects unreceipted sidecar content", () => {
    const { records, manifest } = fixture();
    const output = buildRelease(records, date, { entity_schema_version: "1.1" }, false, undefined, undefined, { schema_version: "1.0", manifests: [manifest], investigations: [] });
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "omics-research-archive-")); roots.push(root);
    const input = path.join(root, "input"), destination = path.join(root, "output"); fs.mkdirSync(input);
    const receipt = JSON.stringify(output.manifest, null, 2) + "\n";
    const files: Record<string, string> = { ...output.files, "manifest.json": receipt };
    const bundle = path.join(input, `${output.snapshot.release_id}.bundle.json.gz`);
    fs.writeFileSync(path.join(input, `${output.snapshot.release_id}.json`), receipt);
    fs.writeFileSync(bundle, gzipSync(JSON.stringify(files)));
    restoreReleaseBundles(input, destination);
    expect(fs.readFileSync(path.join(destination, output.snapshot.release_id, "research-readiness.json"), "utf8")).toBe(output.files["research-readiness.json"]);
    files["research-investigations.json"] += " "; fs.writeFileSync(bundle, gzipSync(JSON.stringify(files)));
    expect(() => restoreReleaseBundles(input, destination)).toThrow(/checksum mismatch/);
  });
  it("serves identical checked research through bounded immutable storage chunks", async () => {
    const { manifest } = fixture();
    const data: ResearchData = { schema_version: "1.0", manifests: [manifest], investigations: [] };
    const snapshot = fixture().snapshot;
    snapshot.research = data; data.readiness = deriveResearchReadiness(snapshot);
    const chunks = researchChunks(data);
    const ref = { collection: () => ({ orderBy: () => ({ get: async () => ({ size: chunks.length, docs: chunks.map((items_json, index) => ({ data: () => ({ index, items_json }) })) }) }) }) };
    const meta = { research_schema_version: "1.0", research_chunks: chunks.length, research_digest: researchDigest(data), research_frozen_readiness: true };
    expect(await readResearchChunks(ref as any, meta)).toEqual(data);
    await expect(readResearchChunks(ref as any, { ...meta, research_digest: hash })).rejects.toThrow(/integrity/);
    await expect(readResearchChunks(ref as any, { ...meta, research_chunks: 2 })).rejects.toThrow(/Incomplete/);
    await expect(readResearchChunks(ref as any, { coverage: { research_schema_version: "1.0" } })).rejects.toThrow(/must complete/);
  });
});

describe("offline investigation import", () => {
  it("uses ECMAScript canonical numbers and deterministic UTF-16 key ordering", () => {
    expect(canonicalResearchJson({ z: .0000001, a: -0, m: 1.0 })).toBe('{"a":0,"m":1,"z":1e-7}');
    expect(canonicalResearchJson({ "2": "two", "10": "ten" })).toBe('{"10":"ten","2":"two"}');
    expect(researchHash({ a: 1, b: 2 })).toBe(researchHash({ b: 2, a: 1 }));
    expect(() => canonicalResearchJson({ a: Infinity })).toThrow(/Nonfinite/);
    expect(() => canonicalResearchJson("\ud800")).toThrow(/Unicode/);
  });
  it("validates plans and numerical receipt lineage and stages only after all artifact bytes match", () => {
    const { snapshot, manifest, report } = reportFixture();
    expect(validateInvestigationBundle(report, manifest, snapshot).id).toBe(report.id);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "omics-research-")); roots.push(root);
    const table = path.join(root, "table.json"); fs.writeFileSync(table, fileBytes);
    const options = { bundle: report, manifest, catalogue: snapshot, artifactPaths: { table }, root };
    const staged = stageResearchBundle(options);
    expect(staged.reviewed).toBe(false);
    expect(staged.directory).toBe(path.join(root, "workbench/research-imports/investigation"));
    expect(stageResearchBundle(options)).toEqual(staged);
    expect(fs.readFileSync(path.join(staged.directory, "import-receipt.json"), "utf8")).not.toContain(root);
    fs.writeFileSync(table, "tampered");
    expect(() => stageResearchBundle(options)).toThrow(/checksum/);
  });
  it("preserves signed whitespace and matches platform SHA-256", () => {
    const { snapshot, manifest, report } = reportFixture();
    report.specs[0].plan.hypotheses[0].explanation = "  A frozen explanation with whitespace.\n";
    report.plan_sha256 = researchHash(report.specs);
    report.attempts[0].plan_sha256 = researchHash(report.specs[0]);
    expect(validateInvestigationBundle(report, manifest, snapshot).specs[0].plan.hypotheses[0].explanation).toBe("  A frozen explanation with whitespace.\n");
    expect(researchHash(report)).toBe(crypto.createHash("sha256").update(canonicalResearchJson(report)).digest("hex"));
  });
  it("rejects changed receipts, stale catalogue pins, post-hoc plans and undeclared operations", () => {
    for (const edit of [
      (r: ResearchInvestigation) => { r.attempts[0].receipt!.numerical.rows = 3; },
      (r: ResearchInvestigation) => { r.catalogue_release_id = "2026-09-20-aaaaaaaaaaaa"; },
      (r: ResearchInvestigation) => { r.attempts[0].started_at = "2026-09-23T09:59:00Z"; },
      (r: ResearchInvestigation) => { r.attempts[0].operation.expected_observation = "Changed after execution"; },
      (r: ResearchInvestigation) => { r.attempts[0].receipt = null; r.attempts[0].receipt_sha256 = null; },
    ]) { const { snapshot, manifest, report } = reportFixture(); edit(report); expect(() => validateInvestigationBundle(report, manifest, snapshot)).toThrow(); }
  });
});


describe("cold current-only research input loading", () => {
  function pinnedFixture(bundle = false) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "research-pinned-"));
    roots.push(root);
    const { snapshot, manifest } = fixture();
    const bytes = JSON.stringify(snapshot);
    const receipt = JSON.stringify({ release_id: sourceRelease, files: { "catalogue.json": crypto.createHash("sha256").update(bytes).digest("hex") } });
    const archive = path.join(root, "data/omics/releases");
    fs.mkdirSync(path.join(archive, sourceRelease), { recursive: true });
    fs.mkdirSync(path.join(root, "data/research"), { recursive: true });
    fs.writeFileSync(path.join(archive, `${sourceRelease}.json`), receipt);
    if (bundle) fs.writeFileSync(path.join(archive, `${sourceRelease}.bundle.json.gz`), gzipSync(JSON.stringify({ "catalogue.json": bytes, "manifest.json": receipt })));
    else fs.writeFileSync(path.join(archive, sourceRelease, "catalogue.json.gz"), gzipSync(bytes));
    fs.writeFileSync(path.join(root, "data/research/manifests.json"), JSON.stringify([manifest]));
    fs.writeFileSync(path.join(root, "data/research/investigations.json"), "[]");
    return { root, snapshot, archive };
  }
  it.each([false, true])("loads authenticated historical evidence without expanding a public release (bundle=%s)", bundle => {
    const { root, snapshot } = pinnedFixture(bundle);
    expect(loadPinnedResearchSnapshot(root, sourceRelease)).toEqual(snapshot);
    expect(withResearchPins(() => loadResearchInputs(root), root)?.manifests[0].catalogue_release_id).toBe(sourceRelease);
    expect(fs.existsSync(path.join(root, "public"))).toBe(false);
  });
  it("removes temporary pins after loader failure and preserves pre-existing directory content", () => {
    const { root } = pinnedFixture();
    const releases = path.join(root, "public/omics/releases");
    fs.mkdirSync(releases, { recursive: true });
    fs.writeFileSync(path.join(releases, "unrelated.txt"), "preserve");
    expect(() => withResearchPins(() => {
      expect(fs.existsSync(path.join(releases, sourceRelease, "catalogue.json"))).toBe(true);
      throw new Error("Research validation failed");
    }, root)).toThrow("Research validation failed");
    expect(fs.readdirSync(releases)).toEqual(["unrelated.txt"]);
    expect(fs.readFileSync(path.join(releases, "unrelated.txt"), "utf8")).toBe("preserve");
  });
  it("keeps existing authenticated pins and their directory bytes untouched", () => {
    const { root, snapshot } = pinnedFixture();
    const directory = path.join(root, "public/omics/releases", sourceRelease);
    fs.mkdirSync(directory, { recursive: true });
    const file = path.join(directory, "catalogue.json");
    fs.writeFileSync(file, JSON.stringify(snapshot));
    fs.utimesSync(file, 1, 1);
    const before = fs.statSync(file);
    const expected = loadResearchInputs(root);
    expect(withResearchPins(() => loadResearchInputs(root), root)).toEqual(expected);
    expect(fs.statSync(file).mtimeMs).toBe(before.mtimeMs);
    expect(fs.statSync(file).ino).toBe(before.ino);
    expect(fs.readFileSync(file, "utf8")).toBe(JSON.stringify(snapshot));
  });
  it("does not delete replacement files created by the loader", () => {
    const { root } = pinnedFixture();
    const directory = path.join(root, "public/omics/releases", sourceRelease);
    const file = path.join(directory, "catalogue.json");
    withResearchPins(() => {
      fs.renameSync(file, path.join(root, "retained-owned-pin"));
      fs.writeFileSync(file, "replacement bytes");
    }, root);
    expect(fs.readFileSync(file, "utf8")).toBe("replacement bytes");
  });
  it("rejects corrupt compressed or already-restored snapshots", () => {
    const { root, snapshot, archive } = pinnedFixture();
    fs.writeFileSync(path.join(archive, sourceRelease, "catalogue.json.gz"), gzipSync(JSON.stringify({ ...snapshot, records: [] })));
    expect(() => loadPinnedResearchSnapshot(root, sourceRelease)).toThrow(/checksum mismatch/);
    const restored = path.join(root, "public/omics/releases", sourceRelease);
    fs.mkdirSync(restored, { recursive: true });
    fs.writeFileSync(path.join(restored, "catalogue.json"), "{}");
    expect(() => loadPinnedResearchSnapshot(root, sourceRelease)).toThrow(/checksum mismatch/);
  });
  it("rejects a mismatched receipt and unsafe release paths", () => {
    const { root, archive } = pinnedFixture();
    fs.writeFileSync(path.join(archive, `${sourceRelease}.json`), JSON.stringify({ release_id: "wrong", files: { "catalogue.json": "a".repeat(64) } }));
    expect(() => loadPinnedResearchSnapshot(root, sourceRelease)).toThrow(/receipt mismatch/);
    expect(() => loadPinnedResearchSnapshot(root, "../other")).toThrow(/Invalid/);
  });
});
