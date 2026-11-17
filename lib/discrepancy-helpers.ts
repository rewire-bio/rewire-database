import { severities, type DiscrepancySummary } from "../shared/omics/discrepancies";

export type { DiscrepancySummary } from "../shared/omics/discrepancies";

export const discrepancyHref = (id: string) => `/contested/${encodeURIComponent(id)}/`;

export type ResultContest = { discrepancy: DiscrepancySummary; role: string };

/**
 * The unsettled findings in which these results are the disagreeing study's: what a
 * "Contested" badge on a use-case row means. Deduplicated, in stored order (most severe first).
 */
export function contestingFindings(
  resultIds: readonly string[],
  byResult: Record<string, ResultContest[]>
): DiscrepancySummary[] {
  const found = new Map<string, DiscrepancySummary>();
  for (const id of resultIds)
    for (const { discrepancy, role } of byResult[id] ?? [])
      if (role === "outlier" && !discrepancy.settled) found.set(discrepancy.id, discrepancy);
  const order = (s: string) => (severities as readonly string[]).indexOf(s);
  return [...found.values()].sort((a, b) => order(a.severity) - order(b.severity));
}
