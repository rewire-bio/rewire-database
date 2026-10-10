import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import MfassV2Page from "../app/runs/mfass-v2/page";

const useCases = vi.hoisted(() => ({ entries: [{ slug: "a" }, { slug: "b" }] }));
vi.mock("@/lib/catalogue-build", () => ({
  buildCatalogue: () => ({
    catalogue: { release_id: "fixture", released_at: "2026-10-10T00:00:00Z", coverage: { use_cases: { total: 2 } } },
    query: { list: () => ({ items: [], total: 0 }), release: () => ({}) },
  }),
}));
vi.mock("@/lib/use-cases-build", () => ({ buildUseCases: () => useCases }));
vi.mock("@/app/database/Explorer", () => ({ default: () => <div>Search the database</div> }));
vi.mock("@/components/catalogue/CatalogueEvidence", () => ({ CatalogueEvidence: () => null }));
vi.mock("@/components/catalogue/CatalogueDownloads", () => ({ CatalogueDownloads: () => null }));
vi.mock("@/components/RefreshStatus", () => ({ default: () => null }));
vi.mock("@/lib/refresh-build", () => ({ readRefresh: () => null }));

describe("home page entry points", () => {
  it("leads with use cases as the primary route and keeps the database search", async () => {
    const { default: HomePage } = await import("../app/page");
    const html = renderToStaticMarkup(<HomePage />);
    const nav = html.match(/<nav[^>]*aria-label="Ways to start"[^>]*>([\s\S]*?)<\/nav>/)![1];
    const first = nav.match(/<a [^>]*>[\s\S]*?<\/a>/)![0];
    expect(first).toContain('href="/use-cases/"');
    expect(first).toContain("primaryJourney");
    expect(first.replace(/<[^>]+>/g, "")).toBe("Start from a biological question 2 use cases");
    expect(nav).toContain('href="/models/"');
    expect(nav).toContain('href="/benchmarks/"');
    expect(html).toContain("Search the database");
  });
});

describe("MFASS v2 run tables", () => {
  it("makes each table a labelled, keyboard-scrollable region", () => {
    const html = renderToStaticMarkup(<MfassV2Page />);
    expect(html).toContain('tabindex="0" role="region" aria-label="Held-out results"');
    expect(html).toContain('tabindex="0" role="region" aria-label="Paired differences"');
  });
});
