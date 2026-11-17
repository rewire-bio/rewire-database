import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import UseCaseComparison from "@/components/catalogue/UseCaseComparison";
import UseCasePage from "@/app/use-cases/[slug]/page";
import type { Comparison, ComparisonCell, ComparisonRow } from "@/lib/use-case-comparisons";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new Error("not found");
  },
}));

function createCell(
  text: string,
  best = false,
  secondary: { label: string; text: string; title: string; missing: boolean }[] = []
): ComparisonCell {
  return {
    shown: { text, derived: false, missing: false },
    printed: text,
    numeric: parseFloat(text) || null,
    qualifier: null,
    best,
    secondary,
  };
}

function createRow(
  id: string,
  name: string,
  cells: ComparisonCell[],
  overrides?: Partial<ComparisonRow>
): ComparisonRow {
  return {
    id,
    name,
    detail: "",
    parentId: null,
    origin: "peer_reviewed",
    resultIds: [],
    methodTypes: ["deep_learning"],
    cells,
    ...overrides,
  };
}

function createSampleComparison(overrides?: Partial<Comparison>): Comparison {
  return {
    id: "sample-comp-1",
    mappingIds: ["map-1"],
    title: "Test Comparison Benchmark",
    relevance: "direct",
    origins: ["peer_reviewed"],
    endpoint: "Interface contact accuracy",
    protocols: [
      {
        id: "prot-1",
        kind: "protocol",
        name: "Sample Benchmark Protocol",
        description: "Test protocol description",
        status: "source_checked",
        facets: {},
        source_ids: [],
        links: [],
        attributes: {},
      },
    ],
    limitations: [],
    legend: [],
    columnEndpoints: [],
    layout: "metrics",
    headline: { metric: "top1_acc", label: "Top-1 Accuracy", direction: "higher" },
    columns: [
      { metric: "top1", qualifier: "", direction: "higher", label: "Top-1 Accuracy" },
      { metric: "top5", qualifier: "", direction: "higher", label: "Top-5 Accuracy" },
      { metric: "dockq", qualifier: "", direction: "higher", label: "DockQ Score" },
    ],
    rows: [
      createRow("tool-alpha", "AlphaPredict", [
        createCell("0.88", true, [
          { label: "Precision", text: "0.91", title: "Interface precision", missing: false },
          { label: "Recall", text: "0.85", title: "Interface recall", missing: false },
        ]),
        createCell("0.95", true, [
          { label: "Top-5 Recall", text: "0.96", title: "Recall", missing: false },
        ]),
        createCell("0.74", true, []),
      ]),
      createRow("tool-beta", "BetaModel", [
        createCell("0.79", false, [
          { label: "Precision", text: "0.82", title: "Interface precision", missing: false },
        ]),
        createCell("0.89", false, []),
        createCell("0.68", false, []),
      ]),
    ],
    ...overrides,
  };
}

