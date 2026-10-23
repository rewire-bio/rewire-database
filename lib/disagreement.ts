// What a finding's per-study data says, built once for the full and compact views.
import type { Discrepancy, DiscrepancyStudy } from "../shared/omics/discrepancies";
import { metricName } from "./result-labels";

export type Named = { name: string; href: string | null };

/** A study's source records as the page shows them; `short` is a citation such as "Alavi 2026". */
export type PaperSource = Named & { short: string; url: string | null; more: Named[] };

/** Which system at least two thirds of a paper's comparisons that are not ties rank higher; "mixed" when
 * neither reaches two thirds or every comparison is a tie. */
export type PaperGroup = "a" | "b" | "mixed";

/** The share of a paper's decided comparisons a system needs for the paper to count as ranking it higher. */
export const CLEAR_MAJORITY = 2 / 3;

export type Paper = PaperSource & {
  key: string;
  role: string;
  higherA: number;
  higherB: number;
  ties: number;
  gap: number | null;
  /** Comparisons counted, all of them; `comparisons` may hold fewer. */
  total: number;
  group: PaperGroup;
  comparisons: {
    protocol: Named | null;
    dataset: Named | null;
    metric: string;
    valueA: number | null;
    valueB: number | null;
    resultA: string | null;
    resultB: string | null;
    higher: "a" | "b" | null;
  }[];
};

export type Disagreement = {
  id: string;
  rule: string;
  /** Ordering reversal: the system the consensus ranks higher, then the other. Gap rule: the system, then the reference. */
  a: Named & { id: string };
  b: Named & { id: string };
  /** The study that disagrees first, then the most compared. */
  papers: Paper[];
  /** One or two plain sentences from the counts. */
  summary: string;
  /** Gap rule: the range of the other papers' gaps. */
  consensusGap: [number, number] | null;
};

/** Papers drawn one by one; above this, views show the first ones and say how many more. */
export const PAPER_LIMIT = 12;

/** The longest name used as it is for a paper that has no author and year to cite. */
const SHORT_NAME = 40;

/** "Alavi 2026" from a source name such as "Title (Alavi, bioRxiv 2026)" or "Tan et al., Nature 15 (2024)".
 * Source records hold no author list, so other names give, in order: the name up to its first year
 * ("AlphaGenome Nature 2026"), a short label before a colon or bracket ("ProteinGym"), the whole name when it is
 * short, or the name cut at a word boundary. The record's year is added when the result has none. */
