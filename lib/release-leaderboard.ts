/**
 * Use-case leaderboards read from the pinned release. Server only: it opens the release file.
 * The rows are built by lib/use-case-ranking.ts from the same comparisons the use-case pages show.
 */

import type { CatalogueRecord } from "@/shared/omics/catalogue-query";
import type { UseCaseDetail } from "@/shared/omics/use-cases";
import { buildCatalogue } from "./catalogue-build";
import { contestedResults } from "./discrepancies";
import { buildComparisons, type Comparison } from "./use-case-comparisons";
import { boardStats, type BiologicalModelRankingRow, type LeaderboardResult } from "./use-case-leaderboard";
import { buildLeaderboard } from "./use-case-ranking";
import { buildUseCases, fullUseCaseDetail } from "./use-cases-build";

type Query = ReturnType<typeof buildCatalogue>["query"];
type Instruction = { status?: string; validation_receipt?: { source_id?: string; scope?: string } };
type Recipe = { instructions?: Instruction[] };

let receipts: { query: Query; sources: Set<string> } | undefined;

/**
 * Source ids of the release's run receipts (ADR 0005): validation receipts on executed run-recipe
 * instructions that cover the full protocol. A result counts as reproduced only when it, or its
 * evaluation, cites one of these sources.
 */
export function runReceiptSources(query: Query = buildCatalogue().query): Set<string> {
  if (receipts?.query === query) return receipts.sources;
  const sources = new Set<string>();
  const ofKind = (query as Partial<Query>).recordsOfKind;
  for (const kind of ["benchmark", "protocol", "task", "evaluator", "model", "pipeline"])
    for (const record of ofKind ? ofKind(kind) : [])
      for (const recipe of (record.attributes.run_recipes as Recipe[] | undefined) ?? [])
        for (const step of recipe.instructions ?? [])
          if (step.status === "executed" && step.validation_receipt?.scope === "full_protocol" && step.validation_receipt.source_id)
            sources.add(step.validation_receipt.source_id);
  receipts = { query, sources };
  return sources;
}

/** The leaderboard for a use case whose detail (and, optionally, comparisons) a page already holds. */
export function leaderboardForDetail(detail: UseCaseDetail, comparisons: Comparison[] = buildComparisons(detail.mappings)): LeaderboardResult {
  const { query } = buildCatalogue();
  const seen = new Map<string, CatalogueRecord | null>();
  const record = (id: string) => {
    if (!seen.has(id)) seen.set(id, query.record?.(id) ?? null);
    return seen.get(id)!;
  };
  return buildLeaderboard({
    slug: detail.use_case.slug,
    title: detail.use_case.title,
    baselineIds: detail.use_case.baseline?.method_ids ?? [],
    comparisons,
    record,
    findings: (ids) => contestedResults(ids),
    receiptSources: runReceiptSources(query),
  });
}

// Per release and process: one use case's board is built on first use (about 50 ms each on the
// 2026-11-18 release), and the full set once for model pages and the LLM files (about 1.3 s).
let boards: { query: Query; value: Map<string, LeaderboardResult | null>; complete: boolean } | undefined;

function cache() {
  const { query } = buildCatalogue();
  if (boards?.query !== query) boards = { query, value: new Map(), complete: false };
  return boards;
}

export function leaderboardForUseCase(slug: string): LeaderboardResult | null {
  const { value } = cache();
  if (!value.has(slug)) {
    const detail = fullUseCaseDetail(slug);
    value.set(slug, detail ? leaderboardForDetail(detail) : null);
  }
  return value.get(slug)!;
}

/** Every use case's leaderboard, in the release's use-case order. */
export function allUseCaseLeaderboards(): LeaderboardResult[] {
  const state = cache();
  const entries = buildUseCases().entries ?? [];
  if (!state.complete) {
    for (const entry of entries) leaderboardForUseCase(entry.slug);
    state.complete = true;
  }
  return entries.map((e) => state.value.get(e.slug)).filter((b): b is LeaderboardResult => !!b);
}

/**
 * The use cases the homepage shows a board for, in this order within each relevance.
 *
 * Chosen from what the 2026-11-20 release can rank. Direct boards: every use case whose ranked
 * comparison is judged directly relevant and scores at least ten tools, except hit discovery (the
 * metric is a hit count with differing denominators) and phenotype perturbation selection
 * (anonymous challenge entries, all reported by their authors). Proxy boards: those that also
 * score at least ten tools, with five or more foundation-model rows and most rows from independent
 * studies. BRCA1 and BRCA2 interpretation qualifies too but ranks on the same protocol as the
 * missense board.
 * The /use-cases/<category>/ aliases (CATEGORY_SLUG_MAP) are separate and unchanged.
 */
export const HOME_LEADERBOARD_SLUGS = [
  "protein-variant-effect-prediction",
  "tumour-dna-somatic-variant-detection",
  "protein-variant-stability",
  "tumour-rna-fusion-detection",
  "regulatory-variant-gene-follow-up",
  "missense-pp3-bp4-calibrated-evidence",
] as const;

/** A homepage board ranks at least this many distinct tools; a thinner one stays on its use-case page. */
export const MIN_HOME_TOOLS = 5;

/**
 * Homepage leaderboards: the listed use cases that rank enough tools in this release, directly
 * relevant protocols first. A proxy board is never promoted: it keeps its relevance and its label.
 */
export function homeLeaderboards(): LeaderboardResult[] {
  return HOME_LEADERBOARD_SLUGS.map(leaderboardForUseCase)
    .filter((b): b is LeaderboardResult => !!b && boardStats(b).tools >= MIN_HOME_TOOLS)
    .sort((a, b) => Number(b.protocol?.relevance === "direct") - Number(a.protocol?.relevance === "direct"));
}

/** A model's, method's or configuration's best-ranked row on each leaderboard it appears on. */
export function rankingsForRecord(id: string): { board: LeaderboardResult; row: BiologicalModelRankingRow }[] {
  return allUseCaseLeaderboards().flatMap((board) => {
    // Rows are in rank order, so the first match is the best of the record's configurations.
    const row = board.rows.find((r) => r.model_id === id || r.parent_id === id);
    return row ? [{ board, row }] : [];
  });
}
