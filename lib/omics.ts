import { assertNoPrivateFields } from "../services/omics/src/private-fields";
export const omicsKinds = [
  "model",
  "benchmark",
  "dataset",
  "baseline",
  "evaluation",
  "result",
  "source",
  "claim",
] as const;
export type OmicsKind = (typeof omicsKinds)[number];
export interface OmicsRecord {
  id: string;
  kind: OmicsKind;
  name: string;
  description: string;
  status: string;
  facets: Record<string, string[]>;
  source_ids: string[];
  links: { relation: string; target_id: string }[];
  attributes: Record<string, unknown>;
}
export interface OmicsCatalogue {
  schema_version: string;
  release_id: string;
  released_at: string;
  records: OmicsRecord[];
  coverage: Record<string, unknown>;
}
export function parseCatalogue(value: unknown): OmicsCatalogue {
  assertNoPrivateFields(
    value,
    "Private contribution data cannot enter the public catalogue.",
  );
  const catalogue = value as OmicsCatalogue;
  if (
    catalogue?.schema_version !== "1.0" ||
    !catalogue.release_id ||
    !Array.isArray(catalogue.records)
  )
    throw new Error("Unsupported omics catalogue.");
  const ids = new Set<string>();
  for (const record of catalogue.records) {
    if (
      !/^[a-z0-9][a-z0-9-]*$/.test(record.id) ||
      ids.has(record.id) ||
      !omicsKinds.includes(record.kind) ||
      !Array.isArray(record.links) ||
      !Array.isArray(record.source_ids) ||
      !record.attributes ||
      !record.facets
    )
      throw new Error("Invalid catalogue record.");
    ids.add(record.id);
  }
  return {
    ...catalogue,
    records: catalogue.records.filter((record) => record.status !== "excluded"),
  };
}
export const recordHref = (record: Pick<OmicsRecord, "kind" | "id">) =>
  `/database/${record.kind}/${record.id}/`;
export function safeSourceUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  try {
    const url = new URL(value);
    if (["https:", "http:"].includes(url.protocol)) return url.href;
  } catch {
    /* Not a URL. */
  }
}
export function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "")
    return "Not reported";
  if (Array.isArray(value))
    return value.length ? value.map(displayValue).join("; ") : "None recorded";
  if (typeof value === "object")
    return Object.entries(value as object)
      .map(([key, item]) => `${key.replace(/_/g, " ")}: ${displayValue(item)}`)
      .join("; ");
  return String(value);
}
export function originLabel(origin: unknown): string {
  return (
    (
      {
        author_reported: "Author-reported evaluation",
        independent_paper: "Independent external evaluation",
        paper_compilation: "Result quoted from another source",
        rewire_run: "Rewire evaluation",
      } as Record<string, string>
    )[String(origin)] || "Evaluation origin not reported"
  );
}
const comparisonFields = [
  "protocol_id",
  "dataset_version",
  "split",
  "population",
  "inputs",
  "adaptation",
  "metric_implementation",
  "aggregation",
  "budget",
];
function known(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string")
    return (
      !!value.trim() &&
      ![
        "unknown",
        "not_reported",
        "not reported",
        "unreported",
        "unextracted",
        "unavailable",
      ].includes(value.trim().toLowerCase())
    );
  if (Array.isArray(value)) return value.length > 0 && value.every(known);
  if (typeof value === "object")
    return Object.keys(value).length > 0 && Object.values(value).every(known);
  return true;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify(value.map(canonical));
  if (value && typeof value === "object")
    return JSON.stringify(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return JSON.stringify(value);
}
export function compareResults(
  results: OmicsRecord[],
  records: OmicsRecord[],
): { compatible: boolean; reasons: string[] } {
  const reasons = new Set<string>();
  if (results.length < 2) reasons.add("Choose at least two results.");
  const evaluations = results.map((result) =>
    records.find(
      (record) =>
        record.id ===
        result.links.find((link) => link.relation === "evaluation")?.target_id,
    ),
  );
  results.forEach((result, index) => {
    if (
      result.kind !== "result" ||
      !["source_checked", "reproduced"].includes(result.status)
    )
      reasons.add(
        "Only current, source-checked or reproduced results can be compared.",
      );
    if (!evaluations[index] || evaluations[index]?.kind !== "evaluation")
      reasons.add("An evaluation record is missing.");
    if (
      ["superseded", "disputed", "excluded"].includes(
        evaluations[index]?.status || "",
      )
    )
      reasons.add("An evaluation is disputed, superseded or excluded.");
    if (
      evaluations[index]?.attributes.origin === "paper_compilation" ||
      evaluations[index]?.links.some(
        (link) => link.relation === "original_evaluation",
      )
    )
      reasons.add(
        "A quoted result is not independent evidence; consult its original evaluation.",
      );
  });
  const datasetIds = evaluations.map(
    (evaluation) =>
      evaluation?.links
        .filter((link) => link.relation === "dataset")
        .map((link) => link.target_id)
        .sort() || [],
  );
  if (
    datasetIds.some(
      (ids) =>
        ids.length === 0 ||
        ids.some(
          (id) =>
            records.find((record) => record.id === id)?.kind !== "dataset",
        ),
    )
  )
    reasons.add("Dataset identity is not fully linked.");
  else if (new Set(datasetIds.map(canonical)).size > 1)
    reasons.add("Evaluations use different datasets.");
  if (new Set(results.map((result) => result.id)).size !== results.length)
    reasons.add("The same result cannot supply independent evidence twice.");
  for (const field of ["metric", "unit", "metric_direction"]) {
    const values = results.map((result) => result.attributes[field]);
    if (values.some((value) => !known(value)))
      reasons.add(`Result ${field.replace(/_/g, " ")} is not fully reported.`);
    else if (new Set(values.map(canonical)).size > 1)
      reasons.add(`Results use different ${field.replace(/_/g, " ")} values.`);
  }
  for (const field of comparisonFields) {
    const values = evaluations.map(
      (evaluation) =>
        (
          evaluation?.attributes.comparison as
            Record<string, unknown> | undefined
        )?.[field],
    );
    if (values.some((value) => !known(value)))
      reasons.add(`${field.replace(/_/g, " ")} is not fully reported.`);
    else if (new Set(values.map(canonical)).size > 1)
      reasons.add(`${field.replace(/_/g, " ")} differs between evaluations.`);
  }
  return { compatible: reasons.size === 0, reasons: Array.from(reasons) };
}
