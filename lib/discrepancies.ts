import fs from "node:fs";
import { dataPath, dataPin } from "./data-pin";

/** One discrepancy between studies, as rewire-benchmark-data's knowledge-graph build derives it
 * (docs/linked-data.md, "For the website"). Rule-derived: a lead to investigate, not a verdict. */
export type Discrepancy = {
  id: string;
  rule: "ordering-reversal" | "gap-outlier" | string;
  label: string;
  summary: string;
  severity: "high" | "medium" | "low";
  scope: "same-task" | "cross-task" | string;
  identity_basis: "reviewed" | "unreviewed" | string;
  review_state: string;
  review_claim: string | null;
  settled: boolean;
  /** From the reviewed claim, when one exists: what was found and what happens next. */
  resolution: {
    rationale?: string; investigation_url?: string; report_url?: string; reported_on?: string;
    upstream_response?: string; awaiting?: string; expected_by?: string; next_check?: string;
    [key: string]: unknown;
  };
  systems: string[];
  consensus_higher: string | null;
  reference_system: string | null;
  outlier_sources: string[];
  consensus_sources: string[];
  outlier_results: string[];
  consensus_results: string[];
  numbers: Record<string, number>;
};

export type Discrepancies = { release_id: string; rules: Record<string, unknown>; discrepancies: Discrepancy[] };

/** The lock's kg pin, present once the release's knowledge-graph build has published discrepancies. */
type KgPin = { tag: string; file: string; sha256: string };

let cached: { release_id: string; value: Discrepancies | null } | undefined;

/** The pinned release's discrepancies, or null when the pin has none (not published yet, or an older release). */
export function discrepancies(): Discrepancies | null {
  const pin = dataPin() as ReturnType<typeof dataPin> & { kg?: KgPin };
  if (cached?.release_id === pin.release_id) return cached.value;
  let value: Discrepancies | null = null;
  if (pin.kg) {
    value = JSON.parse(fs.readFileSync(dataPath("serving", `discrepancies-${pin.release_id}.json`), "utf8")) as Discrepancies;
    if (value.release_id !== pin.release_id)
      throw new Error(`Discrepancies file holds release ${value.release_id}, not the pinned ${pin.release_id}`);
  }
  cached = { release_id: pin.release_id, value };
  return value;
}

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 } as const;

/** Unsettled discrepancies, most severe first. Settled ones (explained, confirmed error, false positive) are not leads. */
export function openDiscrepancies(file: Discrepancies | null = discrepancies()): Discrepancy[] {
  return (file?.discrepancies ?? []).filter((d) => !d.settled)
    .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3) || a.label.localeCompare(b.label));
}

/** For each result an unsettled discrepancy rests on in its outlier study, the discrepancies that name it. */
export function contestedResults(open: Discrepancy[] = openDiscrepancies()): Map<string, Discrepancy[]> {
  const byResult = new Map<string, Discrepancy[]>();
  for (const d of open) for (const id of d.outlier_results) byResult.set(id, [...(byResult.get(id) ?? []), d]);
  return byResult;
}

/** The discrepancies a set of results is contested by, deduplicated, most severe first. */
export function contestedBy(resultIds: string[], byResult: Map<string, Discrepancy[]>): Discrepancy[] {
  const found = new Map<string, Discrepancy>();
  for (const id of resultIds) for (const d of byResult.get(id) ?? []) found.set(d.id, d);
  return openDiscrepancies({ release_id: "", rules: {}, discrepancies: [...found.values()] });
}

export const discrepancyHref = (id: string) => `/contested/#${id}`;

const REVIEW_STATE_LABELS: Record<string, string> = {
  open: "Not yet reviewed",
  investigating: "Under investigation",
  "reported-upstream": "Reported to the authors",
  "awaiting-correction": "Awaiting a correction from the authors",
  explained: "Explained",
  "confirmed-error": "Confirmed error",
  "false-positive": "Not a real disagreement",
};
export const reviewStateLabel = (state: string) => REVIEW_STATE_LABELS[state] ?? state;

export const scopeLabel = (scope: string) =>
  scope === "same-task" ? "Same task in both studies" : scope === "cross-task" ? "Different tasks across studies" : scope;
