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
  dataset: "Datasets",
  baseline: "Baselines",
  result: "Results",
  source: "Sources",
  evaluation: "Evaluations",
  claim: "Evidence claims",
};
export const kindDescriptions: Record<OmicsKind, string> = {
  model:
    "Model families and reported methods, linked to their evaluations and sources. Versions are kept distinct where known.",
  benchmark:
    "Tasks, suites and protocols that define how a biological capability is evaluated.",
  dataset:
    "Biological observations used in evaluations. One dataset can support several benchmarks.",
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
