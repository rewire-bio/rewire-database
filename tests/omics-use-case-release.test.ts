import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { buildRelease } from "../scripts/omics/release";
import { restoreReleaseBundles } from "../scripts/omics/archives";
import {
  addUseCaseSources, loadUseCases, useCaseInputFiles, useCaseRoot,
  parseUseCaseSourceDeclaration, writeUseCaseSourceCopies,
  validateUseCaseHistory,
} from "../scripts/omics/use-cases";
import {
  buildUseCaseArtifact, createUseCaseQuery, mappingEvidenceHash,
  useCaseDeclaration, validateUseCaseArtifact, type UseCaseArtifact, type UseCaseInputs,
} from "../services/omics/src/use-cases";
import type { CatalogueSnapshot } from "../services/omics/src/catalogue-query";
import type { RecordEntry } from "../scripts/omics/schema";

const sha = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});
function temporary() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rewire-use-case-release-"));
  roots.push(root);
  return root;
}
function fixture() {
  const base = { description: "Synthetic release fixture", status: "source_checked" as const, facets: {}, source_ids: [], links: [], attributes: {} };
  const records: RecordEntry[] = [
    { ...base, id: "test-source", kind: "source", name: "Source", attributes: { url: "https://example.org/source", retrieved_at: "2026-09-25T00:00:00Z", version: "1" } },
    { ...base, id: "test-protocol", kind: "protocol", name: "Protocol", source_ids: ["test-source"] },
  ];
  const review = { method: "automated_source_review" as const, actor: "Test fixture", reviewed_at: "2026-09-25T00:00:00Z", note: "Synthetic evidence; no scientific claim." };
  const inputs: UseCaseInputs = {
    schema_version: "1.0",
    use_cases: [{
      id: "test-case", slug: "test-case", title: "Fixture", question: "Which evidence exists?",
      area: "test", contexts: ["research"], search_terms: [], intended_users: ["Test"],
      decision: "Inspect evidence", inputs: ["Public fixture"], output: "Scope", setting: "Synthetic",
      exclusions: [], clinical_scope: "No clinical evidence", evidence_gaps: ["No measurements"],
      citations: [{ source_id: "test-source", locator: "Scope" }], review, planned_work: [],
    }],
    mappings: [{
      id: "test-mapping", use_case_id: "test-case", lifecycle: "active", revision: 1,
      reason: "Initial review", protocol_id: "test-protocol", evaluation_ids: [], endpoint: "Test endpoint",
      relevance: "proxy", rationale: "Synthetic scope", constraints: [], limitations: ["No measurements"],
      citations: [{ source_id: "test-source", locator: "Scope" }], review, evidence_sha256: "0".repeat(64),
    }],
  };
  const snapshot = { schema_version: "1.1", release_id: "2026-09-25-000000000000", released_at: "2026-09-25T00:00:00Z", coverage: {}, records };
  inputs.mappings[0].evidence_sha256 = mappingEvidenceHash(snapshot, inputs.use_cases[0], inputs.mappings[0]);
  return { records, inputs };
}
function release(inputs?: UseCaseInputs, records = fixture().records) {
  return buildRelease(records, "2026-09-25T00:00:00Z", { entity_schema_version: "1.1" }, false, inputs);
}
function withdrawn(priorReleaseId: string, lifecycle: "withdrawn" | "superseded" = "withdrawn") {
  const inputs = fixture().inputs;
  inputs.mappings = [{
    id: "test-mapping", use_case_id: "test-case", lifecycle, revision: 1,
    reason: "Withdraw scoped evidence", prior_release_id: priorReleaseId,
    evaluation_ids: [], constraints: [], limitations: [], citations: [],
  }];
  return inputs;
}
function archive(output: ReturnType<typeof buildRelease>, split: boolean) {
  const root = temporary();
  const input = path.join(root, "input");
  const destination = path.join(root, "output");
  const id = output.snapshot.release_id;
  fs.mkdirSync(input);
  const receipt = JSON.stringify(output.manifest, null, 2) + "\n";
  const files: Record<string, string> = { ...output.files, "manifest.json": receipt };
  const write = () => {
    fs.writeFileSync(path.join(input, `${id}.json`), receipt);
    if (split) {
      const directory = path.join(input, id);
      fs.mkdirSync(directory, { recursive: true });
      for (const [name, bytes] of Object.entries(files))
        if (name !== "manifest.json") fs.writeFileSync(path.join(directory, `${name}.gz`), gzipSync(bytes));
    } else fs.writeFileSync(path.join(input, `${id}.bundle.json.gz`), gzipSync(JSON.stringify(files)));
  };
  write();
  return { input, destination, id, files, write };
}

