/** The description of a model, method, pipeline, service or configuration says what it does
 * (issue #88). Where a record came from, how a source printed it, and what was not inferred
 * about its identity belong in attributes.provenance_note, not in the description, because the
 * description is the first text a reader sees on the record page.
 *
 * descriptionProblems finds descriptions that are placeholders, carry provenance or citation
 * locators, or repeat another entity's description word for word. records -- check and
 * records -- add reject any record it reports. */

export const describedKinds = ["model", "method", "pipeline", "service", "configuration"] as const;
/** Kinds whose descriptions must also differ between differently named records. Configurations
 * of one model may legitimately share wording, so they are not compared. */
export const distinctKinds = ["model", "method", "pipeline", "service"] as const;

export type DescriptionRule = { id: string; kind: "placeholder" | "provenance"; pattern: RegExp; message: string };

export const descriptionRules: DescriptionRule[] = [
  { id: "named-family-placeholder", kind: "placeholder", pattern: /^named prediction model family\b/i,
    message: "placeholder: says only that the source names a model family" },
  { id: "identity-as-reported", kind: "placeholder", pattern: /\bidentity as reported\b/i,
    message: "placeholder: says only that the identity is as the source reported it" },
  { id: "source-label-placeholder", kind: "placeholder", pattern: /\bsource-(reported|label(led)?) configuration\b|\bsource-reported configuration or submission label\b/i,
    message: "placeholder: says only that the configuration label comes from the source" },
  { id: "catalogue-placeholder", kind: "placeholder", pattern: /\bcandidate catalogue entry\b/i,
    message: "placeholder: catalogue candidate text" },
  { id: "as-run-in", kind: "provenance",
    pattern: /\bas (run|evaluated|reported|scored|listed|used|printed|selected|submitted|implemented|benchmarked|quoted|trained and evaluated|evaluated and reported)\b.{0,60}?\b(in|on|by|to|for)\b/i,
    message: "provenance: says where the record was run, listed or reported" },
  { id: "quoted-in", kind: "provenance", pattern: /\bquoted (in|from)\b/i, message: "provenance: says where scores were quoted" },
  { id: "not-new-execution", kind: "provenance", pattern: /\bnot a new(ly)?[- ](execution|executed)\b/i,
    message: "provenance: says the scores are not a new execution" },
  { id: "cited-study", kind: "provenance", pattern: /\b(in|from) the cited (study|comparison|benchmark|source|paper|evaluation)\b/i,
    message: "provenance: refers to the cited study" },
  { id: "this-paper", kind: "provenance", pattern: /\(this (paper|source|study)\)|\bin this (paper|source)\b/i,
    message: "provenance: refers to this paper" },
  { id: "source-reported", kind: "provenance", pattern: /\bsource-reported\b/i, message: "provenance: source-reported label" },
  { id: "reported-by-authors", kind: "provenance",
    pattern: /\b(comparator reported by|evaluated by the [^.;]{1,60} authors\b|is the configuration evaluated in)/i,
    message: "provenance: says who evaluated or reported it" },
  { id: "cited-as-reference", kind: "provenance", pattern: /\b(cited in the source as|the method record names)\b/i,
    message: "provenance: describes how the source cites it" },
  { id: "locator-in-parentheses", kind: "provenance",
    pattern: /\([^()]*\b(Table|Tables|Fig\.|Figure|Supplementary|Section|Introduction|Appendix)\s*S?\d*[^()]*\)/,
    message: "provenance: a source locator in parentheses" },
  { id: "citation-in-parentheses", kind: "provenance", pattern: /\([^()]*\bet al\.?[^()]*\)/,
    message: "provenance: a citation in parentheses; sources belong in source_ids" },
];

export type DescriptionRecord = { id: string; kind: string; name: string; description: string; status?: string };
export type DescriptionProblem = { id: string; kind: string; rule: string; message: string; description: string; shared_with?: string[] };

export const normaliseDescription = (text: string) => text.trim().replace(/\s+/g, " ").toLowerCase();

/** Problems with the descriptions of described kinds, in record order. Excluded records are not
 * published, so they are not checked. */
export function descriptionProblems(records: DescriptionRecord[]): DescriptionProblem[] {
  // A missing or non-string description is the schema's to report (validateRecords runs later).
  const described = records.filter((r) => (describedKinds as readonly string[]).includes(r.kind) && r.status !== "excluded" &&
    typeof r.description === "string");
  const byText = new Map<string, DescriptionRecord[]>();
  for (const r of described)
    if ((distinctKinds as readonly string[]).includes(r.kind) && r.description.trim())
      byText.set(normaliseDescription(r.description), [...(byText.get(normaliseDescription(r.description)) ?? []), r]);
  const problems: DescriptionProblem[] = [];
  for (const r of described) {
    const base = { id: r.id, kind: r.kind, description: r.description };
    for (const rule of descriptionRules)
      if (rule.pattern.test(r.description)) problems.push({ ...base, rule: rule.id, message: rule.message });
    if (!(distinctKinds as readonly string[]).includes(r.kind)) continue;
    const others = (byText.get(normaliseDescription(r.description)) ?? [])
      .filter((o) => o.id !== r.id && normaliseDescription(o.name) !== normaliseDescription(r.name));
    if (others.length)
      problems.push({ ...base, rule: "shared-description", message: "shares its description with a differently named entity",
        shared_with: others.map((o) => o.id) });
  }
  return problems;
}

/** Throw if any described record has a placeholder, provenance or shared description. */
export function validateDescriptions(records: DescriptionRecord[]): void {
  const problems = descriptionProblems(records);
  if (!problems.length) return;
  const shown = problems.slice(0, 20).map((p) => `${p.id}: ${p.message}${p.shared_with ? ` (${p.shared_with.join(", ")})` : ""}`);
  throw new Error(
    `${problems.length} descriptions are not functional. Say what the ${describedKinds.join(", ")} does in one sentence ` +
      `and put provenance in attributes.provenance_note:\n${shown.join("\n")}${problems.length > 20 ? `\n... and ${problems.length - 20} more (npm run records -- descriptions)` : ""}`,
  );
}
