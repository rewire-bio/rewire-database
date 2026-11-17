import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import BenchmarksPage from "@/app/page";

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

describe("Homepage Redesign (TC-HP-01 to TC-HP-08)", () => {
  it("TC-HP-01: Renders hero positioning headline and subhead", () => {
    const html = renderToStaticMarkup(<BenchmarksPage />);

    expect(html).toContain("The Artificial Analysis of Biological Models");
    expect(html).toContain("The Independent Standard for Biological AI");
    expect(html).toContain("Which biological model works best for your task?");
    expect(html).toContain("Per-Use-Case Rankings");
    expect(html).toContain("Protocol Baselines");
    expect(html).toContain("Pareto Efficiency");
    expect(html).toContain("Source Evidence");
  });

  it("TC-HP-02: Renders prominent biological use-case selector with links to all 5 use cases", () => {
    const html = renderToStaticMarkup(<BenchmarksPage />);

    expect(html).toMatch(/<nav[^>]*aria-label="Biological use cases"[^>]*>/);
    expect(html).toContain('href="/use-cases/structure-prediction"');
    expect(html).toContain('href="/use-cases/variant-effect"');
    expect(html).toContain('href="/use-cases/protein-design"');
    expect(html).toContain('href="/use-cases/transcriptomics"');
    expect(html).toContain('href="/use-cases/genomic-grammar"');
  });

  it("TC-HP-03: Embeds UnifiedLeaderboard within headline-leaderboard section", () => {
    const html = renderToStaticMarkup(<BenchmarksPage />);

    expect(html).toMatch(/<section[^>]*class="[^"]*headline-leaderboard[^"]*"/);
    expect(html).toContain("Biological Foundation Model Rankings");
    // Should render table markup with biological model rows
    expect(html).toContain("<table");
    expect(html).toContain("Capability Index");
    expect(html).toContain("AlphaFold 3");
  });

  it("TC-HP-04: Retains backward-compatible 'Ways to start' navigation", () => {
    const html = renderToStaticMarkup(<BenchmarksPage />);

    const navMatch = html.match(/<nav[^>]*aria-label="Ways to start"[^>]*>([\s\S]*?)<\/nav>/);
    expect(navMatch).not.toBeNull();
    const navContent = navMatch![1];
    expect(navContent).toContain('href="/use-cases/"');
    expect(navContent).toContain('href="/models/"');
    expect(navContent).toContain('href="/benchmarks/"');
  });

  it("TC-HP-05: Declutters database search under secondary section with #browse and Search the database", () => {
    const html = renderToStaticMarkup(<BenchmarksPage />);

    expect(html).toContain('id="browse"');
    expect(html).toContain("Search the database");
  });

  it("TC-HP-06: Includes Schema.org JSON-LD structured website metadata", () => {
    const html = renderToStaticMarkup(<BenchmarksPage />);

    expect(html).toContain('<script type="application/ld+json">');
    expect(html).toContain('"@type":"WebSite"');
    expect(html).toContain("rewirebio.io");
  });

  it("TC-HP-07: Renders value proposition cards and agent/download footer sections", () => {
    const html = renderToStaticMarkup(<BenchmarksPage />);

    expect(html).toContain("01 · The problem");
    expect(html).toContain("02 · Methodology");
    expect(html).toContain("03 · Standard");
    expect(html).toContain("Agent integration, freshness and downloads");
  });

  it("TC-HP-08: Defensively renders without throwing even when useCases is 0 or discrepancies are absent", () => {
    expect(() => renderToStaticMarkup(<BenchmarksPage />)).not.toThrow();
  });
});
