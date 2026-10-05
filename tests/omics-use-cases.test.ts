import { describe, expect, it } from "vitest";
import { createCatalogueQuery, type CatalogueRecord, type CatalogueSnapshot } from "../services/omics/src/catalogue-query";
import {
  buildUseCaseArtifact, createUseCaseQuery, mappingEvidenceHash, parseUseCaseInputs,
  useCaseDeclaration, useCaseHash, validateUseCaseArtifact,
  type Mapping, type UseCase, type UseCaseInputs,
} from "../services/omics/src/use-cases";
import { accumulateUseCaseDetail } from "../lib/use-cases-build";
import { summariseUseCaseEvidence } from "../lib/use-case-summary";

const review = { method: "automated_source_review" as const, actor: "Automated test fixture", reviewed_at: "2026-09-25T12:00:00Z", note: "Synthetic fixture, not scientific review" };
function fixture() {
  const record = (id: string, kind: CatalogueRecord["kind"], extra: Partial<CatalogueRecord> = {}): CatalogueRecord => ({
    id, kind, name: id, description: "Synthetic fixture", status: "source_checked", facets: { areas: ["genomics"] },
    source_ids: kind === "source" ? [] : ["source"], links: [], attributes: {}, ...extra,
  });
  const claim = (id: string, subject: string, relation: string, target: string) => record(id, "claim", {
    links: [{ relation: "subject", target_id: subject }], attributes: { field: `links:${relation}:${target}`, value: target, source_locator: "Synthetic relationship" },
  });
  const snapshot: CatalogueSnapshot = {
    schema_version: "1.1", release_id: "2026-09-25-111111111111", released_at: "2026-09-25T12:00:00Z", coverage: {},
    records: [
      record("source", "source", { attributes: { url: "https://example.org/fixture", sha256: "a".repeat(64) } }),
      record("suite", "benchmark"), record("task", "task", { status: "discovered" }), record("model", "model"),
      record("protocol", "protocol", { links: [{ relation: "evaluates_task", target_id: "task" }, { relation: "part_of", target_id: "suite" }] }),
      record("config", "configuration", { links: [{ relation: "variant_of", target_id: "model" }] }),
      record("dataset", "dataset_subset"),
      record("evaluation", "evaluation", { links: [{ relation: "configuration", target_id: "config" }, { relation: "protocol", target_id: "protocol" }, { relation: "dataset_subset", target_id: "dataset" }], attributes: { origin: "rewire_run" } }),
      record("result", "result", { links: [{ relation: "evaluation", target_id: "evaluation" }], attributes: { metric: "Spearman", numeric_value: "0.75", uncertainty: null, source_locator: "/metric" } }),
      claim("task-link", "protocol", "evaluates_task", "task"), claim("suite-link", "protocol", "part_of", "suite"), claim("model-link", "config", "variant_of", "model"),
    ],
  };
  const entry: UseCase = {
    id: "case", slug: "splice-follow-up", title: "Splicing follow-up", question: "Which variants warrant a splicing experiment?",
    area: "genomics", contexts: ["research", "clinical_research"], search_terms: ["SNV", "RNA"], intended_users: ["Experimental researcher"],
    decision: "Choose methods to investigate", inputs: ["Human SNVs"], output: "Prioritised variants", setting: "Reporter assay",
    exclusions: ["Patient-RNA validation"], clinical_scope: "Clinical pathogenicity is not established", evidence_gaps: ["Patient RNA"],
    citations: [{ source_id: "source", locator: "Scope" }], review,
    planned_work: [{ title: "Validation", url: "https://example.org/plan", status: "blocked", reason: "Missing data" }],
  };
  const mapping: Mapping = {
    id: "mapping", use_case_id: "case", lifecycle: "active", revision: 1, reason: "Source review", protocol_id: "protocol", task_id: "task",
    evaluation_ids: ["evaluation"], endpoint: "Assay splicing", relevance: "proxy", rationale: "Assay endpoint is a proxy for broader follow-up",
    constraints: ["Human SNVs"], limitations: ["Not clinical validation"], citations: [{ source_id: "source", locator: "/metric" }], review,
  };
  mapping.evidence_sha256 = mappingEvidenceHash(snapshot, entry, mapping);
  const inputs: UseCaseInputs = { schema_version: "1.0", use_cases: [entry], mappings: [mapping] };
  return { snapshot, inputs, entry, mapping };
}
function build(f = fixture()) {
  const declaration = useCaseDeclaration(f.inputs);
  const artifact = buildUseCaseArtifact(f.snapshot, f.inputs);
  return { ...f, declaration, artifact, query: createUseCaseQuery(f.snapshot, artifact, declaration) };
}
function freeze(f: ReturnType<typeof fixture>) {
  f.mapping.evidence_sha256 = mappingEvidenceHash(f.snapshot, f.entry, f.mapping);
}

