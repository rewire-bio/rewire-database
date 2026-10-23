import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DisagreementView } from "../components/catalogue/DisagreementView";
import { disagreement, gapPercent, paperGroup, shortCitation, type SourceResolver } from "../lib/disagreement";
import type { Discrepancy, DiscrepancyStudy } from "../shared/omics/discrepancies";

const study = (key: string, role: DiscrepancyStudy["role"], higher: Record<string, number>, extra: Partial<DiscrepancyStudy> = {}): DiscrepancyStudy => {
  const ties = extra.ties ?? 0;
  const total = Object.values(higher).reduce((n, v) => n + v, 0) + ties;
  return { key, role, source_ids: [], higher, ties, gap: null, comparisons_total: total, comparisons: [], ...extra };
};
// Papers named by their key; a key starting "unnamed" has no source record.
const source: SourceResolver = (s) => {
  const name = s.key.replace(/^source:/, "");
  return name.startsWith("unnamed")
    ? { name, short: name, href: null, url: null, more: [] }
    : { name: `${name} full title`, short: name, href: `/database/source/${name}/`, url: null, more: [] };
};
const names = (id: string) => ({ name: { ag: "AlphaGenome", bz: "Borzoi", ref: "SpliceAI" }[id] ?? id, href: `/database/model/${id}/` });
type Finding = Pick<Discrepancy, "id" | "rule" | "systems" | "consensus_higher" | "reference_system" | "numbers" | "studies">;
const ordering = (studies: DiscrepancyStudy[]): Finding => ({
  id: "discrepancy-test", rule: "ordering-reversal", systems: ["bz", "ag"], consensus_higher: "ag", reference_system: null, numbers: {}, studies,
});
const view = (f: Finding) => disagreement(f, source, names)!;
const render = (f: Finding, compact = false) => renderToStaticMarkup(<DisagreementView view={view(f)} compact={compact} />);

