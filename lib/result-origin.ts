/**
 * Who produced a result: the evaluation's `origin` in the release (data/vocab/origin.ttl in
 * rewire-benchmark-data). One set of labels for the leaderboard, the use-case tables and the
 * LLM files. No data and no file access, so client components can import it.
 */

export const ORIGIN_LABELS: Record<string, string> = {
  author_reported: "Developer-reported",
  independent_paper: "Independent study",
  rewire_run: "Rewire run",
  paper_compilation: "Quoted from another paper",
  unreported: "Source does not say who ran it",
};

/** What each origin means, for tooltips and the LLM files. */
export const ORIGIN_DESCRIPTIONS: Record<string, string> = {
  author_reported: "Reported by the developers of the evaluated tool.",
  independent_paper: "Reported in a study whose authors did not develop the evaluated tool.",
  rewire_run: "Run by Rewire, not transcribed from a publication.",
  paper_compilation: "A value the source copied from another paper or benchmark table.",
  unreported: "The source prints the value but does not say who ran the tool, so it is not counted as independent.",
};

/** Shown when the evaluation record has no origin at all. */
export const ORIGIN_NOT_RECORDED = "Origin not recorded";

/** Origins that count as independent of the tool's developers. */
export const INDEPENDENT_ORIGINS: ReadonlySet<string> = new Set(["independent_paper", "rewire_run"]);

export const isIndependentOrigin = (origin: string | null | undefined) => !!origin && INDEPENDENT_ORIGINS.has(origin);

export const originLabel = (origin: string | null | undefined) =>
  origin ? ORIGIN_LABELS[origin] ?? origin.replace(/_/g, " ") : ORIGIN_NOT_RECORDED;

export const originDescription = (origin: string | null | undefined) =>
  origin ? ORIGIN_DESCRIPTIONS[origin] ?? "" : "The evaluation record has no origin.";
