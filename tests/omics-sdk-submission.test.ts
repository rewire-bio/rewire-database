import { describe, expect, it } from "vitest";
import { sdkSubmissionSchema } from "../services/omics/src/sdk-submission";

const tdcRevision = "c310c35f27e3f506411018ac43d97b8ba23ca652";
const genomicRevision = "605d8539830e16c85abe7826990958303ffc5e1c";

// Synthetic submission fixtures, not scientific results or real data digests.
function bundle(genomic = false, multiclass = false) {
  return {
    schema_version: "1.0",
    kind: "rewire_benchmark_submission",
    protocol_id: genomic ? "genomic-benchmarks-v2" : "tdc-admet-group-v1",
    protocol_version: genomic ? "2" : tdcRevision,
    dataset_id: genomic
      ? `genomic-benchmarks-${multiclass ? "human_ensembl_regulatory" : "human_nontata_promoters"}`
      : "tdc-admet-caco2_wang",
    scope: "full",
    completion: "complete",
    model: { name: "Synthetic test", training_overlap: "unreported" },
    metrics: genomic
      ? multiclass
        ? { accuracy: 0.5, f1_macro: 0.5, f1_weighted: 0.5, n: 2 }
        : { accuracy: 0.5, f1: 0.5, n: 2 }
      : { mae: 0.5, n: 2 },
    coverage: { denominator: 2, scored: 2, unscored: 0 },
    provenance: {
      upstream_revision: genomic ? genomicRevision : tdcRevision,
      test_sha256: "a".repeat(64),
      train_sha256: "b".repeat(64),
    },
    evaluation_claim: "local_evaluation_not_paper_reproduction",
    data_verification: "local_bytes_hashed_not_independently_source_verified",
    execution_status: "imported_predictions",
    review_status: "unreviewed_contribution",
    independently_reproduced: false,
    prepared_sha256: "c".repeat(64),
    predictions_sha256: "d".repeat(64),
  };
}

describe("local-copy SDK submission contracts", () => {
  it.each([
    [false, false],
    [true, false],
    [true, true],
  ])(
    "accepts prescribed metrics and partial local-copy coverage (genomic=%s, multiclass=%s)",
    (genomic, multiclass) => {
      const input = bundle(genomic, multiclass);
      expect(sdkSubmissionSchema.safeParse(input).success).toBe(true);
      expect(
        sdkSubmissionSchema.safeParse({
          ...input,
          completion: "partial",
          coverage: { denominator: 5, scored: 2, unscored: 3 },
        }).success,
      ).toBe(true);
    },
  );

  it.each([
    ["hia_hou", "roc-auc", 0.75],
    ["cyp2c9_veith", "pr-auc", 0.25],
    ["vdss_lombardo", "spearman", -0.5],
    ["ld50_zhu", "mae", 2.5],
  ])("accepts TDC's metric for %s", (dataset, metric, value) => {
    expect(
      sdkSubmissionSchema.safeParse({
        ...bundle(),
        dataset_id: `tdc-admet-${dataset}`,
        metrics: { [metric]: value, n: 2 },
      }).success,
    ).toBe(true);
  });

  it.each([
    { protocol_id: "genomic-benchmarks-v1" },
    { protocol_version: "unreviewed" },
    { dataset_id: "tdc-admet-private_dataset" },
    { dataset_id: "tdc-admet-toString" },
    { evaluation_claim: undefined },
    { evaluation_claim: "paper_reproduction" },
    { data_verification: "pinned_source_bytes" },
    { data_verification: undefined },
    { provenance: { test_sha256: "a".repeat(64) } },
    { provenance: { upstream_revision: tdcRevision } },
    { metrics: { "roc-auc": 0.5, n: 2 } },
    { metrics: { mae: 0.5 } },
    { metrics: { mae: 0.5, n: 1 } },
    { metrics: { mae: 0.5, n: 2.5 } },
    { metrics: { mae: -0.1, n: 2 } },
    { metrics: { mae: null, n: 2 } },
    { metrics: { mae: Infinity, n: 2 } },
    { metrics: { mae: Number.NaN, n: 2 } },
    { metrics: { mae: true, n: 2 } },
    { metrics: { mae: 0.5, n: 2, private_sequence: 1 } },
    { metrics: { mae: { private_sequence: 1 }, n: 2 } },
    {
      completion: "complete",
      coverage: { denominator: 5, scored: 2, unscored: 3 },
    },
  ])("refuses unsupported claims, identities and metrics: %j", (change) => {
    expect(
      sdkSubmissionSchema.safeParse({ ...bundle(), ...change }).success,
    ).toBe(false);
  });

  it.each([
    ["hia_hou", "roc-auc", 1.1],
    ["cyp2c9_veith", "pr-auc", -0.1],
    ["vdss_lombardo", "spearman", -1.1],
  ])("refuses invalid metric range for %s", (dataset, metric, value) => {
    expect(
      sdkSubmissionSchema.safeParse({
        ...bundle(),
        dataset_id: `tdc-admet-${dataset}`,
        metrics: { [metric]: value, n: 2 },
      }).success,
    ).toBe(false);
  });

  it("checks Genomic Benchmarks averaging, version, identity and source hashes", () => {
    const binary = bundle(true);
    for (const change of [
      { protocol_version: genomicRevision },
      { dataset_id: "genomic-benchmarks-private_dataset" },
      { metrics: { accuracy: 1.1, f1: 1, n: 2 } },
      { metrics: { accuracy: 0.5, f1_macro: 0.5, n: 2 } },
      { metrics: { accuracy: 0.5, f1: -0.1, n: 2 } },
      {
        provenance: {
          upstream_revision: genomicRevision,
          test_sha256: "a".repeat(64),
        },
      },
    ])
      expect(
        sdkSubmissionSchema.safeParse({ ...binary, ...change }).success,
      ).toBe(false);
    expect(
      sdkSubmissionSchema.safeParse({
        ...bundle(true, true),
        metrics: { accuracy: 0.5, f1: 0.5, n: 2 },
      }).success,
    ).toBe(false);
  });
});

describe("SDK provenance privacy", () => {
  it.each([
    "/private/customer/checkpoint_sha256",
    "model_/private/customer/checkpoint_sha256",
    "private_customer_revision",
    "unknown_sha256",
    "constructor",
  ])(
    "rejects non-allowlisted names even with valid digest values: %s",
    (key) => {
      const input = bundle();
      expect(
        sdkSubmissionSchema.safeParse({
          ...input,
          provenance: {
            ...input.provenance,
            [key]: "a".repeat(key.endsWith("_revision") ? 40 : 64),
          },
        }).success,
      ).toBe(false);
    },
  );

  it("preserves the supported model digests and legacy protocol revision", () => {
    const input = bundle();
    const provenance = {
      ...input.provenance,
      protocol_revision: "a".repeat(40),
      model_checkpoint_revision: "b".repeat(40),
      model_code_revision: "c".repeat(40),
      model_checkpoint_sha256: "d".repeat(64),
      model_implementation_sha256: "e".repeat(64),
      model_weights_sha256: "f".repeat(64),
      model_configuration_sha256: "1".repeat(64),
    };
    expect(
      sdkSubmissionSchema.parse({ ...input, provenance }).provenance,
    ).toEqual(provenance);
    expect(
      sdkSubmissionSchema.safeParse({
        ...input,
        provenance: {
          ...provenance,
          model_checkpoint_revision: "b".repeat(64),
        },
      }).success,
    ).toBe(false);
  });
});
