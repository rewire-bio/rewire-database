/**
 * Builds a use case's leaderboard from its reviewed comparisons (lib/use-case-comparisons.ts),
 * the same tables the use-case page shows. Pure: records, findings and run receipts are passed in.
 */

import type { CatalogueRecord } from "@/shared/omics/catalogue-query";
import type { ResultContest } from "./discrepancy-helpers";
import { discrepancyHref } from "./discrepancy-helpers";
import { recordHref } from "./omics";
import { isIndependentOrigin } from "./result-origin";
import { telemetryFromRecord } from "./operational-telemetry";
import { isBaselineRow, type Comparison, type ComparisonRow } from "./use-case-comparisons";
import {
  calculateConventionalMargin,
  directionSign,
  markParetoOptimal,
  type BiologicalModelRankingRow,
  type LeaderboardBaseline,
  type LeaderboardResult,
  type MetricDirection,
  type OpenFinding,
  type RankingProtocol,
  type ReviewStatus,
  type UnrankedModel,
} from "./use-case-leaderboard";

export interface RankingInputs {
  slug: string;
  title: string;
  /** The use case's reviewed baseline methods (use_case.baseline.method_ids). */
  baselineIds: readonly string[];
  comparisons: Comparison[];
  record: (id: string) => CatalogueRecord | null;
  /** Findings each result takes part in (contestedResults). */
  findings: (resultIds: string[]) => Record<string, ResultContest[]>;
  /** Source ids of run receipts: executed full-protocol validation receipts in the release. */
  receiptSources: ReadonlySet<string>;
  /** Overrides ALLOW_PROXY_PROTOCOLS. */
  allowProxy?: boolean;
}

const valued = (row: ComparisonRow) => {
  const cell = row.cells[0];
  return !!cell && !cell.shown.missing && cell.value !== undefined && cell.value !== null && !!cell.resultId;
};
const toolKey = (row: ComparisonRow) => row.parentId ?? row.id;

/** Whether a use case with no directly relevant comparison is ranked on a proxy one (labelled as such). */
export const ALLOW_PROXY_PROTOCOLS = true;

/**
 * The comparison a use case is ranked on: its first column with a stated direction and at least
 * two tools with a value there. Directly relevant comparisons come first; a proxy one is used
 * only when no direct one qualifies (and ALLOW_PROXY_PROTOCOLS is on). Within a relevance, most
 * tools with a value wins, then a comparison that also scores the use case's baseline, then the id.
 */
export function selectRankingComparison(
  comparisons: Comparison[], baselineIds: readonly string[], allowProxy = ALLOW_PROXY_PROTOCOLS,
): Comparison | null {
  const baselines = new Set(baselineIds);
  const rankable = comparisons.filter((c) =>
    c.columns[0] && c.columns[0].direction !== "unknown" && c.rows.filter(valued).length >= 2);
  const hasBaseline = (c: Comparison) => Number(c.rows.some((r) => valued(r) && isBaselineRow(r, baselines)));
  const best = (list: Comparison[]) => [...list].sort((a, b) =>
    b.rows.filter(valued).length - a.rows.filter(valued).length || hasBaseline(b) - hasBaseline(a) || a.id.localeCompare(b.id))[0] ?? null;
  return best(rankable.filter((c) => c.relevance === "direct")) ?? (allowProxy ? best(rankable) : null);
}

function emptyReason(comparisons: Comparison[], allowProxy: boolean): string {
  if (!comparisons.length) return "No comparable results yet: no comparison has been collected for this use case.";
  if (!allowProxy && !comparisons.some((c) => c.relevance === "direct"))
    return "No comparison in this release is judged directly relevant to this use case, so nothing is ranked.";
  return "No comparison for this use case scores two or more tools on one metric with a stated direction, so nothing is ranked.";
}

const hrefOf = (record: CatalogueRecord | null, fallbackId: string) =>
  record ? recordHref(record) : recordHref({ kind: "configuration", id: fallbackId });

