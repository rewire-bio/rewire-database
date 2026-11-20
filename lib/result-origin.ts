/**
 * Who produced a result: the evaluation's `origin` in the release (data/vocab/origin.ttl in
 * rewire-benchmark-data). Every origin label on the site is defined here: the short label for
 * badges and tables, the sentence form for record pages, and the plural form for counts. No data
 * and no file access, so client components can import it.
 */

export const ORIGIN_LABELS: Record<string, string> = {
  author_reported: "Developer-reported",
  independent_paper: "Independent study",
  rewire_run: "Rewire run",
  paper_compilation: "Quoted from another paper",
  unreported: "Source does not say who ran it",
};

/** The label on record pages, where it stands next to the evaluation it describes. */
export const ORIGIN_EVALUATION_LABELS: Record<string, string> = {
  author_reported: "Author-reported evaluation",
  independent_paper: "Independent external evaluation",
  rewire_run: "Rewire evaluation",
  paper_compilation: "Result quoted from another source",
  unreported: "Source does not say who ran the evaluation",
};

/** The label beside a count of evaluations. */
export const ORIGIN_COUNT_LABELS: Record<string, string> = {
  author_reported: "Author-reported evaluations",
  independent_paper: "External evaluations",
  rewire_run: "Published Rewire evaluations",
  paper_compilation: "Evaluations quoted from another source",
  unreported: "Evaluations whose source does not say who ran them",
};

/** What each origin means, for tooltips, row details and the LLM files. */
export const ORIGIN_DESCRIPTIONS: Record<string, string> = {
  author_reported: "Reported by the developers of the evaluated tool.",
  independent_paper: "Reported in a study whose authors did not develop the evaluated tool.",
  rewire_run: "Run by Rewire, not transcribed from a publication. Rewire wrote some of the baselines and controls it runs, so a Rewire run is not counted as independent of the tool's developers.",
  paper_compilation: "A value the source copied from another paper or benchmark table.",
  unreported: "The source prints the value but does not say who ran the tool, so it is not counted as independent.",
};

/** Shown when the evaluation record has no origin at all. */
export const ORIGIN_NOT_RECORDED = "Origin not recorded";
export const ORIGIN_NOT_RECORDED_DESCRIPTION = "The evaluation record has no origin.";
/** Shown for an origin value this file has no description for (a value newer than the site). */
export const ORIGIN_UNDESCRIBED = "The release uses this origin value, and this site has no description for it yet.";

/**
 * Origins that count as independent of the tool's developers. A Rewire run is not in the set: the
 * release does not record who developed a tool, and several Rewire runs score baselines and
 * controls that Rewire wrote. It keeps its own label, "Rewire run".
 */
export const INDEPENDENT_ORIGINS: ReadonlySet<string> = new Set(["independent_paper"]);

export const isIndependentOrigin = (origin: string | null | undefined) => !!origin && INDEPENDENT_ORIGINS.has(origin);

const readable = (origin: string) => origin.replace(/_/g, " ");
const given = (origin: unknown): string | null => (typeof origin === "string" && origin.trim() ? origin.trim() : null);

export const originLabel = (origin: string | null | undefined) => {
  const value = given(origin);
  return value ? ORIGIN_LABELS[value] ?? readable(value) : ORIGIN_NOT_RECORDED;
};

/** Record-page label. An unknown value stays readable and is never merged with "unreported". */
export const originEvaluationLabel = (origin: unknown) => {
  const value = given(origin);
  return value ? ORIGIN_EVALUATION_LABELS[value] ?? `Evaluation origin: ${readable(value)}` : "Evaluation origin not recorded";
};

export const originCountLabel = (origin: string) => ORIGIN_COUNT_LABELS[origin] ?? `Evaluations with origin ${readable(origin)}`;

export const originDescription = (origin: string | null | undefined) => {
  const value = given(origin);
  return value ? ORIGIN_DESCRIPTIONS[value] ?? ORIGIN_UNDESCRIBED : ORIGIN_NOT_RECORDED_DESCRIPTION;
};
