import { formatScore } from "./score-display";
import { omicsKinds, type OmicsKind, type OmicsRecord } from "./omics";
import { recordSearchText } from "../shared/omics/source-identity";
import type { ResearchReadiness } from "../shared/omics/research";
export type CatalogueFilters = {
  kind: OmicsKind;
  q: string;
  area: string;
  status: string;
  origin: string;
  readiness: "" | keyof ResearchReadiness["capabilities"];
};
/** "1 result", "2 results": counts shown to readers. */
export function countLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`;
}

/** Reader-facing names for catalogue review states. */
const statusLabels: Record<string, string> = {
  discovered: "Not yet reviewed",
  needs_review: "Needs review",
  source_checked: "Source checked",
  reproduced: "Independently reproduced",
  disputed: "Disputed",
  superseded: "Superseded",
  excluded: "Excluded",
};
export function statusLabel(status: string): string {
  return statusLabels[status] || status.replace(/_/g, " ");
}

/** Records per browse page; kept short so filters and downloads stay reachable on phones. */
export const BROWSE_PAGE_SIZE = 10;
export const defaultFilters: CatalogueFilters = {
  kind: "model",
  q: "",
  area: "",
  status: "",
  origin: "",
  readiness: "",
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
  use_case: "Use cases",
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
    "Measurements linked to a model, evaluation protocol and source. Different protocols do not form a single leaderboard; pooled views state what differs between the rows they gather.",
  source:
    "Papers, repositories and artifacts supporting the records in this database.",
  evaluation:
    "The model configuration, data and conditions used to produce a result.",
  claim: "Individual assertions linked to the evidence that supports them.",
  use_case:
    "Research and clinical-research decision questions, each linked to the protocols whose evaluations bear on it."
};
export function readCatalogueFilters(search: string): CatalogueFilters {
  const params = new URLSearchParams(search);
  const kind = params.get("kind") as OmicsKind;
  const origin = params.get("origin") || "";
  const readiness = params.get("readiness") || "";
  return {
    kind: omicsKinds.includes(kind) ? kind : "model",
    q: params.get("q") || "",
    area: params.get("area") || "",
    status: params.get("status") || "",
    origin: ["literature", "rewire"].includes(origin) ? origin : "",
    readiness: ["dataset", "dataset_subset", "evaluation"].includes(kind) &&
      ["replay", "analysis", "local_run", "validation"].includes(readiness)
      ? readiness as keyof ResearchReadiness["capabilities"] : "",
  };
}
export function filterCatalogue(
  records: OmicsRecord[],
  filters: CatalogueFilters,
  readiness: ResearchReadiness[] = [],
) {
  const byId = new Map(records.map((record) => [record.id, record]));
  const readyIds = new Set(readiness.filter((item) =>
    filters.readiness && item.capabilities[filters.readiness].ready,
  ).map((item) => item.record_id));
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
      (!filters.readiness || readyIds.has(record.id)) &&
      matchesOrigin &&
      (!filters.area || record.facets.areas?.includes(filters.area)) &&
      (!filters.status || record.status === filters.status) &&
      (!query || recordSearchText(record).includes(query))
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
  use_case: "Use case",
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

/** Human labels are presentation only; stored facet identities remain intact. */
export function researchAreaLabel(value: string): string {
  const labels: Record<string, string> = {
    "dna-genomes": "DNA and genomes",
    "rna-transcriptomics": "RNA and transcriptomics",
    "rna-transcriptomes": "RNA and transcriptomes",
    "cells-tissues": "Cells and tissues",
    "proteins-complexes": "Proteins and complexes",
    "microbes-communities": "Microbes and communities",
    rna: "RNA",
    "protein-sequence-function": "Protein sequence and function",
    "protein-structure-design": "Protein structure and design",
    "single-cell-spatial": "Single-cell and spatial omics",
    "molecular-interactions": "Molecular interactions",
    "microbes-metagenomics": "Microbes and metagenomics",
    metabolomics: "Metabolomics",
    "networks-mechanistic": "Networks and mechanistic biology",
  };
  return (
    labels[value] ||
    value.replace(/[-_]/g, " ").replace(/^./, (c) => c.toUpperCase())
  );
}

export function catalogueSearch(
  filters: CatalogueFilters,
  cursor?: string,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value && !(key === "kind" && value === "model")) params.set(key, value);
  }
  if (cursor) params.set("cursor", cursor);
  return params.size ? `?${params}` : "";
}

/** Only local catalogue/use-case routes may be used as a return destination. */
export function safeBrowseReturnTo(
  value: string | null | undefined,
): string | null {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\r\n]/.test(value)
  )
    return null;
  try {
    // Check the literal path before URL normalization can hide traversal or an
    // encoded separator. Query values may contain safely encoded search terms.
    const pathname = value.split(/[?#]/, 1)[0];
    if (!/^(?:\/|\/database\/|\/use-cases\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/)?)$/.test(pathname)) return null;
    if (/[\\\r\n]|%(?:25)*(?:0[ad]|5c)/i.test(value)) return null;
    const url = new URL(value, "https://benchmarks.rewirebio.io");
    if (
      url.origin !== "https://benchmarks.rewirebio.io" ||
      url.pathname !== pathname
    )
      return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function browseFilterSummary(filters: CatalogueFilters): string {
  return [
    kindLabels[filters.kind],
    filters.q && `Search: ${filters.q}`,
    filters.area && researchAreaLabel(filters.area),
    filters.status && statusLabel(filters.status),
    filters.origin &&
      `${filters.origin === "rewire" ? "Rewire" : "Published"} evaluations`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Citation and claim records are not indexed as evaluated entities. */
export function supportsEvaluationSummary(kind: OmicsKind): boolean {
  return kind !== "source" && kind !== "claim";
}

export function explorerPrintedScore(value: unknown, unit: unknown): string {
  const printed =
    typeof value === "string" || typeof value === "number"
      ? formatScore(value)
      : "Unreported";
  return `${printed}${unit === "percent" && !printed.includes("%") && printed !== "Unreported" ? "%" : ""}`;
}
