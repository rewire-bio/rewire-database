export function fixture(): any {
  const record = (
    id: string,
    kind: string,
    attributes: object,
    links: object[] = [],
  ) => ({
    id,
    kind,
    name: id,
    description: "Test record",
    status: kind === "result" ? "source_checked" : "discovered",
    facets: { areas: ["genomics"] },
    source_ids: kind === "source" ? [] : ["source-one"],
    links,
    attributes,
  });
  return {
    schema_version: "1.0",
    release_id: "test-release",
    released_at: "2026-09-16T00:00:00Z",
    coverage: {},
    records: [
      record("source-one", "source", {
        url: "https://example.org/paper",
        version: "v1",
        retrieved_at: "2026-09-16",
      }),
      record("model-one", "model", {
        entity_level: "family",
        version: null,
        missing_metadata: { version: "unreported" },
      }),
      record("benchmark-one", "benchmark", {
        entity_level: "protocol",
        version: "1",
      }),
      record("dataset-one", "dataset", { version: "1", split: "test" }),
      record(
        "evaluation-one",
        "evaluation",
        {
          origin: "author_reported",
          comparison: {
            protocol_id: "benchmark-one",
            dataset_version: "1",
            split: "test",
            population: "human",
            inputs: "sequence",
            adaptation: "none",
            metric_implementation: "impl1",
            aggregation: "pooled",
            budget: "cpu",
          },
        },
        [
          { relation: "model", target_id: "model-one" },
          { relation: "benchmark", target_id: "benchmark-one" },
          { relation: "dataset", target_id: "dataset-one" },
        ],
      ),
      record(
        "result-one",
        "result",
        {
          printed_value: "0.8",
          numeric_value: "0.8",
          metric: "AUROC",
          metric_direction: "higher",
          unit: "fraction",
          source_locator: "Table 1, row 2",
          review: {
            method: "manual",
            reviewer: "test",
            reviewed_at: "2026-09-16",
          },
        },
        [{ relation: "evaluation", target_id: "evaluation-one" }],
      ),
    ],
  };
}
export const proposalInput = {
  type: "model" as const,
  title: "A molecular model",
  summary: "A specialist model with a source and explicit limitations.",
  source_urls: ["https://example.org/model"],
  public_credit: false,
  details: {},
};

export const sdkBundle = {
  schema_version: "1.0",
  kind: "rewire_benchmark_submission",
  protocol_id: "mfass-v2",
  protocol_version: "bee9133b83f3aedaf2bbb9013f1875515845607e",
  dataset_id: "mfass-v2",
  scope: "full",
  completion: "complete",
  model: { name: "Private model", training_overlap: "Not established" },
  metrics: { auroc: 0.77, average_precision_sklearn: 0.28 },
  coverage: { denominator: 100, scored: 100, unscored: 0 },
  provenance: { protocol_revision: "a".repeat(40) },
  execution_status: "local_adapter",
  review_status: "unreviewed_contribution",
  independently_reproduced: false,
  prepared_sha256: "b".repeat(64),
  predictions_sha256: "c".repeat(64),
};