describe("reviewed use-case release inputs", () => {
  function reviewedExpansion() {
    const bundle = loadUseCases()!;
    const baseline: Omit<CatalogueSnapshot, "records"> & { records: RecordEntry[] } = JSON.parse(gunzipSync(fs.readFileSync("data/omics/releases/2026-09-25-d40cee0abe73/catalogue.json.gz")).toString());
    const previous: CatalogueSnapshot = JSON.parse(gunzipSync(fs.readFileSync("data/omics/releases/2026-09-28-f9f5770cef26/catalogue.json.gz")).toString());
    const seedInputs: UseCaseArtifact = JSON.parse(gunzipSync(fs.readFileSync("data/omics/releases/2026-09-28-f9f5770cef26/use-cases.json.gz")).toString());
    const records = addUseCaseSources(baseline.records, bundle);
    const snapshot = { ...baseline, records };
    const artifact = buildUseCaseArtifact(snapshot, bundle.inputs);
    const query = createUseCaseQuery(snapshot, artifact, useCaseDeclaration(bundle.inputs));
    return { bundle, baseline, previous, seedInputs, records, snapshot, artifact, query };
  }
  let expanded: ReturnType<typeof reviewedExpansion>;
  beforeAll(() => { expanded = reviewedExpansion(); });

  it("expands reviewed questions while preserving every scientific record and seed input", () => {
    const { bundle, baseline, previous, seedInputs, records, artifact, query } = expanded;
    expect(baseline.records).toHaveLength(26122);
    expect(records).toHaveLength(26126);
    expect(previous.records).toHaveLength(26124);
    const previousIds = new Set(previous.records.map((record) => record.id));
    expect(records.filter((record) => previousIds.has(record.id)).sort((a, b) => a.id.localeCompare(b.id))).toEqual(previous.records);
    expect(records.filter((record) => !previousIds.has(record.id)).map((record) => record.kind)).toEqual(["source", "source"]);
    expect(bundle.sources.every((source) => source.kind === "source")).toBe(true);
    expect(query.list().total).toBe(17);
    expect(artifact.mappings).toHaveLength(17);
    expect(artifact.mappings.every((m) => m.lifecycle === "active")).toBe(true);
    const evaluations = artifact.mappings.flatMap((m) => m.evaluation_ids);
    expect(evaluations).toHaveLength(57);
    expect(new Set(evaluations).size).toBe(57);
    expect(seedInputs.use_cases).toHaveLength(7);
    expect(seedInputs.mappings).toHaveLength(17);
    for (const seed of seedInputs.use_cases)
      expect(bundle.inputs.use_cases.find((entry) => entry.id === seed.id)).toEqual(seed);
    for (const seed of seedInputs.mappings) {
      expect(bundle.inputs.mappings.find((mapping) => mapping.id === seed.id)).toEqual(seed);
      expect(artifact.mappings.find((mapping) => mapping.id === seed.id)).toEqual(seed);
    }
    for (const entry of bundle.inputs.use_cases) {
      expect(entry.review.method).toBe("automated_source_review");
      expect(query.get({ slug: entry.slug })!.use_case.review).toEqual(entry.review);
    }
    for (const mapping of artifact.mappings) {
      expect(mapping.review?.method).toBe("automated_source_review");
      const entry = bundle.inputs.use_cases.find((item) => item.id === mapping.use_case_id)!;
      expect(query.get({ slug: entry.slug })!.mappings.find((item) => item.id === mapping.id)!.review).toEqual(mapping.review);
    }
    expect(() => addUseCaseSources(records, bundle)).toThrow(/cannot replace existing record/);
  });

  it("keeps the original MFASS and AMFR scopes separate from planned evidence", () => {
    const { query } = expanded;
    const mfass = query.get({ slug: "splicing-follow-up" })!;
    expect(mfass.mappings).toHaveLength(1);
    expect(mfass.mappings[0].evaluations).toHaveLength(4);
    expect(mfass.mappings[0].evaluations.flatMap((e) => e.results)).toHaveLength(16);
    expect(mfass.use_case.evidence_gaps.join(" ")).toMatch(/8,297 of 8,324/);
    expect(mfass.use_case.evidence_gaps.join(" ")).toMatch(/23.*four.*not established faulty variants/);
    const amfr = query.get({ slug: "protein-variant-stability" })!;
    expect(amfr.mappings).toHaveLength(2);
    expect(new Set(amfr.mappings.map((m) => m.protocol_id)).size).toBe(2);
    expect(amfr.mappings.every((m) => m.task_id === undefined && m.evaluation_ids.length === 1)).toBe(true);
    expect(amfr.use_case.planned_work).toHaveLength(1);
    expect(amfr.use_case.planned_work[0].status).toBe("blocked");
    expect(amfr.mappings.flatMap((m) => m.evaluation_ids).join(" ")).not.toMatch(/evcouplings|evmutation/);
  });

  type Scope = { protocol: string; evaluations: [string, string][] };
  const groups: { slug: string; scopes: Scope[] }[] = [
    {
      slug: "utr-translation-baselines",
      scopes: [{
        protocol: "rewire-protocol-mrnabench-designed-mrl-v1",
        evaluations: [
          ["rewire-local-20260920-evaluation-mrnabench-composition", "rewire-local-20260920-configuration-mrnabench-composition"],
          ["rewire-local-20260920-evaluation-mrnabench-train-mean", "rewire-local-20260920-configuration-mrnabench-train-mean"],
        ],
      }],
    },
    {
      slug: "plant-promoter-reporters",
      scopes: ["maize-protoplasts", "tobacco-leaves"].flatMap((host) =>
        ["a-thaliana", "s-bicolor", "z-mays"].map((species) => ({
          protocol: `agront-2024-fig3e-task-${host}-${species}`,
          evaluations: ["agront", "cnn-jores-et-al"].map((method): [string, string] => [
            `agront-2024-fig3e-evaluation-${method}-promoter-strength-${host}-${host}-${species}`,
            `agront-2024-fig3e-method-${method}-promoter-strength-${host}`,
          ]),
        }))),
    },
    {
      slug: "genetic-perturbation-response",
      scopes: ["mse", "pearson-de"].map((metric) => ({
        protocol: `gears-2023-supp-table6-task-${metric}`,
        evaluations: ["no-perturb", "cpa", "cpa-plus-kg", "gears"].map((method): [string, string] => [
          `gears-2023-supp-table6-evaluation-${method}-${metric}`,
          `gears-2023-supp-table6-method-${method}`,
        ]),
      })),
    },
    {
      slug: "rhodopsin-wavelength-transfer",
      scopes: [{
        protocol: "rewire-protocol-flip2-rhomax-by-wild-type-v1",
        evaluations: [
          ["rewire-local-20260920-evaluation-flip2-composition", "rewire-local-20260920-configuration-flip2-composition"],
          ["rewire-local-20260920-evaluation-flip2-train-mean", "rewire-local-20260920-configuration-flip2-train-mean"],
          ["rewire-local-20260921-evaluation-composition22", "rewire-local-20260921-configuration-composition22"],
          ["rewire-local-20260921-evaluation-esm2-35m", "rewire-local-20260921-configuration-esm2-35m"],
          ["rewire-local-20260921-evaluation-esm2-8m", "rewire-local-20260921-configuration-esm2-8m"],
        ],
      }],
    },
    {
      slug: "mass-spectrum-molecule-shortlisting",
      scopes: ["formula", "mces"].flatMap((split) => [1, 20].map((rank) => ({
        protocol: `msalign-2026-table3-task-massspecgym-${split}-split-no-formula-r-${rank}`,
        evaluations: ["deepsets", "emb-cos", "ffn", "jestr", "msalign", "sail"].map((method): [string, string] => [
          `msalign-2026-table3-evaluation-${method}-massspecgym-${split}-split-no-formula-r-${rank}`,
          `msalign-2026-table3-method-${method}`,
        ]),
      }))),
    },
  ];
  it.each(groups)("keeps $slug evaluations within their exact protocol and configuration scopes", ({ slug, scopes }) => {
    const page = expanded.query.get({ slug })!;
    expect(page).not.toBeNull();
    expect(page.mappings).toHaveLength(scopes.length);
    expect(page.mappings.map((mapping) => mapping.protocol_id).sort()).toEqual(scopes.map((scope) => scope.protocol).sort());
    for (const scope of scopes) {
      const mapping = page.mappings.find((item) => item.protocol_id === scope.protocol)!;
      expect(mapping.protocol).toMatchObject({ id: scope.protocol, kind: "protocol" });
      expect(mapping.evaluation_ids.toSorted()).toEqual(scope.evaluations.map(([id]) => id).sort());
      expect(mapping.evaluations).toHaveLength(scope.evaluations.length);
      for (const [evaluationId, configurationId] of scope.evaluations) {
        const evaluation = mapping.evaluations.find((item) => item.evaluation.id === evaluationId)!;
        expect(evaluation.configurations.map((configuration) => configuration.id)).toEqual([configurationId]);
        expect(evaluation.configurations[0].kind).toBe("configuration");
        expect(evaluation.results.length).toBeGreaterThan(0);
        for (const result of evaluation.results) {
          expect(result.evaluation?.id).toBe(evaluationId);
          expect(result.protocols.map((protocol) => protocol.id)).toEqual([scope.protocol]);
          expect(result.configurations.map((configuration) => configuration.id)).toEqual([configurationId]);
        }
      }
    }
  });

  it("retains undefined constant-control correlations and their original review evidence", () => {
    const controls = [
      { slug: "utr-translation-baselines", evaluation: "rewire-local-20260920-evaluation-mrnabench-train-mean", metrics: ["pearson", "spearman"] },
      { slug: "rhodopsin-wavelength-transfer", evaluation: "rewire-local-20260920-evaluation-flip2-train-mean", metrics: ["spearman"] },
    ];
    const originals = new Map(expanded.previous.records.map((record) => [record.id, record]));
    for (const control of controls) {
      const page = expanded.query.get({ slug: control.slug })!;
      const evaluation = page.mappings.flatMap((mapping) => mapping.evaluations)
        .find((item) => item.evaluation.id === control.evaluation)!;
      const correlations = evaluation.results.filter((row) => control.metrics.includes(String(row.result.attributes.metric)));
      expect(correlations).toHaveLength(control.metrics.length);
      for (const { result } of correlations) {
        const original = originals.get(result.id)!;
        expect(result.attributes.numeric_value).toBeNull();
        expect(result.attributes.printed_value).toBe("undefined");
        expect(result.attributes.undefined_reason).toBe(original.attributes.undefined_reason);
        expect(result.attributes.undefined_reason).toMatch(/constant/i);
        expect(result.attributes.review).toEqual(original.attributes.review);
        expect(result.attributes.review).toMatchObject({ method: "automated_execution_evidence_review" });
      }
    }
  });

  it("rejects changed curation or source bytes without blessing them during release generation", () => {
    const directory = path.join(temporary(), "curation");
    fs.cpSync(useCaseRoot, directory, { recursive: true });
    expect(useCaseInputFiles(directory)).toHaveLength(7);
    expect(loadUseCases(directory)!.inputs.use_cases).toHaveLength(17);
    const file = path.join(directory, "inputs.json");
    const before = fs.readFileSync(file, "utf8");
    fs.writeFileSync(file, before + " ");
    expect(() => loadUseCases(directory)).toThrow(/changed since review/);
    fs.writeFileSync(file, before);
    fs.appendFileSync(path.join(directory, "sources/mfass-matched-study-intake.md"), "changed");
    expect(() => loadUseCases(directory)).toThrow(/changed since review/);
    expect(loadUseCases(path.join(directory, "not-present"))).toBeUndefined();
  });
});

