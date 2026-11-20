/**
 * Benchmark boards: one protocol of a benchmark, ranked on the metric its protocol record names.
 *
 * A use-case board rests on a reviewed relevance judgement, which picks the protocol, the headline
 * metric and the evaluations to compare. A benchmark board has no judgement behind it, so it is
 * built only where the records leave nothing to choose (checkProtocol). Where a choice would be
 * needed, the protocol is not ranked and the reason is kept.
 *
 * Pure: records, findings, concerns and run receipts are passed in. lib/benchmark-leaderboard.ts
 * reads them from the pinned release.
 */

import type { CatalogueRecord, ResultRow } from "@/shared/omics/catalogue-query";
import type { ResolvedMapping } from "@/shared/omics/use-cases";
import { evidencePath, sourceWideConcern } from "@/shared/omics/concerns";
import { recordHref } from "./omics";
import { buildComparisons } from "./use-case-comparisons";
import type { BenchmarkScope, LeaderboardResult } from "./use-case-leaderboard";
import { buildLeaderboard, type RankingInputs } from "./use-case-ranking";

/** A benchmark board ranks at least this many distinct tools. */
export const MIN_BENCHMARK_TOOLS = 5;

const CHECKED = new Set(["source_checked", "reproduced"]);
/** Parts of an evaluation's comparison block that every row of one ranking must share. */
const SHARED_SETTINGS = ["dataset_version", "split", "population", "metric_implementation", "aggregation", "budget"] as const;
const PARENT_RELATIONS = ["configuration_of", "family", "variant_of"];

export type ProtocolCheck =
  | { rankable: true; mapping: ResolvedMapping; tools: number; adaptations: string[]; withheld: number }
  | { rankable: false; reason: string };

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/** The records an evaluation's system links name: configurations, or a model, method, pipeline or service tested as it stands. */
function tested(row: ResultRow): CatalogueRecord[] {
  const systems = new Set(row.evaluation!.links.filter((l) => l.relation === "system").map((l) => l.target_id));
  const linked = new Map([...row.configurations, ...row.models, ...row.methods, ...row.pipelines, ...row.services]
    .filter((r) => systems.has(r.id)).map((r) => [r.id, r]));
  return linked.size === systems.size ? [...linked.values()] : [];
}

/**
 * Whether a protocol's results can be ranked without a judgement, and if so the comparison input.
 * `rows` are every result recorded against the protocol; `concerned` holds the ids that scoped
 * evidence concerns name. An evaluation whose ranked result rests on a concerned record is left
 * out, as it is on a use-case page. Of the rest, all of these must hold:
 * - the protocol record is source-checked and names its metric and the metric's direction;
 * - every evaluation is source-checked, assesses this protocol and tests one configuration, model
 *   or method, and none is evaluated twice;
 * - every evaluation has exactly one source-checked result in that metric, with the stated
 *   direction and the same qualifier, so the ranking is one column;
 * - the evaluations share the dataset version, split, population, metric implementation,
 *   aggregation and budget, and every foundation model (or tool of unrecorded type) was adapted
 *   the same way;
 * - the ranked results cite the same sources, each source-checked and free of a source-wide concern;
 * - at least MIN_BENCHMARK_TOOLS distinct tools have a number.
 */
