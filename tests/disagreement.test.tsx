import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DisagreementView, leanText, POOL_ABOVE } from "../components/catalogue/DisagreementView";
import { disagreement, gapPercent, paperGroup, shortCitation, type SourceResolver } from "../lib/disagreement";
import type { Discrepancy, DiscrepancyStudy } from "../shared/omics/discrepancies";
import real from "./fixtures/disagreements.json";

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
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();
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
    expect(text(html)).toContain("Tied 2023 : Tied in all 4 comparisons");
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
  it("names each side of a two-study conflict, then the other papers, and says when a side is level", () => {
    const conflict = (studies: DiscrepancyStudy[]): Finding => ({ ...ordering(studies), rule: "two-study-conflict", consensus_higher: null });
    expect(view(conflict([study("source:Kim 2025", "party", { ag: 6, bz: 1 }), study("source:Lee 2024", "party", { bz: 4 })])).summary)
      .toBe("Kim 2025 ranks AlphaGenome above Borzoi in 6 of its 7 comparisons and Borzoi higher in 1. Lee 2024 ranks Borzoi above AlphaGenome in all 4 of its comparisons.");
    expect(view(conflict([
      study("source:Kim 2025", "party", { ag: 5 }), study("source:Lee 2024", "party", { bz: 3 }),
      study("source:Park 2023", "consensus", { ag: 3, bz: 3 }, { ties: 1 }), study("source:Cho 2022", "consensus", { ag: 1, bz: 1 }),
    ])).summary).toBe("Kim 2025 ranks AlphaGenome above Borzoi in all 5 of its comparisons. Lee 2024 ranks Borzoi above AlphaGenome in all 3 of its comparisons. The other 2 papers find Borzoi and AlphaGenome level: each is higher in 4 of their 9 comparisons; 1 is a tie.");
  });

  it("names a paper without a source record by its key", () => {
    const html = render(ordering([study("source:unnamed-key", "consensus", { ag: 3 }), study("source:Alavi 2026", "outlier", { bz: 2 })]));
    expect(html).toContain("Unnamed-key ranks AlphaGenome above Borzoi");
    expect(html).toMatch(/<th scope="row">unnamed-key<\/th>/);
  });
});

