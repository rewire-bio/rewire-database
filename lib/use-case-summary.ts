import type { ResolvedMapping } from "../services/omics/src/use-cases";

export type EvidenceSummary = {
  /** Current, source-reviewed mappings that present direct or proxy evidence. */
  endpoints: number;
  /** Distinct evaluated configurations, including controls and baselines. */
  configurations: number;
  relevance: "direct" | "proxy" | "mixed" | "none";
  gaps: number;
};

/** Counts what a use-case page presents. It describes coverage, never performance. */
export function summariseUseCaseEvidence(mappings: ResolvedMapping[], gaps: number): EvidenceSummary {
  const current = mappings.filter((mapping) => mapping.lifecycle === "active" && (mapping.relevance === "direct" || mapping.relevance === "proxy"));
  const configurations = new Set(current.flatMap((mapping) => mapping.evaluations.flatMap(({ configurations }) => configurations.map(({ id }) => id))));
  const direct = current.some((mapping) => mapping.relevance === "direct");
  const proxy = current.some((mapping) => mapping.relevance === "proxy");
  return {
    endpoints: current.length,
    configurations: configurations.size,
    relevance: direct && proxy ? "mixed" : direct ? "direct" : proxy ? "proxy" : "none",
    gaps,
  };
}

export const evidenceRelevanceLabels: Record<EvidenceSummary["relevance"], string> = {
  direct: "Direct evidence for the stated endpoint",
  proxy: "Proxy evidence only",
  mixed: "Direct and proxy evidence",
  none: "No current evaluated evidence",
};

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

export function evidenceSummaryParts(summary: EvidenceSummary): string[] {
  return [
    plural(summary.endpoints, "evaluated endpoint"),
    plural(summary.configurations, "tested configuration"),
    evidenceRelevanceLabels[summary.relevance],
    plural(summary.gaps, "recorded evidence gap"),
  ];
}
