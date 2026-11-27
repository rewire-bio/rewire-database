/** Reader-facing names for record field paths in evidence tables and claims.
 * The raw path stays visible in each row's audit details. */
const FIELD_LABELS: Record<string, string> = {
  id: "Record ID",
  kind: "Record type",
  name: "Name",
  description: "Description",
  status: "Review status",
  facets: "Search facets",
  source_ids: "Sources",
  field: "Claimed field",
  value: "Claimed value",
  summary: "Summary",
  pins: "Pinned records",
  citation_locators: "Citation locations",
  source_locator: "Source location",
  comparison_group: "Comparison group",
  comparison_title: "Comparison title",
  headline_metric: "Headline metric",
  stratum_label: "Stratum",
  stratum_order: "Stratum order",
  reviewed_evaluations: "Reviewed evaluations",
  printed_value: "Printed value",
  numeric_value: "Numeric value",
  metric_direction: "Metric direction",
  metric_qualifier: "Metric qualifier",
  artifact_sha256: "Artifact SHA-256",
  "review.method": "Review method",
  "review.note": "Review note",
  "review.reviewed_at": "Review date",
  "review.reviewer": "Reviewer",
  "review.reviewer_note": "Reviewer note",
};

const words = (text: string) => {
  const spaced = text.replace(/_/g, " ").replace(/\./g, ": ").trim();
  return spaced ? spaced[0].toUpperCase() + spaced.slice(1) : spaced;
};

/** "attributes.citation_locators" reads as "Citation locations"; "links:part_of:x" as "Part of". */
export function claimFieldLabel(path: string): string {
  const link = /^links:([a-z_]+)(?::.*)?$/.exec(path);
  if (link) return words(link[1]);
  const key = path.replace(/^attributes\./, "");
  return FIELD_LABELS[key] ?? words(key);
}

/** Evidence table property labels: relationship labels pass through; field paths are named. */
export function evidencePropertyLabel(property: string): string {
  if (/^Relationship:/.test(property)) return property;
  return /^[a-z0-9_]+(?:\.[a-z0-9_]+)*(?::\s*[a-z0-9_]+)?$/i.test(property) || property.startsWith("links:")
    ? claimFieldLabel(property)
    : property;
}

const RELATION_LABELS: Record<string, { direct: string; reverse: string }> = {
  alias_of: { direct: "Other name for", reverse: "Other name" },
  applicable_to: { direct: "Applicable to", reverse: "Applies to" },
  assessed_by: { direct: "Assessed by", reverse: "Assesses" },
  assessment: { direct: "Assessed on", reverse: "Assesses" },
  benchmark: { direct: "Benchmark", reverse: "Evaluated in" },
  companion_of: { direct: "Companion to", reverse: "Companion to" },
  configuration: { direct: "Configuration", reverse: "Evaluated in" },
  configuration_of: { direct: "Configuration of", reverse: "Configuration" },
  data: { direct: "Data", reverse: "Used as data in" },
  dataset: { direct: "Dataset", reverse: "Evaluated in" },
  evaluates_task: { direct: "Evaluates task", reverse: "Evaluated by" },
  evaluation: { direct: "From evaluation", reverse: "Result" },
  family: { direct: "In family", reverse: "Family member" },
  implemented_by: { direct: "Implemented by", reverse: "Implements" },
  measured_in: { direct: "Measured in", reverse: "Measures" },
  model: { direct: "Model", reverse: "Evaluated in" },
  parent: { direct: "Part of", reverse: "Includes" },
  part_of: { direct: "Part of", reverse: "Includes" },
  pipeline: { direct: "Pipeline", reverse: "Evaluated in" },
  protocol: { direct: "Protocol", reverse: "Evaluated in" },
  same_data_as: { direct: "Uses same data as", reverse: "Uses same data as" },
  subject: { direct: "About", reverse: "Claim" },
  supersedes: { direct: "Supersedes", reverse: "Superseded by" },
  system: { direct: "Evaluated system", reverse: "Evaluated in" },
  used_in: { direct: "Used in", reverse: "Uses" },
  uses_data: { direct: "Uses data", reverse: "Used as data by" },
  uses_model: { direct: "Uses model", reverse: "Used by" },
  variant_of: { direct: "Version of", reverse: "Version" },
};

/** Plain-English label for a direct or reverse entry relationship. */
export function relationLabel(relation: string, direction: "direct" | "reverse"): string {
  const known = RELATION_LABELS[relation];
  if (known) return known[direction];
  return words(relation);
}
