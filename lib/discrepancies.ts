import { buildCatalogue } from "./catalogue-build";
import { discrepancyStates, severities, type DiscrepancySummary } from "../shared/omics/discrepancies";
import type { PreparedCatalogue } from "../shared/omics/prepared-catalogue";

export { overdue } from "./discrepancy-dates";
export type { Discrepancy, DiscrepancyAction, DiscrepancySummary } from "../shared/omics/discrepancies";

/** Discrepancies between studies, read from the pinned release's prepared file (contract 3.3).
 * The knowledge-graph build infers them; the serving build copies them into SQL tables. A finding
 * is a lead to investigate. It marks results as contested and never withholds them. Files older
 * than 3.3 have none, and every reader here returns empty for them. */
export type DiscrepancyReader = Pick<
  PreparedCatalogue,
  "hasDiscrepancies" | "discrepancyRules" | "discrepancies" | "discrepancy" | "contestedBy" | "discrepanciesForSystem"
>;

/** The pinned release's reader, through buildCatalogue so pages and their tests share one source. */
export const discrepancyReader = (): DiscrepancyReader => buildCatalogue().query;

export const STATE_LABELS: Record<string, string> = {
  open: "Not yet reviewed",
  investigating: "Under investigation",
  "reported-upstream": "Reported to the authors",
  "awaiting-correction": "Awaiting a correction",
  explained: "Explained",
  "confirmed-error": "Confirmed error",
  "false-positive": "Not a real disagreement",
};
export const stateLabel = (state: string) => STATE_LABELS[state] ?? state;

export const ACTION_LABELS: Record<string, string> = {
  investigated: "Investigated",
  "contacted-authors": "Contacted the authors",
  "reported-upstream": "Reported to the authors",
  "awaiting-correction": "Waiting for a correction",
  reran: "Reran the evaluation",
  "corrected-records": "Corrected the records",
  closed: "Closed",
};
export const actionLabel = (action: string | null) => (action ? ACTION_LABELS[action] ?? action : "Review");

export const RULE_LABELS: Record<string, string> = {
  "ordering-reversal": "Ordering reversal",
  "gap-outlier": "Gap outlier",
};
export const ruleLabel = (rule: string) => RULE_LABELS[rule] ?? rule;

export const SCOPE_LABELS: Record<string, string> = {
  "same-protocol": "Same protocol in both studies",
  "same-task": "Same task, different protocols",
  "cross-task": "Different tasks across studies",
};
export const scopeLabel = (scope: string) => SCOPE_LABELS[scope] ?? scope;

export const severityLabel = (severity: string) => `${severity[0]?.toUpperCase() ?? ""}${severity.slice(1)} severity`;

/** The data repository's reference for the rules, states and follow-up actions. */
export const DISCREPANCIES_DOC = "https://github.com/rewire-bio/rewire-benchmark-data/blob/main/docs/discrepancies.md";

export const discrepancyHref = (id: string) => `/contested/${encodeURIComponent(id)}/`;

/** The list filters, as /contested/ reads them from its search parameters. Unknown values are dropped. */
export type ContestedFilters = { severity?: string; state?: string; settled?: "open" | "settled"; system?: string; cursor?: string };

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) || undefined;
const recordId = /^[a-z0-9][a-z0-9-]{0,254}$/;

export function contestedFilters(params: Record<string, string | string[] | undefined>): ContestedFilters {
  const severity = one(params.severity);
  const state = one(params.state);
  const settled = one(params.status);
  const system = one(params.system);
  const cursor = one(params.cursor);
  return {
    ...(severity && (severities as readonly string[]).includes(severity) ? { severity } : {}),
    ...(state && (discrepancyStates as readonly string[]).includes(state) ? { state } : {}),
    ...(settled === "open" || settled === "settled" ? { settled } : {}),
    ...(system && recordId.test(system) ? { system } : {}),
    ...(cursor && cursor.length <= 200 ? { cursor } : {}),
  };
}