describe("disagreement summary and grouping", () => {
  it("shortens source names to a citation", () => {
    expect(shortCitation("Probing Genomic Foundation Models with Splice-Variant Perturbations (Alavi, bioRxiv 2026)")).toBe("Alavi 2026");
    expect(shortCitation("A deep protein language model (Brandes et al., Nature Genetics 2023)")).toBe("Brandes et al. 2023");
    expect(shortCitation("Splice prediction algorithms (Fortier, Rudy and Scherer, PLOS One 2026)")).toBe("Fortier et al. 2026");
    expect(shortCitation("Blaabjerg et al. 2024, Nature Communications 15:9646 (Europe PMC full text XML)")).toBe("Blaabjerg et al. 2024");
    expect(shortCitation("Abstract: Qwen2 Technical Report (arXiv:2407.10671)")).toBe("Abstract: Qwen2 Technical Report…");
    // Names with no author: up to the first year, a label before a colon or bracket, or cut at a word.
    expect(shortCitation("AlphaGenome Nature 2026 supplementary comparison tables")).toBe("AlphaGenome Nature 2026");
    expect(shortCitation("ProteinGym: Large-Scale Benchmarks for Protein Fitness Prediction and Design", 2023)).toBe("ProteinGym 2023");
    expect(shortCitation("GENEB leaderboard (leaderboard.json, 13 task-type aggregates)")).toBe("GENEB leaderboard");
    expect(shortCitation("Comprehensive assessment of computational algorithms in predicting cancer driver mutations")).toBe("Comprehensive assessment…");
    expect(shortCitation("BEACON: repository README")).toBe("BEACON");
    // At least two thirds of the comparisons that are not ties decide the group.
    expect(paperGroup(3, 0)).toBe("a");
    expect(paperGroup(0, 2)).toBe("b");
    expect(paperGroup(2, 1)).toBe("a");
    expect(paperGroup(3, 9)).toBe("b");
    expect(paperGroup(3, 2)).toBe("mixed");
    expect(paperGroup(0, 0)).toBe("mixed");
    expect(gapPercent(0.123)).toBe("+12%");
    expect(gapPercent(-0.3)).toBe("−30%");
  });

  it("is null without per-study data", () => {
    expect(disagreement(ordering([]), source, names)).toBeNull();
    expect(disagreement({ ...ordering([]), studies: undefined }, source, names)).toBeNull();
  });

  it("puts the paper that disagrees first, then the most compared, and sums the consensus", () => {
    const v = view(ordering([
      study("source:Lee 2024", "consensus", { ag: 5 }),
      study("source:Alavi 2026", "outlier", { bz: 9, ag: 3 }),
      study("source:Kim 2025", "consensus", { ag: 20 }),
    ]));
    expect(v.papers.map((p) => p.short)).toEqual(["Alavi 2026", "Kim 2025", "Lee 2024"]);
    expect(v.a.name).toBe("AlphaGenome");
    expect(v.summary).toBe("2 papers rank AlphaGenome above Borzoi in all 25 of their comparisons. Alavi 2026 ranks Borzoi above AlphaGenome in 9 of its 12 comparisons and AlphaGenome higher in 3.");
    expect(v.papers.map((p) => p.group)).toEqual(["b", "a", "a"]);
  });

  it("handles one consensus paper, a mixed paper and a tie-heavy paper", () => {
    expect(view(ordering([study("source:Kim 2025", "consensus", { ag: 6 }), study("source:Alavi 2026", "outlier", { bz: 2 })])).summary)
      .toBe("Kim 2025 ranks AlphaGenome above Borzoi in all 6 of its comparisons. Alavi 2026 ranks Borzoi above AlphaGenome in all 2 of its comparisons.");
    const mixed = view(ordering([study("source:Kim 2025", "consensus", { ag: 4, bz: 3 }, { ties: 1 }), study("source:Alavi 2026", "outlier", { bz: 2 })]));
    expect(mixed.summary).toBe("Kim 2025 ranks AlphaGenome above Borzoi in 4 of its 8 comparisons and Borzoi higher in 3; 1 is a tie. Alavi 2026 ranks Borzoi above AlphaGenome in all 2 of its comparisons.");
    expect(mixed.papers[1].group).toBe("mixed");
    const ties = view(ordering([
      study("source:Kim 2025", "consensus", { ag: 1 }, { ties: 9 }),
      study("source:Tied 2023", "consensus", {}, { ties: 4 }),
      study("source:Alavi 2026", "outlier", { bz: 2 }, { ties: 6 }),
    ]));
    expect(ties.summary).toBe("2 papers rank AlphaGenome above Borzoi in the one comparison that is not a tie (13 are ties). Alavi 2026 ranks Borzoi above AlphaGenome in all 2 comparisons that are not ties (6 are ties).");
    const html = render(ordering([study("source:Tied 2023", "consensus", {}, { ties: 4 }), study("source:Alavi 2026", "outlier", { bz: 2 })]));
    expect(html).toContain("Tied 2023 finds AlphaGenome and Borzoi tied in all 4 comparisons.");
    // A paper with only ties sits in the overlap.
    expect(html).toContain("Mixed: Tied 2023.");
  });

  it("names an agreeing paper that leans the other way on its own, and capitalises a lowercase name", () => {
    const v = view(ordering([
      study("source:Livesey 2025", "consensus", { ag: 7 }),
      study("source:Clinical 2024", "consensus", { ag: 2, bz: 4 }),
      study("source:Open 2026", "consensus", { ag: 6 }),
      study("source:proteinbench evidence", "outlier", { bz: 9, ag: 1 }),
    ]));
    expect(v.summary).toBe("3 papers rank AlphaGenome above Borzoi in 15 of their 19 comparisons and Borzoi higher in 4. "
      + "Of those papers, Clinical 2024 ranks Borzoi higher on its own (4 of 6). "
      + "Proteinbench evidence ranks Borzoi above AlphaGenome in 9 of its 10 comparisons and AlphaGenome higher in 1.");
    // With one agreeing paper there is no pooled count to qualify.
    expect(view(ordering([study("source:Clinical 2024", "consensus", { ag: 2, bz: 4 }), study("source:Alavi 2026", "outlier", { bz: 2 })])).summary)
      .not.toContain("Of those papers");
  });
  it("names a paper without a source record by its key", () => {
    const html = render(ordering([study("source:unnamed-key", "consensus", { ag: 3 }), study("source:Alavi 2026", "outlier", { bz: 2 })]));
    expect(html).toContain("Unnamed-key ranks AlphaGenome above Borzoi");
    expect(html).toMatch(/<th scope="row">unnamed-key<\/th>/);
  });
});

