/** A result value Rewire computed from a source's own data (result.attributes.derivation),
 * rather than a value printed in the source. The evaluation's origin still says who
 * reported the underlying data, so only this attribute marks the value as computed. */
export type DerivationInput = {
  source_id: string;
  artifact_sha256?: string;
  locator?: string;
  row_filter?: string;
  row_count?: number;
};
export type Derivation = {
  method: string;
  inputs: DerivationInput[];
  aggregation?: string;
  aggregation_source_id?: string;
  aggregation_locator?: string;
  script?: string;
  script_sha256?: string;
  precision?: string;
  note?: string;
};

export const DERIVED_LABEL = "Computed by Rewire from the authors' source data";
export const DERIVATION_REPOSITORY = "rewire-bio/rewire-benchmark-data";

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value : undefined);

/** The derivation of a result, or null for a value printed by its source. */
export function resultDerivation(attributes: Record<string, unknown> | undefined): Derivation | null {
  const value = attributes?.derivation as Record<string, unknown> | undefined;
  if (!value || typeof value !== "object" || !text(value.method)) return null;
  const inputs = Array.isArray(value.inputs)
    ? value.inputs.flatMap((input) => {
        const item = input as Record<string, unknown>;
        return text(item?.source_id)
          ? [{
              source_id: item.source_id as string,
              artifact_sha256: text(item.artifact_sha256),
              locator: text(item.locator),
              row_filter: text(item.row_filter),
              row_count: typeof item.row_count === "number" ? item.row_count : undefined,
            }]
          : [];
      })
    : [];
  return {
    method: value.method as string,
    inputs,
    aggregation: text(value.aggregation),
    aggregation_source_id: text(value.aggregation_source_id),
    aggregation_locator: text(value.aggregation_locator),
    script: text(value.script),
    script_sha256: text(value.script_sha256),
    precision: text(value.precision),
    note: text(value.note),
  };
}

/** The script at the producer commit the site's data release was cut from. */
export function derivationScriptUrl(script: string, revision: string): string | undefined {
  if (!/^[a-f0-9]{40}$/.test(revision) || !/^[A-Za-z0-9_./-]+$/.test(script) || script.includes("..")) return undefined;
  return `https://github.com/${DERIVATION_REPOSITORY}/blob/${revision}/${script}`;
}