/** The search string for a filtered list, keeping the other filters; `cursor` is never carried over. */
export function contestedQuery(filters: ContestedFilters, change: Partial<Record<keyof ContestedFilters, string | undefined>> = {}) {
  const merged = { ...filters, cursor: undefined, ...change };
  const params = new URLSearchParams();
  if (merged.severity) params.set("severity", merged.severity);
  if (merged.state) params.set("state", merged.state);
  if (merged.settled) params.set("status", merged.settled);
  if (merged.system) params.set("system", merged.system);
  if (merged.cursor) params.set("cursor", merged.cursor);
  const search = params.toString();
  return `/contested/${search ? `?${search}` : ""}`;
}

export const CONTESTED_PAGE_SIZE = 50;

/** One page of findings for /contested/, plus the release-wide counts for its header. */
export function contestedList(filters: ContestedFilters, reader: DiscrepancyReader = discrepancyReader()) {
  if (!reader.hasDiscrepancies()) return null;
  const all = reader.discrepancies({ limit: 500 });
  const { cursor, ...rest } = filters;
  let page: ReturnType<DiscrepancyReader["discrepancies"]>;
  try {
    page = reader.discrepancies({ ...rest, cursor, limit: CONTESTED_PAGE_SIZE });
  } catch {
    // A cursor from another release or a hand-edited URL starts the list again.
    page = reader.discrepancies({ ...rest, limit: CONTESTED_PAGE_SIZE });
  }
  const settled = reader.discrepancies({ settled: "settled", limit: 1 }).total;
  return {
    page,
    totals: { all: all.total, open: all.total - settled, settled, severity: all.counts.severity, state: all.counts.state },
    /** Every system any finding compares, for the model filter. */
    systems: [...new Set(all.items.flatMap((d) => d.systems))],
    rules: reader.discrepancyRules(),
  };
}

/** Every finding's page, in stored order: the sitemap and the build check list the same paths. */
export function contestedPaths(reader: DiscrepancyReader = discrepancyReader()): string[] {
  if (!reader.hasDiscrepancies()) return [];
  const paths: string[] = [];
  let cursor: string | undefined;
  do {
    const page = reader.discrepancies({ limit: 500, cursor });
    paths.push(...page.items.map((d) => discrepancyHref(d.id)));
    cursor = page.next_cursor ?? undefined;
  } while (cursor);
  return paths;
}

/** Findings with an investigation of our own: an issue or dated review linked from a follow-up action. */
export function investigatedFindings(reader: DiscrepancyReader = discrepancyReader()) {
  if (!reader.hasDiscrepancies()) return [];
  return reader.discrepancies({ limit: 500 }).items
    .filter((d) => d.actions > 0)
    .flatMap((d) => {
      const url = reader.discrepancy(d.id)?.actions.map((a) => a.investigation_url).filter((u): u is string => !!u).pop();
      return url ? [{ discrepancy: d, investigation_url: url }] : [];
    });
}

export type ResultContest = { discrepancy: DiscrepancySummary; role: string };

/** The findings each result takes part in, as outlier or consensus, settled or not. */
export function contestedResults(resultIds: readonly string[], reader: DiscrepancyReader = discrepancyReader()) {
  return reader.hasDiscrepancies() ? reader.contestedBy(resultIds) : {};
}

/** The unsettled findings in which these results are the disagreeing study's: what a
 * "Contested" badge on a use-case row means. Deduplicated, in stored order (most severe first). */
export function contestingFindings(resultIds: readonly string[], byResult: Record<string, ResultContest[]>): DiscrepancySummary[] {
  const found = new Map<string, DiscrepancySummary>();
  for (const id of resultIds)
    for (const { discrepancy, role } of byResult[id] ?? [])
      if (role === "outlier" && !discrepancy.settled) found.set(discrepancy.id, discrepancy);
  const order = (s: string) => (severities as readonly string[]).indexOf(s);
  return [...found.values()].sort((a, b) => order(a.severity) - order(b.severity));
}

/** Unsettled findings that compare this model, method or configuration. */
export function openFindingsForSystem(systemId: string, reader: DiscrepancyReader = discrepancyReader()): DiscrepancySummary[] {
  return reader.hasDiscrepancies() ? reader.discrepanciesForSystem(systemId).filter((d) => !d.settled) : [];
}

/** The date the latest follow-up action asks to check again, while the finding is unsettled. */
export function pendingCheck(d: { settled: boolean; actions: { next_check: string | null }[] }): string | null {
  return d.settled ? null : d.actions[d.actions.length - 1]?.next_check ?? null;
}
