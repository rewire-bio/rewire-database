/**
 * Per-use-case leaderboard: row types and the arithmetic the table does on them.
 *
 * Rows are built from the release by lib/use-case-ranking.ts (pure) and lib/release-leaderboard.ts
 * (reads the pinned release). This module has no data and no file access, so the client
 * component can import it.
 *
 * Rules (#218, #229):
 * - One protocol per use case: one comparison, one column, one metric. Ranks never mix protocols.
 *   A directly relevant protocol is preferred; a proxy one is used, and labelled, only without one.
 * - Every ranked value is a result record in the release (source_record_id).
 * - "reproduced" only where a run receipt in the release names the result's evaluation or result.
 * - A baseline value, and the margin over it, only when the release scores the baseline on the
 *   same protocol. No null baselines, assay ceilings or capability index.
 */

import type { OperationalTelemetry } from "./operational-telemetry";

export const EPSILON = 1e-6;

export type MetricDirection = "higher" | "lower";

/** How far the release has checked the value: reproduced needs a run receipt in the release. */
export type ReviewStatus = "reproduced" | "source_checked" | "author_reported";

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  reproduced: "Reproduced",
  source_checked: "Source-checked",
  author_reported: "As reported, not yet checked",
};

/** The comparison and column a use case is ranked on. */
export interface RankingProtocol {
  /** The use-case comparison (presentation group) id. */
  comparison_id: string;
  /** The benchmark or study the values come from, as the use-case page titles it. */
  title: string;
  /** The column ranked on: the stratum label for strata tables, else the metric label. */
  column_label: string;
  metric: string;
  metric_label: string;
  direction: MetricDirection;
  endpoint: string;
  /**
   * "direct" when the use case's reviewers judged the protocol directly relevant, else "proxy".
   * "benchmark" on a benchmark board, which has no relevance judgement (lib/benchmark-ranking.ts).
   */
  relevance: "direct" | "proxy" | "benchmark";
}

/** The benchmark a benchmark board belongs to, and how much of it the board shows. */
export interface BenchmarkScope {
  id: string;
  name: string;
  href: string;
  /** The protocol record the board ranks. */
  protocol_id: string;
  protocol_href: string;
  /** Protocols that are part of the benchmark, and how many of them can be ranked without a judgement. */
  protocols: number;
  rankable: number;
  /** How the ranked tools were fitted, as the evaluations record it. */
  adaptations: string[];
  /** Evaluations left out because a scoped evidence concern names a record their value rests on. */
  withheld: number;
}

export interface RankingSource {
  id: string;
  name: string;
  href: string;
  doi: string | null;
}

/** A run receipt the result or its evaluation cites: an executed full-protocol run in the release. */
export interface RunReceipt {
  /** The receipt's source record. */
  id: string;
  name: string;
  href: string;
}

export interface OpenFinding {
  id: string;
  href: string;
  label: string;
}

export interface BiologicalModelRankingRow {
  /** The configuration the value belongs to; unique within a leaderboard. */
  model_id: string;
  model_name: string;
  /** What tells rows with the same name apart (database, threshold, backbone). */
  model_detail: string | null;
  model_href: string;
  /** The model, method or pipeline the configuration belongs to. */
  parent_id: string | null;
  use_case_slug: string;
  primary_metric_name: string;
  raw_metric_value: number | null;
  /** The value as the use-case table shows it. */
  display_value: string;
  /** Competition rank within the protocol (1, 2, 2, 4); null when the row has no value. */
  rank: number | null;
  /** Percent over the sourced baseline on the same protocol, direction-adjusted; null without one. */
  margin_over_conventional: number | null;
  telemetry: OperationalTelemetry;
  pareto_optimal: boolean;
  reviewed_status: ReviewStatus;
  /** The run receipt behind "reproduced"; null for every other status. */
  receipt: RunReceipt | null;
  /** Who produced the result: the origin of the evaluation the ranked value belongs to. */
  origin: string | null;
  /** True only when the origin is an independent study. Unreported is not independent, nor is a Rewire run. */
  independent: boolean;
  /** The result record the value is read from. */
  source_record_id: string;
  evaluation_id: string | null;
  /** The first source the result cites, shown in the row. */
  source: RankingSource | null;
  /** Every source the result cites. */
  source_ids: string[];
  /** Comparisons in this use case that score the tool, out of all the use case's comparisons. */
  coverage: { evaluated: number; relevant: number };
  open_findings: OpenFinding[];
  is_baseline: boolean;
  method_types: string[];
}

export interface UnrankedModel {
  model_id: string;
  model_name: string;
  model_href: string;
  coverage: { evaluated: number; relevant: number };
}

export interface LeaderboardBaseline {
  name: string;
  model_id: string;
  value: number;
  display_value: string;
  source_record_id: string;
}