describe("scoped use-case evidence", () => {
  it("publishes a collection plan without inventing mapped evidence or model backlinks", () => {
    const f = fixture();
    f.inputs.mappings = [];
    f.entry.collection_plan = {
      status: "planned", comparison_question: "Does this method improve confirmed experimental hits?",
      baselines: ["Conventional selection with the same inputs"], outcomes: ["Hits at a fixed testing budget"],
      validation_requirements: ["Independent study holdout"], next_step: "Collect paired method and baseline evaluations",
    };
    const before = structuredClone(f.snapshot);
    const { query, declaration } = build(f);
    expect(query.list({ q: "splicing" }).items[0].collection_plan).toEqual(f.entry.collection_plan);
    expect(query.get({ slug: f.entry.slug })!.mappings).toEqual([]);
    expect(query.links({ id: "model" }).items).toEqual([]);
    expect(f.snapshot).toEqual(before);
    f.entry.collection_plan.next_step = "An explicitly revised collection task";
    expect(useCaseDeclaration(f.inputs).input_sha256).not.toBe(declaration.input_sha256);
    f.entry.collection_plan.baselines = [];
    expect(() => parseUseCaseInputs(f.inputs)).toThrow();
  });

  it("does not add collection defaults to historical inputs or change their digest", () => {
    const { inputs } = fixture();
    const original = structuredClone(inputs);
    expect(parseUseCaseInputs(inputs)).toEqual(original);
    expect(parseUseCaseInputs(inputs).use_cases[0]).not.toHaveProperty("collection_plan");
    expect(useCaseDeclaration(inputs).input_sha256).toBe(useCaseHash(original));
  });

  it("resolves exact configurations, existing result values and honest review/source metadata", () => {
    const { query, snapshot, artifact } = build();
    const detail = query.get({ slug: "splice-follow-up" })!;
    expect(detail.mappings[0].evaluations[0].configurations[0].id).toBe("config");
    expect(detail.mappings[0].evaluations[0].results[0].result.attributes.numeric_value).toBe("0.75");
    expect(detail.mappings[0].evaluations[0].results[0].result.attributes.uncertainty).toBeNull();
    expect(detail.mappings[0].task?.status).toBe("discovered");
    expect(detail.sources[0].id).toBe("source");
    expect(detail.use_case.review.method).toBe("automated_source_review");
    expect(JSON.stringify(artifact)).not.toContain("numeric_value");
    expect(snapshot.records.find((r) => r.id === "task")!.status).toBe("discovered");
  });
  it("resolves legacy link labels only through their exact reviewed protocol and configuration targets", () => {
    const f = fixture();
    f.snapshot.records.find((r) => r.id === "evaluation")!.links = [
      { relation: "model", target_id: "config" },
      { relation: "benchmark", target_id: "protocol" },
      { relation: "dataset", target_id: "dataset" },
    ];
    freeze(f);
    const before = structuredClone(f.snapshot);
    const { query } = build(f);
    const evaluated = query.get({ slug: f.entry.slug })!.mappings[0].evaluations[0];
    expect(evaluated.configurations.map((r) => r.id)).toEqual(["config"]);
    expect(evaluated.results[0].result.attributes.numeric_value).toBe("0.75");
    expect(query.links({ id: "config" }).items[0].configuration_ids).toEqual(["config"]);
    expect(query.links({ id: "model" }).items[0].configuration_ids).toEqual(["config"]);
    expect(f.snapshot).toEqual(before);
  });
  it.each(["model", "method", "pipeline"] as const)("does not treat a legacy model link to a %s as an exact configuration", (kind) => {
    const f = fixture();
    f.snapshot.records.find((r) => r.id === "evaluation")!.links[0].relation = "model";
    f.snapshot.records.find((r) => r.id === "config")!.kind = kind;
    freeze(f);
    expect(() => build(f)).toThrow(/no exact configuration/);
  });
  it.each(["task", "benchmark"] as const)("does not promote a legacy benchmark target of kind %s to a protocol", (kind) => {
    const f = fixture();
    f.snapshot.records.find((r) => r.id === "evaluation")!.links[1].relation = "benchmark";
    f.snapshot.records.find((r) => r.id === "protocol")!.kind = kind;
    freeze(f);
    expect(() => build(f)).toThrow(/wrong-kind public protocol/);
  });
  it.each(["config", "model", "model-link"])("fingerprints %s evidence reached through a legacy configuration link", (id) => {
    const f = fixture();
    f.snapshot.records.find((r) => r.id === "evaluation")!.links[0].relation = "model";
    freeze(f);
    expect(build(f).artifact.mappings[0].lifecycle).toBe("active");
    f.snapshot.records.find((r) => r.id === id)!.description += " changed";
    const { artifact, query } = build(f);
    expect(artifact.mappings[0].lifecycle).toBe("needs_review");
    expect(query.links({ id: "config" }).items).toEqual([]);
  });
  it("keeps source and review gates for legacy configuration evidence", () => {
    const f = fixture();
    f.snapshot.records.find((r) => r.id === "evaluation")!.links[0].relation = "model";
    const configuration = f.snapshot.records.find((r) => r.id === "config")!;
    configuration.status = "discovered"; freeze(f);
    expect(() => build(f)).toThrow(/not reviewed evidence/);
    configuration.status = "source_checked";
    f.snapshot.records.push({ ...f.snapshot.records[0], id: "config-source", attributes: { evidence_concerns: ["Unresolved provenance"] } });
    configuration.source_ids = ["config-source"]; freeze(f);
    expect(() => build(f)).toThrow(/Configuration evidence is disputed or unchecked/);
  });
  it("provides backlinks only through exact evidence and reviewed navigation relationships", () => {
    const { query } = build();
    for (const id of ["protocol", "task", "evaluation", "config", "model", "suite"])
      expect(query.links({ id }).items).toHaveLength(1);
    expect(query.links({ id: "model" }).items[0].configuration_ids).toEqual(["config"]);
    expect(query.links({ id: "source" }).items).toEqual([]);
  });
  it("scopes model, configuration and evaluation backlinks to their own supporting configurations", () => {
    const f = fixture();
    for (const id of ["model", "config", "evaluation", "result", "model-link"]) {
      const record = structuredClone(f.snapshot.records.find((r) => r.id === id)!);
      record.id += "-two";
      record.links = record.links.map((l) => ({ ...l, target_id: ["model", "config", "evaluation"].includes(l.target_id) ? `${l.target_id}-two` : l.target_id }));
      if (id === "model-link") Object.assign(record.attributes, { field: "links:variant_of:model-two", value: "model-two" });
      f.snapshot.records.push(record);
    }
    f.mapping.evaluation_ids.push("evaluation-two"); freeze(f);
    const { query } = build(f);
    for (const target of ["model", "config", "evaluation"])
      expect(query.links({ id: target }).items[0].configuration_ids).toEqual(["config"]);
    for (const target of ["model-two", "config-two", "evaluation-two"])
      expect(query.links({ id: target }).items[0].configuration_ids).toEqual(["config-two"]);
    for (const target of ["protocol", "task", "suite"])
      expect(query.links({ id: target }).items[0].configuration_ids).toEqual(["config", "config-two"]);
  });
  it.each(["wrong-value", "source-concern"])("rejects task associations with %s evidence", (problem) => {
    const f = fixture();
    const claim = f.snapshot.records.find((r) => r.id === "task-link")!;
    if (problem === "wrong-value") claim.attributes.value = "another-task";
    else {
      f.snapshot.records.push({ ...f.snapshot.records[0], id: "concerned-source", attributes: { evidence_concerns: ["Unresolved evidence discrepancy"] } });
      claim.source_ids = ["concerned-source"];
    }
    freeze(f);
    expect(() => build(f)).toThrow(/direct reviewed/);
  });
  it.each(["model-link", "suite-link"])("withholds navigation from contradictory or concerning %s evidence", (id) => {
    const f = fixture();
    const claim = f.snapshot.records.find((r) => r.id === id)!;
    const target = String(claim.attributes.value);
    claim.attributes.value = "another-target"; freeze(f);
    expect(build(f).query.links({ id: target }).items).toEqual([]);
    claim.attributes.value = target;
    f.snapshot.records.push({ ...f.snapshot.records[0], id: "concerned-source", attributes: { evidence_concerns: ["Unresolved evidence discrepancy"] } });
    claim.source_ids = ["concerned-source"]; freeze(f);
    expect(build(f).query.links({ id: target }).items).toEqual([]);
  });
  it.each(["disputed", "excluded", "superseded"] as const)("rejects an active mapping to a %s task", (status) => {
    const f = fixture(); f.snapshot.records.find((r) => r.id === "task")!.status = status; freeze(f);
    expect(() => build(f)).toThrow(/inactive task|public task/);
  });
  it("never adds mapping relationships to catalogue results or comparison gates", () => {
    const f = fixture();
    const before = createCatalogueQuery(f.snapshot);
    const results = before.results({ id: "suite" });
    const comparison = before.compare({ ids: ["result"] });
    build(f);
    const after = createCatalogueQuery(f.snapshot);
    expect(after.results({ id: "suite" })).toEqual(results);
    expect(after.compare({ ids: ["result"] })).toEqual(comparison);
    expect(after.results({ id: "case" }).total).toBe(0);
  });
  it("does not infer model suitability through unreviewed family links", () => {
    const f = fixture();
    f.snapshot.records.find((r) => r.id === "model-link")!.status = "discovered";
    freeze(f);
    expect(build(f).query.links({ id: "model" }).items).toEqual([]);
    expect(build(f).query.links({ id: "config" }).items).toHaveLength(1);
  });
  it("rejects an existing evaluation from a sibling protocol", () => {
    const f = fixture();
    f.snapshot.records.push({ ...f.snapshot.records.find((r) => r.id === "protocol")!, id: "sibling" });
    f.mapping.protocol_id = "sibling";
    freeze(f);
    expect(() => build(f)).toThrow(/another protocol/);
  });
  it("does not traverse a suite to invent task membership", () => {
    const f = fixture();
    f.snapshot.records.find((r) => r.id === "protocol")!.links = [{ relation: "part_of", target_id: "suite" }];
    f.snapshot.records.find((r) => r.id === "suite")!.links = [{ relation: "evaluates_task", target_id: "task" }];
    f.snapshot.records.find((r) => r.id === "task-link")!.links[0].target_id = "suite";
    freeze(f);
    expect(() => build(f)).toThrow(/direct reviewed/);
  });
  it("supports protocol-only mappings when no reviewed task link exists", () => {
    const f = fixture(); delete f.mapping.task_id;
    f.snapshot.records.find((r) => r.id === "task-link")!.status = "discovered";
    freeze(f);
    expect(build(f).query.get({ slug: f.entry.slug })!.mappings[0].task).toBeNull();
  });
  it("keeps direct relevance scoped to the endpoint and retains clinical limitations", () => {
    const f = fixture(); f.mapping.relevance = "direct"; freeze(f);
    const detail = build(f).query.get({ slug: f.entry.slug })!;
    expect(detail.mappings[0].relevance).toBe("direct");
    expect(detail.mappings[0].endpoint).toBe("Assay splicing");
    expect(detail.use_case.clinical_scope).toBe("Clinical pathogenicity is not established");
  });
  it.each(["source", "result", "config", "evaluation", "task-link", "model-link"])("suppresses active claims after %s changes under the same ID", (id) => {
    const f = fixture();
    const original = build(f);
    f.snapshot.records.find((r) => r.id === id)!.description += " changed";
    const artifact = buildUseCaseArtifact(f.snapshot, f.inputs);
    expect(artifact.mappings[0].lifecycle).toBe("needs_review");
    expect(artifact.mappings[0].stale_from).toEqual({ lifecycle: "active", reason: f.mapping.reason });
    expect(f.mapping.lifecycle).toBe("active");
    const query = createUseCaseQuery(f.snapshot, artifact, original.declaration);
    expect(query.links({ id: "config" }).items).toEqual([]);
    expect(query.get({ slug: f.entry.slug })!.mappings[0].evaluations).toEqual([]);
    expect(() => validateUseCaseArtifact(f.snapshot, original.artifact, original.declaration)).toThrow(/stale/);
  });
  it("requires an explicit new fingerprint/review before restoring applicability", () => {
    const f = fixture();
    f.snapshot.records.find((r) => r.id === "source")!.description += " source update";
    expect(build(f).artifact.mappings[0].lifecycle).toBe("needs_review");
    freeze(f); f.mapping.revision++;
    expect(build(f).artifact.mappings[0].lifecycle).toBe("active");
  });
  it.each(["draft", "needs_review"] as const)("withholds all evaluated evidence/backlinks for %s mappings", (lifecycle) => {
    const f = fixture(); f.mapping.lifecycle = lifecycle;
    const { query } = build(f);
    expect(query.links({ id: "protocol" }).items).toEqual([]);
    expect(query.get({ slug: f.entry.slug })!.mappings[0].evaluations).toEqual([]);
  });
  it.each(["outside_scope", "not_assessed"] as const)("represents %s without a zero score or implied failure", (relevance) => {
    const f = fixture(); f.mapping.relevance = relevance; f.mapping.evaluation_ids = []; freeze(f);
    const { query } = build(f);
    expect(query.get({ slug: f.entry.slug })!.mappings[0].evaluations).toEqual([]);
    expect(query.links({ id: "protocol" }).items).toEqual([]);
  });
  it("keeps planned work separate from an active mapping with no recorded evaluation", () => {
    const f = fixture(); f.mapping.evaluation_ids = []; freeze(f);
    const detail = build(f).query.get({ slug: f.entry.slug })!;
    expect(detail.mappings[0].evaluations).toEqual([]);
    expect(detail.use_case.planned_work[0].status).toBe("blocked");
  });
  it("retains tombstone history after the protocol disappears", () => {
    const f = fixture();
    f.inputs.mappings = [{ id: "mapping", use_case_id: "case", revision: 2, lifecycle: "withdrawn", reason: "Protocol withdrawn", prior_release_id: "2026-09-24-111111111111", evaluation_ids: [], constraints: [], limitations: [], citations: [] }];
    f.snapshot.records = f.snapshot.records.filter((r) => r.id !== "protocol");
    const { query } = build(f);
    expect(query.get({ slug: f.entry.slug })!.mappings[0].prior_release_id).toBe("2026-09-24-111111111111");
    expect(query.links({ id: "config" }).items).toEqual([]);
  });
  it.each(["2026-09-25-111111111111", "2026-09-26-111111111111"])("rejects a self or future history release %s", (prior_release_id) => {
    const f = fixture();
    f.inputs.mappings = [{ id: "mapping", use_case_id: "case", revision: 2, lifecycle: "withdrawn", reason: "Protocol withdrawn", prior_release_id, evaluation_ids: [], constraints: [], limitations: [], citations: [] }];
    expect(() => build(f)).toThrow(/prior release/);
  });
  it("keeps superseded history without retaining active evidence or backlinks", () => {
    const f = fixture();
    const replacement = { ...f.mapping, id: "mapping-two", revision: 2, supersedes_id: "mapping" };
    f.inputs.mappings = [replacement, { id: "mapping", use_case_id: "case", revision: 1, lifecycle: "superseded", reason: "Replaced by a newly reviewed mapping", prior_release_id: "2026-09-24-111111111111", evaluation_ids: [], constraints: [], limitations: [], citations: [] }];
    const { query } = build(f);
    const historical = query.get({ slug: f.entry.slug })!.mappings.find((m) => m.id === "mapping")!;
    expect(historical.evaluations).toEqual([]);
    expect(historical.protocol).toBeNull();
    expect(query.links({ id: "config" }).items.map((m) => m.mapping_id)).toEqual(["mapping-two"]);
    replacement.revision = 1;
    expect(() => build(f)).toThrow(/Supersession/);
  });
  it.each(["source", "protocol", "evaluation", "config"])("rejects positive claims relying on disputed %s", (id) => {
    const f = fixture(); f.snapshot.records.find((r) => r.id === id)!.status = "disputed"; freeze(f);
    expect(() => build(f)).toThrow(/reviewed|disputed/);
  });
  it("allows a public disputed-source citation as outside-scope audit context", () => {
    const f = fixture(); f.mapping.relevance = "outside_scope"; f.mapping.evaluation_ids = [];
    delete f.mapping.task_id;
    f.snapshot.records.find((r) => r.id === "source")!.status = "disputed"; freeze(f);
    expect(build(f).query.get({ slug: f.entry.slug })!.mappings[0].sources[0].status).toBe("disputed");
  });
  it.each(["protocol", "config", "dataset"])("rejects %s evidence supported by a concerning source even with clean mapping citations", (id) => {
    const f = fixture();
    f.snapshot.records.push({ ...f.snapshot.records[0], id: "concerned-source", attributes: { evidence_concerns: ["Unresolved provenance"] } });
    f.snapshot.records.find((r) => r.id === id)!.source_ids = ["concerned-source"]; freeze(f);
    expect(() => build(f)).toThrow(/disputed or unchecked/);
  });
  it("rejects a disputed dataset source even when every displayed metric source remains clean", () => {
    const f = fixture();
    f.snapshot.records.push({ ...f.snapshot.records[0], id: "disputed-source", status: "disputed" });
    f.snapshot.records.find((r) => r.id === "dataset")!.source_ids = ["disputed-source"]; freeze(f);
    expect(() => build(f)).toThrow(/Dataset evidence is disputed/);
  });
  it("rejects dangling/wrong-kind refs, missing locators and private nested metadata", () => {
    const f = fixture(); f.mapping.protocol_id = "model";
    expect(() => build(f)).toThrow(/wrong-kind/);
    f.mapping.protocol_id = "missing";
    expect(() => build(f)).toThrow(/Missing/);
    f.mapping.protocol_id = "protocol"; f.mapping.citations[0].locator = "";
    expect(() => build(f)).toThrow();
    const privateInput = { ...fixture().inputs, contact_email: "private@example.org" };
    expect(() => parseUseCaseInputs(privateInput)).toThrow(/Private/);
  });
});

