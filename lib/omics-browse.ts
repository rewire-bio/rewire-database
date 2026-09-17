import { omicsKinds, type OmicsKind, type OmicsRecord } from "./omics";
export type CatalogueFilters = {
  kind: OmicsKind;
  q: string;
  area: string;
  status: string;
  origin: string;
};
export const defaultFilters: CatalogueFilters = {
  kind: "model",
  q: "",
  area: "",
  status: "",
  origin: "",
};
export const kindLabels: Record<OmicsKind, string> = {
  model: "Models",
  benchmark: "Benchmarks",
  method: "Methods",
  configuration: "Configurations",
  pipeline: "Pipelines",
  service: "Services",
  task: "Tasks",
  protocol: "Protocols",
  evaluator: "Evaluators",
  dataset: "Datasets",
  dataset_subset: "Dataset subsets",
  baseline: "Baselines",
  result: "Results",
  source: "Sources",
  evaluation: "Evaluations",
  claim: "Evidence claims",
};
export const kindDescriptions: Record<OmicsKind, string> = {
  model:
    "Biological models and model families. Evaluated versions, configurations and pipelines are linked separately.",
  benchmark:
    "Benchmark suites and challenges. Explore their tasks, protocols, datasets and published results.",
  method:
    "Algorithms and scientific procedures, including conventional statistical and mechanistic methods.",
  configuration:
    "Specific checkpoints, settings and adaptations evaluated in a study.",
  pipeline:
    "Complete workflows combining models, preprocessing and prediction or scoring steps.",
  service:
    "Hosted interfaces and software services that expose biological models or workflows.",
  task: "Biological questions and capabilities. A task may have several distinct evaluation protocols.",
  protocol:
    "Concrete evaluation procedures: data, splits, allowed inputs, adaptation and metrics.",
  evaluator:
    "Scoring software and assessment procedures used to measure predictions.",
  dataset:
    "Biological observations used in evaluations. One dataset can support several benchmarks.",
  dataset_subset:
    "Defined cohorts, splits and subsets of a dataset used in particular evaluations.",
  baseline:
    "Reference methods and controls. Proposed baselines have no measured performance unless a result is linked.",
  result:
    "Measurements linked to a model, evaluation protocol and source. Different protocols do not form a single leaderboard.",
  source:
    "Papers, repositories and artifacts supporting the records in this database.",
  evaluation:
    "The model configuration, data and conditions used to produce a result.",
  claim: "Individual assertions linked to the evidence that supports them.",
};
export function readCatalogueFilters(search: string): CatalogueFilters {
  const params = new URLSearchParams(search);
  const kind = params.get("kind") as OmicsKind;
  const origin = params.get("origin") || "";
  return {
    kind: omicsKinds.includes(kind) ? kind : "model",
    q: params.get("q") || "",
    area: params.get("area") || "",
    status: params.get("status") || "",
    origin: ["literature", "rewire"].includes(origin) ? origin : "",
  };
}
export function filterCatalogue(
  records: OmicsRecord[],
  filters: CatalogueFilters,
) {
  const byId = new Map(records.map((record) => [record.id, record]));
  const query = filters.q.trim().toLowerCase();
  return records.filter((record) => {
    const evaluation =
      record.kind === "evaluation"
        ? record
        : byId.get(
            record.links.find((link) => link.relation === "evaluation")
              ?.target_id || "",
          );
    const origin = evaluation?.attributes.origin;
    const matchesOrigin =
      !["result", "evaluation"].includes(filters.kind) ||
      !filters.origin ||
      (filters.origin === "rewire"
        ? origin === "rewire_run"
        : [
            "author_reported",
            "independent_paper",
            "paper_compilation",
          ].includes(String(origin)));
    return (
      record.kind === filters.kind &&
      matchesOrigin &&
      (!filters.area || record.facets.areas?.includes(filters.area)) &&
      (!filters.status || record.status === filters.status) &&
      (!query ||
        `${record.name} ${record.id} ${record.description} ${Object.values(record.facets).flat().join(" ")}`
          .toLowerCase()
          .includes(query))
    );
  });
}

export const primaryKinds = [
  "model",
  "benchmark",
  "dataset",
  "result",
] as const;
export const secondaryKinds = [
  "method",
  "configuration",
  "pipeline",
  "service",
  "task",
  "protocol",
  "evaluator",
  "dataset_subset",
  "baseline",
  "evaluation",
  "source",
  "claim",
] as const;
export const predictiveKinds: readonly OmicsKind[] = [
  "model",
  "method",
  "configuration",
  "pipeline",
  "service",
];
export const evaluationKinds: readonly OmicsKind[] = [
  "benchmark",
  "task",
  "protocol",
  "evaluator",
];
export const profileKinds: readonly OmicsKind[] = [
  ...predictiveKinds,
  ...evaluationKinds,
];
export const singularKindLabels: Record<OmicsKind, string> = {
  model: "Model",
  method: "Method",
  configuration: "Configuration",
  pipeline: "Pipeline",
  service: "Service",
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
};
/** Older releases used model/benchmark links for several entity types. Read
 * the target's actual kind; never infer a scientific identity from its name. */
export function uniqueRecords(records: OmicsRecord[]): OmicsRecord[] {
  return [...new Map(records.map((record) => [record.id, record])).values()];
}
export type EntityResultRow = {
  models: OmicsRecord[];
  benchmarks: OmicsRecord[];
  methods?: OmicsRecord[];
  configurations?: OmicsRecord[];
  pipelines?: OmicsRecord[];
  services?: OmicsRecord[];
  tasks?: OmicsRecord[];
  protocols?: OmicsRecord[];
  evaluators?: OmicsRecord[];
  datasets?: OmicsRecord[];
  dataset_subsets?: OmicsRecord[];
};
export function testedEntities(row: EntityResultRow): OmicsRecord[] {
  return uniqueRecords([
    ...row.models,
    ...(row.methods || []),
    ...(row.configurations || []),
    ...(row.pipelines || []),
    ...(row.services || []),
  ]);
}
export function evaluationEntities(row: EntityResultRow): OmicsRecord[] {
  return uniqueRecords([
    ...row.benchmarks,
    ...(row.tasks || []),
    ...(row.protocols || []),
    ...(row.evaluators || []),
  ]);
}
export function datasetEntities(row: EntityResultRow): OmicsRecord[] {
  return uniqueRecords([
    ...(row.datasets || []),
    ...(row.dataset_subsets || []),
  ]);
}
export function groupEntities(records: OmicsRecord[]) {
  return [
    ...predictiveKinds,
    ...evaluationKinds,
    "dataset" as const,
    "dataset_subset" as const,
  ].flatMap((kind) => {
    const items = uniqueRecords(records).filter(
      (record) => record.kind === kind,
    );
    return items.length
      ? [{ kind, label: singularKindLabels[kind], records: items }]
      : [];
  });
}
