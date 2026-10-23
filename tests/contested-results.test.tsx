import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create } from "react-test-renderer";
import type { CatalogueRecord, CatalogueSnapshot } from "../shared/omics/catalogue-query";
import { normaliseDiscrepancies, type Discrepancy, type DiscrepancyAction, type DiscrepancyStudy } from "../shared/omics/discrepancies";
import type { PreparedCatalogue } from "../shared/omics/prepared-catalogue";
import { preparedFromSnapshot } from "./helpers/prepared";
import UseCaseComparison from "../components/catalogue/UseCaseComparison";
import OverdueMark from "../components/catalogue/OverdueMark";
import { ContestedPanel } from "../components/catalogue/Contested";
import type { Comparison } from "../lib/use-case-comparisons";
import {
  contestedFilters, contestedList, contestedPaths, contestedQuery, contestedResults, contestingFindings,
  investigatedFindings, linkLabel, openFindingsForSystem, overdue, pendingCheck, resultIdsOfUseCase, studyKeyUrl, studyRoleLabel,
} from "../lib/discrepancies";

const fixture = vi.hoisted(() => ({ query: null as PreparedCatalogue | null }));
vi.mock("../lib/catalogue-build", () => ({
  buildCatalogue: () => ({
    catalogue: { release_id: fixture.query!.release_id, released_at: "2026-10-23T00:00:00Z", schema_version: "1.1", coverage: {} },
    query: fixture.query!,
  }),
}));
vi.mock("../lib/use-cases-build", () => ({
  // One use case whose results are Alavi's AlphaGenome result and an unrelated one.
  fullUseCaseDetail: (slug: string) => slug === "patient-rna-splicing-validation"
    ? { use_case: { slug, title: "Patient RNA splicing validation" }, mappings: [{ evaluations: [{ results: [{ result: { id: "r-out-ag" } }, { result: { id: "r-clean" } }] }] }] }
    : null,
}));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
  permanentRedirect: (to: string) => { throw new Error(`NEXT_REDIRECT ${to}`); },
}));

