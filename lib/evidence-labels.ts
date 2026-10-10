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
  return /^[a-z_]+(?:\.[a-z_]+)*$/.test(property) || property.startsWith("links:") ? claimFieldLabel(property) : property;
}
