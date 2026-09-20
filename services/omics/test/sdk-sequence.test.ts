import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sequenceContract } from "../src/sdk-sequence-reference.js";
import { sdkSubmissionSchema } from "../src/sdk-submission.js";

test("compiled sequence contract equals its reviewed portable source", () => {
  const raw = JSON.parse(
    readFileSync(
      new URL("./sequence-fixtures/contract.json", import.meta.url),
      "utf8",
    ),
  );
  assert.deepEqual(sequenceContract, raw);
});

for (const [protocolId, protocol] of Object.entries(
  sequenceContract.protocols,
)) {
  for (const [datasetId, dataset] of Object.entries(protocol.datasets)) {
    test(`${protocolId}: ${datasetId} is accepted only with its exact source and metrics`, () => {
      const pinned = dataset.denominator !== null;
      const denominator = dataset.denominator ?? 20;
      const metrics: Record<string, number | null> = {};
      for (const [key, constraints] of Object.entries(protocol.metrics))
        metrics[key] = constraints.integer ? 1 : 0.5;
      if ("n" in metrics) metrics.n = denominator;
      if ("n_pairs" in metrics) {
        metrics.n_pairs = denominator / 2;
        metrics.pairs_denominator = denominator / 2;
      }
      const provenance: Record<string, string> = {
        upstream_revision: protocol.upstream_revision,
      };
      for (const key of protocol.required_hashes)
        provenance[key] = "a".repeat(64);
      Object.assign(provenance, dataset.verified_provenance);
      const bundle = {
        schema_version: "1.0",
        kind: "rewire_benchmark_submission",
        protocol_id: protocolId,
        protocol_version: protocol.protocol_version,
        dataset_id: datasetId,
        scope: pinned ? "full" : "subset",
        completion: pinned ? "complete" : "partial",
        model: { name: "Private local model", training_overlap: "unreported" },
        metrics,
        coverage: { denominator, scored: denominator, unscored: 0 },
        provenance,
        data_verification: pinned
          ? "pinned_source_bytes"
          : "local_bytes_hashed_not_independently_source_verified",
        evaluation_claim: "local_evaluation_not_paper_reproduction",
        evaluation_method: "imported_predictions",
        execution_status: "imported_predictions",
        review_status: "unreviewed_contribution",
        independently_reproduced: false,
        prepared_sha256: "b".repeat(64),
        predictions_sha256: "c".repeat(64),
      };
      assert.ok(
        sdkSubmissionSchema.safeParse(bundle).success,
        JSON.stringify(sdkSubmissionSchema.safeParse(bundle)),
      );
      for (const change of [
        { dataset_id: "private-data-path" },
        { dataset_id: "constructor" },
        { dataset_id: "__proto__" },
        { metrics: { ...metrics, private_sample: 0.1 } },
        {
          metrics: Object.fromEntries(
            Object.keys(metrics).map((key) => [key, null]),
          ),
        },
        { provenance: { ...provenance, upstream_revision: "d".repeat(40) } },
        { evaluation_claim: undefined },
        {
          execution_status: "imported_embeddings",
          evaluation_method: "imported_predictions",
        },
        { data_verification: "unreported" },
        { scope: "smoke" },
      ])
        assert.equal(
          sdkSubmissionSchema.safeParse({ ...bundle, ...change }).success,
          false,
          JSON.stringify(change),
        );
    });
  }
}

const sharedCases = JSON.parse(
  readFileSync(
    new URL("./sequence-fixtures/cases.json", import.meta.url),
    "utf8",
  ),
);
for (const fixture of sharedCases.cases) {
  test(`Python/TypeScript contract parity: ${fixture.name}`, () => {
    const parsed = sdkSubmissionSchema.safeParse(fixture.bundle);
    assert.equal(
      parsed.success,
      fixture.valid,
      parsed.success ? fixture.name : JSON.stringify(parsed.error),
    );
  });
}
