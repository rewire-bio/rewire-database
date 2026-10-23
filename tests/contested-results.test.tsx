import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create } from "react-test-renderer";
import type { CatalogueRecord, CatalogueSnapshot } from "../shared/omics/catalogue-query";
import type { Discrepancy, DiscrepancyAction } from "../shared/omics/discrepancies";
import type { PreparedCatalogue } from "../shared/omics/prepared-catalogue";
import { preparedFromSnapshot } from "./helpers/prepared";
import UseCaseComparison from "../components/catalogue/UseCaseComparison";
import OverdueMark from "../components/catalogue/OverdueMark";
import { ContestedPanel } from "../components/catalogue/Contested";
import type { Comparison } from "../lib/use-case-comparisons";
import {
  contestedFilters, contestedList, contestedPaths, contestedQuery, contestedResults, contestingFindings,
  investigatedFindings, openFindingsForSystem, overdue, pendingCheck,
} from "../lib/discrepancies";

const fixture = vi.hoisted(() => ({ query: null as PreparedCatalogue | null }));
vi.mock("../lib/catalogue-build", () => ({
  buildCatalogue: () => ({
    catalogue: { release_id: fixture.query!.release_id, released_at: "2026-10-23T00:00:00Z", schema_version: "1.1", coverage: {} },
    query: fixture.query!,
  }),
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
    action({ revision: 2, action: "reported-upstream", state: "awaiting-correction", date: "2026-10-19", report_url: "https://example.org/report",
      awaiting: "A corrected preprint", next_check: "2026-11-10" }),
  ],
});
const findings = [
  alavi,
  finding("discrepancy-00000000000000bb", { severity: "medium", outlier_results: ["r-con-sa"], consensus_results: ["r-out-sa"] }),
  finding("discrepancy-00000000000000cc", { state: "explained", settled: true, outlier_results: ["r-clean"], systems: ["other", "spliceai"] }),
];
const use = (discrepancies?: Discrepancy[]) => { fixture.query = preparedFromSnapshot(snapshot(), { discrepancies }); return fixture.query; };

describe("contested results: wrapper", () => {
  it("keeps only known filter values and builds list URLs from them", () => {
    expect(contestedFilters({ severity: "high", state: "bogus", status: "open", system: "alphagenome", other: "x" }))
      .toEqual({ severity: "high", settled: "open", system: "alphagenome" });
    expect(contestedFilters({ system: "<script>", severity: ["medium", "low"] })).toEqual({ severity: "medium" });
    expect(contestedQuery({ severity: "high", cursor: "abc" }, { system: "spliceai" })).toBe("/contested/?severity=high&system=spliceai");
    expect(contestedQuery({})).toBe("/contested/");
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
    expect(html).toContain('href="https://example.org/report"');
    expect(html).toMatch(/\/contribute\/?\?type=correction&amp;target_id=r-out-ag/);
    expect(generateMetadata({ params: { id: alavi.id } }).alternates?.canonical).toBe(`https://benchmarks.rewirebio.io/contested/${alavi.id}/`);
    expect(() => FindingPage({ params: { id: "discrepancy-old0000000000000" } })).toThrow(`NEXT_REDIRECT /contested/${alavi.id}/`);
    expect(() => FindingPage({ params: { id: "discrepancy-missing" } })).toThrow("NEXT_NOT_FOUND");
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