describe("disagreement views", () => {
  it("draws an ordering reversal as a row per paper, with the outlier marked", () => {
    const html = render(ordering([
      study("source:Kim 2025", "consensus", { ag: 20 }),
      study("source:Fortier et al. 2026", "consensus", { ag: 4, bz: 1 }),
      study("source:Jaganathan et al. 2026", "consensus", { ag: 3, bz: 2 }),
      study("source:Alavi 2026", "outlier", { bz: 9, ag: 3 }),
    ]));
    expect(html).not.toContain("Papers grouped by");
    expect(html.match(/class="[^"]*leanItem/g)?.length).toBe(4);
    expect(text(html)).toContain("Alavi 2026 Disagrees : Borzoi ahead in 9 of 12 comparisons");
    expect(text(html)).toContain("Jaganathan et al. 2026 : Split: AlphaGenome ahead in 3, Borzoi in 2, of 5 comparisons");
    expect(html).toContain("Papers compared (4)");
  });

  it("caps drawn papers at 12 and adds a row for the others together for 20 papers", () => {
    const many = [study("source:Alavi 2026", "outlier", { bz: 5 }), ...Array.from({ length: 19 }, (_, i) => study(`source:Paper ${i + 1}`, "consensus", { ag: 30 - i }))];
    const v = view(ordering(many));
    expect(v.summary).toBe("19 papers rank AlphaGenome above Borzoi in all 399 of their comparisons. Alavi 2026 ranks Borzoi above AlphaGenome in all 5 of its comparisons.");
    const html = render(ordering(many));
    // The bars show the first 12, the one that disagrees first, and say how many more.
    expect(html.match(/class="[^"]*leanItem/g)?.length).toBe(13);
    expect(text(html)).toContain("The other 19 papers together : AlphaGenome ahead in 399 of 399 comparisons");
    expect(html).toContain("The chart shows the 12 papers with the most comparisons, the one that disagrees first; 8 more are in the table.");
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
    expect(html).toMatch(/class="[^"]*gapBandBox/);
    expect(html).toContain("Gap to SpliceAI");
    expect(html).not.toContain("Papers grouped by");
    const compact = renderToStaticMarkup(<DisagreementView view={v} compact />);
    expect(compact).toContain(v.summary);
    expect(text(compact)).toContain("Disagrees Alavi 2026 : −30%");
    expect(html).toContain("Same as SpliceAI");
    expect(text(html)).toContain("Disagrees Alavi 2026 : −30%");
    expect(compact).not.toContain("Papers compared");
    // A gap range that spans the reference.
    expect(view({ ...f, studies: [study("source:Kim 2025", "consensus", {}, { gap: -0.02 }), study("source:Lee 2024", "consensus", {}, { gap: 0.04 })] }).summary)
      .toBe("In 2 papers, AlphaGenome scores between 2% below and 4% above SpliceAI.");
  });

  it("keeps the compact view to the summary and one row per paper", () => {
    const html = render(ordering([study("source:Kim 2025", "consensus", { ag: 6 }), study("source:Lee 2024", "consensus", { ag: 2 }, { ties: 1 }), study("source:Alavi 2026", "outlier", { bz: 2 })]), true);
    expect(text(html)).toContain("Alavi 2026 Disagrees : Borzoi ahead in 2 of 2 comparisons");
    expect(text(html)).toContain("Kim 2025 : AlphaGenome ahead in 6 of 6 comparisons");
    expect(text(html)).toContain("Lee 2024 : AlphaGenome ahead in 2 of 3 comparisons; 1 tie");
    expect(html).not.toContain("together");
    expect(html).not.toContain("Papers grouped by");
    expect(html).not.toContain("<table");
  });
});