describe("use-case release identity and archives", () => {
  it("binds logical content before release identity and exported bytes afterwards", () => {
    const { inputs, records } = fixture();
    const output = release(inputs, records);
    const artifact = JSON.parse(output.files["use-cases.json"]);
    expect(output.snapshot.schema_version).toBe("1.1");
    expect(output.manifest.coverage).toMatchObject({ use_cases: useCaseDeclaration(inputs) });
    expect(output.manifest.files["use-cases.json"]).toBe(sha(output.files["use-cases.json"]));
    expect(artifact.release_id).toBe(output.snapshot.release_id);
    expect(validateUseCaseArtifact(output.snapshot, artifact, useCaseDeclaration(inputs))).toEqual(artifact);
    const changed = structuredClone(inputs);
    changed.use_cases[0].title = "Changed reviewed question";
    expect(release(changed, records).snapshot.release_id).not.toBe(output.snapshot.release_id);
    expect(output.snapshot.records).toEqual([...records].sort((a, b) => a.id.localeCompare(b.id)));
    expect(release(inputs, records).files).toEqual(output.files);
  });

  it("requires inputs for a declaration and preserves declaration-free legacy releases", () => {
    const { inputs, records } = fixture();
    const legacy = release();
    expect(legacy.manifest.coverage).not.toHaveProperty("use_cases");
    expect(legacy.files).not.toHaveProperty("use-cases.json");
    expect(createUseCaseQuery(legacy.snapshot).list().items).toEqual([]);
    expect(() => buildRelease(records, "2026-09-25T00:00:00Z", { entity_schema_version: "1.1", use_cases: useCaseDeclaration(inputs) })).toThrow(/require reviewed inputs/);
    expect(() => buildRelease(records, "2026-09-25T00:00:00Z", { entity_schema_version: "1.1", use_cases: { ...useCaseDeclaration(inputs), mappings: 8 } }, false, inputs)).toThrow(/does not match/);
  });

  it.each([false, true])("restores sidecar bytes and refuses mutable archive data (split=%s)", (split) => {
    const bundle = archive(release(fixture().inputs), split);
    restoreReleaseBundles(bundle.input, bundle.destination);
    restoreReleaseBundles(bundle.input, bundle.destination);
    const file = path.join(bundle.destination, bundle.id, "use-cases.json");
    expect(fs.readFileSync(file, "utf8")).toBe(bundle.files["use-cases.json"]);
    fs.writeFileSync(file, "existing bytes");
    expect(() => restoreReleaseBundles(bundle.input, bundle.destination)).toThrow(/Immutable release conflict/);
    expect(fs.readFileSync(file, "utf8")).toBe("existing bytes");
  });

  it.each([false, true])("rejects missing, undeclared and foreign-release sidecars (split=%s)", (split) => {
    const missing = archive(release(fixture().inputs), split);
    if (split) fs.unlinkSync(path.join(missing.input, missing.id, "use-cases.json.gz"));
    else { delete missing.files["use-cases.json"]; missing.write(); }
    expect(() => restoreReleaseBundles(missing.input, missing.destination)).toThrow(/Unexpected archived files/);
    const undeclared = archive(release(), split);
    undeclared.files["use-cases.json"] = "{}";
    undeclared.write();
    expect(() => restoreReleaseBundles(undeclared.input, undeclared.destination)).toThrow(/Unexpected archived files/);
    const output = release(fixture().inputs);
    const changed = JSON.parse(output.files["use-cases.json"]);
    changed.release_id = "2026-09-25-ffffffffffff";
    output.files["use-cases.json"] = JSON.stringify(changed);
    output.manifest.files["use-cases.json"] = sha(output.files["use-cases.json"]);
    const foreign = archive(output, split);
    expect(() => restoreReleaseBundles(foreign.input, foreign.destination)).toThrow(/release\/declaration mismatch/);
  });

  it("withholds changed evidence while retaining the reviewed digest and fingerprint", () => {
    const { inputs, records } = fixture();
    const old = inputs.mappings[0].evidence_sha256;
    records[1].description = "Changed evidence";
    const artifact = JSON.parse(release(inputs, records).files["use-cases.json"]);
    expect(artifact.mappings[0].lifecycle).toBe("needs_review");
    expect(artifact.mappings[0].evidence_sha256).toBe(old);
    expect(inputs.mappings[0].lifecycle).toBe("active");
    expect(artifact.input_sha256).toBe(useCaseDeclaration(inputs).input_sha256);
  });

  it.each([false, true])("restores reviewed source copies and immutable public aliases (split=%s)", (split) => {
    const source = "# Reviewed synthetic source\n\nNo scientific claim.\n";
    const digest = sha(source);
    const name = `use-case-source-${digest}.md`;
    const fixtureData = fixture();
    const output = buildRelease(fixtureData.records, "2026-09-25T00:00:00Z", { entity_schema_version: "1.1" }, false, fixtureData.inputs, { [name]: source });
    expect(output.manifest.coverage).toMatchObject({ use_case_sources: [{ file: name, sha256: digest }] });
    expect(output.manifest.files[name]).toBe(digest);
    const saved = archive(output, split);
    restoreReleaseBundles(saved.input, saved.destination);
    const alias = path.join(path.dirname(saved.destination), "sources", `${digest}.md`);
    expect(fs.readFileSync(alias, "utf8")).toBe(source);
    expect(fs.readFileSync(path.join(saved.destination, saved.id, name), "utf8")).toBe(source);
    restoreReleaseBundles(saved.input, saved.destination);
    fs.writeFileSync(alias, "conflicting old bytes");
    expect(() => restoreReleaseBundles(saved.input, saved.destination)).toThrow(/Immutable use-case source conflict/);
    expect(fs.readFileSync(alias, "utf8")).toBe("conflicting old bytes");
  });

  it("rejects unsafe, duplicate and content-mismatched source names", () => {
    const text = "reviewed source\n";
    const digest = sha(text);
    const declaration = { file: `use-case-source-${digest}.md`, sha256: digest };
    expect(() => parseUseCaseSourceDeclaration([declaration, declaration])).toThrow(/duplicate digest/);
    expect(() => parseUseCaseSourceDeclaration([{ ...declaration, file: `../use-case-source-${digest}.md` }])).toThrow();
    expect(() => parseUseCaseSourceDeclaration([{ ...declaration, sha256: "0".repeat(64) }])).toThrow(/Invalid use-case source filename/);
    const destination = path.join(temporary(), "sources");
    expect(() => writeUseCaseSourceCopies({ [declaration.file]: "changed source" }, destination)).toThrow(/Invalid use-case source filename/);
    expect(fs.existsSync(destination)).toBe(false);
  });

  it.each([false, true])("binds tombstones to real scoped historical evidence (split=%s)", (split) => {
    const previous = archive(release(fixture().inputs), split);
    for (const lifecycle of ["withdrawn", "superseded"] as const) {
      const inputs = withdrawn(previous.id, lifecycle);
      expect(() => validateUseCaseHistory(inputs, previous.input)).not.toThrow();
      inputs.mappings[0].revision = 2;
      expect(() => validateUseCaseHistory(inputs, previous.input)).not.toThrow();
      inputs.mappings[0].id = "invented-mapping";
      expect(() => validateUseCaseHistory(inputs, previous.input)).toThrow(/no matching historical scoped evidence/);
    }
    const wrongCase = withdrawn(previous.id);
    wrongCase.use_cases[0].id = "different-case";
    wrongCase.mappings[0].use_case_id = "different-case";
    expect(() => validateUseCaseHistory(wrongCase, previous.input)).toThrow(/no matching historical scoped evidence/);
    const later = fixture().inputs;
    later.mappings[0].revision = 2;
    const laterArchive = archive(release(later), split);
    expect(() => validateUseCaseHistory(withdrawn(laterArchive.id), laterArchive.input)).toThrow(/no matching historical scoped evidence/);
    if (split) fs.writeFileSync(path.join(previous.input, previous.id, "use-cases.json.gz"), gzipSync("{}"));
    else { previous.files["use-cases.json"] = "{}"; previous.write(); }
    expect(() => validateUseCaseHistory(withdrawn(previous.id), previous.input)).toThrow(/Historical use-case checksum mismatch/);
  });

  it("rejects missing historical evidence in release assembly and declaration-free history", () => {
    const input = withdrawn("2026-09-20-ffffffffffff");
    expect(() => release(input)).toThrow(/Historical use-case release does not exist/);
    const old = archive(release(), true);
    expect(() => validateUseCaseHistory(withdrawn(old.id), old.input)).toThrow(/no bound use-case declaration/);
    const missing = archive(release(fixture().inputs), true);
    fs.unlinkSync(path.join(missing.input, missing.id, "use-cases.json.gz"));
    expect(() => validateUseCaseHistory(withdrawn(missing.id), missing.input)).toThrow(/Historical use-case artifacts are missing/);
  });
});