describe("release-bound query contract", () => {
  it("supports optional legacy absence and rejects missing declared data", () => {
    const { snapshot, artifact, declaration } = build();
    const legacy = createUseCaseQuery(snapshot);
    expect(legacy.list().items).toEqual([]); expect(legacy.get({ slug: "missing" })).toBeNull();
    expect(() => createUseCaseQuery(snapshot, undefined, declaration)).toThrow(/must be present/);
    expect(() => createUseCaseQuery(snapshot, artifact)).toThrow(/must be present/);
  });
  it("rejects foreign release, bad declaration and unsupported schema", () => {
    const { snapshot, artifact, declaration } = build();
    expect(() => validateUseCaseArtifact({ ...snapshot, release_id: "2026-09-25-222222222222" }, artifact, declaration)).toThrow(/mismatch/);
    expect(() => validateUseCaseArtifact(snapshot, artifact, { ...declaration, input_sha256: "b".repeat(64) })).toThrow(/mismatch/);
    expect(() => validateUseCaseArtifact(snapshot, { ...artifact, schema_version: "2.0" }, declaration)).toThrow();
  });
  it("recomputes the logical digest instead of trusting the declared string", () => {
    const { snapshot, artifact, declaration } = build();
    const alteredQuestion = structuredClone(artifact);
    alteredQuestion.use_cases[0].question = "An unreviewed replacement question";
    expect(() => validateUseCaseArtifact(snapshot, alteredQuestion, declaration)).toThrow(/mismatch/);
    const alteredMapping = structuredClone(artifact);
    alteredMapping.mappings[0].rationale = "An unreviewed applicability claim";
    expect(() => validateUseCaseArtifact(snapshot, alteredMapping, declaration)).toThrow(/mismatch/);
  });
  it("permits only the documented automatic stale transformation", () => {
    const f = fixture(); const original = build(f);
    f.snapshot.records[0].description += " changed";
    const stale = buildUseCaseArtifact(f.snapshot, f.inputs);
    expect(validateUseCaseArtifact(f.snapshot, stale, original.declaration)).toEqual(stale);
    const noProvenance = structuredClone(stale); delete noProvenance.mappings[0].stale_from;
    expect(() => validateUseCaseArtifact(f.snapshot, noProvenance, original.declaration)).toThrow(/mismatch/);
    const alteredReason = structuredClone(stale); alteredReason.mappings[0].reason = "Unverified substitute";
    expect(() => validateUseCaseArtifact(f.snapshot, alteredReason, original.declaration)).toThrow(/differs/);
    const inventedStaleness = structuredClone(original.artifact);
    inventedStaleness.mappings[0] = { ...inventedStaleness.mappings[0], lifecycle: "needs_review", reason: stale.mappings[0].reason, stale_from: stale.mappings[0].stale_from };
    const unchanged = fixture();
    expect(() => validateUseCaseArtifact(unchanged.snapshot, inventedStaleness, original.declaration)).toThrow(/differs/);
    expect(() => parseUseCaseInputs({ ...f.inputs, mappings: stale.mappings })).toThrow();
  });
  it("binds pagination to release and filters, with bounded search and visible counts", () => {
    const f = fixture();
    f.inputs.use_cases.push({ ...f.entry, id: "case-two", slug: "stability", title: "Protein stability", area: "proteins", contexts: ["research"] });
    const { query, artifact, declaration } = build(f);
    const first = query.list({ limit: 1 }); expect(first.total).toBe(2); expect(first.next_cursor).toBeTruthy();
    const next = query.list({ limit: 1, cursor: first.next_cursor! });
    expect(next.items[0].id).not.toBe(first.items[0].id); expect(next.next_cursor).toBeNull();
    expect(() => query.list({ limit: 101 })).toThrow(/limit/);
    expect(() => query.list({ context: "clinical_research", cursor: first.next_cursor! })).toThrow(/cursor/);
    const newRelease = { ...f.snapshot, release_id: "2026-09-26-111111111111" };
    const other = createUseCaseQuery(newRelease, { ...artifact, release_id: newRelease.release_id }, declaration);
    expect(() => other.list({ cursor: first.next_cursor! })).toThrow(/cursor/);
    expect(query.list({ area: "genomics", context: "clinical_research", q: "SNV RNA" }).total).toBe(1);
    expect(query.list({ q: "no matching evidence" }).total).toBe(0);
  });
  it("changes input identity for curation-only changes without touching catalogue records", () => {
    const f = fixture(); const old = useCaseDeclaration(f.inputs);
    f.entry.evidence_gaps.push("Another reviewed gap");
    expect(useCaseDeclaration(f.inputs).input_sha256).not.toBe(old.input_sha256);
    expect(useCaseHash({ z: 1, a: 2 })).toBe(useCaseHash({ a: 2, z: 1 }));
  });
});

