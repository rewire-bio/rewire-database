import test from "node:test";
import assert from "node:assert/strict";
import {
  createCatalogueQuery,
  type CatalogueRecord,
  type CatalogueSnapshot,
} from "../src/catalogue-query.js";
import type { PublishedComparison } from "../src/published-comparisons.js";

function record(
  id: string,
  kind: CatalogueRecord["kind"],
  attributes: Record<string, unknown> = {},
  links: CatalogueRecord["links"] = [],
): CatalogueRecord {
  return {
    id,
    kind,
    name: id,
    description: "Synthetic API fixture",
    status: "source_checked",
    facets: {},
    source_ids: kind === "source" ? [] : ["source"],
    links,
    attributes,
  };
}
function snapshot(): CatalogueSnapshot {
  const records = [
    record("source", "source", {
      url: "https://example.org/reviewed-table",
      version: "v1",
      artifact_sha256: "a".repeat(64),
      retrieved_at: "2026-09-22",
    }),
    record("model-a", "model"),
    record("model-b", "model"),
    record("empty-model", "model"),
    record("protocol", "protocol"),
    record("dataset-a", "dataset"),
    record("dataset-b", "dataset"),
  ];
  for (let i = 0; i < 6; i++)
    records.push(
      record(
        `evaluation-${i}`,
        "evaluation",
        {
          origin: i < 4 ? "author_reported" : "independent_paper",
          evaluation_group_id: `setup-${i}`,
        },
        [
          { relation: "model", target_id: i % 2 ? "model-b" : "model-a" },
          { relation: "protocol", target_id: "protocol" },
          { relation: "dataset", target_id: i < 4 ? "dataset-a" : "dataset-b" },
        ],
      ),
      record(
        `result-${i}`,
        "result",
        {
          metric: "AUROC",
          unit: "fraction",
          metric_direction: "higher",
          numeric_value: String(0.6 + i / 100),
          printed_value: String(0.6 + i / 100),
          source_locator: `Table 1, row ${i + 1}`,
        },
        [{ relation: "evaluation", target_id: `evaluation-${i}` }],
      ),
    );
  records.push(
    record(
      "extra-metric",
      "result",
      {
        metric: "AP",
        numeric_value: "0.5",
        printed_value: "0.5",
        unit: "fraction",
        metric_direction: "higher",
        source_locator: "Table 1, row 1, AP",
      },
      [{ relation: "evaluation", target_id: "evaluation-0" }],
    ),
  );
  return {
    schema_version: "1.1",
    release_id: "browsing-fixture",
    released_at: "2026-09-22T00:00:00Z",
    coverage: {},
    records,
  };
}

test("list summaries distinguish exact evaluations from metric rows and retain empty entries", () => {
  const query = createCatalogueQuery(snapshot());
  const page = query.list({ kind: "model" });
  assert.deepEqual(page.evaluation_summaries["model-a"], {
    evaluation_count: 3,
    result_count: 4,
  });
  assert.deepEqual(page.evaluation_summaries["model-b"], {
    evaluation_count: 3,
    result_count: 3,
  });
  assert.deepEqual(page.evaluation_summaries["empty-model"], {
    evaluation_count: 0,
    result_count: 0,
  });
  const bounded = query.list({ kind: "model", limit: 1 });
  assert.deepEqual(
    Object.keys(bounded.evaluation_summaries),
    bounded.items.map((item) => item.id),
  );
});

test("evaluation summaries use reviewed family associations and never infer identity from names", () => {
  const input = snapshot();
  input.records.push(record("family", "model"));
  input.records
    .find((item) => item.id === "model-a")!
    .links.push({ relation: "family", target_id: "family" });
  assert.deepEqual(
    createCatalogueQuery(input).list({ kind: "model" }).evaluation_summaries
      .family,
    { evaluation_count: 0, result_count: 0 },
  );
  input.records.push(
    record(
      "family-claim",
      "claim",
      { field: "links:family:family", source_locator: "Methods: model family" },
      [{ relation: "subject", target_id: "model-a" }],
    ),
  );
  assert.deepEqual(
    createCatalogueQuery(input).list({ kind: "model" }).evaluation_summaries
      .family,
    { evaluation_count: 3, result_count: 4 },
  );
});

test("result filters intersect exact protocol, dataset and tested-entity identities", () => {
  const query = createCatalogueQuery(snapshot());
  const filtered = query.results({
    id: "protocol",
    protocol_id: "protocol",
    dataset_id: "dataset-a",
    tested_entity_id: "model-a",
    metric: "AUROC",
    origin: "author_reported",
  });
  assert.deepEqual(
    filtered.items.map((row) => row.result.id),
    ["result-0", "result-2"],
  );
  assert.equal(filtered.evaluation_count, 2);
  assert.equal(
    query.results({ id: "protocol", protocol_id: "unknown" }).total,
    0,
  );
  assert.equal(
    query.results({
      id: "protocol",
      dataset_id: "dataset-a",
      origin: "independent_paper",
    }).total,
    0,
  );
  assert.equal(
    query.results({ id: "protocol", tested_entity_id: "empty-model" }).total,
    0,
  );
  // The legacy field still refers to evaluation identity, not a tested model ID.
  assert.equal(
    query.results({ id: "protocol", configuration_id: "model-a" }).total,
    0,
  );
  for (const configuration_id of ["evaluation-0", "setup-0"]) {
    const rows = query.results({ id: "protocol", configuration_id });
    assert.equal(rows.total, 2);
    assert.equal(rows.evaluation_count, 1);
  }
});