export function checkProtocol(
  protocol: CatalogueRecord, rows: ResultRow[], record: (id: string) => CatalogueRecord | null, concerned: ReadonlySet<string> = new Set(),
): ProtocolCheck {
  const no = (reason: string): ProtocolCheck => ({ rankable: false, reason });
  const metric = text(protocol.attributes.metric);
  const direction = protocol.attributes.metric_direction;
  if (!CHECKED.has(protocol.status)) return no("The protocol record is not source-checked.");
  if (!metric || (direction !== "higher" && direction !== "lower")) return no("The protocol record does not name one metric and its direction.");
  if (!rows.length) return no("No result is recorded against the protocol.");

  type Entry = { evaluation: CatalogueRecord; configurations: CatalogueRecord[]; results: ResultRow[] };
  const byEvaluation = new Map<string, Entry>();
  for (const row of rows) {
    if (!row.evaluation) return no("A result has no evaluation record.");
    const entry = byEvaluation.get(row.evaluation.id) ?? { evaluation: row.evaluation, configurations: tested(row), results: [] };
    if (CHECKED.has(row.result.status)) entry.results.push(row);
    byEvaluation.set(row.evaluation.id, entry);
  }
  const isConcerned = (row: ResultRow) => evidencePath(row.result, row.evaluation, [protocol]).some((id) => concerned.has(id));
  const evaluations = [...byEvaluation.values()].filter((e) => !e.results.some((r) => r.result.attributes.metric === metric && isConcerned(r)));
  const withheld = byEvaluation.size - evaluations.length;
  if (!evaluations.length) return no("Every result is withheld by an evidence concern.");

  const configurations = new Set<string>();
  const tools = new Set<string>();
  const qualifiers = new Set<string>();
  const cited = new Set<string>();
  const shared = new Map<string, Set<string>>(SHARED_SETTINGS.map((key) => [key, new Set<string>()]));
  const modelAdaptations = new Set<string>();
  const adaptations = new Set<string>();
  for (const { evaluation, configurations: systems, results } of evaluations) {
    if (!CHECKED.has(evaluation.status)) return no("An evaluation is not source-checked.");
    if (!evaluation.links.some((l) => l.relation === "assessment" && l.target_id === protocol.id))
      return no("A result reaches the protocol through another record, not through an evaluation of the protocol.");
    if (systems.length !== 1) return no("An evaluation does not test exactly one configuration, model or method.");
    const [configuration] = systems;
    if (configurations.has(configuration.id)) return no("A configuration is evaluated more than once, so a row would have to be chosen.");
    configurations.add(configuration.id);

    const ranked = results.filter((r) => r.result.attributes.metric === metric);
    if (ranked.length !== 1) return no(`An evaluation does not have exactly one source-checked ${metric} result, so a column would have to be chosen.`);
    const attributes = ranked[0].result.attributes;
    if (attributes.metric_direction !== direction) return no("A ranked result states a direction other than the protocol's.");
    // A cell the source leaves empty is shown as not reported and is not ranked.
    if (Number.isFinite(Number(text(attributes.numeric_value) || NaN)))
      tools.add(configuration.links.find((l) => PARENT_RELATIONS.includes(l.relation))?.target_id ?? configuration.id);
    qualifiers.add(text(attributes.metric_qualifier));
    cited.add(JSON.stringify([...ranked[0].result.source_ids].sort()));

    const block = (evaluation.attributes.comparison ?? {}) as Record<string, unknown>;
    for (const key of SHARED_SETTINGS) shared.get(key)!.add(JSON.stringify(block[key] ?? null));
    const adaptation = text(block.adaptation);
    if (adaptation) adaptations.add(adaptation);
    const types = configuration.facets?.method_types ?? [];
    if (!types.length || types.includes("foundation_model")) modelAdaptations.add(adaptation);
  }

  if (qualifiers.size !== 1) return no(`The ${metric} results are reported for more than one stratum, so a column would have to be chosen.`);
  const differing = SHARED_SETTINGS.filter((key) => shared.get(key)!.size > 1);
  if (differing.length) return no(`The evaluations differ in ${differing.join(", ").replace(/_/g, " ")}.`);
  if (modelAdaptations.size > 1) return no("The foundation models were adapted in more than one way, so the rows are not one comparison.");
  if (cited.size !== 1) return no("The ranked results cite different sources.");
  for (const id of JSON.parse([...cited][0]) as string[]) {
    const source = record(id);
    if (!source || source.kind !== "source" || !CHECKED.has(source.status)) return no("A cited source is not source-checked.");
    if (sourceWideConcern(source)) return no("A cited source carries an evidence concern over everything it supports.");
  }
  if (tools.size < MIN_BENCHMARK_TOOLS) return no(`Fewer than ${MIN_BENCHMARK_TOOLS} tools have a number.`);

  const limitations = Array.isArray(protocol.attributes.limitations) ? protocol.attributes.limitations.map(String) : [];
  // The shape the use-case comparison builder reads. The title and the headline metric are the
  // protocol record's own, and there is no relevance, because no judgement was made.
  const mapping = {
    id: protocol.id, lifecycle: "active", protocol_id: protocol.id, evaluation_ids: evaluations.map((e) => e.evaluation.id),
    endpoint: "", limitations, constraints: [], citations: [],
    presentation: { group: protocol.id, title: protocol.name, headline_metric: metric },
    protocol, task: null, sources: [],
    evaluations: evaluations.map((e) => ({
      ...e, results: e.results.filter((r) => !isConcerned(r)), results_total: e.results.length, results_next_cursor: null,
    })),
  } as unknown as ResolvedMapping;
  return { rankable: true, mapping, tools: tools.size, adaptations: [...adaptations].sort(), withheld };
}