const record = (id: string, kind: CatalogueRecord["kind"], extra: Partial<CatalogueRecord> = {}): CatalogueRecord => ({
  id, kind, name: id.toUpperCase(), description: "Synthetic", status: "source_checked", source_ids: [], links: [], facets: { areas: [] }, attributes: {}, ...extra,
});
const result = (id: string, model: string, source: string, value: string) => [
  record(`e-${id}`, "evaluation", { links: [{ relation: "system", target_id: model }] }),
  record(id, "result", { source_ids: [source], links: [{ relation: "evaluation", target_id: `e-${id}` }], attributes: { metric: "auprc", printed_value: value } }),
];
const snapshot = (): CatalogueSnapshot => ({
  schema_version: "1.1", release_id: "2026-10-23-a1a0ac69daa3", released_at: "2026-10-23T00:00:00Z", coverage: {},
  records: [
    record("alphagenome", "model"), record("spliceai", "model"), record("other", "model"),
    record("alavi-2026", "source"), record("study-b", "source"),
    ...result("r-out-ag", "alphagenome", "alavi-2026", "0.41"), ...result("r-out-sa", "spliceai", "alavi-2026", "0.62"),
    ...result("r-con-ag", "alphagenome", "study-b", "0.81"), ...result("r-con-sa", "spliceai", "study-b", "0.70"),
    ...result("r-clean", "other", "study-b", "0.50"),
  ],
});
const action = (extra: Partial<DiscrepancyAction>): DiscrepancyAction => ({
  revision: 1, claim_id: null, action: null, state: "open", date: null, rationale: null, investigation_url: null, report_url: null,
  upstream_response: null, awaiting: null, expected_by: null, next_check: null, resolved_by: [], ...extra,
});
const finding = (id: string, extra: Partial<Discrepancy> = {}): Discrepancy => ({
  id, previous_ids: [], rule: "ordering-reversal", label: `Label ${id}`, summary: `Summary ${id}`, severity: "low", scope: "cross-task",
  identity_basis: "unreviewed", state: "open", settled: false, systems: ["alphagenome", "spliceai"], consensus_higher: "alphagenome",
  reference_system: null, outlier_sources: ["alavi-2026"], consensus_sources: ["study-b"], outlier_results: [], consensus_results: [],
  numbers: { outlier_comparisons: 2, outlier_reversals: 2, consensus_comparisons: 6, consensus_agreements: 6 }, actions: [], ...extra,
});
const alavi = finding("discrepancy-00000000000000aa", {
  severity: "high", state: "awaiting-correction", previous_ids: ["discrepancy-old0000000000000"],
  outlier_results: ["r-out-ag", "r-out-sa"], consensus_results: ["r-con-ag", "r-con-sa"],
  actions: [
    action({ revision: 1, action: "investigated", state: "investigating", date: "2026-10-18", rationale: "Traced to an off-by-one in the scripts.",
      investigation_url: "https://github.com/rewire-bio/rewire-benchmark-data/issues/174" }),
    action({ revision: 2, action: "reported-upstream", state: "awaiting-correction", date: "2026-10-19", report_url: "https://github.com/marcel-2c8/Probing-genomic-foundation-models-2026/issues/2",
      upstream_response: "The owner confirmed the offset.",
      awaiting: "A corrected preprint", next_check: "2026-11-10" }),
  ],
});
const findings = [
  alavi,
  finding("discrepancy-00000000000000bb", { severity: "medium", outlier_results: ["r-con-sa"], consensus_results: ["r-out-sa"] }),
  finding("discrepancy-00000000000000cc", { state: "explained", settled: true, outlier_results: ["r-clean"], systems: ["other", "spliceai"] }),
];
const comparison = (ag: number, sa: number, extra: Partial<DiscrepancyStudy["comparisons"][number]> = {}): DiscrepancyStudy["comparisons"][number] => ({
  protocol: "protocol-splice", dataset: null, metric: "auprc", unit: null, qualifier: null, split: null,
  values: { alphagenome: ag, spliceai: sa }, results: { alphagenome: "r-con-ag", spliceai: "r-con-sa" },
  higher: ag > sa ? "alphagenome" : ag < sa ? "spliceai" : null, ...extra,
});
const study = (key: string, role: DiscrepancyStudy["role"], extra: Partial<DiscrepancyStudy>): DiscrepancyStudy => ({
  key, role, source_ids: [], higher: {}, ties: 0, gap: null, comparisons_total: 0, comparisons: [], ...extra,
});
// The disagreeing study, a consensus study with a tie, and a consensus study whose comparisons are capped.
const studied = finding("discrepancy-00000000000000dd", {
  outlier_results: ["r-out-ag", "r-out-sa"], consensus_results: ["r-con-ag", "r-con-sa"],
  studies: [
    study("source:study-b", "consensus", { source_ids: ["study-b"], higher: { alphagenome: 2 }, ties: 1, comparisons_total: 3,
      comparisons: [comparison(0.81, 0.7), comparison(0.9, 0.8, { qualifier: "macro", unit: "score", split: "test" }), comparison(0.5, 0.5)] }),
    study("doi:10.1234/third", "consensus", { higher: { alphagenome: 4 }, comparisons_total: 4, comparisons: [comparison(0.7, 0.6, { dataset: "Unlinked set" })] }),
    study("doi:10.64898/2026.10.02.756289", "outlier", { source_ids: ["alavi-2026"], higher: { spliceai: 2 }, comparisons_total: 2,
      comparisons: [comparison(0.41, 0.62, { results: { alphagenome: "r-out-ag", spliceai: "r-out-sa" } }), comparison(0.3, 0.5)] }),
  ],
});
// Resolved: the error was confirmed and the results withdrawn, so the rules no longer find it.
const resolvedFinding = finding("discrepancy-00000000000000ee", {
  // As the data release writes one: low severity, no sources or results, the last rationale as its summary.
  resolved: true, rule: "", scope: "", identity_basis: "", severity: "low", state: "confirmed-error", settled: true,
  label: "AlphaGenome and Borzoi: resolved", summary: "The authors confirmed a one-base offset; the results are marked disputed.",
  numbers: {}, studies: [], systems: ["alphagenome"], outlier_sources: [], consensus_sources: [], outlier_results: [], consensus_results: [],
  actions: [
    action({ revision: 1, action: "investigated", state: "investigating", date: "2026-10-18", investigation_url: "https://github.com/rewire-bio/rewire-benchmark-data/issues/174" }),
    action({ revision: 2, action: "reported-upstream", state: "awaiting-correction", date: "2026-10-19",
      report_url: "https://github.com/marcel-2c8/Probing-genomic-foundation-models-2026/issues/2" }),
    action({ revision: 3, action: "closed", state: "confirmed-error", date: "2026-10-23", rationale: "The authors confirmed a one-base offset; the results are marked disputed." }),
  ],
});
const use = (discrepancies?: Discrepancy[]) => { fixture.query = preparedFromSnapshot(snapshot(), { discrepancies }); return fixture.query; };

