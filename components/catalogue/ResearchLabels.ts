import type { ResearchReadiness } from "@/shared/omics/research";

export const researchCapabilityLabels: Record<keyof ResearchReadiness["capabilities"], string> = {
  replay: "Replay metrics",
  analysis: "Investigate discrepancies",
  local_run: "Run locally",
  validation: "Validate independently",
};

export const researchCapabilityDescriptions: Record<keyof ResearchReadiness["capabilities"], string> = {
  replay: "Exact outcomes, predictions, identifiers and evaluator are connected.",
  analysis: "Replay evidence includes annotations and an assessment of dependence. Unknown independence permits descriptive analysis only.",
  local_run: "A pinned recipe describes the inputs, environment and resource requirements.",
  validation: "Separate data and exposure records support an independent test.",
};

export const researchKinds = ["dataset", "dataset_subset", "evaluation"];

const outcomeLabels: Record<string, string> = {
  data_or_method_explanation: "Data or method explanation",
  exploratory_biological_hypothesis: "Exploratory biological hypothesis",
  inconclusive: "Inconclusive",
  blocked: "Investigation blocked",
};

export function researchOutcomeLabel(outcome: string): string {
  return outcomeLabels[outcome] || outcome;
}

export function researchDate(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : "Not verified";
}
