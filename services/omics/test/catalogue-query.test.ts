import test from "node:test";
import assert from "node:assert/strict";
import { createCatalogueQuery } from "../src/catalogue-query.js";
import { validateSnapshot } from "../src/validation.js";
import { fixture } from "./fixtures.js";

test("public queries expose exact direct and reverse identities with result provenance", () => {
  const query = createCatalogueQuery(fixture());
  assert.equal(
    query.get({ id: "result-one" })?.direct[0].record.id,
    "evaluation-one",
  );
  assert.equal(
    query.get({ id: "model-one" })?.reverse[0].record.id,
    "evaluation-one",
  );
  const result = query.results({ id: "model-one" });
  assert.equal(result.total, 1);
  assert.equal(result.evaluation_count, 1);
  assert.equal(result.items[0].models[0].id, "model-one");
  assert.equal(result.items[0].benchmarks[0].id, "benchmark-one");
  assert.equal(result.items[0].datasets[0].id, "dataset-one");
  assert.equal(result.items[0].sources[0].id, "source-one");
  assert.equal(result.items[0].review_status, "source_checked");
  assert.equal(result.items[0].origin, "author_reported");
  assert.deepEqual(result.facets.metrics, ["AUROC"]);
  assert.equal(
    query.results({ id: "model-one", configuration_id: "absent" }).total,
    0,
  );
  assert.equal(query.get({ id: "absent" }), null);
});

test("pagination is bounded, stable and rejects reuse across filters or releases", () => {
  const source = fixture(),
    query = createCatalogueQuery(source);
  const first = query.list({ limit: 2 });
  const second = query.list({ limit: 2, cursor: first.next_cursor! });
  assert.equal(
    new Set([...first.items, ...second.items].map((r) => r.id)).size,
    4,
  );
  assert.throws(
    () => query.list({ kind: "model", cursor: first.next_cursor! }),
    /filters/,
  );
  assert.throws(
    () =>
      createCatalogueQuery({ ...source, release_id: "another" }).list({
        cursor: first.next_cursor!,
      }),
    /release/,
  );
  assert.throws(() => query.list({ limit: 101 }), /limit/);
  assert.equal(
    query.list({ q: "model-one", kind: "model", area: "genomics" }).total,
    1,
  );
  assert.equal(
    query.list({ kind: "model", origin: "author_reported" }).total,
    1,
  );
});

test("excluded and private records cannot leak through queries or imports", () => {
  const source = fixture();
  source.records.find((r: any) => r.id === "model-one").status = "excluded";
  const query = createCatalogueQuery(source);
  assert.equal(query.get({ id: "model-one" }), null);
  assert.equal(query.results({ id: "result-one" }).items[0].models.length, 0);
  source.records[0].attributes.extra = { contact_email: "private@example.org" };
  assert.throws(() => createCatalogueQuery(source), /Private/);
  assert.throws(() => validateSnapshot(source), /Private/);
});

test("profile citations join sources and are validated even when nested", () => {
  const source = fixture(),
    model = source.records.find((r: any) => r.id === "model-one");
  model.source_ids = [];
  model.attributes.profile = {
    sections: [{ body: "Summary", source_ids: ["source-one"] }],
  };
  assert.equal(
    createCatalogueQuery(source).get({ id: "model-one" })?.sources[0].id,
    "source-one",
  );
  model.attributes.profile.sections[0].source_ids = ["absent"];
  assert.throws(() => validateSnapshot(source), /profile evidence/);
});

test("comparisons fail closed for missing fields, copied rows and different populations", () => {
  const source = fixture();
  const original = source.records.find((r: any) => r.id === "result-one");
  const evaluation = source.records.find((r: any) => r.id === "evaluation-one");
  const second = structuredClone(original);
  second.id = "result-two";
  second.links[0].target_id = "evaluation-two";
  const secondEval = structuredClone(evaluation);
  secondEval.id = "evaluation-two";
  source.records.push(second, secondEval);
  assert.equal(
    createCatalogueQuery(source).compare({ ids: ["result-one", "result-two"] })
      .compatible,
    true,
  );
  secondEval.attributes.comparison.population = "unreported";
  assert.match(
    createCatalogueQuery(source)
      .compare({ ids: ["result-one", "result-two"] })
      .reasons.join(" "),
    /not fully reported/,
  );
  secondEval.attributes.comparison.population = "mouse";
  assert.match(
    createCatalogueQuery(source)
      .compare({ ids: ["result-one", "result-two"] })
      .reasons.join(" "),
    /population differs/,
  );
  secondEval.attributes.comparison.population = "human";
  secondEval.attributes.origin = "paper_compilation";
  assert.match(
    createCatalogueQuery(source)
      .compare({ ids: ["result-one", "result-two"] })
      .reasons.join(" "),
    /not independent/,
  );
  assert.equal(
    createCatalogueQuery(source).compare({ ids: ["absent", "result-one"] })
      .compatible,
    false,
  );
  assert.equal(
    createCatalogueQuery(source).compare({ ids: ["result-one", "result-one"] })
      .compatible,
    false,
  );
});

