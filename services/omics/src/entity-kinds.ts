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
/** Legacy links use model/benchmark as evaluation roles, not current entity kinds. */
export function relationAcceptsKind(relation: string, kind: string): boolean {
  if (relation === "model") return isModelSubject(kind);
  if (relation === "benchmark") return isBenchmarkSubject(kind);
  if (relation === "dataset") return isDatasetSubject(kind);
  return relation === kind;
}