// A single mapping can reference up to 100 evaluations (the schema maximum),
// and each evaluation can have an unbounded number of result rows. Production
// releases have hit both shapes: one mapping with 3 evaluations and 162
// result rows, and another with 99 evaluations across 3 mappings. Both
// exceeded the probe's 1 MB response budget when fully embedded in one
// `useCase` response. These fixtures reproduce that shape at unit scale.
function manyEvaluationsFixture(options: { evaluationCount: number; resultsForFirst?: number; padDescription?: number; releaseId?: string }) {
  const { evaluationCount, resultsForFirst = 1, padDescription = 0, releaseId = "2026-09-25-222222222222" } = options;
  const pad = padDescription ? "x".repeat(padDescription) : undefined;
  const record = (id: string, kind: CatalogueRecord["kind"], extra: Partial<CatalogueRecord> = {}): CatalogueRecord => ({
    id, kind, name: id, description: pad || "Synthetic fixture", status: "source_checked", facets: { areas: ["genomics"] },
    source_ids: kind === "source" ? [] : ["source"], links: [], attributes: {}, ...extra,
  });
  const claim = (id: string, subject: string, relation: string, target: string) => record(id, "claim", {
    links: [{ relation: "subject", target_id: subject }], attributes: { field: `links:${relation}:${target}`, value: target, source_locator: "Synthetic relationship" },
  });
  const records: CatalogueRecord[] = [
    record("source", "source", { attributes: { url: "https://example.org/fixture", sha256: "a".repeat(64) } }),
    record("suite", "benchmark"), record("task", "task", { status: "discovered" }),
    record("protocol", "protocol", { links: [{ relation: "evaluates_task", target_id: "task" }, { relation: "part_of", target_id: "suite" }] }),
    claim("task-link", "protocol", "evaluates_task", "task"), claim("suite-link", "protocol", "part_of", "suite"),
  ];
  const evaluationIds: string[] = [];
  for (let i = 0; i < evaluationCount; i++) {
    const evaluationId = `evaluation-${i}`;
    evaluationIds.push(evaluationId);
    // One distinct configuration per evaluation, so a distinct-configuration
    // count (as the use-case index summary computes) only grows past the
    // first evaluation page if the whole accumulated evidence is counted.
    records.push(record(`config-${i}`, "configuration"));
    records.push(record(evaluationId, "evaluation", {
      links: [{ relation: "configuration", target_id: `config-${i}` }, { relation: "protocol", target_id: "protocol" }],
      attributes: { origin: "rewire_run" },
    }));
    const resultCount = i === 0 ? resultsForFirst : 1;
    for (let j = 0; j < resultCount; j++) {
      records.push(record(`result-${i}-${j}`, "result", {
        links: [{ relation: "evaluation", target_id: evaluationId }],
        attributes: { metric: "Spearman", numeric_value: (0.5 + j * 0.001).toFixed(3), uncertainty: null, source_locator: "/metric" },
      }));
    }
  }
  const snapshot: CatalogueSnapshot = { schema_version: "1.1", release_id: releaseId, released_at: "2026-09-25T12:00:00Z", coverage: {}, records };
  const review = { method: "automated_source_review" as const, actor: "Automated test fixture", reviewed_at: "2026-09-25T12:00:00Z", note: "Synthetic fixture, not scientific review" };
  const entry: UseCase = {
    id: "many-case", slug: "many-evaluations", title: "Many evaluations", question: "Does this scale?", area: "genomics",
    contexts: ["research"], search_terms: ["scale"], intended_users: ["Researcher"], decision: "Choose a method", inputs: ["Inputs"],
    output: "Output", setting: "Setting", exclusions: [], clinical_scope: "Research only", evidence_gaps: [],
    citations: [{ source_id: "source", locator: "Scope" }], review, planned_work: [],
  };
  const mapping: Mapping = {
    id: "many-mapping", use_case_id: "many-case", lifecycle: "active", revision: 1, reason: "Source review",
    protocol_id: "protocol", task_id: "task", evaluation_ids: evaluationIds, endpoint: "Scaled endpoint", relevance: "proxy",
    rationale: "Synthetic scale test", constraints: [], limitations: [], citations: [{ source_id: "source", locator: "/metric" }], review,
  };
  mapping.evidence_sha256 = mappingEvidenceHash(snapshot, entry, mapping);
  const inputs: UseCaseInputs = { schema_version: "1.0", use_cases: [entry], mappings: [mapping] };
  const declaration = useCaseDeclaration(inputs);
  const artifact = buildUseCaseArtifact(snapshot, inputs);
  return { snapshot, entry, mapping, evaluationIds, query: createUseCaseQuery(snapshot, artifact, declaration) };
}

