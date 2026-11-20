// Synthetic leaderboards for UI tests. Names and values are invented and never rendered on the site;
// the release-backed rows are tested in tests/catalogue/release-leaderboard.test.ts.
import { EMPTY_TELEMETRY, type OperationalTelemetry } from "../../../lib/operational-telemetry";
import type { BiologicalModelRankingRow, LeaderboardResult } from "../../../lib/use-case-leaderboard";

export function fixtureRow(overrides: Partial<BiologicalModelRankingRow> & { model_id: string }): BiologicalModelRankingRow {
  return {
    model_name: `Fixture ${overrides.model_id}`,
    model_detail: null,
    model_href: `/database/model/${overrides.model_id}/`,
    parent_id: null,
    use_case_slug: "fixture-variant-effect",
    primary_metric_name: "Spearman",
    raw_metric_value: 0.5,
    display_value: "0.500",
    rank: 1,
    margin_over_conventional: null,
    telemetry: { ...EMPTY_TELEMETRY },
    pareto_optimal: false,
    reviewed_status: "source_checked",
    receipt: null,
    origin: "independent_paper",
    independent: true,
    source_record_id: `fixture-result-${overrides.model_id}`,
    evaluation_id: `fixture-evaluation-${overrides.model_id}`,
    source: { id: "fixture-source", name: "Fixture study of variant effect predictors", href: "/database/source/fixture-source/", doi: "10.0000/fixture" },
    source_ids: ["fixture-source"],
    coverage: { evaluated: 1, relevant: 2 },
    open_findings: [],
    is_baseline: false,
    method_types: ["foundation_model"],
    ...overrides,
  };
}

const telemetry = (overrides: Partial<OperationalTelemetry>): OperationalTelemetry => ({ ...EMPTY_TELEMETRY, ...overrides });

/** Higher is better, with one baseline, recorded hardware on two rows, and one open finding. */
export const VARIANT_BOARD: LeaderboardResult = {
  use_case_slug: "fixture-variant-effect",
  use_case_title: "Fixture variant effect",
  use_case_href: "/use-cases/fixture-variant-effect/",
  protocol: {
    comparison_id: "fixture-dms",
    title: "Fixture DMS substitutions",
    column_label: "All assays",
    metric: "spearman",
    metric_label: "Spearman",
    direction: "higher",
    endpoint: "Fitness of substitutions",
    relevance: "direct",
  },
  baseline: { name: "Fixture alignment baseline", model_id: "baseline-a", value: 0.4, display_value: "0.400", source_record_id: "fixture-result-baseline-a" },
  rows: [
    fixtureRow({
      model_id: "alpha", model_name: "Alpha", raw_metric_value: 0.6, display_value: "0.600", rank: 1, margin_over_conventional: 50,
      telemetry: telemetry({ min_vram_gb: 16, inference_latency_ms: 40, open_weights: true, license: "MIT", parameters: "650M" }),
      reviewed_status: "reproduced", origin: "rewire_run", independent: false,
      receipt: { id: "fixture-receipt", name: "Fixture full-protocol run", href: "/database/source/fixture-receipt/" },
      open_findings: [{ id: "finding-1", href: "/contested/finding-1/", label: "Alpha disagrees with two other studies" }],
    }),
    fixtureRow({
      model_id: "beta", model_name: "Beta", raw_metric_value: 0.55, display_value: "0.550", rank: 2, margin_over_conventional: 37.5,
      telemetry: telemetry({ min_vram_gb: 40, inference_latency_ms: 120, open_weights: false, license: "Proprietary" }),
      origin: "author_reported", independent: false,
    }),
    fixtureRow({
      model_id: "gamma", model_name: "Gamma", raw_metric_value: 0.55, display_value: "0.550", rank: 2, margin_over_conventional: 37.5,
      telemetry: telemetry({ license: "MIT", license_scope: "code" }),
      origin: "unreported", independent: false,
    }),
    fixtureRow({
      model_id: "baseline-a", model_name: "Fixture alignment baseline", raw_metric_value: 0.4, display_value: "0.400", rank: 4, is_baseline: true,
      method_types: ["baseline"],
    }),
  ],
  unranked: [{ model_id: "delta", model_name: "Delta", model_href: "/database/model/delta/", coverage: { evaluated: 1, relevant: 2 } }],
  empty_reason: null,
};

/** Lower is better, a proxy protocol, no baseline and no recorded hardware. */
export const RUNTIME_BOARD: LeaderboardResult = {
  use_case_slug: "fixture-runtime",
  use_case_title: "Fixture runtime",
  use_case_href: "/use-cases/fixture-runtime/",
  protocol: {
    comparison_id: "fixture-runtime-table",
    title: "Fixture pipeline runtimes",
    column_label: "Read mapping",
    metric: "runtime",
    metric_label: "Runtime",
    direction: "lower",
    endpoint: "",
    relevance: "proxy",
  },
  baseline: null,
  rows: [
    fixtureRow({ model_id: "fast", model_name: "Fast pipeline", use_case_slug: "fixture-runtime", primary_metric_name: "Runtime", raw_metric_value: 14, display_value: "14 min", rank: 1 }),
    fixtureRow({ model_id: "slow", model_name: "Slow pipeline", use_case_slug: "fixture-runtime", primary_metric_name: "Runtime", raw_metric_value: 90, display_value: "90 min", rank: 2 }),
  ],
  unranked: [],
  empty_reason: null,
};

export const EMPTY_BOARD: LeaderboardResult = {
  use_case_slug: "fixture-empty",
  use_case_title: "Fixture empty",
  use_case_href: "/use-cases/fixture-empty/",
  protocol: null,
  baseline: null,
  rows: [],
  unranked: [],
  empty_reason: "No comparable results yet: no comparison has been collected for this use case.",
};

/** A benchmark board: a benchmark's own protocol, with no use case, baseline or relevance judgement. */
export const BENCHMARK_BOARD: LeaderboardResult = {
  use_case_slug: "fixture-benchmark",
  use_case_title: "Fixture benchmark",
  use_case_href: "/database/benchmark/fixture-benchmark/",
  protocol: {
    comparison_id: "fixture-benchmark-protocol",
    title: "Fixture benchmark host classification",
    column_label: "Macro F1",
    metric: "macro-f1",
    metric_label: "Macro F1",
    direction: "higher",
    endpoint: "",
    relevance: "benchmark",
  },
  baseline: null,
  rows: [
    fixtureRow({ model_id: "probe-a", model_name: "Probe A", use_case_slug: "fixture-benchmark", primary_metric_name: "Macro F1", raw_metric_value: 71, display_value: "71.0", rank: 1, coverage: { evaluated: 2, relevant: 3 } }),
    fixtureRow({ model_id: "probe-b", model_name: "Probe B", use_case_slug: "fixture-benchmark", primary_metric_name: "Macro F1", raw_metric_value: 64, display_value: "64.0", rank: 2, origin: "author_reported", independent: false, coverage: { evaluated: 3, relevant: 3 } }),
  ],
  unranked: [{ model_id: "probe-c", model_name: "Probe C", model_href: "/database/model/probe-c/", coverage: { evaluated: 1, relevant: 3 } }],
  empty_reason: null,
  benchmark: {
    id: "fixture-benchmark", name: "Fixture benchmark", href: "/database/benchmark/fixture-benchmark/",
    protocol_id: "fixture-benchmark-protocol", protocol_href: "/database/protocol/fixture-benchmark-protocol/",
    protocols: 5, rankable: 3, adaptations: ["Frozen embeddings with a linear probe", "Trained from scratch"], withheld: 1,
  },
};
