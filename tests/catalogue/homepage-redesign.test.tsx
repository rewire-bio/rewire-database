import React from "react";
import { describe, expect, it, vi } from "vitest";

import { renderToStaticMarkup } from "react-dom/server";
import BenchmarksPage from "@/app/page";
import { HOME_LEADERBOARD_SLUGS, homeLeaderboards } from "@/lib/release-leaderboard";
import { boardStats, boardStatsText } from "@/lib/use-case-leaderboard";
import { buildCatalogue } from "@/lib/catalogue-build";

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

    expect(html).toContain("Independent Benchmarks for Biological Models");
    expect(html).not.toMatch(/Artificial Analysis/i);
    expect(html).toContain("The Independent Standard for Biological AI");
    expect(html).toContain("Which biological model works best for your task?");
    expect(html).toContain("Per-Use-Case Rankings");
    expect(html).toContain("Protocol Baselines");
    expect(html).toContain("Independence and Coverage");
    expect(html).not.toContain("noise ceilings");
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
    expect(html).toContain("Biological Model Rankings");
    // The table shows the release's rows for the first lead use case that has a ranking.
    const [first] = homeLeaderboards();
    expect(html).toContain("<table");
    expect(html).toContain(first.rows[0].model_name.replace(/&/g, "&amp;"));
    expect(html).toContain(`/database/result/${encodeURIComponent(first.rows[0].source_record_id)}/`);
    expect(html).not.toContain("Capability Index");
  });

  it("TC-HP-03b: Shows a tab for every homepage board, marks the proxy ones, and names what each rests on and the pinned release", () => {
    const html = renderToStaticMarkup(<BenchmarksPage />).replace(/<!-- -->/g, "").replace(/&#x27;/g, "'");
    const boards = homeLeaderboards();
    const tabs = [...html.matchAll(/<button[^>]*role="tab"[^>]*>([\s\S]*?)<\/button>/g)].map((m) => m[1].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&"));
    expect(tabs).toEqual(boards.map((b) => `${b.use_case_title}${b.protocol!.relevance === "proxy" ? " Proxy" : ""}`));
    expect(tabs).toHaveLength(HOME_LEADERBOARD_SLUGS.length);
    expect(tabs.some((t) => t.endsWith(" Proxy"))).toBe(boards.some((b) => b.protocol!.relevance === "proxy"));

    const { catalogue } = buildCatalogue();
    const stats = html.match(/<p[^>]*data-testid="leaderboard-stats"[^>]*>([\s\S]*?)<\/p>/)![1];
    expect(stats).toBe(`${boardStatsText(boardStats(boards[0]))} Data release ${catalogue.release_id}, published ${catalogue.released_at.slice(0, 10)}.`);
    expect(catalogue.release_id).toMatch(/^\d{4}-\d{2}-\d{2}-[a-f0-9]{12}$/);
    expect(html).not.toContain("Benchmark board");
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

  it("TC-HP-07: Renders compact provenance and agent/download footer without low-value homepage bloat", () => {
    const html = renderToStaticMarkup(<BenchmarksPage />);

    expect(html).toContain("Audit the evidence");
    expect(html).toContain('id="mfass-v1"');
    expect(html).toContain("Agent integration and database downloads");
    expect(html).toContain('id="downloads"');
    expect(html).toContain("Connect your agent");

    expect(html).not.toContain("Benchmark evidence coverage");
    expect(html).not.toContain("Collection coverage and remaining gaps");
    expect(html).not.toContain("Coverage: entries and evaluations");
    expect(html).not.toContain("What this platform is for");
    expect(html).not.toContain("Database freshness");
    expect(html).not.toContain("Original literature downloads");
  });

  it("TC-HP-08: Defensively renders without throwing even when useCases is 0 or discrepancies are absent", () => {
    expect(() => renderToStaticMarkup(<BenchmarksPage />)).not.toThrow();
  });
});
