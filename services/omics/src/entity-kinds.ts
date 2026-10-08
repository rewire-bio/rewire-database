/** First-class catalogue entities. Historical 1.0 releases remain readable. */
export const legacyKinds = [
  "model",
  "benchmark",
  "dataset",
  "baseline",
  "evaluation",
  "result",
  "source",
  "claim",
] as const;
export const entityKinds = [
  "model",
  "method",
  "configuration",
  "pipeline",
  "service",
  "benchmark",
  "task",
  "protocol",
  "evaluator",
  "dataset",
  "dataset_subset",
  "baseline",
  "evaluation",
  "result",
  "source",
  "claim",
] as const;
export type EntityKind = (typeof entityKinds)[number];
export const modelSubjectKinds = [
  "model",
  "method",
  "configuration",
  "pipeline",
  "service",
] as const;
export const benchmarkSubjectKinds = [
  "benchmark",
  "task",
  "protocol",
  "evaluator",
] as const;
export const datasetSubjectKinds = ["dataset", "dataset_subset"] as const;
export const isDatasetSubject = (kind: string): boolean =>
  (datasetSubjectKinds as readonly string[]).includes(kind);
export const isModelSubject = (kind: string): boolean =>
  (modelSubjectKinds as readonly string[]).includes(kind);
export const isBenchmarkSubject = (kind: string): boolean =>
  (benchmarkSubjectKinds as readonly string[]).includes(kind);
export const entityKindLabel = (kind: string): string =>
  ({
    model: "Model",
    method: "Method",
    configuration: "Configuration",
    pipeline: "Pipeline",
    service: "Hosted service",
    benchmark: "Benchmark",
    task: "Task",
    protocol: "Protocol",
    evaluator: "Evaluator",
    dataset: "Dataset",
    dataset_subset: "Dataset subset",
    baseline: "Baseline",
    evaluation: "Evaluation",
    result: "Result",
    source: "Source",
    claim: "Evidence claim",
  })[kind] || kind;
/** Alias routes preserve published links: the canonical kind plus any listed legacy kinds. */
export function recordRouteKinds(record: {
  kind: EntityKind;
  attributes: Record<string, unknown>;
}): EntityKind[] {
  const aliases = record.attributes.legacy_kinds;
  return [
    ...new Set([
      record.kind,
      ...(Array.isArray(aliases)
        ? aliases.filter((kind): kind is EntityKind =>
            (entityKinds as readonly unknown[]).includes(kind),
          )
        : []),
    ]),
  ];
}

/** Legacy links use model/benchmark as evaluation roles, not current entity kinds. */
export function relationAcceptsKind(relation: string, kind: string): boolean {
  if (relation === "model") return isModelSubject(kind);
  if (relation === "benchmark") return isBenchmarkSubject(kind);
  if (relation === "dataset") return isDatasetSubject(kind);
  return relation === kind;
}

/** Shared publication vocabulary prevents website/API release validation drift. */
export const catalogueRelations = [
  "method", "configuration", "pipeline", "service", "task", "protocol",
  "evaluator", "dataset_subset", "model", "benchmark", "dataset", "evaluation",
  "baseline", "family", "parent", "supersedes", "original_evaluation", "subject",
  "source", "applicable_to", "uses_model", "variant_of", "alias_of", "part_of",
  "evaluates_task", "same_data_as",
] as const;

/** Informational data reuse only: never merges methods, results or comparison groups. */
export function validateDatasetReuseLink(
  record: { id: string; kind: string },
  link: { relation: string },
  target: { id: string; kind: string },
): void {
  if (link.relation === "same_data_as" &&
      (!isDatasetSubject(record.kind) || !isDatasetSubject(target.kind) || record.id === target.id))
    throw new Error(`Invalid dataset reuse relationship on ${record.id}`);
}