describe("Use-Case Comparison Redesign (TC-UCC-01 to TC-UCC-10)", () => {
  it("TC-UCC-01: Table cells never contain moreValues or details disclosures", () => {
    const comp = createSampleComparison();
    const html = renderToStaticMarkup(
      <UseCaseComparison
        comparison={comp}
        useCasePath="/use-cases/structure-prediction/"
      />
    );

    expect(html).not.toContain("moreValues");
    expect(html).not.toMatch(/<td[^>]*>[\s\S]*?<details[\s\S]*?<\/td>/);
  });

  it("TC-UCC-02: Each table cell contains only primary metric value, not secondary vertical stacks", () => {
    const comp = createSampleComparison();
    const html = renderToStaticMarkup(
      <UseCaseComparison
        comparison={comp}
        useCasePath="/use-cases/structure-prediction/"
      />
    );

    const cells = html.match(/<td[^>]*>([\s\S]*?)<\/td>/g) || [];
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) {
      // Cell must not contain secondary item stacks
      expect(cell).not.toContain("secondaryItem");
      // Must not contain more than 1 primary number in the cell
      const clean = cell.replace(/<[^>]+>/g, " ");
      const numbers = clean.match(/\b\d+(\.\d+)?\b/g) || [];
      expect(numbers.length).toBeLessThanOrEqual(1);
    }
  });

  it("TC-UCC-03: Drawer row displays secondary metrics and protocol evidence", () => {
    const comp = createSampleComparison();
    const html = renderToStaticMarkup(
      <UseCaseComparison
        comparison={comp}
        useCasePath="/use-cases/structure-prediction/"
        expandedRowId="tool-alpha"
      />
    );

    expect(html).toMatch(/<tr[^>]*class="[^"]*(drawer|metric-details)[^"]*"/);
    expect(html).toContain("Secondary Metrics");
    expect(html).toContain("Precision");
    expect(html).toContain("0.91");
    expect(html).toContain("Protocol &amp; Study Evidence");
    expect(html).toContain("Sample Benchmark Protocol");
  });

  it("TC-UCC-04: Baseline tools are clearly badged in the row header", () => {
    const comp = createSampleComparison();
    const html = renderToStaticMarkup(
      <UseCaseComparison
        comparison={comp}
        useCasePath="/use-cases/structure-prediction/"
        baselineIds={["tool-beta"]}
      />
    );

    expect(html).toContain("Baseline");
  });

  it("TC-UCC-05: Contested findings display a Contested badge with discrepancy link", () => {
    const comp = createSampleComparison();
    // Mark tool-alpha with a contested result
    comp.rows[0].resultIds = ["res-contested-1"];
    const contested = {
      "res-contested-1": [
        {
          role: "outlier" as const,
          discrepancy: {
            id: "disc-1",
            summary: "Disagreement between Study A and Study B on contact score",
            settled: false,
            severity: "material" as const,
          } as any,
        },
      ],
    };

    const html = renderToStaticMarkup(
      <UseCaseComparison
        comparison={comp}
        useCasePath="/use-cases/structure-prediction/"
        contested={contested}
      />
    );

    expect(html).toContain("Contested");
    expect(html).toContain('href="/contested/disc-1/"');
  });

  it("TC-UCC-06: Single-result comparison renders metric list layout without table markup", () => {
    const comp = createSampleComparison({
      rows: [createSampleComparison().rows[0]],
    });
    const html = renderToStaticMarkup(
      <UseCaseComparison
        comparison={comp}
        useCasePath="/use-cases/structure-prediction/"
      />
    );

    expect(html).toContain("Single reported result");
    expect(html).not.toContain("<table");
    expect(html).toContain("Top-1 Accuracy");
  });

  it("TC-UCC-07: Parameter sweeps for the same tool identity are clustered into one row", () => {
    const sweepRows: ComparisonRow[] = [
      createRow("exomiser-run-1", "Exomiser", [createCell("0.85", false)], {
        detail: "Threshold 0.1",
        methodTypes: ["algorithm"],
      }),
      createRow("exomiser-run-2", "Exomiser", [createCell("0.92", true)], {
        detail: "Threshold 0.5 (optimal)",
        methodTypes: ["algorithm"],
      }),
      createRow("exomiser-run-3", "Exomiser", [createCell("0.78", false)], {
        detail: "Threshold 0.9",
        methodTypes: ["algorithm"],
      }),
    ];

    const comp = createSampleComparison({
      columns: [{ metric: "f1", qualifier: "", direction: "higher", label: "F1 Score" }],
      rows: sweepRows,
    });

    const html = renderToStaticMarkup(
      <UseCaseComparison
        comparison={comp}
        useCasePath="/use-cases/variant-effect/"
        expandedRowId="exomiser-run-2"
      />
    );

    // Main table body should only have 1 tool row (clustered)
    const bodyRows = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/)?.[1] || "";
    const toolRows = bodyRows.match(/<th[^>]*scope="row"/g) || [];
    expect(toolRows.length).toBe(1);

    // Should indicate parameter sweep count
    expect(html).toContain("3 sweeps");
    // Should render the parameter sweeps subtable in the drawer
    expect(html).toContain("Parameter Sweeps (3 configurations)");
    expect(html).toContain("Threshold 0.5 (optimal)");
  });

  it("TC-UCC-08: Does not render scrollHintWide horizontal scroll message", () => {
    const comp = createSampleComparison();
    const html = renderToStaticMarkup(
      <UseCaseComparison
        comparison={comp}
        useCasePath="/use-cases/structure-prediction/"
      />
    );

    expect(html).not.toContain("scrollHintWide");
    expect(html).not.toContain("Scroll sideways to see all");
  });

  it("TC-UCC-09: UseCasePage maintains strict parity between SectionNavigation links and h2 headings", () => {
    const html = renderToStaticMarkup(
      <UseCasePage params={{ slug: "structural-hypotheses-experiments" }} />
    );

    expect(html.match(/<h1\b/g)).toHaveLength(1);
    const navMatch = html.match(/<nav[^>]*aria-label="On this page"[^>]*>([\s\S]*?)<\/nav>/);
    expect(navMatch).not.toBeNull();
    const nav = navMatch![1];

    const links = [...nav.matchAll(/<a[^>]*href="#([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map(
      ([, id]) => id
    );
    const headings = [...html.matchAll(/<section[^>]*id="([^"]+)"[^>]*>[\s\S]*?<h2[^>]*>/g)].map(
      ([, id]) => id
    );

    expect(links).toEqual(headings);
  });

  it("TC-UCC-10: Preserves clinical scope anchor on UseCasePage", () => {
    const html = renderToStaticMarkup(
      <UseCasePage params={{ slug: "structural-hypotheses-experiments" }} />
    );

    expect(html).toContain('id="clinical-scope"');
  });
});
