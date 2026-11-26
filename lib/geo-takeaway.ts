/**
 * Short answer statements for the homepage, use-case and model pages, and for search and LLM
 * readers. Every figure comes from a leaderboard built from the release
 * (lib/release-leaderboard.ts), and every sentence names the protocol, the metric and the source
 * the value was reported in. No sentence says a model "ranks #1" overall.
 */

import { NOT_RECORDED, licenceLabel, shortFact, type OperationalTelemetry } from "./operational-telemetry";
import {
  protocolLabel,
  type BiologicalModelRankingRow,
  type LeaderboardResult,
} from "./use-case-leaderboard";

export interface GeoTakeawayTriple {
  modelName: string;
  useCaseTitle: string;
  protocol: string;
  primaryMetricName: string;
  metricValue: string;
  source: string;
  sourceRecordId: string;
  reviewStatus: string;
}

export interface GeoHighlightItem {
  label: string;
  value: string;
  subtext: string;
}

export interface GeoTakeawayData {
  title: string;
  primaryStatement: string;
  secondaryStatement?: string;
  highlights?: GeoHighlightItem[];
  triple?: GeoTakeawayTriple;
}

const sourceName = (row: BiologicalModelRankingRow) => row.source?.name ?? "an unnamed source";

/** "on ProteinGym zero-shot DMS substitutions (Spearman), VenusREM scored 0.518, reported by <source>" */
const proxyNote = (board: LeaderboardResult) => (board.protocol?.relevance === "proxy" ? ", a proxy protocol" : "");

export function rowStatement(board: LeaderboardResult, row: BiologicalModelRankingRow): string {
  const protocol = board.protocol!;
  return `on ${protocolLabel(protocol)} (${protocol.metric_label}${proxyNote(board)}), ${row.model_name} scored ${row.display_value}, reported by ${sourceName(row)}`;
}

const best = (board: LeaderboardResult) => board.rows.filter((r) => r.rank === board.rows[0]?.rank);

/** The best value on the board, with ties named together. */
export function leadStatement(board: LeaderboardResult): string {
  const leaders = best(board);
  if (leaders.length === 1) return rowStatement(board, leaders[0]);
  const protocol = board.protocol!;
  return `on ${protocolLabel(protocol)} (${protocol.metric_label}${proxyNote(board)}), ${leaders.map((r) => r.model_name).join(" and ")} share the best value, ${leaders[0].display_value}, reported by ${sourceName(leaders[0])}`;
}

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Factual statements for one use case's leaderboard. */
export function generateUseCaseTakeaway({ leaderboard }: { leaderboard: LeaderboardResult }): GeoTakeawayData {
  const board = leaderboard;
  if (!board.protocol || !board.rows.length) {
    return {
      title: "Executive Takeaway",
      primaryStatement: `No ranking for "${board.use_case_title}" in this release. ${board.empty_reason ?? ""}`.trim(),
    };
  }
  const top = board.rows[0];
  const independent = board.rows.filter((r) => r.independent).length;
  const proxy = board.protocol.relevance === "proxy" ? " Reviewers judged this protocol a proxy for the use case." : "";
  const baseline = board.baseline
    ? ` The use case's baseline, ${board.baseline.name}, scored ${board.baseline.display_value} on the same protocol.`
    : " No baseline method is scored on this protocol.";
  return {
    title: "Executive Takeaway",
    primaryStatement: `For "${board.use_case_title}", ${leadStatement(board)}.`,
    secondaryStatement: `${board.rows.length} ${board.rows.length === 1 ? "tool has" : "tools have"} a value on this protocol; ${independent} of them come from studies whose authors did not develop the tool.${baseline}${proxy}`,
    highlights: [
      { label: "Best reported value", value: top.model_name, subtext: shortFact(sourceName(top), 60) },
      { label: board.protocol.metric_label, value: top.display_value, subtext: protocolLabel(board.protocol) },
      board.baseline
        ? { label: "Baseline on this protocol", value: board.baseline.name, subtext: board.baseline.display_value }
        : { label: "Baseline on this protocol", value: "None scored", subtext: "No margin is computed" },
      { label: "Ranked tools", value: String(board.rows.length), subtext: `${independent} from independent studies` },
    ],
    triple: {
      modelName: top.model_name,
      useCaseTitle: board.use_case_title,
      protocol: protocolLabel(board.protocol),
      primaryMetricName: board.protocol.metric_label,
      metricValue: top.display_value,
      source: sourceName(top),
      sourceRecordId: top.source_record_id,
      reviewStatus: top.reviewed_status,
    },
  };
}

/** One statement per homepage leaderboard. */
export function generateHomepageTakeaway(boards: LeaderboardResult[]): GeoTakeawayData {
  const ranked = boards.filter((b) => b.protocol && b.rows.length);
  if (!ranked.length) {
    return { title: "Benchmark Takeaway", primaryStatement: "No use case has a ranking in this release yet." };
  }
  return {
    title: "Benchmark Takeaway",
    primaryStatement: ranked.map((b) => `For "${b.use_case_title}", ${leadStatement(b)}.`).join(" "),
    secondaryStatement:
      "Each use case is ranked on one protocol only; values are never compared across protocols. Every value links to its result record and source.",
    highlights: ranked.map((b) => ({
      label: b.use_case_title,
      value: b.rows[0].model_name,
      subtext: `${b.protocol!.metric_label} ${b.rows[0].display_value} on ${shortFact(b.protocol!.title, 48)}`,
    })),
  };
}

const ordinalOf = (row: BiologicalModelRankingRow, board: LeaderboardResult) =>
  `position ${row.rank} of ${board.rows.length} on this protocol`;

/** What a model's ranked results say, or, without any, what its record carries. */
export function generateModelTakeaway(
  record: { id: string; name: string },
  rankings: { board: LeaderboardResult; row: BiologicalModelRankingRow }[],
  telemetry: OperationalTelemetry,
): GeoTakeawayData {
  if (rankings.length) {
    const [first, ...rest] = rankings;
    const others = rest.length
      ? ` It also has ranked values in ${rest.length} other ${rest.length === 1 ? "use case" : "use cases"}: ${rest.map(({ board }) => board.use_case_title).join(", ")}.`
      : "";
    return {
      title: "Model Benchmark Takeaway",
      primaryStatement: `${capitalise(rowStatement(first.board, first.row))} (${ordinalOf(first.row, first.board)} for "${first.board.use_case_title}").${others}`,
      secondaryStatement: `Recorded parameters: ${(telemetry.parameters ?? NOT_RECORDED).replace(/\.$/, "")}. ${licenceLabel(telemetry, "Licence")}: ${telemetry.license ?? NOT_RECORDED}.`,
    };
  }
  return {
    title: "Model Deployment Profile",
    primaryStatement: `${record.name} has no ranked result on a use-case protocol in this release.`,
    secondaryStatement: `Recorded parameters: ${(telemetry.parameters ?? NOT_RECORDED).replace(/\.$/, "")}. ${licenceLabel(telemetry, "Licence")}: ${telemetry.license ?? NOT_RECORDED}.`,
  };
}