export function shortCitation(name: string, year?: unknown): string {
  const trailing = name.match(/\(([^()]+)\)\s*$/)?.[1];
  if (trailing) {
    const parts = trailing.split(/,\s*/);
    const yearMatch = parts[parts.length - 1].match(/\b(?:19|20)\d{2}\b/);
    if (parts.length > 1 && yearMatch && /^[A-Z][^\d:]*$/.test(parts[0])) {
      const author = parts.length > 2 && !/et al\.?$/.test(parts[0]) ? `${parts[0]} et al.` : parts[0];
      return `${author} ${yearMatch[0]}`;
    }
  }
  const recorded = typeof year === "number" || typeof year === "string" ? String(year) : null;
  const leading = name.match(/^([A-Z][\p{L}'-]+ et al\.?)[ ,]/u)?.[1];
  const anyYear = name.match(/\b(?:19|20)\d{2}\b/)?.[0] ?? recorded;
  if (leading && anyYear) return `${leading.replace(/\.?$/, ".")} ${anyYear}`;
  const upToYear = name.match(/^[^():]*?\b(?:19|20)\d{2}\b/)?.[0];
  if (upToYear && upToYear.length >= 8 && upToYear.length <= SHORT_NAME) return upToYear;
  const withYear = (text: string) => (recorded && !text.includes(recorded) ? `${text} ${recorded}` : text);
  const label = name.match(/^([^:]{3,30}):\s/)?.[1] ?? name.match(/^([^():]{8,40}?)\s*\(/)?.[1];
  if (label && !/^(abstract|supplementary|appendix|source data)$/i.test(label)) return withYear(label);
  if (name.length <= SHORT_NAME) return withYear(name);
  const cut = name.slice(0, SHORT_NAME);
  const words = cut.slice(0, cut.lastIndexOf(" ") > 20 ? cut.lastIndexOf(" ") : SHORT_NAME)
    .replace(/[\s,;:(-]+$/, "").replace(/\s+(?:a|an|and|the|of|for|in|on|to|with|by|from)$/i, "");
  return `${words}…`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function paperGroup(higherA: number, higherB: number): PaperGroup {
  const decided = higherA + higherB;
  if (!decided) return "mixed";
  return higherA / decided >= CLEAR_MAJORITY ? "a" : higherB / decided >= CLEAR_MAJORITY ? "b" : "mixed";
}

/** "+12%" or "-30%": a relative gap as a percentage. */
export const gapPercent = (gap: number) => `${gap >= 0 ? "+" : "−"}${Math.abs(Math.round(gap * 100))}%`;

const relative = (gap: number, reference: string) => `${Math.abs(Math.round(gap * 100))}% ${gap >= 0 ? "above" : "below"} ${reference}`;

function orderingSummary(papers: Paper[], a: string, b: string): string {
  const sentence = (group: Paper[], higher: string, lower: string, countHigher: (p: Paper) => number, countLower: (p: Paper) => number) => {
    if (!group.length) return "";
    const one = group.length === 1;
    const subject = one ? group[0].short : `${group.length} papers`;
    const their = one ? "its" : "their";
    const up = group.reduce((n, p) => n + countHigher(p), 0);
    const down = group.reduce((n, p) => n + countLower(p), 0);
    const ties = group.reduce((n, p) => n + p.ties, 0);
    const tieNote = ties === 1 ? "1 is a tie" : `${ties} are ties`;
    const verb = one ? "ranks" : "rank";
    if (!up && !down) return `${subject} ${one ? "finds" : "find"} ${a} and ${b} tied in all ${plural(ties, "comparison")}.`;
    if (!down) {
      if (ties) return `${subject} ${verb} ${higher} above ${lower} in ${up === 1 ? "the one comparison that is not a tie" : `all ${up} comparisons that are not ties`} (${tieNote}).`;
      return `${subject} ${verb} ${higher} above ${lower} in ${up === 1 ? `${their} one comparison` : `all ${up} of ${their} comparisons`}.`;
    }
    return `${subject} ${verb} ${higher} above ${lower} in ${up} of ${their} ${up + down + ties} comparisons and ${lower} higher in ${down}${ties ? `; ${tieNote}` : ""}.`;
  };
  const consensus = papers.filter((p) => p.role !== "outlier");
  const outliers = papers.filter((p) => p.role === "outlier");
  return [
    sentence(consensus, a, b, (p) => p.higherA, (p) => p.higherB),
    sentence(outliers, b, a, (p) => p.higherB, (p) => p.higherA),
  ].filter(Boolean).join(" ");
}

function gapSummary(papers: Paper[], a: string, reference: string, range: [number, number] | null): string {
  const consensus = papers.filter((p) => p.role !== "outlier");
  const outliers = papers.filter((p) => p.role === "outlier" && p.gap !== null);
  const parts: string[] = [];
  if (range) {
    const subject = consensus.length === 1 ? consensus[0].short : consensus.length ? `${consensus.length} papers` : "the other papers";
    const [min, max] = range;
    const pct = (g: number) => `${Math.abs(Math.round(g * 100))}%`;
    const where = min === max ? relative(min, reference)
      : min >= 0 ? `between ${pct(min)} and ${pct(max)} above ${reference}`
        : max < 0 ? `between ${pct(max)} and ${pct(min)} below ${reference}`
          : `between ${pct(min)} below and ${pct(max)} above ${reference}`;
    parts.push(`In ${subject}, ${a} scores ${where}.`);
  }
  for (const o of outliers) parts.push(`In ${o.short}, ${a} scores ${relative(o.gap!, reference)}.`);
  return parts.join(" ");
}

export type SourceResolver = (study: DiscrepancyStudy) => PaperSource;
export type NameResolver = (id: string) => Named;

/** What a finding's studies show, or null for a finding without per-study data. */
export function disagreement(
  d: Pick<Discrepancy, "id" | "rule" | "systems" | "consensus_higher" | "reference_system" | "numbers" | "studies">,
  source: SourceResolver,
  name: NameResolver,
): Disagreement | null {
  const studies = d.studies ?? [];
  if (!studies.length) return null;
  const gapRule = d.rule === "gap-outlier";
  const aId = gapRule
    ? d.systems.find((s) => s !== d.reference_system) ?? d.systems[0]
    : d.consensus_higher ?? d.systems[0];
  const bId = gapRule ? d.reference_system ?? d.systems.find((s) => s !== aId) : d.systems.find((s) => s !== aId);
  if (!aId || !bId) return null;
  const papers = [...studies]
    .sort((x, y) => Number(y.role === "outlier") - Number(x.role === "outlier") || y.comparisons_total - x.comparisons_total)
    .map((s): Paper => {
      const higherA = s.higher[aId] ?? 0;
      const higherB = s.higher[bId] ?? 0;
      return {
        ...source(s),
        key: s.key, role: s.role, higherA, higherB, ties: s.ties, gap: s.gap,
        total: Math.max(s.comparisons_total, higherA + higherB + s.ties),
        group: paperGroup(higherA, higherB),
        comparisons: s.comparisons.map((c) => ({
          protocol: c.protocol ? name(c.protocol) : null,
          dataset: c.dataset ? name(c.dataset) : null,
          metric: [c.metric ? metricName(c.metric, c.qualifier) : "Not stated", c.unit, c.split && `${c.split} split`].filter(Boolean).join(", "),
          valueA: c.values[aId] ?? null,
          valueB: c.values[bId] ?? null,
          resultA: c.results[aId] ?? null,
          resultB: c.results[bId] ?? null,
          higher: c.higher === aId ? "a" : c.higher === bId ? "b" : null,
        })),
      };
    });
  const a = { id: aId, ...name(aId) };
  const b = { id: bId, ...name(bId) };
  const gaps = papers.filter((p) => p.role !== "outlier" && p.gap !== null).map((p) => p.gap!);
  const n = d.numbers as Record<string, number | undefined>;
  const consensusGap: [number, number] | null = !gapRule ? null
    : gaps.length ? [Math.min(...gaps), Math.max(...gaps)]
      : typeof n.consensus_gap_min === "number" && typeof n.consensus_gap_max === "number" ? [n.consensus_gap_min, n.consensus_gap_max] : null;
  return {
    id: d.id, rule: d.rule, a, b, papers, consensusGap,
    summary: gapRule ? gapSummary(papers, a.name, b.name, consensusGap) : orderingSummary(papers, a.name, b.name),
  };
}