describe("bounded, paginated use-case evidence", () => {
  it("bounds the detail response within the probe's safety budget even with 100 large evaluations", () => {
    // A fixed item-count cap is not enough: each evaluation's own closure
    // (its linked protocol/configuration/source records, repeated once per
    // result row) can be large on its own, so the page must shrink by bytes,
    // not just by count, whenever individual items are this big. Kept under
    // each per-item safety budget (see the dedicated "fails explicitly"
    // test below for what happens when a single item exceeds it).
    const { query } = manyEvaluationsFixture({ evaluationCount: 100, padDescription: 5_000 });
    const detail = query.get({ slug: "many-evaluations" })!;
    expect(detail.mappings).toHaveLength(1);
    const included = detail.mappings[0].evaluations.length;
    expect(included).toBeGreaterThan(0);
    expect(included).toBeLessThan(100);
    expect(detail.evaluations_total).toBe(100);
    expect(detail.evaluations_next_cursor).toBeTruthy();
    const bytes = Buffer.byteLength(JSON.stringify({ result: { data: detail } }));
    expect(bytes).toBeLessThan(1_000_000);
  });
  it("still bounds the response when a single evaluation's own preview is itself large", () => {
    // One evaluation with many large result rows: the inline preview must
    // stay small on its own so it cannot dominate an evaluation page shared
    // with other evaluations. Each row stays under the preview's own byte
    // budget so this exercises graceful shrinking, not the hard failure
    // guard for a single row that is oversized on its own.
    const { query } = manyEvaluationsFixture({ evaluationCount: 5, resultsForFirst: 40, padDescription: 5_000 });
    const detail = query.get({ slug: "many-evaluations" })!;
    const first = detail.mappings[0].evaluations.find((e) => e.evaluation.id === "evaluation-0")!;
    expect(first.results.length).toBeLessThan(40);
    expect(first.results_total).toBe(40);
    const bytes = Buffer.byteLength(JSON.stringify({ result: { data: detail } }));
    expect(bytes).toBeLessThan(1_000_000);
  });
  it("accumulates the complete evidence for 100 large evaluations across many byte-capped pages without loss or duplication", () => {
    const { query, evaluationIds } = manyEvaluationsFixture({ evaluationCount: 100, padDescription: 5_000 });
    const full = accumulateUseCaseDetail(query, "many-evaluations")!;
    expect(full.mappings[0].evaluations.map((e) => e.evaluation.id)).toEqual(evaluationIds);
    for (const evaluation of full.mappings[0].evaluations) {
      expect(evaluation.results.length).toBe(evaluation.results_total);
      expect(evaluation.results_next_cursor).toBeNull();
    }
  });
  it("repeated accumulation calls are idempotent and never mutate the query's cached preview", () => {
    const { query } = manyEvaluationsFixture({ evaluationCount: 6, resultsForFirst: 23 });
    // A real caller: generateMetadata and the page component both call this
    // for the same route, so a second call must reproduce the first exactly.
    const first = accumulateUseCaseDetail(query, "many-evaluations")!;
    const second = accumulateUseCaseDetail(query, "many-evaluations")!;
    expect(second).toEqual(first);
    const firstEvaluation = first.mappings[0].evaluations.find((e) => e.evaluation.id === "evaluation-0")!;
    expect(firstEvaluation.results).toHaveLength(23);
    // The query's own bounded preview must still be exactly the original
    // preview size after accumulation ran: it must not have been mutated.
    const freshPage = query.get({ slug: "many-evaluations", limit: 20 })!;
    const freshPreview = freshPage.mappings[0].evaluations.find((e) => e.evaluation.id === "evaluation-0")!;
    expect(freshPreview.results.length).toBeLessThanOrEqual(10);
    expect(freshPreview.results_total).toBe(23);
    expect(freshPreview.results_next_cursor).toBeTruthy();
  });
  it("caps an evaluationResults page by bytes even when the caller asks for the probe's limit of 50", () => {
    const { query, mapping } = manyEvaluationsFixture({ evaluationCount: 1, resultsForFirst: 60, padDescription: 5_000 });
    const page = query.evaluationResults({ mapping_id: mapping.id, evaluation_id: "evaluation-0", limit: 50 });
    expect(page.items.length).toBeLessThan(50);
    expect(page.total).toBe(60);
    expect(page.next_cursor).toBeTruthy();
    const bytes = Buffer.byteLength(JSON.stringify({ result: { data: page } }));
    expect(bytes).toBeLessThan(1_000_000);
    const all = [...page.items];
    let cursor = page.next_cursor || undefined;
    while (cursor) {
      const next = query.evaluationResults({ mapping_id: mapping.id, evaluation_id: "evaluation-0", limit: 50, cursor });
      expect(Buffer.byteLength(JSON.stringify({ result: { data: next } }))).toBeLessThan(1_000_000);
      all.push(...next.items);
      cursor = next.next_cursor || undefined;
    }
    expect(new Set(all.map((r) => r.result.id)).size).toBe(60);
  });
  it("paginates evaluations across pages and recovers the complete, correctly ordered evidence", () => {
    const { query, evaluationIds } = manyEvaluationsFixture({ evaluationCount: 45, resultsForFirst: 15 });
    const collected: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = query.get({ slug: "many-evaluations", cursor, limit: 20 })!;
      expect(page.mappings).toHaveLength(1);
      expect(page.mappings[0].evaluations.length).toBeLessThanOrEqual(20);
      collected.push(...page.mappings[0].evaluations.map((e) => e.evaluation.id));
      cursor = page.evaluations_next_cursor || undefined;
      pages++;
    } while (cursor);
    expect(pages).toBeGreaterThan(1);
    expect(collected).toEqual(evaluationIds);
  });
  it("paginates one evaluation's results and recovers them all without loss or duplication", () => {
    const { query, mapping } = manyEvaluationsFixture({ evaluationCount: 3, resultsForFirst: 23 });
    const detail = query.get({ slug: "many-evaluations" })!;
    const first = detail.mappings[0].evaluations.find((e) => e.evaluation.id === "evaluation-0")!;
    expect(first.results.length).toBeLessThanOrEqual(10);
    expect(first.results_total).toBe(23);
    expect(first.results_next_cursor).toBeTruthy();
    const all = [...first.results];
    let cursor = first.results_next_cursor || undefined;
    while (cursor) {
      const page = query.evaluationResults({ mapping_id: mapping.id, evaluation_id: "evaluation-0", cursor, limit: 10 });
      all.push(...page.items);
      cursor = page.next_cursor || undefined;
    }
    expect(all.map((r) => r.result.id).sort()).toEqual(Array.from({ length: 23 }, (_, j) => `result-0-${j}`).sort());
    expect(new Set(all.map((r) => r.result.id)).size).toBe(23);
  });
  it("rejects an evaluation-results cursor minted for a different evaluation", () => {
    const { query, mapping } = manyEvaluationsFixture({ evaluationCount: 2, resultsForFirst: 15 });
    const first = query.evaluationResults({ mapping_id: mapping.id, evaluation_id: "evaluation-0", limit: 10 });
    expect(first.next_cursor).toBeTruthy();
    expect(() => query.evaluationResults({ mapping_id: mapping.id, evaluation_id: "evaluation-1", cursor: first.next_cursor! })).toThrow(/cursor/);
  });
  it("rejects a malformed or foreign use-case evidence cursor", () => {
    const { query } = manyEvaluationsFixture({ evaluationCount: 25 });
    expect(() => query.get({ slug: "many-evaluations", cursor: "not-a-real-cursor" })).toThrow(/cursor/);
    const other = manyEvaluationsFixture({ evaluationCount: 30 });
    const otherCursor = other.query.get({ slug: "many-evaluations", limit: 20 })!.evaluations_next_cursor!;
    expect(() => query.get({ slug: "many-evaluations", cursor: otherCursor })).toThrow(/cursor/);
  });
  it("an index summary built from only the first evaluation page undercounts configurations", () => {
    // app/use-cases/page.tsx builds every question's index-card evidence
    // summary by calling summariseUseCaseEvidence on the resolved mappings.
    // A bare query.get({slug}) only resolves the first evaluation page, so
    // with 45 evaluations each testing a distinct configuration, a naive
    // index implementation would report 20 (the page size) configurations
    // instead of all 45 — the exact understatement this test guards against.
    const { query, evaluationIds } = manyEvaluationsFixture({ evaluationCount: 45 });
    const firstPageOnly = query.get({ slug: "many-evaluations" })!;
    const firstPageSummary = summariseUseCaseEvidence(firstPageOnly.mappings, 0);
    expect(firstPageSummary.configurations).toBeLessThan(evaluationIds.length);
    const full = accumulateUseCaseDetail(query, "many-evaluations")!;
    const fullSummary = summariseUseCaseEvidence(full.mappings, 0);
    expect(fullSummary.configurations).toBe(evaluationIds.length);
    expect(fullSummary.configurations).toBeGreaterThan(firstPageSummary.configurations);
    // Accumulating twice (as an index page rendering every question's card
    // would) must not mutate the cached preview or grow on repeated calls.
    const again = accumulateUseCaseDetail(query, "many-evaluations")!;
    expect(summariseUseCaseEvidence(again.mappings, 0)).toEqual(fullSummary);
    expect(summariseUseCaseEvidence(query.get({ slug: "many-evaluations" })!.mappings, 0)).toEqual(firstPageSummary);
  });
  it("fails explicitly at construction instead of silently serving an oversized evaluation or result", () => {
    // A result row embeds a full copy of its evaluation, configuration,
    // protocol and source records (the exact duplication that hit 3.7x the
    // response budget in production). So one evaluation/result pair this
    // large is caught here, during query construction, by the inline result
    // preview's own byte budget — well before any client could request a
    // page and receive it. A fixed item-count cap would have admitted it as
    // the one guaranteed-first item of a page; the byte guard must not.
    expect(() => manyEvaluationsFixture({ evaluationCount: 1, padDescription: 500_000 })).toThrow(/safety budget/);
  });
  it("fails explicitly when use-case question metadata alone pushes the wrapped response over budget", () => {
    // Per-item budgets bound the evaluations/results arrays, but use_case
    // and mapping metadata (long question text, many search terms) is not
    // paginated at all. A use case that is schema-valid (up to 100 search
    // terms of up to 10,000 characters each) but this verbose must still
    // fail the overall response-size guard rather than ship past it.
    const f = fixture();
    f.entry.search_terms = Array.from({ length: 100 }, (_, i) => `term-${i}-${"x".repeat(9900)}`);
    const { query } = build(f);
    expect(() => query.get({ slug: f.entry.slug })).toThrow(/safety budget/);
  });
});