test("only source-checked family and task associations aggregate results, preserving configurations", () => {
  const snapshot = fixture();
  const child = snapshot.records.find((r: any) => r.id === "model-one");
  const parent = structuredClone(child);
  parent.id = "family-one";
  parent.links = [];
  const pipeline = structuredClone(child);
  pipeline.id = "pipeline-one";
  pipeline.links = [{ relation: "uses_model", target_id: "family-one" }];
  child.links.push({ relation: "family", target_id: "family-one" });
  const task = structuredClone(
    snapshot.records.find((r: any) => r.id === "benchmark-one"),
  );
  task.id = "task-one";
  task.attributes.entity_level = "task";
  const benchmark = snapshot.records.find((r: any) => r.id === "benchmark-one");
  benchmark.links.push({ relation: "evaluates_task", target_id: "task-one" });
  snapshot.records.push(parent, pipeline, task);
  assert.equal(
    createCatalogueQuery(snapshot).results({ id: "family-one" }).total,
    0,
    "uncited family labels cannot invent identity",
  );
  const claim = (
    id: string,
    subject: string,
    relation: string,
    target: string,
  ) => ({
    id,
    kind: "claim",
    name: id,
    description: "Checked identity",
    status: "source_checked",
    facets: {},
    source_ids: ["source-one"],
    links: [{ relation: "subject", target_id: subject }],
    attributes: {
      field: `links:${relation}:${target}`,
      source_locator: "Methods, configurations",
    },
  });
  snapshot.records.push(
    claim("claim-family", "model-one", "family", "family-one"),
    claim("claim-task", "benchmark-one", "evaluates_task", "task-one"),
    claim("claim-pipeline", "pipeline-one", "uses_model", "family-one"),
  );
  const evaluation = structuredClone(
    snapshot.records.find((r: any) => r.id === "evaluation-one"),
  );
  evaluation.id = "evaluation-pipeline";
  evaluation.links[0].target_id = "pipeline-one";
  const result = structuredClone(
    snapshot.records.find((r: any) => r.id === "result-one"),
  );
  result.id = "result-pipeline";
  result.links[0].target_id = "evaluation-pipeline";
  snapshot.records.push(evaluation, result);
  const query = createCatalogueQuery(snapshot);
  assert.equal(
    query.results({ id: "family-one" }).total,
    1,
    "pipeline results must remain separate",
  );
  assert.equal(
    query.results({ id: "family-one" }).items[0].models[0].id,
    "model-one",
  );
  assert.equal(
    query.results({ id: "family-one" }).facets.configurations[0].id,
    "evaluation-one",
  );
  assert.equal(query.results({ id: "task-one" }).total, 2);
  assert.ok(
    query
      .get({ id: "family-one" })
      ?.reverse.some((r) => r.relation === "uses_model"),
  );
  child.links.push({ relation: "alias_of", target_id: "family-one" });
  assert.equal(createCatalogueQuery(snapshot).list({ kind: "model" }).total, 3);
  snapshot.records.push(
    claim("claim-alias", "model-one", "alias_of", "family-one"),
  );
  assert.equal(createCatalogueQuery(snapshot).list({ kind: "model" }).total, 2);
  assert.equal(
    createCatalogueQuery(snapshot).get({ id: "model-one" })?.record.id,
    "model-one",
  );
});

test("comparison reports every missing protocol condition and rejects incompatible units", () => {
  const baseline = fixture();
  const result = structuredClone(
    baseline.records.find((r: any) => r.id === "result-one"),
  );
  result.id = "result-two";
  result.links[0].target_id = "evaluation-two";
  const evaluation = structuredClone(
    baseline.records.find((r: any) => r.id === "evaluation-one"),
  );
  evaluation.id = "evaluation-two";
  baseline.records.push(result, evaluation);
  for (const field of [
    "protocol_id",
    "dataset_version",
    "split",
    "population",
    "inputs",
    "adaptation",
    "metric_implementation",
    "aggregation",
    "budget",
  ]) {
    const copy = structuredClone(baseline);
    delete copy.records.find((r: any) => r.id === "evaluation-two").attributes
      .comparison[field];
    const compared = createCatalogueQuery(copy).compare({
      ids: ["result-one", "result-two"],
    });
    assert.equal(compared.compatible, false, field);
    assert.ok(
      compared.reasons.includes(
        `${field.replace(/_/g, " ")} is not fully reported.`,
      ),
    );
  }
  result.attributes.unit = "percent";
  assert.equal(
    createCatalogueQuery(baseline).compare({
      ids: ["result-one", "result-two"],
    }).compatible,
    false,
  );
  result.attributes.unit = "fraction";
  evaluation.status = "superseded";
  assert.equal(
    createCatalogueQuery(baseline).compare({
      ids: ["result-one", "result-two"],
    }).compatible,
    false,
  );
});