describe("disagreement views", () => {
  it("draws an ordering reversal as grouped dots and bars, with the outlier marked", () => {
    const html = render(ordering([
      study("source:Kim 2025", "consensus", { ag: 20 }),
      study("source:Fortier et al. 2026", "consensus", { ag: 4, bz: 1 }),
      study("source:Jaganathan et al. 2026", "consensus", { ag: 3, bz: 2 }),
      study("source:Alavi 2026", "outlier", { bz: 9, ag: 3 }),
    ]));
    // Alavi ranks Borzoi higher in 9 of 12: three quarters, so it sits in the Borzoi circle.
    expect(html).toContain("Rank AlphaGenome higher: Kim 2025, Fortier et al. 2026. Rank Borzoi higher: Alavi 2026 (disagrees). Mixed: Jaganathan et al. 2026.");
    expect(html).toContain("Each paper sits where at least two thirds of its comparisons point; Mixed means neither model reaches two thirds.");
    // Labels are never cut short: the long name in the narrow overlap wraps onto two lines.
    expect(html).not.toContain("…");
    expect(html).toMatch(/<tspan[^>]*>Jaganathan et al\.<\/tspan><tspan[^>]*>2026<\/tspan>/);
    expect(html.match(/<circle cx="[\d.]+" cy="[\d.]+" r="(4|6)"/g)?.length).toBe(4);
    expect(html).toContain(">Mixed<");
    expect(html).toContain("Alavi 2026 (disagrees): AlphaGenome higher in 3, Borzoi higher in 9, 0 ties.");
    expect(html).toMatch(/Disagrees: <\/tspan>Alavi 2026/);
    expect(html).toContain("Papers compared (4)");
  });

  it("caps drawn papers at 12 and switches the groups to counts for 20 papers", () => {
    const many = [study("source:Alavi 2026", "outlier", { bz: 5 }), ...Array.from({ length: 19 }, (_, i) => study(`source:Paper ${i + 1}`, "consensus", { ag: 30 - i }))];
    const v = view(ordering(many));
    expect(v.summary).toBe("19 papers rank AlphaGenome above Borzoi in all 399 of their comparisons. Alavi 2026 ranks Borzoi above AlphaGenome in all 5 of its comparisons.");
    const html = render(ordering(many));
    // The groups show counts, with every name in the visible caption.
    expect(html).toMatch(/class="[^"]*vennCount[^"]*">19</);
    expect(html).toContain("Rank AlphaGenome higher (19): Paper 1, Paper 2,");
    expect(html).not.toMatch(/r="4"/);
    // The bars show the first 12, the one that disagrees first, and say how many more.
    expect(html.match(/<g( class="[^"]*")?><text x="0" y="\d+" class="[^"]*chartLabel/g)?.length).toBe(12);
    expect(html).toContain("The charts show the 12 papers with the most comparisons, the one that disagrees first; 8 more are in the table.");
    expect(html).toContain("Papers compared (20)");
  });

  it("draws a gap outlier as each paper's gap to the reference, with the other papers' range shaded", () => {
    const f: Finding = {
      id: "discrepancy-gap", rule: "gap-outlier", systems: ["ag", "ref"], consensus_higher: null, reference_system: "ref",
      numbers: { outlier_gap: -0.3, consensus_gap_min: 0.05, consensus_gap_max: 0.1 },
      studies: [
        study("source:Kim 2025", "consensus", { ag: 4 }, { gap: 0.05 }),
        study("source:Lee 2024", "consensus", { ag: 3 }, { gap: 0.1 }),
        study("source:Park 2023", "consensus", { ag: 3 }, { gap: 0.08 }),
        study("source:Alavi 2026", "outlier", { ref: 4 }, { gap: -0.3 }),
      ],
    };
    const v = view(f);
    expect(v.a.name).toBe("AlphaGenome");
    expect(v.b.name).toBe("SpliceAI");
    expect(v.consensusGap).toEqual([0.05, 0.1]);
    expect(v.summary).toBe("In 3 papers, AlphaGenome scores between 5% and 10% above SpliceAI. In Alavi 2026, AlphaGenome scores 30% below SpliceAI.");
    const html = renderToStaticMarkup(<DisagreementView view={v} />);
    expect(html).toContain("How far AlphaGenome scores from SpliceAI in each paper");
    expect(html).toContain("The other papers range from +5% to +10%. Alavi 2026 (disagrees): −30%.");
    expect(html).toMatch(/class="[^"]*gapBand/);
    expect(html).toContain("Gap to SpliceAI");
    expect(html).not.toContain("Papers grouped by");
    const compact = renderToStaticMarkup(<DisagreementView view={v} compact />);
    expect(compact).toContain(v.summary);
    expect(compact).toContain("Alavi 2026 −30%");
    expect(compact).not.toContain("Papers compared");
    // A gap range that spans the reference.
    expect(view({ ...f, studies: [study("source:Kim 2025", "consensus", {}, { gap: -0.02 }), study("source:Lee 2024", "consensus", {}, { gap: 0.04 })] }).summary)
      .toBe("In 2 papers, AlphaGenome scores between 2% below and 4% above SpliceAI.");
  });

  it("keeps the compact view to the summary and one bar for the others and one for the outlier", () => {
    const html = render(ordering([study("source:Kim 2025", "consensus", { ag: 6 }), study("source:Lee 2024", "consensus", { ag: 2 }, { ties: 1 }), study("source:Alavi 2026", "outlier", { bz: 2 })]), true);
    expect(html).toContain("2 other papers: AlphaGenome higher in 8, Borzoi higher in 0, 1 tie.");
    expect(html).toContain("Alavi 2026 (disagrees): AlphaGenome higher in 0, Borzoi higher in 2, 0 ties.");
    expect(html).not.toContain("Papers grouped by");
    expect(html).not.toContain("<table");
  });
});