describe("contested results: wrapper", () => {
  it("keeps only known filter values and builds list URLs from them", () => {
    expect(contestedFilters({ severity: "high", state: "bogus", status: "open", system: "alphagenome", other: "x" }))
      .toEqual({ severity: "high", settled: "open", system: "alphagenome" });
    expect(contestedFilters({ system: "<script>", severity: ["medium", "low"] })).toEqual({ severity: "medium" });
    expect(contestedFilters({ use_case: "patient-rna-splicing-validation" })).toEqual({ use_case: "patient-rna-splicing-validation" });
    expect(contestedQuery({ use_case: "splicing", cursor: "x" })).toBe("/contested/?use_case=splicing");
    expect(contestedQuery({ severity: "high", cursor: "abc" }, { system: "spliceai" })).toBe("/contested/?severity=high&system=spliceai");
    expect(contestedQuery({})).toBe("/contested/");
  });
  it("names follow-up links and study roles", () => {
    expect(linkLabel("https://github.com/marcel-2c8/Probing-genomic-foundation-models-2026/issues/2")).toBe("marcel-2c8/Probing-genomic-foundation-models-2026#2");
    expect(linkLabel("https://github.com/rewire-bio/rewire-benchmark-data/pull/193#issuecomment-1")).toBe("rewire-bio/rewire-benchmark-data#193");
    expect(linkLabel("https://github.com/rewire-bio/rewire-benchmark-data")).toBe("github.com");
    expect(linkLabel("https://www.biorxiv.org/content/10.1101/x")).toBe("biorxiv.org");
    expect(linkLabel("mailto:someone@example.org")).toBeNull();
    expect(linkLabel("not a url")).toBeNull();
    expect(studyRoleLabel("outlier")).toBe("Disagrees");
    expect(studyRoleLabel("consensus")).toBe("Agrees");
    expect(studyKeyUrl("doi:10.1/x")).toBe("https://doi.org/10.1/x");
    expect(studyKeyUrl("repository:https://github.com/o/r")).toBe("https://github.com/o/r");
    expect(studyKeyUrl("repository:javascript:alert(1)")).toBeNull();
    expect(studyKeyUrl("source:abc")).toBeNull();
  });
  it("defaults a finding's studies to none when the file has no per-study data", () => {
    const file = normaliseDiscrepancies({ release_id: "r", discrepancies: [{ id: "x", rule: "ordering-reversal", severity: "low" }] });
    expect(file.discrepancies[0].studies).toEqual([]);
    const studies = [study("doi:1", "outlier", {})];
    expect(normaliseDiscrepancies({ release_id: "r", discrepancies: [{ id: "x", rule: "r", severity: "low", studies }] }).discrepancies[0].studies).toEqual(studies);
  });
  it("decides overdue from the date it is given, and only for an unsettled finding's latest check", () => {
    expect(overdue("2026-11-10", "2026-11-10")).toBe(false);
    expect(overdue("2026-11-10", "2026-11-11")).toBe(true);
    expect(overdue("2026-11-10", new Date("2026-12-01T09:00:00Z"))).toBe(true);
    expect(overdue(null, "2027-01-01")).toBe(false);
    expect(pendingCheck(alavi)).toBe("2026-11-10");
    expect(pendingCheck({ ...alavi, settled: true })).toBeNull();
    expect(pendingCheck({ ...alavi, actions: [...alavi.actions, action({ revision: 3, state: "awaiting-correction" })] })).toBeNull();
  });
  it("filters and counts the list, and lists every finding's page", () => {
    use(findings);
    const all = contestedList({})!;
    expect(all.totals).toMatchObject({ all: 3, open: 2, settled: 1, severity: { high: 1, medium: 1, low: 1 } });
    expect(all.page.items.map((d) => d.id)).toEqual(findings.map((d) => d.id));
    expect(contestedList({ settled: "open" })!.page.items.map((d) => d.severity)).toEqual(["high", "medium"]);
    expect(contestedList({ state: "explained" })!.page.total).toBe(1);
    expect(contestedList({ system: "other" })!.page.items.map((d) => d.id)).toEqual(["discrepancy-00000000000000cc"]);
    expect(contestedList({ cursor: "not-a-cursor" })!.page.total).toBe(3);
    expect(contestedPaths()).toEqual(findings.map((d) => `/contested/${d.id}/`));
    expect(openFindingsForSystem("spliceai").map((d) => d.id)).toEqual(["discrepancy-00000000000000aa", "discrepancy-00000000000000bb"]);
    expect(investigatedFindings().map((f) => [f.discrepancy.id, f.investigation_url]))
      .toEqual([["discrepancy-00000000000000aa", "https://github.com/rewire-bio/rewire-benchmark-data/issues/174"]]);
  });
  it("keeps resolved findings out of the main list, in their own section and status, and out of open counts", () => {
    use([...findings, resolvedFinding]);
    expect(contestedFilters({ status: "resolved" })).toEqual({ settled: "resolved" });
    const all = contestedList({})!;
    expect(all.totals).toMatchObject({ all: 4, open: 2, settled: 1, resolved: 1 });
    expect(all.page.items.map((d) => d.id)).toEqual(findings.map((d) => d.id));
    expect(all.resolved.map((d) => d.id)).toEqual([resolvedFinding.id]);
    expect(contestedList({ settled: "settled" })!.page.items.map((d) => d.id)).toEqual(["discrepancy-00000000000000cc"]);
    const only = contestedList({ settled: "resolved" })!;
    expect(only.page.items.map((d) => d.id)).toEqual([resolvedFinding.id]);
    expect(only.resolved).toEqual([]);
    expect(contestedList({ settled: "open" })!.resolved).toEqual([]);
    expect(contestedList({ settled: "settled" })!.resolved.map((d) => d.id)).toEqual([resolvedFinding.id]);
    // The other filters apply to the resolved section too.
    expect(contestedList({ severity: "high" })!.resolved).toEqual([]);
    expect(openFindingsForSystem("alphagenome").map((d) => d.id)).not.toContain(resolvedFinding.id);
  });
  it("filters to the findings a use case's results take part in, in either role", () => {
    use(findings);
    const results = (slug: string) => (slug === "u" ? ["r-out-sa", "r-clean"] : null);
    // r-out-sa is outlier in aa and consensus in bb; r-clean is outlier in the settled cc.
    expect(contestedList({ use_case: "u" }, undefined, results)!.page.items.map((d) => d.id))
      .toEqual(["discrepancy-00000000000000aa", "discrepancy-00000000000000bb", "discrepancy-00000000000000cc"]);
    expect(contestedList({ use_case: "u", settled: "open", severity: "medium" }, undefined, results)!.page.items.map((d) => d.id))
      .toEqual(["discrepancy-00000000000000bb"]);
    expect(contestedList({ use_case: "missing" }, undefined, results)!.page.total).toBe(0);
    expect(contestedList({ use_case: "u" }, undefined, results)!.totals.all).toBe(3);
    expect(resultIdsOfUseCase({ mappings: [{ evaluations: [{ results: [{ result: { id: "a" } }] }, { results: [{ result: { id: "b" } }] }] }] })).toEqual(["a", "b"]);
    expect(resultIdsOfUseCase(null)).toBeNull();
  });
  it("badges a row only for unsettled findings in which its results are the disagreeing study's", () => {
    use(findings);
    const byResult = contestedResults(["r-out-ag", "r-out-sa", "r-con-sa", "r-clean"]);
    expect(byResult["r-out-sa"].map((c) => c.role)).toEqual(["outlier", "consensus"]);
    expect(contestingFindings(["r-out-ag", "r-out-sa"], byResult).map((d) => d.id)).toEqual(["discrepancy-00000000000000aa"]);
    expect(contestingFindings(["r-clean"], byResult)).toEqual([]);
    expect(contestingFindings(["r-con-sa"], byResult).map((d) => d.id)).toEqual(["discrepancy-00000000000000bb"]);
  });
});