export interface LeaderboardResult {
  use_case_slug: string;
  use_case_title: string;
  use_case_href: string;
  protocol: RankingProtocol | null;
  /** The one baseline row the release scores on this protocol, when there is exactly one. */
  baseline: LeaderboardBaseline | null;
  /** Ranked rows, best first. */
  rows: BiologicalModelRankingRow[];
  /** Tools evaluated elsewhere in the use case but not on this protocol: listed, not ranked. */
  unranked: UnrankedModel[];
  /** Why there is no ranking, when rows is empty. */
  empty_reason: string | null;
  /** Set on a benchmark board: the use_case_ fields then hold the benchmark's id, name and page. */
  benchmark?: BenchmarkScope;
}

/**
 * Direction-adjusted percent margin over a baseline value on the same protocol.
 * - When |baseline| > epsilon: d * ((model - baseline) / |baseline|) * 100
 * - When |baseline| <= epsilon: d * (model - baseline) * 100
 */
export function calculateConventionalMargin(
  sModel: number,
  sConv: number,
  direction: 1 | -1,
  epsilon = EPSILON
): number {
  if (Math.abs(sConv) <= epsilon) {
    return direction * (sModel - sConv) * 100;
  }
  return direction * ((sModel - sConv) / (Math.abs(sConv) + epsilon)) * 100;
}

export const directionSign = (direction: MetricDirection): 1 | -1 => (direction === "lower" ? -1 : 1);

export interface ParetoCandidate {
  id: string;
  /** Higher is better. */
  quality: number | null;
  /** Lower is better; null when not recorded. */
  cost: number | null;
}

/**
 * Non-dominated set on (quality, cost). Only candidates with a recorded positive cost take part,
 * so with no recorded latency nothing is marked.
 */
export function computeParetoOptimal(items: ParetoCandidate[]): Set<string> {
  const eligible = items.filter(
    (item): item is { id: string; quality: number; cost: number } =>
      item.cost !== null && Number.isFinite(item.cost) && item.cost > 0 &&
      item.quality !== null && Number.isFinite(item.quality)
  );
  const optimal = new Set<string>();
  for (const a of eligible) {
    const dominated = eligible.some(
      (b) => b.id !== a.id && b.quality >= a.quality && b.cost <= a.cost && (b.quality > a.quality || b.cost < a.cost)
    );
    if (!dominated) optimal.add(a.id);
  }
  return optimal;
}

/** Pareto flags for ranked rows: quality is the direction-adjusted value, cost the recorded latency. */
export function markParetoOptimal(rows: BiologicalModelRankingRow[], direction: MetricDirection): void {
  const sign = directionSign(direction);
  const optimal = computeParetoOptimal(rows.map((r) => ({
    id: r.model_id,
    quality: r.raw_metric_value === null ? null : sign * r.raw_metric_value,
    cost: r.telemetry.inference_latency_ms,
  })));
  for (const row of rows) row.pareto_optimal = optimal.has(row.model_id);
}

export interface BoardStats {
  /** Ranked rows: one per configuration. */
  rows: number;
  /** Distinct models, methods or pipelines behind the rows (a configuration with no parent counts as itself). */
  tools: number;
  /** Distinct sources the ranked results cite. */
  sources: number;
  /** Rows whose evaluation was run by an independent study. */
  independent: number;
  /** Rows whose evaluation records no origin, or records that the source does not say who ran it. */
  origin_unreported: number;
}

/** What a board rests on, counted from its ranked rows. */
export function boardStats(board: Pick<LeaderboardResult, "rows">): BoardStats {
  const { rows } = board;
  return {
    rows: rows.length,
    tools: new Set(rows.map((r) => r.parent_id ?? r.model_id)).size,
    sources: new Set(rows.flatMap((r) => r.source_ids)).size,
    independent: rows.filter((r) => r.independent).length,
    origin_unreported: rows.filter((r) => r.origin === null || r.origin === "unreported").length,
  };
}

/** "44 tools in 97 rows, from 1 source. 0 of 97 results come from an independent study; ..." */
export function boardStatsText(stats: BoardStats): string {
  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const tools = stats.tools === stats.rows ? plural(stats.tools, "tool") : `${plural(stats.tools, "tool")} in ${plural(stats.rows, "row")}`;
  const share = stats.rows ? ` (${Math.round((stats.independent / stats.rows) * 100)}%)` : "";
  const unreported = !stats.origin_unreported ? ""
    : stats.origin_unreported === stats.rows ? `; the release does not say who ran ${stats.rows === 1 ? "it" : "them"}`
    : `; the release does not say who ran ${stats.origin_unreported} of them`;
  return `${tools}, from ${plural(stats.sources, "source")}. ${stats.independent} of ${plural(stats.rows, "result")}${share} ${stats.independent === 1 ? "comes" : "come"} from an independent study${unreported}.`;
}

/** "AUROC on Feng Donor sequence classification", or with the stratum when it is not the metric. */
export function protocolLabel(protocol: RankingProtocol): string {
  const column = protocol.column_label && protocol.column_label !== protocol.metric_label ? `, ${protocol.column_label}` : "";
  return `${protocol.title}${column}`;
}
