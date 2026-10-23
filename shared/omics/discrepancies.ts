/** Discrepancies between studies, as the serving database stores and returns them.
 *
 * The knowledge-graph build infers them (scripts/kg/contradictions.py) and writes
 * public/kg/discrepancies.json; the serving build copies that file into the
 * discrepancy tables (contract 3.3). Each finding carries its follow-up history:
 * one action per accepted revision of its `discrepancy_review` claims. Files
 * written before the history existed (schema 1) only carry the latest review,
 * which becomes a single action. Schema 3 adds each finding's per-study breakdown
 * (`studies`); earlier files read as having none. docs/discrepancies.md describes the whole feature. */

export const discrepancyStates = [
  "open", "investigating", "reported-upstream", "awaiting-correction", "explained", "confirmed-error", "false-positive",
] as const;
export const settledStates = ["explained", "confirmed-error", "false-positive"] as const;
export const severities = ["high", "medium", "low"] as const;

export type DiscrepancyAction = {
  revision: number;
  claim_id: string | null;
  /** What was done (data/vocab/discrepancy-action.ttl); null for a review that only set a state. */
  action: string | null;
  /** The finding's state after this action. */
  state: string;
  date: string | null;
  rationale: string | null;
  investigation_url: string | null;
  report_url: string | null;
  upstream_response: string | null;
  awaiting: string | null;
  expected_by: string | null;
  next_check: string | null;
  resolved_by: string[];
};

/** One comparison of the finding's two systems in one study: their best values in one group of results. */
export type DiscrepancyComparison = {
  protocol: string | null;
  dataset: string | null;
  metric: string | null;
  unit: string | null;
  qualifier: string | null;
  split: string | null;
  /** System ID to its best value. */
  values: Record<string, number>;
  /** System ID to the result that value comes from. */
  results: Record<string, string>;
  /** The system that scored better; null for a tie. */
  higher: string | null;
};

/** A study that compared the finding's two systems, and how its comparisons came out. */
export type DiscrepancyStudy = {
  /** The study key: doi:..., repository:... or source:... */
  key: string;
  role: "outlier" | "consensus";
  source_ids: string[];
  /** System ID (as in `systems`) to the number of comparisons in which it scored better. */
  higher: Record<string, number>;
  ties: number;
  /** Gap rule only: the study's median relative gap to the reference. */
  gap: number | null;
  comparisons_total: number;
  /** At most 200; `comparisons_total` counts them all. */
  comparisons: DiscrepancyComparison[];
};

export type Discrepancy = {
  id: string;
  previous_ids: string[];
  rule: string;
  label: string;
  summary: string;
  severity: string;
  scope: string;
  identity_basis: string;
  state: string;
  settled: boolean;
  systems: string[];
  consensus_higher: string | null;
  reference_system: string | null;
  outlier_sources: string[];
  consensus_sources: string[];
  outlier_results: string[];
  consensus_results: string[];
  numbers: Record<string, unknown>;
  /** Outlier study first, then the others, most comparisons first. Empty before schema 3. */
  studies?: DiscrepancyStudy[];
  /** Oldest first. Empty while no one has reviewed the finding. */
  actions: DiscrepancyAction[];
};

export type DiscrepancyFile = {
  release_id: string;
  schema_version: number;
  rules: { version?: unknown; [key: string]: unknown };
  excluded: { disputed: number; concern: number } | null;
  discrepancies: Discrepancy[];
};

const text = (value: unknown) => (value === undefined || value === null || value === "" ? null : String(value));
const texts = (value: unknown) => (Array.isArray(value) ? value.map(String) : value ? [String(value)] : []);

function action(raw: Record<string, unknown>, fallbackState: string): DiscrepancyAction {
  return {
    revision: Number(raw.revision ?? 1),
    claim_id: text(raw.claim_id),
    action: text(raw.action),
    state: text(raw.state) ?? fallbackState,
    date: text(raw.date ?? raw.reported_on),
    rationale: text(raw.rationale),
    investigation_url: text(raw.investigation_url),
    report_url: text(raw.report_url),
    upstream_response: text(raw.upstream_response),
    awaiting: text(raw.awaiting),
    expected_by: text(raw.expected_by),
    next_check: text(raw.next_check),
    resolved_by: texts(raw.resolved_by),
  };
}

