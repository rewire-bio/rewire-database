import type { ResolvedMapping } from "../shared/omics/use-cases";
import { buildComparisons, heldJudgements, toolsCompared } from "./use-case-comparisons";

export type EvidenceSummary = {
  /** Current, source-reviewed mappings that present direct or proxy evidence. */
  endpoints: number;
  /** Distinct evaluated configurations, including controls and baselines. */
  configurations: number;
  relevance: "direct" | "proxy" | "mixed" | "none";
  gaps: number;
  /** The units the use-case page header shows, from the same functions. */
  comparisons: number;
  held: number;
  tools: number;
};

/** Counts what a use-case page presents. It describes coverage, never performance. */
export function summariseUseCaseEvidence(mappings: ResolvedMapping[], gaps: number): EvidenceSummary {
  const current = mappings.filter((mapping) => mapping.lifecycle === "active" && (mapping.relevance === "direct" || mapping.relevance === "proxy"));
  const configurations = new Set(current.flatMap((mapping) => mapping.evaluations.flatMap(({ configurations }) => configurations.map(({ id }) => id))));
  const direct = current.some((mapping) => mapping.relevance === "direct");
  const proxy = current.some((mapping) => mapping.relevance === "proxy");
  const comparisons = buildComparisons(mappings);
  return {
    endpoints: current.length,
    configurations: configurations.size,
    relevance: direct && proxy ? "mixed" : direct ? "direct" : proxy ? "proxy" : "none",
    gaps,
    comparisons: comparisons.length,
    held: heldJudgements(mappings).length,
    tools: toolsCompared(comparisons).length,
  };
}

export const evidenceRelevanceLabels: Record<EvidenceSummary["relevance"], string> = {
  direct: "Direct evidence for the stated endpoint",
  proxy: "Proxy evidence only",
  mixed: "Direct and proxy evidence",
  none: "No current evaluated evidence",
};

export const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** The counts in the use-case page header ("2 comparisons shown · 3 held for review · 10 tools"). */
export function evidenceCountParts(summary: EvidenceSummary): string[] {
  return [
    `${plural(summary.comparisons, "comparison")} shown`,
    ...(summary.held ? [`${summary.held} held for review`] : []),
    ...(summary.tools ? [plural(summary.tools, "tool")] : []),
  ];
}

export function evidenceSummaryParts(summary: EvidenceSummary): string[] {
  return [
    ...evidenceCountParts(summary),
    evidenceRelevanceLabels[summary.relevance],
    plural(summary.gaps, "recorded evidence gap"),
  ];
}

/** Describes mapped evidence already on record, independent of any open collection plan. A plan tracks one further unresolved comparison; it is not a statement that no evidence exists. */
export function evidenceCollectedLabel(summary: EvidenceSummary): string {
  return summary.endpoints > 0 ? `Already on record: ${evidenceCountParts(summary).join(" · ")}` : "No evaluated endpoints are recorded yet";
}

// A period after one of these, or after a single capital (an initial), does not end a sentence.
const ABBREVIATION = /(?:\b(?:et al|e\.g|i\.e|vs|cf|Fig|Figs|Tab|No|approx|Suppl|Ref|ca)|\b[A-Z])\.$/;

/** Splits a reviewed summary into its first sentence and short paragraphs of the rest. Layout only:
 * the sentences are kept in order and unchanged, so joining the parts gives the text back. */
export function summaryParagraphs(text: string, perParagraph = 3): string[] {
  const sentences: string[] = [];
  for (const part of text.trim().split(/(?<=[.!?])\s+(?=[A-Z(“"])/)) {
    if (sentences.length && ABBREVIATION.test(sentences[sentences.length - 1])) sentences[sentences.length - 1] += ` ${part}`;
    else sentences.push(part);
  }
  const [lead, ...rest] = sentences;
  const paragraphs = lead ? [lead] : [];
  for (let i = 0; i < rest.length; i += perParagraph) paragraphs.push(rest.slice(i, i + perParagraph).join(" "));
  return paragraphs;
}