export interface BenchmarkBoardInputs extends Pick<RankingInputs, "record" | "findings" | "receiptSources"> {
  benchmark: CatalogueRecord;
  /** Every protocol that is part of the benchmark, with every result recorded against it. */
  protocols: { protocol: CatalogueRecord; rows: ResultRow[] }[];
  /** Ids named by scoped evidence concerns on any source in the release. */
  concerned?: ReadonlySet<string>;
}

export interface BenchmarkBoard {
  /** The ranking, or null when no protocol of the benchmark can be ranked without a judgement. */
  board: LeaderboardResult | null;
  /** Each protocol of the benchmark, and why it is not ranked when it is not. */
  protocols: { id: string; name: string; rankable: boolean; reason: string | null }[];
}

/**
 * A benchmark's board: of its rankable protocols, the one that scores the most configurations
 * (then the first by id), the same rule a use case's protocol is picked by. Coverage counts the
 * benchmark's rankable protocols, and the other rankable protocols' tools are listed unranked.
 */
export function buildBenchmarkBoard({ benchmark, protocols, record, findings, receiptSources, concerned }: BenchmarkBoardInputs): BenchmarkBoard {
  const checks = protocols.map(({ protocol, rows }) => ({ protocol, check: checkProtocol(protocol, rows, record, concerned) }));
  const summary = checks.map(({ protocol, check }) => ({
    id: protocol.id, name: protocol.name, rankable: check.rankable, reason: check.rankable ? null : check.reason,
  }));
  const rankable = checks.flatMap(({ protocol, check }) => (check.rankable ? [{ protocol, check }] : []));
  if (!rankable.length) return { board: null, protocols: summary };

  const built = buildLeaderboard({
    slug: benchmark.id, title: benchmark.name, baselineIds: [],
    comparisons: buildComparisons(rankable.map(({ check }) => check.mapping)),
    record, findings, receiptSources, allowProxy: true,
  });
  const chosen = rankable.find(({ protocol }) => protocol.id === built.protocol?.comparison_id);
  // The comparison builder does not rank a column whose values it cannot read as numbers.
  if (!built.protocol || !chosen) return { board: null, protocols: summary };
  const scope: BenchmarkScope = {
    id: benchmark.id, name: benchmark.name, href: recordHref(benchmark),
    protocol_id: chosen.protocol.id, protocol_href: recordHref(chosen.protocol),
    protocols: protocols.length, rankable: rankable.length,
    adaptations: chosen.check.adaptations, withheld: chosen.check.withheld,
  };
  return {
    board: { ...built, use_case_href: scope.href, protocol: { ...built.protocol, relevance: "benchmark" }, benchmark: scope },
    protocols: summary,
  };
}