// Findings from the data repository's discrepancy report, with each study's first source name.
describe("lean chart on real findings", () => {
  const sources = real.sources as Record<string, { name: string; year: unknown }>;
  const realView = (id: string) => disagreement(real.findings.find((f) => f.id === id) as unknown as Finding, (s) => {
    const first = sources[s.source_ids[0]];
    return { name: first.name, short: shortCitation(first.name, first.year), href: null, url: null, more: [] };
  }, (id) => ({ name: (real.names as Record<string, string>)[id], href: null }))!;
  const draw = (id: string, compact = false) => text(renderToStaticMarkup(<DisagreementView view={realView(id)} compact={compact} />));

  it("draws each paper, the one that disagrees first, and numbers studies that share a source name", () => {
    const v = realView("discrepancy-0311356983b743d6");
    expect(v.papers.map((p) => p.short)).toEqual(["BEELINE", "BEELINE (study 2)", "BEELINE (study 3)"]);
    const words = draw(v.id, true);
    expect(words).toContain("GRNBoost2 ahead Even PPCOR (partial Pearson correlation) ahead");
    expect(words).toContain("BEELINE Disagrees : PPCOR (partial Pearson correlation) ahead in 9 of 12 comparisons");
    expect(words).toContain("BEELINE (study 2) : GRNBoost2 ahead in 37 of 44 comparisons; 1 tie");
    expect(words).toContain("BEELINE (study 3) : GRNBoost2 ahead in 10 of 15 comparisons; 3 ties");
  });

  it("leans each bar from the even line toward the paper's model, thicker for more comparisons", () => {
    const html = renderToStaticMarkup(<DisagreementView view={realView("discrepancy-0311356983b743d6")} compact />);
    const bars = [...html.matchAll(/class="[^"]*leanTrack[^"]*" style="height:(\d+)px"[^>]*><span class="[^"]*(leanA|leanB)[^"]*" style="left:([\d.]+)%;width:([\d.]+)%"/g)]
      .map(([, height, side, left, width]) => ({ height: Number(height), side, left: Number(left), width: Number(width) }));
    // BEELINE: 9 of 12 for PPCOR, so 75 percent: the bar runs right from 50 to 75.
    expect(bars[0]).toMatchObject({ side: "leanB", left: 50, width: 25 });
    // Study 2: 6 of 43 for PPCOR, so the bar runs left from about 14 to 50, and it is the thickest.
    expect(bars[1].side).toBe("leanA");
    expect(bars[1].left + bars[1].width).toBeCloseTo(50);
    expect(bars[1].height).toBe(18);
    expect(bars[0].height).toBeLessThan(bars[1].height);
  });

  it("says split and tied in words, as the grouping does", () => {
    const words = draw("discrepancy-44e5640b79522964");
    expect(words).toContain("Brandes et al. 2023 Disagrees : SIFT ahead in 3 of 4 comparisons; 1 tie");
    expect(words).toMatch(/: Split: PROVEAN ahead in 2, SIFT in 3, of 5 comparisons/);
    expect(words).toContain("ProteinGym : Tied in its one comparison");
  });

  it("adds a row for the other papers together above five, and in the compact view shows it with the outlier only", () => {
    const v = realView("discrepancy-31564883eee95750");
    expect(v.papers.filter((p) => p.role === "consensus").length).toBeGreaterThan(POOL_ABOVE);
    const full = draw(v.id);
    expect(full).toContain("The other 10 papers together : Nucleotide Transformer ahead in 104 of 171 comparisons; 15 ties");
    expect(full).toContain("By paper: 7 put Nucleotide Transformer ahead, 2 put DNABERT-2 ahead, 1 split or tied.");
    expect(full).toContain("GENEB leaderboard : Nucleotide Transformer ahead in 35 of 45 comparisons; 2 ties");
    const compact = renderToStaticMarkup(<DisagreementView view={v} compact />);
    expect(compact.match(/class="[^"]*leanItem/g)?.length).toBe(2);
    // The outlier rests on 3 comparisons: its bar is thin beside the 18px of the most compared paper.
    expect(compact).toMatch(/leanTrack[^"]*" style="height:8px"/);
  });

  it("marks both studies of a two-study conflict and pools neither", () => {
    const words = draw("discrepancy-055eb0dd61040574", true);
    expect(words).toMatch(/In conflict : AIDO\.RNA ahead in 36 of 36 comparisons/);
    expect(words).toMatch(/In conflict : RNAErnie ahead in 3 of 4 comparisons/);
    expect(words).not.toContain("Disagrees");
    expect(words).not.toContain("together");
  });

  it("gives each side of a two-study conflict its own sentence", () => {
    expect(realView("discrepancy-055eb0dd61040574").summary).toBe(
      "Zero-shot benchmarking of RNA language… ranks AIDO.RNA above RNAErnie in all 36 of its comparisons. RNAGym fitness leaderboard ranks RNAErnie above AIDO.RNA in 3 of its 4 comparisons and AIDO.RNA higher in 1.");
  });

  it("calls studies that share one source name studies, not papers", () => {
    expect(realView("discrepancy-0311356983b743d6").summary).toBe(
      "2 studies rank GRNBoost2 above PPCOR (partial Pearson correlation) in 47 of their 59 comparisons and PPCOR (partial Pearson correlation) higher in 8; 4 are ties. BEELINE ranks PPCOR (partial Pearson correlation) above GRNBoost2 in 9 of its 12 comparisons and GRNBoost2 higher in 3.");
    expect(realView("discrepancy-44e5640b79522964").summary).toMatch(/^5 papers rank PROVEAN above SIFT/);
  });

  it("states a row's counts", () => {
    const v = realView("discrepancy-0311356983b743d6");
    expect(leanText(v, { a: 0, b: 0, ties: 3 })).toBe("Tied in all 3 comparisons");
    expect(leanText(v, { a: 2, b: 2, ties: 0 })).toBe("Split: GRNBoost2 ahead in 2, PPCOR (partial Pearson correlation) in 2, of 4 comparisons");
    expect(leanText(v, { a: 1, b: 0, ties: 0 })).toBe("GRNBoost2 ahead in 1 of 1 comparison");
  });
});
