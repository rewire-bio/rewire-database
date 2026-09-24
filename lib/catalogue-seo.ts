import { catalogueText } from "./catalogue-text";
import { formatScore } from "./score-display";
import { singularKindLabels } from "./omics-browse";
import { recordHref, type OmicsRecord } from "./omics";

const indexes = new WeakMap<
  readonly OmicsRecord[],
  ReadonlyMap<string, OmicsRecord>
>();
const text = (value: unknown): string =>
  typeof value === "string" || typeof value === "number"
    ? catalogueText(String(value)).replace(/\s+/g, " ").trim()
    : "";
const sentence = (value: string) =>
  value && /[.!?]$/.test(value) ? value : value ? `${value}.` : "";
const join = (values: string[]) =>
  [...new Set(values.filter(Boolean))].join("; ");
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** Supporting assertions remain readable and crawlable but are not search landing pages. */
export function recordIsIndexable(record: Pick<OmicsRecord, "kind">): boolean {
  return record.kind !== "claim";
}

/** Presentation only: use recorded fields and explicit links, never inferred model aliases.
 * No character cap: removing scope or a reproduction caveat to fit a nominal snippet
 * length would be misleading. Search engines may choose a different visible snippet.
 */
export function recordSearchMetadata(
  record: OmicsRecord,
  records: readonly OmicsRecord[],
) {
  let byId = indexes.get(records);
  if (!byId) {
    byId = new Map(records.map((item) => [item.id, item]));
    indexes.set(records, byId);
  }
  const linked = (item: OmicsRecord, relations: string[]) =>
    item.links
      .filter((link) => relations.includes(link.relation))
      .flatMap((link) => {
        const target = byId.get(link.target_id);
        return target ? [target] : [];
      });
  const name = text(record.name);
  const kind = singularKindLabels[record.kind].toLowerCase();
  const version = text(record.attributes.version);
  const checkpoint = text(record.attributes.checkpoint);
  const identity = join([
    name,
    version && !name.includes(version) ? version : "",
    checkpoint && !name.includes(checkpoint) ? checkpoint : "",
  ]);
  const profile = text(object(record.attributes.profile).summary);
  const summary = profile || text(record.description);
  const sources = record.source_ids.flatMap((id) => {
    const source = byId.get(id);
    return source?.kind === "source" ? [source] : [];
  });
  const sourceContext = sources.length
    ? `Source: ${join(sources.slice(0, 2).map((source) => text(source.name)))}`
    : "";
  const context = (item: OmicsRecord) =>
    join(
      linked(item, [
        "model",
        "method",
        "configuration",
        "pipeline",
        "service",
        "baseline",
        "benchmark",
        "protocol",
        "task",
        "dataset",
        "dataset_subset",
      ]).map(
        (target) => `${singularKindLabels[target.kind]}: ${text(target.name)}`,
      ),
    );
  const review =
    record.status === "source_checked"
      ? "Source checked; not independently reproduced."
      : record.status === "reproduced"
        ? "Record status: reproduced."
        : `Record status: ${text(record.status).replaceAll("_", " ")}; independent reproduction is not established by this record.`;
  let title = `${identity} | ${kind}`;
  let description: string;
  if (record.kind === "result") {
    const evaluation = linked(record, ["evaluation"])[0];
    const metric = text(record.attributes.metric);
    // Same display rounding as result tables; scientific values remain untouched.
    const rawValue =
      text(record.attributes.printed_value) ||
      text(record.attributes.numeric_value);
    const value = rawValue ? formatScore(rawValue) : "";
    const unit = text(record.attributes.unit);
    const valueWithUnit = [
      value,
      /%/.test(value) && /^(%|percent|percentage)$/i.test(unit) ? "" : unit,
    ]
      .filter(Boolean)
      .join(" ");
    const measurement = metric
      ? `${metric}${valueWithUnit ? `: ${valueWithUnit}` : ""}`
      : valueWithUnit;
    // Existing names already identify the source task and usually its metric. Add
    // only the displayed value, and never repeat a value already written there.
    if (
      value &&
      !name.includes(`${metric}: ${value}`) &&
      !name.includes(`${metric} = ${value}`)
    )
      title = `${name}: ${valueWithUnit} | result`;
    const comparison = object(evaluation?.attributes.comparison);
    description = [
      sentence(measurement || name),
      sentence(
        evaluation
          ? context(evaluation) || `Evaluation: ${text(evaluation.name)}`
          : "",
      ),
      sentence(
        join([
          comparison.split ? `Split: ${text(comparison.split)}` : "",
          record.attributes.aggregation
            ? `Aggregation: ${text(record.attributes.aggregation)}`
            : "",
        ]),
      ),
      review,
    ]
      .filter(Boolean)
      .join(" ");
  } else if (record.kind === "evaluation") {
    const comparison = object(record.attributes.comparison);
    description = [
      sentence(`${identity}: ${context(record) || "recorded evaluation"}`),
      sentence(
        join([
          record.attributes.protocol
            ? `Protocol: ${text(record.attributes.protocol)}`
            : "",
          comparison.split ? `Split: ${text(comparison.split)}` : "",
          comparison.inputs ? `Inputs: ${text(comparison.inputs)}` : "",
          comparison.adaptation
            ? `Adaptation: ${text(comparison.adaptation)}`
            : "",
        ]),
      ),
      review,
    ]
      .filter(Boolean)
      .join(" ");
  } else if (record.kind === "source") {
    description = [
      sentence(
        `${identity}${text(record.attributes.year) ? ` (${text(record.attributes.year)})` : ""}: source record`,
      ),
      sentence(
        record.attributes.doi ? `DOI: ${text(record.attributes.doi)}` : "",
      ),
      sentence(
        summary ||
          "Linked evidence and source metadata in the biological benchmark database",
      ),
    ]
      .filter(Boolean)
      .join(" ");
  } else {
    description = [
      sentence(
        `${identity}: ${summary || `${kind} record in the biological benchmark database`}`,
      ),
      sentence(context(record)),
      sentence(
        ["configuration", "dataset", "dataset_subset", "baseline"].includes(
          record.kind,
        )
          ? sourceContext
          : "",
      ),
    ]
      .filter(Boolean)
      .join(" ");
  }
  return {
    title,
    description,
    alternates: {
      canonical: `https://benchmarks.rewire.it${recordHref(record)}`,
    },
    robots: { index: recordIsIndexable(record), follow: true as const },
  };
}
