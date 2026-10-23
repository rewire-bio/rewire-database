import { buildCatalogue } from "./catalogue-build";
import { catalogueText } from "./catalogue-text";
import { disagreement, shortCitation, type Disagreement } from "./disagreement";
import { recordHref, safeSourceUrl } from "./omics";
import {
  discrepanciesPage, discrepancyStates, severities, type DiscrepanciesInput, type Discrepancy, type DiscrepancySummary,
} from "../shared/omics/discrepancies";
import type { PreparedCatalogue } from "../shared/omics/prepared-catalogue";

export { overdue } from "./discrepancy-dates";
export type { Discrepancy, DiscrepancyAction, DiscrepancyStudy, DiscrepancySummary } from "../shared/omics/discrepancies";
export type { Disagreement } from "./disagreement";

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
export type ContestedFilters = {
  severity?: string; state?: string;
  /** "open", "settled" (settled but not resolved) or "resolved". */
  settled?: "open" | "settled" | "resolved";
  system?: string;
  /** A use case's slug: findings in which any of its results takes part, in either role. */
  use_case?: string;
  cursor?: string;
};

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) || undefined;
const recordId = /^[a-z0-9][a-z0-9-]{0,254}$/;

export function contestedFilters(params: Record<string, string | string[] | undefined>): ContestedFilters {
  const severity = one(params.severity);
  const state = one(params.state);
  const settled = one(params.status);
  const system = one(params.system);
  const cursor = one(params.cursor);
  const useCase = one(params.use_case);
  return {
    ...(severity && (severities as readonly string[]).includes(severity) ? { severity } : {}),
    ...(state && (discrepancyStates as readonly string[]).includes(state) ? { state } : {}),
    ...(settled === "open" || settled === "settled" || settled === "resolved" ? { settled } : {}),
    ...(system && recordId.test(system) ? { system } : {}),
    ...(useCase && recordId.test(useCase) ? { use_case: useCase } : {}),
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
  if (merged.use_case) params.set("use_case", merged.use_case);
  if (merged.cursor) params.set("cursor", merged.cursor);
  const search = params.toString();
  return `/contested/${search ? `?${search}` : ""}`;
}

export const CONTESTED_PAGE_SIZE = 50;

/** Every finding matching the filters, across all pages, in stored order. */
function allFindings(reader: DiscrepancyReader, filters: Omit<DiscrepanciesInput, "cursor" | "limit">) {
  const items: DiscrepancySummary[] = [];
  let cursor: string | undefined;
  do {
    const page = reader.discrepancies({ ...filters, limit: 500, cursor });
    items.push(...page.items);
    cursor = page.next_cursor ?? undefined;
  } while (cursor);
  return items;
}

/** One page of findings for /contested/, plus the release-wide counts for its header.
 * Resolved findings never share the main list: they are its own page with status "resolved", and
 * with no status or "settled" come back in `resolved`, filtered the same way, for their own section.
 * `resultsOfUseCase` gives a use case's result IDs by slug, or null when there is no such use case. */
export function contestedList(
  filters: ContestedFilters,
  reader: DiscrepancyReader = discrepancyReader(),
  resultsOfUseCase: (slug: string) => string[] | null = () => null,
) {
  if (!reader.hasDiscrepancies()) return null;
  const all = reader.discrepancies({ limit: 500 });
  const resolvedCount = allFindings(reader, { settled: "settled" }).filter((d) => d.resolved).length;
  const { cursor, use_case, settled: status, ...rest } = filters;
  // The findings a use case's results take part in: few enough to list on one page.
  const involved = use_case
    ? new Set(Object.values(reader.contestedBy(resultsOfUseCase(use_case) ?? [])).flat().map((c) => c.discrepancy.id))
    : null;
  const matching = (settled: "open" | "settled" | undefined) =>
    allFindings(reader, { ...rest, settled }).filter((d) => !involved || involved.has(d.id));
  const resolvedMatches = matching("settled").filter((d) => d.resolved);
  let page: ReturnType<DiscrepancyReader["discrepancies"]>;
  if (status === "resolved") page = discrepanciesPage(all.release_id, resolvedMatches, { limit: 500 });
  else if (involved || resolvedCount) {
    const items = matching(status).filter((d) => !d.resolved);
    try {
      page = discrepanciesPage(all.release_id, items, { cursor: involved ? undefined : cursor, limit: involved ? 500 : CONTESTED_PAGE_SIZE });
    } catch {
      page = discrepanciesPage(all.release_id, items, { limit: CONTESTED_PAGE_SIZE });
    }
  } else {
    try {
      page = reader.discrepancies({ ...rest, settled: status, cursor, limit: CONTESTED_PAGE_SIZE });
    } catch {
      // A cursor from another release or a hand-edited URL starts the list again.
      page = reader.discrepancies({ ...rest, settled: status, limit: CONTESTED_PAGE_SIZE });
    }
  }
  const settled = reader.discrepancies({ settled: "settled", limit: 1 }).total;
  return {
    page,
    /** Resolved findings for their own section below the list of all or settled findings. */
    resolved: !status || status === "settled" ? resolvedMatches : [],
    totals: {
      all: all.total, open: all.total - settled, settled: settled - resolvedCount, resolved: resolvedCount,
      severity: all.counts.severity, state: all.counts.state,
    },
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

/** A use case's result IDs, from its resolved mappings (the rows its comparison tables show). */
export function resultIdsOfUseCase(detail: { mappings: { evaluations: { results: { result: { id: string } }[] }[] }[] } | null): string[] | null {
  return detail ? detail.mappings.flatMap((m) => m.evaluations.flatMap((e) => e.results.map((r) => r.result.id))) : null;
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

/** A link's short name: "owner/repo#N" for a GitHub issue or pull request, otherwise the host name. */
export function linkLabel(url: string): string | null {
  let parsed: URL;
  try { parsed = new URL(url); } catch { return null; }
  if (!["https:", "http:"].includes(parsed.protocol)) return null;
  const host = parsed.hostname.replace(/^www\./, "");
  const github = host === "github.com" && parsed.pathname.match(/^\/([^/]+)\/([^/]+)\/(?:issues|pull)\/(\d+)/);
  return github ? `${github[1]}/${github[2]}#${github[3]}` : host;
}

/** A study's role in a finding, in words: the outlier disagrees with the consensus studies, which agree. */
export const studyRoleLabel = (role: string) => (role === "outlier" ? "Disagrees" : "Agrees");

/** What a finding's studies show, with their source records and named records resolved from the
 * pinned release. Null for a finding without per-study data. */
export function disagreementOf(d: Discrepancy): Disagreement | null {
  const { query } = buildCatalogue();
  const name = (id: string) => {
    const record = query.record(id);
    return record ? { name: catalogueText(record.name), href: recordHref(record) } : { name: catalogueText(id), href: null };
  };
  return disagreement(d, (study) => {
    const records = study.source_ids.flatMap((id) => {
      const record = query.record(id);
      return record ? [record] : [];
    });
    const [first, ...rest] = records;
    const fallback = study.key.replace(/^(doi|repository|source):/, "");
    const title = first ? catalogueText(first.name) : fallback;
    return {
      name: title,
      short: first ? shortCitation(title, first.attributes.year) : fallback,
      href: first ? recordHref(first) : null,
      url: safeSourceUrl(first?.attributes.url) ?? studyKeyUrl(study.key),
      more: rest.map((r) => ({ name: catalogueText(r.name), href: recordHref(r) })),
    };
  }, name);
}

/** Where a study key points when its source records do not say: a DOI or a repository. */
export function studyKeyUrl(key: string): string | null {
  if (key.startsWith("doi:")) return `https://doi.org/${key.slice(4)}`;
  if (key.startsWith("repository:")) return /^https?:\/\//.test(key.slice(11)) ? key.slice(11) : null;
  return null;
}