describe("contested results: pages", () => {
  it("lists findings with counts, filters and the flag-only note", async () => {
    use(findings);
    const { default: ContestedPage } = await import("../app/contested/page");
    const html = renderToStaticMarkup(<ContestedPage searchParams={{ status: "open" }} />);
    expect(html).toContain("automatic leads, not findings of error");
    expect(html).toContain("A flag never hides a result");
    expect(html).toContain("rewire-benchmark-data/blob/main/docs/discrepancies.md");
    expect(html).toMatch(/<strong>2<\/strong>open/);
    expect(html).toMatch(/href="\/contested\/discrepancy-00000000000000aa\/?"/);
    expect(html).toMatch(/href="\/contested\/discrepancy-00000000000000bb\/?"/);
    expect(html).not.toContain("discrepancy-00000000000000cc");
    expect(html).toContain("Next check 10 November 2026");
  });
  it("names the use case it filters by, and links back to it", async () => {
    use(findings);
    const { default: ContestedPage } = await import("../app/contested/page");
    const html = renderToStaticMarkup(<ContestedPage searchParams={{ use_case: "patient-rna-splicing-validation" }} />);
    expect(html).toContain("Patient RNA splicing validation");
    expect(html).toMatch(/href="\/use-cases\/patient-rna-splicing-validation\/?"/);
    expect(html).toContain("2 findings match");
    expect(html).toContain('name="use_case" value="patient-rna-splicing-validation"');
    expect(renderToStaticMarkup(<ContestedPage searchParams={{ use_case: "nothing-here" }} />)).toContain("an unknown use case");
  });
  it("shows a finding's numbers, results and follow-up timeline, and redirects an earlier ID", async () => {
    use(findings);
    const { default: FindingPage, generateMetadata } = await import("../app/contested/[id]/page");
    const html = renderToStaticMarkup(<FindingPage params={{ id: alavi.id }} />);
    expect(html).toContain("rank ALPHAGENOME above SPLICEAI in 6 of 6 comparisons");
    expect(html).toContain("ranks SPLICEAI above ALPHAGENOME in 2 of 2 comparisons");
    expect(html).toMatch(/href="\/database\/result\/r-out-ag\/?">0.41</);
    expect(html).toMatch(/<th scope="row"><span><a href="\/database\/model\/alphagenome\/?">ALPHAGENOME/);
    expect(html).toContain("In the other studies (2)");
    expect(html).toContain("18 October 2026: Investigated");
    expect(html).toContain("19 October 2026: Reported to the authors");
    expect(html).toContain("Waiting for: A corrected preprint");
    expect(html).toContain("Next check: 10 November 2026");
    expect(html).toContain('19 October 2026: Reported to the authors · <a href="https://github.com/marcel-2c8/Probing-genomic-foundation-models-2026/issues/2">marcel-2c8/Probing-genomic-foundation-models-2026#2</a>');
    expect(html).toContain('18 October 2026: Investigated · <a href="https://github.com/rewire-bio/rewire-benchmark-data/issues/174">rewire-bio/rewire-benchmark-data#174</a>');
    expect(html).toContain("Issue raised with the authors · ");
    expect(html).toContain("Our investigation · ");
    expect(html).toContain("Authors&#x27; response: The owner confirmed the offset.");
    // Without per-study data the page keeps the result lists and has no studies section.
    expect(html).not.toContain("Which studies agree");
    expect(html).toMatch(/\/contribute\/?\?type=correction&amp;target_id=r-out-ag/);
    expect(generateMetadata({ params: { id: alavi.id } }).alternates?.canonical).toBe(`https://benchmarks.rewirebio.io/contested/${alavi.id}/`);
    expect(() => FindingPage({ params: { id: "discrepancy-old0000000000000" } })).toThrow(`NEXT_REDIRECT /contested/${alavi.id}/`);
    expect(() => FindingPage({ params: { id: "discrepancy-missing" } })).toThrow("NEXT_NOT_FOUND");
  });
  it("shows which studies agree as a chart, a table and each study's comparisons", async () => {
    use([...findings, studied]);
    const { default: FindingPage } = await import("../app/contested/[id]/page");
    const html = renderToStaticMarkup(<FindingPage params={{ id: studied.id }} />);
    expect(html).toContain("Which studies agree");
    // The disagreeing study comes first, in the chart and the table, and is marked in words.
    expect(html).toContain("2 papers rank ALPHAGENOME above SPLICEAI in all 6 comparisons that are not ties (1 is a tie). ALAVI-2026 ranks SPLICEAI above ALPHAGENOME in all 2 of its comparisons.");
    expect(html).toContain("Papers grouped by which system they rank higher: ALPHAGENOME or SPLICEAI");
    expect(html).toContain("Rank ALPHAGENOME higher: 10.1234/third, STUDY-B. Rank SPLICEAI higher: ALAVI-2026 (disagrees). Mixed: none.");
    expect(html).toContain("ALAVI-2026 (disagrees): ALPHAGENOME higher in 0, SPLICEAI higher in 2, 0 ties.");
    expect(html).toContain("STUDY-B: ALPHAGENOME higher in 2, SPLICEAI higher in 0, 1 tie.");
    expect(html).toMatch(/Disagrees: <\/tspan>ALAVI-2026/);
    const rows = [...html.matchAll(/<tr class="([^"]*)"><th scope="row">(.*?)<\/tr>/g)].map((m) => m[2]);
    expect(rows[0]).toMatch(/ALAVI-2026.*<strong>Disagrees<\/strong><\/td><td>0<\/td><td>2<\/td><td>0<\/td>/);
    expect(html).toMatch(/STUDY-B<\/a>.*?<\/th><td>Agrees<\/td><td>2<\/td><td>0<\/td><td>1<\/td>/);
    // A study with no source record falls back to its key, linked to its DOI.
    expect(html).toMatch(/10\.1234\/third · <a href="https:\/\/doi.org\/10.1234\/third">DOI<\/a><\/th><td>Agrees<\/td><td>4<\/td>/);
    expect(html).not.toContain("Gap to");
    // Comparisons: capped, with a tie, the metric's qualifier, unit and split, and links to both results.
    expect(html).toContain("Comparisons in 10.1234/third (first 1 of 4)");
    expect(html).toContain("Comparisons in STUDY-B (3)");
    expect(html).toContain("AUPRC (macro), score, test split");
    expect(html).toMatch(/>0\.5<\/a><\/td><td><a[^>]*>0\.5<\/a><\/td><td>Tie<\/td>/);
    expect(html).toMatch(/href="\/database\/result\/r-out-ag\/?">0\.41<\/a><\/td><td><a href="\/database\/result\/r-out-sa\/?">0\.62<\/a><\/td><td>SPLICEAI</);
    expect(html).toContain("<td>Unlinked set</td>");
    // The result lists stay below.
    expect(html).toContain("The compared numbers");
  });
  it("lists resolved findings in their own section with their final state and date", async () => {
    use([...findings, resolvedFinding]);
    const { default: ContestedPage } = await import("../app/contested/page");
    const html = renderToStaticMarkup(<ContestedPage />);
    expect(html).toMatch(/<strong>1<\/strong>resolved/);
    expect(html).toContain('<h2 id="resolved-heading">Resolved</h2>');
    expect(html).toMatch(/href="\/contested\/discrepancy-00000000000000ee\/?">AlphaGenome and Borzoi: resolved<\/a> <span[^>]*>Confirmed error, 23 October 2026<\/span>/);
    expect(html.indexOf("resolved-heading")).toBeGreaterThan(html.indexOf("list-heading"));
    expect(html).toMatch(/href="\/contested\/?\?status=resolved"[^>]*>Resolved</);
    const only = renderToStaticMarkup(<ContestedPage searchParams={{ status: "resolved" }} />);
    expect(only).toContain("1 resolved finding matches");
    expect(only).not.toContain("resolved-heading");
    expect(renderToStaticMarkup(<ContestedPage searchParams={{ status: "open" }} />)).not.toContain("discrepancy-00000000000000ee");
  });
  it("shows a resolved finding's outcome, rationale and full follow-up, without the comparison", async () => {
    use([...findings, resolvedFinding]);
    const { default: FindingPage } = await import("../app/contested/[id]/page");
    const html = renderToStaticMarkup(<FindingPage params={{ id: resolvedFinding.id }} />);
    expect(html).toContain("Resolved finding");
    expect(html).toContain("<strong>Resolved: confirmed error on 23 October 2026.</strong>");
    // The last rationale is the summary, shown in the intro and the timeline but not again in the banner.
    expect(html).toContain('<p class="intro">The authors confirmed a one-base offset; the results are marked disputed.</p>');
    expect(html.match(/role="status">(.*?)<\/div>/)![1]).not.toContain("one-base offset");
    expect(html).toContain("The compared results were withdrawn from the database (marked disputed) after the error was confirmed");
    expect(html).not.toContain("An automatic lead, not a finding of error");
    expect(html).not.toContain("Which studies agree");
    expect(html).not.toContain("The compared numbers");
    expect(html).not.toContain("<dt>Rule</dt>");
    expect(html).toContain("What disagreed");
    for (const step of ["18 October 2026: Investigated", "19 October 2026: Reported to the authors", "23 October 2026: Closed"]) expect(html).toContain(step);
    expect(html).not.toContain("How to help resolve this");
  });
  it("adds the compact summary and chart to a list entry with per-study data", async () => {
    use([...findings, studied]);
    const { default: ContestedPage } = await import("../app/contested/page");
    const html = renderToStaticMarkup(<ContestedPage />);
    expect(html.match(/\(1 is a tie\)\. ALAVI-2026 ranks SPLICEAI above ALPHAGENOME/g)?.length).toBe(1);
    expect(html).toContain("2 other papers: ALPHAGENOME higher in 6, SPLICEAI higher in 0, 1 tie.");
    expect(html).not.toContain("Papers grouped by");
  });
  it("marks a passed next check in the browser, not in the server HTML", () => {
    expect(renderToStaticMarkup(<OverdueMark nextCheck="2026-11-10" />)).toBe("");
    let renderer!: ReturnType<typeof create>;
    act(() => { renderer = create(<OverdueMark nextCheck="2000-01-01" />); });
    expect(JSON.stringify(renderer.toJSON())).toContain("Overdue");
    act(() => { renderer.update(<OverdueMark nextCheck="2999-01-01" />); });
    expect(renderer.toJSON()).toBeNull();
  });
  it("puts a Contested badge on the use-case rows built on the disagreeing study's results", () => {
    use(findings);
    const row = (id: string, resultIds: string[]) => ({ id, name: id.toUpperCase(), detail: null, parentId: null, methodTypes: [], origin: null, resultIds,
      cells: [{ printed: "0.5", numeric: 0.5, best: false, shown: { text: "0.5", missing: false }, qualifier: null, secondary: [] }] });
    const comparison = {
      id: "c", title: "Splicing", endpoint: "", columnEndpoints: [], relevance: "direct", layout: "metrics",
      headline: { metric: "auprc", label: "auPRC", direction: "higher" }, columns: [{ label: "auPRC", metric: "auprc", qualifier: null, direction: "higher" }],
      rows: [row("alphagenome", ["r-out-ag"]), row("other", ["r-clean"])], origins: [], limitations: [], protocols: [], mappingIds: [], legend: [],
    } as unknown as Comparison;
    const contested = contestedResults(["r-out-ag", "r-clean"]);
    const html = renderToStaticMarkup(<UseCaseComparison comparison={comparison} useCasePath="/use-cases/x/" contested={contested} />);
    expect(html.match(/>Contested</g)?.length).toBe(1);
    expect(html).toMatch(/href="\/contested\/discrepancy-00000000000000aa\/?"/);
    expect(renderToStaticMarkup(<UseCaseComparison comparison={comparison} useCasePath="/use-cases/x/" />)).not.toContain("Contested");
  });
  it("shows a result's role in each finding on its record page panel", () => {
    use(findings);
    const html = renderToStaticMarkup(<ContestedPanel contests={contestedResults(["r-out-sa"])["r-out-sa"]} scope="result" />);
    expect(html).toContain("2 disagreements");
    expect(html).toContain("From the study that disagrees");
    expect(html).toContain("From a study in the agreeing group");
    expect(renderToStaticMarkup(<ContestedPanel contests={[]} scope="result" />)).toBe("");
  });
});

describe("contested results: a release without discrepancy data", () => {
  it("renders a plain no-data state and empty readers", async () => {
    use(undefined);
    expect(contestedList({})).toBeNull();
    expect(contestedPaths()).toEqual([]);
    expect(contestedResults(["r-out-ag"])).toEqual({});
    expect(openFindingsForSystem("alphagenome")).toEqual([]);
    const { default: ContestedPage } = await import("../app/contested/page");
    expect(renderToStaticMarkup(<ContestedPage />)).toContain("No discrepancy data in this release");
    const { default: FindingPage } = await import("../app/contested/[id]/page");
    expect(() => FindingPage({ params: { id: alavi.id } })).toThrow("NEXT_NOT_FOUND");
  });
});