test("result facets retain exact typed protocol and subject references under active filters", () => {
  const input = snapshot();
  input.records.push(record("task", "task"));
  input.records.find((item) => item.id === "evaluation-5")!.links = [
    { relation: "model", target_id: "model-b" },
    { relation: "task", target_id: "task" },
    { relation: "dataset", target_id: "dataset-b" },
  ];
  const query = createCatalogueQuery(input);
  const facets = query.results({
    id: "model-a",
    dataset_id: "dataset-a",
  }).facets;
  assert.deepEqual(facets.protocols, [{ id: "protocol", name: "protocol" }]);
  assert.deepEqual(
    facets.datasets.map((item) => item.id),
    ["dataset-a", "dataset-b"],
  );
  assert.deepEqual(facets.tested_entities, [
    { id: "model-a", name: "model-a" },
  ]);
  assert.deepEqual(query.results({ id: "task" }).facets.protocols, []);
  assert.equal(query.results({ id: "task", protocol_id: "task" }).total, 0);
});

test("result pagination supplies reversible cursors and exact ranges including final and empty pages", () => {
  const query = createCatalogueQuery(snapshot());
  const first = query.results({ id: "protocol", limit: 2 });
  const second = query.results({
    id: "protocol",
    limit: 2,
    cursor: first.next_cursor!,
  });
  const third = query.results({
    id: "protocol",
    limit: 2,
    cursor: second.next_cursor!,
  });
  const fourth = query.results({
    id: "protocol",
    limit: 2,
    cursor: third.next_cursor!,
  });
  assert.deepEqual(
    [first.range_start, first.range_end, first.previous_cursor],
    [1, 2, null],
  );
  assert.equal(second.previous_cursor, "");
  assert.deepEqual(
    query.results({ id: "protocol", limit: 2, cursor: second.previous_cursor! })
      .items,
    first.items,
  );
  assert.deepEqual(
    query.results({ id: "protocol", limit: 2, cursor: third.previous_cursor! })
      .items,
    second.items,
  );
  assert.deepEqual(
    [fourth.range_start, fourth.range_end, fourth.total, fourth.next_cursor],
    [7, 7, 7, null],
  );
  const empty = query.results({ id: "protocol", metric: "unavailable" });
  assert.deepEqual(
    [
      empty.range_start,
      empty.range_end,
      empty.previous_cursor,
      empty.next_cursor,
    ],
    [0, 0, null, null],
  );
});

test("list pagination provides the same previous-cursor contract independently of result queries", () => {
  const query = createCatalogueQuery(snapshot());
  const first = query.list({ kind: "model", limit: 1 });
  const second = query.list({
    kind: "model",
    limit: 1,
    cursor: first.next_cursor!,
  });
  const third = query.list({
    kind: "model",
    limit: 1,
    cursor: second.next_cursor!,
  });
  assert.deepEqual(
    [third.range_start, third.range_end, third.total],
    [3, 3, 3],
  );
  assert.deepEqual(
    query.list({ kind: "model", limit: 1, cursor: third.previous_cursor! })
      .items,
    second.items,
  );
});

test("new filter dimensions and release identity remain part of the cursor boundary", () => {
  const query = createCatalogueQuery(snapshot());
  const first = query.results({ id: "protocol", limit: 1 });
  for (const filter of [
    { protocol_id: "protocol" },
    { dataset_id: "dataset-a" },
    { tested_entity_id: "model-a" },
  ])
    assert.throws(
      () =>
        query.results({
          id: "protocol",
          cursor: first.next_cursor!,
          ...filter,
        }),
      /filters/,
    );
  assert.throws(
    () =>
      createCatalogueQuery({
        ...snapshot(),
        release_id: "new-release",
      }).results({ id: "protocol", cursor: first.next_cursor! }),
    /release/,
  );
});

test("comparison options expose readable exact scope and source context without nested chart definitions", () => {
  const input = snapshot();
  const panel: PublishedComparison = {
    id: "table-one",
    title: "Matched reported comparison",
    protocol_id: "protocol",
    dataset_id: "dataset-a",
    metric: "AUROC",
    unit: "fraction",
    direction: "higher",
    result_ids: ["result-0", "result-1"],
    source_ids: ["source"],
    source_locator: "Table 1",
    context: "Held-out test split; no adaptation.",
    caveats: ["Runtime is unreported."],
    review: { method: "automated_source_review", date: "2026-09-22" },
  };
  input.records.find(
    (item) => item.id === "protocol",
  )!.attributes.comparison_panels = [panel];
  const query = createCatalogueQuery(input);
  const detail = query.get({ id: "protocol", include_comparisons: false })!;
  const option = detail.comparison_options[0];
  assert.deepEqual(
    [option.id, option.title, option.metric],
    [panel.id, panel.title, panel.metric],
  );
  assert.equal(option.protocol.id, "protocol");
  assert.equal(option.protocol.kind, "protocol");
  assert.equal(option.dataset.id, "dataset-a");
  assert.equal(option.context, panel.context);
  assert.deepEqual(option.source_ids, ["source"]);
  assert.equal(
    option.sources[0].attributes.url,
    "https://example.org/reviewed-table",
  );
  assert.equal(option.protocol.attributes.comparison_panels, undefined);
  assert.deepEqual(
    query.comparison({ id: "protocol", panel_id: option.id }).panel!.result_ids,
    panel.result_ids,
  );
  assert.equal(
    query.comparison({ id: "protocol", panel_id: "unknown" }).panel,
    null,
  );
});