export function buildLeaderboard(inputs: RankingInputs): LeaderboardResult {
  const { slug, title, comparisons, record } = inputs;
  const base = { use_case_slug: slug, use_case_title: title, use_case_href: `/use-cases/${slug}/` };
  const allowProxy = inputs.allowProxy ?? ALLOW_PROXY_PROTOCOLS;
  const chosen = selectRankingComparison(comparisons, inputs.baselineIds, allowProxy);
  if (!chosen) return { ...base, protocol: null, baseline: null, rows: [], unranked: [], empty_reason: emptyReason(comparisons, allowProxy) };

  const direction = chosen.columns[0].direction as MetricDirection;
  const protocol: RankingProtocol = {
    comparison_id: chosen.id,
    title: chosen.title,
    column_label: chosen.columns[0].label,
    metric: chosen.headline.metric,
    metric_label: chosen.headline.label,
    direction,
    endpoint: chosen.endpoint,
    relevance: chosen.relevance,
  };

  // Coverage: of the comparisons judged relevant to the use case, how many score the tool at all.
  const coverageOf = (key: string) => ({
    evaluated: comparisons.filter((c) => c.rows.some((r) => toolKey(r) === key)).length,
    relevant: comparisons.length,
  });

  const ranked = chosen.rows.filter(valued);
  // Only the ranked value's findings: a row's other results (another metric of the same evaluation) are not what the rank rests on.
  const contests = inputs.findings(ranked.map((r) => r.cells[0].resultId!));
  const baselines = new Set(inputs.baselineIds);
  const sign = directionSign(direction);

  const rows: BiologicalModelRankingRow[] = [];
  ranked.forEach((row, index) => {
    const cell = row.cells[0];
    // The display-scale value, so a column mixing "0.94" and "94%" ranks and compares on one scale.
    const value = cell.value!;
    const previous = rows[index - 1];
    const rank = previous && previous.raw_metric_value === value ? previous.rank : index + 1;
    const result = record(cell.resultId!);
    const evaluation = cell.evaluationId ? record(cell.evaluationId) : null;
    const cited = [...(result?.source_ids ?? []), ...(evaluation?.source_ids ?? [])];
    // A receipt counts only when its source record is in the release, so the link always resolves.
    const receiptRecord = cited.filter((id) => inputs.receiptSources.has(id)).map(record).find((r) => !!r) ?? null;
    // The record's own "reproduced" status is not enough: only a cited run receipt is.
    const status: ReviewStatus = receiptRecord
      ? "reproduced"
      : result?.status === "source_checked" || result?.status === "reproduced" ? "source_checked" : "author_reported";
    // A row can hold several evaluations of one configuration; the origin is the ranked value's.
    // If that evaluation has none, the row has none: another evaluation's origin is not borrowed.
    const evaluationOrigin = evaluation?.attributes.origin;
    const origin = typeof evaluationOrigin === "string" && evaluationOrigin ? evaluationOrigin : null;
    const sourceRecord = result?.source_ids[0] ? record(result.source_ids[0]) : null;
    const parent = row.parentId ? record(row.parentId) : null;
    const findings = new Map<string, OpenFinding>();
    for (const { discrepancy } of contests[cell.resultId!] ?? [])
      if (!discrepancy.settled) findings.set(discrepancy.id, { id: discrepancy.id, href: discrepancyHref(discrepancy.id), label: discrepancy.label });
    rows.push({
      model_id: row.id,
      model_name: row.name,
      model_detail: row.detail,
      model_href: hrefOf(parent, row.id),
      parent_id: row.parentId,
      use_case_slug: slug,
      primary_metric_name: protocol.metric_label,
      raw_metric_value: value,
      display_value: cell.shown.text,
      rank,
      margin_over_conventional: null,
      telemetry: telemetryFromRecord(parent ?? record(row.id)),
      pareto_optimal: false,
      reviewed_status: status,
      receipt: receiptRecord ? { id: receiptRecord.id, name: receiptRecord.name, href: recordHref(receiptRecord) } : null,
      origin,
      independent: isIndependentOrigin(origin),
      source_record_id: cell.resultId!,
      evaluation_id: cell.evaluationId ?? null,
      source_ids: [...(result?.source_ids ?? [])],
      source: sourceRecord
        ? {
          id: sourceRecord.id,
          name: sourceRecord.name,
          href: recordHref(sourceRecord),
          doi: typeof sourceRecord.attributes.doi === "string" ? sourceRecord.attributes.doi : null,
        }
        : null,
      coverage: coverageOf(toolKey(row)),
      open_findings: [...findings.values()],
      is_baseline: isBaselineRow(row, baselines),
      method_types: row.methodTypes,
    });
  });

  // A margin needs exactly one baseline scored on this protocol; more than one has no single anchor.
  const baselineRows = rows.filter((r) => r.is_baseline);
  let baseline: LeaderboardBaseline | null = null;
  if (baselineRows.length === 1) {
    const b = baselineRows[0];
    baseline = { name: b.model_name, model_id: b.model_id, value: b.raw_metric_value!, display_value: b.display_value, source_record_id: b.source_record_id };
    for (const r of rows) if (!r.is_baseline) r.margin_over_conventional = calculateConventionalMargin(r.raw_metric_value!, baseline.value, sign);
  }
  markParetoOptimal(rows, direction);

  const rankedKeys = new Set(ranked.map(toolKey));
  const unranked = new Map<string, UnrankedModel>();
  for (const c of comparisons) for (const r of c.rows) {
    const key = toolKey(r);
    if (rankedKeys.has(key) || unranked.has(key)) continue;
    const owner = r.parentId ? record(r.parentId) : null;
    unranked.set(key, { model_id: key, model_name: owner?.name ?? r.name, model_href: hrefOf(owner, r.id), coverage: coverageOf(key) });
  }

  return {
    ...base,
    protocol,
    baseline,
    rows,
    unranked: [...unranked.values()].sort((a, b) => b.coverage.evaluated - a.coverage.evaluated || a.model_name.localeCompare(b.model_name)),
    empty_reason: null,
  };
}