/** The knowledge-graph build's discrepancies.json, in the form the serving tables hold. */
export function normaliseDiscrepancies(raw: Record<string, unknown>): DiscrepancyFile {
  const list = Array.isArray(raw.discrepancies) ? (raw.discrepancies as Record<string, unknown>[]) : [];
  const discrepancies = list.map((d): Discrepancy => {
    const state = text(d.review_state ?? d.state) ?? "open";
    const actions = Array.isArray(d.actions)
      ? (d.actions as Record<string, unknown>[]).map((a) => action(a, state)).sort((a, b) => a.revision - b.revision)
      : d.review_claim
        ? [action({ ...(d.resolution as Record<string, unknown> | undefined), claim_id: d.review_claim, state }, state)]
        : [];
    return {
      id: String(d.id),
      previous_ids: texts(d.previous_ids),
      rule: String(d.rule),
      label: String(d.label ?? d.id),
      summary: String(d.summary ?? ""),
      severity: String(d.severity),
      scope: String(d.scope ?? ""),
      identity_basis: String(d.identity_basis ?? ""),
      state,
      settled: (settledStates as readonly string[]).includes(state),
      systems: texts(d.systems),
      consensus_higher: text(d.consensus_higher),
      reference_system: text(d.reference_system),
      outlier_sources: texts(d.outlier_sources),
      consensus_sources: texts(d.consensus_sources),
      outlier_results: texts(d.outlier_results),
      consensus_results: texts(d.consensus_results),
      numbers: (d.numbers as Record<string, unknown>) ?? {},
      studies: Array.isArray(d.studies) ? (d.studies as DiscrepancyStudy[]) : [],
      actions,
    };
  });
  const order = (s: string) => (severities as readonly string[]).indexOf(s);
  discrepancies.sort((a, b) => order(a.severity) - order(b.severity) || a.rule.localeCompare(b.rule) || a.id.localeCompare(b.id));
  const excluded = raw.excluded as { disputed?: number; concern?: number } | undefined;
  return {
    release_id: String(raw.release_id),
    schema_version: Number(raw.schema_version ?? 1),
    rules: (raw.rules as DiscrepancyFile["rules"]) ?? {},
    excluded: excluded ? { disputed: Number(excluded.disputed ?? 0), concern: Number(excluded.concern ?? 0) } : null,
    discrepancies,
  };
}

/** The list entry for one finding: everything but its numbers and action details. */
export type DiscrepancySummary = Pick<
  Discrepancy,
  "id" | "rule" | "label" | "summary" | "severity" | "scope" | "state" | "settled" | "systems"
> & { actions: number; last_action_date: string | null; next_check: string | null };

export function summarise(d: Discrepancy): DiscrepancySummary {
  const last = d.actions[d.actions.length - 1];
  return {
    id: d.id, rule: d.rule, label: d.label, summary: d.summary, severity: d.severity, scope: d.scope,
    state: d.state, settled: d.settled, systems: d.systems,
    actions: d.actions.length, last_action_date: last?.date ?? null, next_check: last?.next_check ?? null,
  };
}

export type DiscrepanciesInput = {
  severity?: string;
  state?: string;
  /** "open" for unsettled findings, "settled" for resolved ones. */
  settled?: "open" | "settled";
  system?: string;
  rule?: string;
  cursor?: string;
  limit?: number;
};

/** One page of findings, filtered, in stored order (most severe first). */
export function discrepanciesPage(release_id: string, all: DiscrepancySummary[], input: DiscrepanciesInput = {}) {
  const filtered = all.filter(
    (d) =>
      (!input.severity || d.severity === input.severity) &&
      (!input.state || d.state === input.state) &&
      (!input.rule || d.rule === input.rule) &&
      (!input.system || d.systems.includes(input.system)) &&
      (!input.settled || d.settled === (input.settled === "settled")),
  );
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 500);
  let start = 0;
  if (input.cursor) {
    const [release, offset] = Buffer.from(input.cursor, "base64url").toString("utf8").split(":");
    if (release !== release_id || !/^\d+$/.test(offset || "")) throw new Error("Cursor is not from this release");
    start = Number(offset);
  }
  const items = filtered.slice(start, start + limit);
  const next = start + limit < filtered.length ? Buffer.from(`${release_id}:${start + limit}`).toString("base64url") : null;
  const tally = (pick: (d: DiscrepancySummary) => string) =>
    Object.fromEntries([...filtered.reduce((m, d) => m.set(pick(d), (m.get(pick(d)) || 0) + 1), new Map<string, number>())]);
  return {
    release_id,
    total: filtered.length,
    counts: { severity: tally((d) => d.severity), state: tally((d) => d.state), rule: tally((d) => d.rule) },
    items,
    next_cursor: next,
  };
}
