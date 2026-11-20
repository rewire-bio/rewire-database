/**
 * Hardware and access facts for a ranked model, read only from the model record in the release.
 *
 * A field is filled only when the record carries it: a numeric attribute for the measured fields,
 * a source-checked profile fact or attribute for the text fields. Nothing is inferred from names,
 * licence wording or other models, so a missing field stays null and is shown as "Not recorded".
 * Text is kept as the record writes it: it is never mapped to a category such as "open weights"
 * or "research only" (#230).
 */

export interface OperationalTelemetry {
  inference_latency_ms: number | null;
  throughput_items_per_sec: number | null;
  min_vram_gb: number | null;
  estimated_cost_per_1k_evals_usd: number | null;
  /** The record's "Parameters" fact, as written. */
  parameters: string | null;
  /** The record's "Context limits" fact, as written. */
  context_window: string | null;
  /** The weights licence, else the record's licence attribute, else the code licence, as written. */
  license: string | null;
  /**
   * Which of those `license` holds. "code" means only a code licence is recorded: it says nothing
   * about the weights, so every place that shows it must say it is the code licence.
   */
  license_scope: LicenceScope | null;
  /** How the model is obtained, as written. */
  access: string | null;
  /** Set only when the record states it as a boolean attribute. */
  open_weights: boolean | null;
}

export type LicenceScope = "weights" | "record" | "code";

export const NOT_RECORDED = "Not recorded";

export interface MinimalRecordFact {
  label: string;
  value: string;
  status?: string;
}

export interface MinimalRecord {
  id?: string;
  name?: string;
  kind?: string;
  attributes?: Record<string, unknown>;
}

export const EMPTY_TELEMETRY: OperationalTelemetry = {
  inference_latency_ms: null,
  throughput_items_per_sec: null,
  min_vram_gb: null,
  estimated_cost_per_1k_evals_usd: null,
  parameters: null,
  context_window: null,
  license: null,
  license_scope: null,
  access: null,
  open_weights: null,
};

const numberAttribute = (attributes: Record<string, unknown>, key: string) => {
  const value = attributes[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};
const textAttribute = (attributes: Record<string, unknown>, key: string) => {
  const value = attributes[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

/** The telemetry a model record carries, field by field; null where it carries nothing. */
export function telemetryFromRecord(record: MinimalRecord | null | undefined): OperationalTelemetry {
  const attributes = record?.attributes ?? {};
  const profile = attributes.profile as { facts?: MinimalRecordFact[] } | undefined;
  const facts = (profile?.facts ?? []).filter((f) => f.status === undefined || f.status === "source_checked");
  const fact = (label: string) => facts.find((f) => f.label === label)?.value?.trim() || null;
  const licences: [LicenceScope, string | null][] = [
    ["weights", fact("Weights licence")],
    ["record", textAttribute(attributes, "licence")],
    ["code", fact("Code licence")],
  ];
  const [licenseScope, license] = licences.find(([, value]) => value) ?? [null, null];
  return {
    inference_latency_ms: numberAttribute(attributes, "inference_latency_ms"),
    throughput_items_per_sec: numberAttribute(attributes, "throughput_items_per_sec"),
    min_vram_gb: numberAttribute(attributes, "min_vram_gb"),
    estimated_cost_per_1k_evals_usd: numberAttribute(attributes, "estimated_cost_per_1k_evals_usd"),
    parameters: fact("Parameters"),
    context_window: fact("Context limits"),
    license,
    license_scope: licenseScope,
    access: textAttribute(attributes, "access") ?? fact("Access"),
    open_weights: typeof attributes.open_weights === "boolean" ? attributes.open_weights : null,
  };
}

/** "License", or "Code licence" when only the code licence is recorded. */
export const licenceLabel = (telemetry: Pick<OperationalTelemetry, "license_scope">, label = "License") =>
  telemetry.license_scope === "code" ? "Code licence" : label;

/** The licence text for a cell with no label of its own: "Code: MIT" when it is only the code licence. */
export const licenceText = (telemetry: Pick<OperationalTelemetry, "license" | "license_scope">) =>
  telemetry.license && telemetry.license_scope === "code" ? `Code: ${telemetry.license}` : telemetry.license;

/**
 * A recorded text shortened for a table cell: its first sentence (or the part before a semicolon),
 * at most `max` characters. Anything left out is marked with an ellipsis, so a cut is never read
 * as the whole statement; a qualifier after a comma ("public, but gated") stays in.
 */
export function shortFact(text: string | null | undefined, max = 40): string {
  const full = text?.trim();
  if (!full) return NOT_RECORDED;
  const sentence = full.split(/;\s|\.\s+(?=[A-Z])/)[0].replace(/\.$/, "").trim();
  if (sentence.length > max) return `${sentence.slice(0, max - 1).trimEnd()}…`;
  return sentence.length < full.replace(/\.$/, "").length ? `${sentence}…` : sentence;
}
