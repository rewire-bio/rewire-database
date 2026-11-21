/**
 * Benchmark boards read from the pinned release. Server only: it opens the release file.
 * The rule for what can be ranked is in lib/benchmark-ranking.ts.
 */

import type { CatalogueRecord, ResultRow } from "@/shared/omics/catalogue-query";
import { concernTargets } from "@/shared/omics/concerns";
import { buildBenchmarkBoard, type BenchmarkBoard } from "./benchmark-ranking";
import { buildCatalogue } from "./catalogue-build";
import { contestedResults } from "./discrepancies";
import { runReceiptSources } from "./release-leaderboard";
import type { LeaderboardResult } from "./use-case-leaderboard";

type Query = ReturnType<typeof buildCatalogue>["query"];

/**
 * Benchmarks the homepage shows a board for: those with foundation-model results in the
 * 2026-11-20 release whose protocols no use case is linked to, and which the release lets the site
 * rank without a judgement. A benchmark that stops meeting the rule in a later release has no board.
 *
 * Checked and not listed, because no protocol passes the rule yet:
 * - ViroBench: its source carries two concerns that are not scoped to the records they are about;
 * - GENEB leaderboard: each evaluation has 15 values of the metric (13 categories and two averages);
 * - Evo 2 human variant effect strata: the protocol records name no metric (AUROC and AUPRC are both stored).
 */
export const HOME_BENCHMARK_IDS = [
  "gfm-guides-20261014-esm1b-benchmark-brandes2023-clinical-missense",
  "lit-genomics-20261011-guanine-benchmark-guanine-v1-1",
  "discovery-benchmark-mrnabench",
] as const;

// Per release and process, like the use-case boards. The scoped concerns are read once from the
// release's source records.
let cached: { query: Query; value: Map<string, BenchmarkBoard | null>; concerned?: ReadonlySet<string> } | undefined;

function allResults(query: Query, id: string): ResultRow[] {
  const rows: ResultRow[] = [];
  let cursor: string | undefined;
  do {
    const page = query.results({ id, limit: 100, ...(cursor ? { cursor } : {}) });
    rows.push(...page.items);
    cursor = page.next_cursor || undefined;
  } while (cursor);
  return rows;
}

/** A benchmark's board and the state of each of its protocols; null when the release has no such benchmark. */
export function benchmarkBoard(id: string): BenchmarkBoard | null {
  const { query } = buildCatalogue();
  if (cached?.query !== query) cached = { query, value: new Map() };
  const { value } = cached;
  const state = cached;
  if (!value.has(id)) {
    const detail = query.get({ id, include_comparisons: false });
    if (!detail || detail.record.kind !== "benchmark") value.set(id, null);
    else {
      const seen = new Map<string, CatalogueRecord | null>();
      const record = (recordId: string) => {
        if (!seen.has(recordId)) seen.set(recordId, query.record(recordId) ?? null);
        return seen.get(recordId)!;
      };
      const protocols = detail.reverse
        .filter((link) => link.relation === "part_of" && (link.record.kind === "protocol" || link.record.kind === "task"))
        .flatMap((link) => {
          const protocol = record(link.record.id);
          return protocol ? [{ protocol, rows: allResults(query, protocol.id) }] : [];
        });
      value.set(id, buildBenchmarkBoard({
        benchmark: detail.record, protocols, record,
        concerned: (state.concerned ??= concernTargets(query.recordsOfKind("source"))),
        findings: (ids) => contestedResults(ids),
        receiptSources: runReceiptSources(query),
      }));
    }
  }
  return value.get(id)!;
}

/** Homepage benchmark boards: the listed benchmarks the release can rank, in the listed order. */
export function homeBenchmarkBoards(): LeaderboardResult[] {
  return HOME_BENCHMARK_IDS.flatMap((id) => {
    const board = benchmarkBoard(id)?.board;
    return board ? [board] : [];
  });
}
