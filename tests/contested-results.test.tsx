import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import UseCaseComparison from "../components/catalogue/UseCaseComparison";
import { contestedBy, contestedResults, openDiscrepancies, type Discrepancy } from "../lib/discrepancies";
import type { Comparison } from "../lib/use-case-comparisons";

const discrepancy = (id: string, extra: Partial<Discrepancy> = {}): Discrepancy => ({
  id, rule: "ordering-reversal", label: `Label ${id}`, summary: `Summary ${id}`, severity: "low", scope: "cross-task",
  identity_basis: "unreviewed", review_state: "open", review_claim: null, settled: false, resolution: {},
  systems: ["a", "b"], consensus_higher: "a", reference_system: null, outlier_sources: ["s1"], consensus_sources: ["s2"],
  outlier_results: [], consensus_results: [], numbers: {}, ...extra,
});

describe("contested results", () => {
  const file = { release_id: "2026-10-22-fbd3d9705499", rules: {}, discrepancies: [
    discrepancy("d-low", { outlier_results: ["r1", "r2"] }),
    discrepancy("d-medium", { severity: "medium", outlier_results: ["r2"] }),
    discrepancy("d-settled", { severity: "high", settled: true, review_state: "explained", outlier_results: ["r3"] }),
  ] };

  it("lists unsettled discrepancies, most severe first, and indexes them by outlier result", () => {
    const open = openDiscrepancies(file);
    expect(open.map((d) => d.id)).toEqual(["d-medium", "d-low"]);
    const byResult = contestedResults(open);
    expect(byResult.has("r3")).toBe(false);
    expect(contestedBy(["r1", "r2", "r9"], byResult).map((d) => d.id)).toEqual(["d-medium", "d-low"]);
    expect(contestedBy(["r9"], byResult)).toEqual([]);
  });

  it("marks only the rows whose results a discrepancy rests on, linking to its entry", () => {
    const row = (id: string, resultIds: string[]) => ({ id, name: id.toUpperCase(), detail: null, parentId: null, methodTypes: [], origin: null, resultIds,
      cells: [{ printed: "0.5", numeric: 0.5, best: false, shown: { text: "0.5", missing: false }, qualifier: null, secondary: [] }] });
    const comparison = {
      id: "c", title: "Splicing", endpoint: "", columnEndpoints: [], relevance: "direct", layout: "metrics",
      headline: { metric: "auprc", label: "auPRC", direction: "higher" }, columns: [{ label: "auPRC", metric: "auprc", qualifier: null, direction: "higher" }],
      rows: [row("flagged", ["r2"]), row("clean", ["r9"])], origins: [], limitations: [], protocols: [], mappingIds: [], legend: [],
    } as unknown as Comparison;
    const html = renderToStaticMarkup(<UseCaseComparison comparison={comparison} useCasePath="/use-cases/x/" contested={contestedResults(openDiscrepancies(file))} />);
    expect(html.match(/Contested/g)?.length).toBe(1);
    expect(html).toMatch(/href="\/contested\/?#d-medium"/);
    expect(html).toContain("Contested (2)");
    expect(renderToStaticMarkup(<UseCaseComparison comparison={comparison} useCasePath="/use-cases/x/" />)).not.toContain("Contested");
  });
});
