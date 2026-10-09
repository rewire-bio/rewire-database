import test from "node:test";
import assert from "node:assert/strict";
import { contribution } from "../src/contribution.js";
import { sdkSubmissionSchema } from "../src/sdk-submission.js";
import { sdkBundle as bundle } from "./fixtures.js";
test("SDK bundle preserves self-reported provenance while rejecting private extras and upgraded review", () => {
  assert.ok(sdkSubmissionSchema.safeParse(bundle).success);
  for (const change of [
    { token: "private" },
    { predictions: [0.1] },
    { model: { ...bundle.model, path: "/private/weights" } },
    { review_status: "source_checked" },
    { independently_reproduced: true },
    { metrics: { path: "/private/data" } },
    { provenance: { weights_path: "private" } },
    { coverage: { denominator: 100, scored: 99, unscored: 0 } },
    { scope: "smoke" },
    { metrics: {} },
    { metrics: { auroc: null } },
    { metrics: { "": 1 } },
    { metrics: { a: { b: { c: { d: { e: { f: { g: 1 } } } } } } } },
    {
      coverage: { denominator: 100, scored: 0, unscored: 100 },
      completion: "partial",
    },
    { data_verification: "independently_reproduced" },
  ])
    assert.equal(
      sdkSubmissionSchema.safeParse({ ...bundle, ...change }).success,
      false,
    );
});
test("SDK results use the existing evidence-required contribution envelope", () => {
  const input = {
    type: "result",
    title: "Private model evaluation",
    summary: "A locally evaluated model submitted for review.",
    source_urls: ["https://example.org/results"],
    public_credit: false,
    details: {
      model: "Private model",
      benchmark: "MFASS",
      protocol: "mfass-v2",
      metric: "AUROC",
      value: "0.77",
      source_locator: "Supplement Table 1",
      rewire_bundle: bundle,
    },
  };
  assert.ok(contribution.safeParse(input).success);
  assert.equal(
    contribution.safeParse({ ...input, source_urls: [] }).success,
    false,
  );
  assert.equal(
    contribution.safeParse({ ...input, type: "benchmark" }).success,
    false,
  );
  assert.equal(
    contribution.safeParse({
      ...input,
      details: {
        ...input.details,
        rewire_bundle: { ...bundle, private_notes: "private" },
      },
    }).success,
    false,
  );
});

test("metric keys cannot disguise private predictions or machine paths", () => {
  for (const metrics of [
    { predictions: { private_sequence_id: 0.9 } },
    { n: 100, capacity: 10 },
    { "/private/checkpoint": 0.5 },
    { auroc: { row_1: 0.3 } },
  ])
    assert.equal(
      sdkSubmissionSchema.safeParse({ ...bundle, metrics }).success,
      false,
    );
  const pg = {
    ...bundle,
    protocol_id: "proteingym-v1.3-dms-substitutions",
    scope: "subset",
    completion: "partial",
    coverage: { denominator: 2972, scored: 2972, unscored: 0 },
    metrics: {
      per_assay: {
        AMFR_HUMAN_Tsuboyama_2023_4G3O: {
          metrics: { Spearman: 0.7, AUC: null },
          scored: 2972,
          denominator: 2972,
        },
      },
    },
  };
  assert.ok(sdkSubmissionSchema.safeParse(pg).success);
  assert.equal(
    sdkSubmissionSchema.safeParse({
      ...pg,
      metrics: {
        per_assay: {
          private_sample_1: {
            metrics: { Spearman: 0.7 },
            scored: 100,
            denominator: 100,
          },
        },
      },
    }).success,
    false,
  );
  assert.equal(
    sdkSubmissionSchema.safeParse({
      ...pg,
      metrics: {
        per_assay: {
          AMFR_HUMAN_Tsuboyama_2023_4G3O: {
            metrics: { Spearman: 0.7 },
            scored: 99,
            denominator: 100,
          },
        },
      },
    }).success,
    false,
  );
  assert.equal(
    sdkSubmissionSchema.safeParse({
      ...pg,
      metrics: {
        per_assay: {
          AMFR_HUMAN_Tsuboyama_2023_4G3O: {
            metrics: { Spearman: null },
            scored: 100,
            denominator: 100,
          },
        },
      },
    }).success,
    false,
  );
});
