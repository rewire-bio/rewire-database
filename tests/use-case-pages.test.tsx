import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { CatalogueRecord } from "../services/omics/src/catalogue-query";
import type { ResolvedMapping, UseCase } from "../services/omics/src/use-cases";
import { evidenceSummaryParts, summariseUseCaseEvidence } from "../lib/use-case-summary";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(""), notFound: () => { throw new Error("not found"); } }));

const record = (id: string, kind: CatalogueRecord["kind"]): CatalogueRecord => ({ id, kind, name: `Fixture ${id}`, description: "Synthetic", status: "source_checked", facets: {}, source_ids: [], links: [], attributes: {} });
const review = { method: "automated_source_review" as const, actor: "Fixture curator", reviewed_at: "2026-09-25T12:00:00Z", note: "Not independent human scientific review" };
const base: UseCase = {
  id: "question", slug: "research-question", title: "Research question", question: "Which methods should I test?", area: "cells-tissues", contexts: ["research"], search_terms: [], intended_users: ["Researchers"], decision: "Choose a pilot", inputs: ["Single-cell data"], output: "Predicted expression", setting: "Cell line", exclusions: ["Bulk sequencing"], clinical_scope: "Research use only. No diagnostic validity.", evidence_gaps: ["No prospective evaluation"], citations: [], review, planned_work: [],
};
function mapping(id: string, relevance: ResolvedMapping["relevance"], configurations: string[], lifecycle: ResolvedMapping["lifecycle"] = "active"): ResolvedMapping {
  const evaluation = record(`evaluation-${id}`, "evaluation");
  return {
    id, use_case_id: "question", lifecycle, revision: 1, reason: "Reviewed", protocol_id: "protocol", task_id: "task", evaluation_ids: [evaluation.id], endpoint: "Expression", relevance, rationale: "Proxy endpoint", constraints: [], limitations: [], citations: [], review, evidence_sha256: "a".repeat(64),
    protocol: record("protocol", "protocol"), task: null, sources: [],
    evaluations: [{ evaluation, configurations: configurations.map((c) => record(c, "configuration")), results: [] }],
  } as unknown as ResolvedMapping;
}

const state = vi.hoisted(() => ({ entry: undefined as unknown as UseCase, mappings: [] as ResolvedMapping[] }));
vi.mock("../lib/catalogue-build", () => ({ buildCatalogue: () => ({ query: { get: () => undefined } }) }));
vi.mock("../lib/use-cases-build", () => ({
  buildUseCases: () => ({
    entries: [state.entry],
    query: {
      get: () => ({ use_case: state.entry, mappings: state.mappings, sources: [], release_id: "fixture", input_sha256: "b".repeat(64) }),
      list: () => ({ release_id: "fixture", input_sha256: "b".repeat(64), items: [state.entry], total: 1, next_cursor: null, available: { areas: [state.entry.area], contexts: ["research", "clinical_research"] } }),
    },
  }),
  fullUseCaseDetail: () => ({ use_case: state.entry, mappings: state.mappings, sources: [], release_id: "fixture", input_sha256: "b".repeat(64) }),
  accumulateUseCaseDetail: (query: { get: (input: { slug: string }) => unknown }, slug: string) => query.get({ slug }),
}));

async function detail(entry: UseCase, mappings: ResolvedMapping[] = [mapping("m1", "proxy", ["c1", "c2"])]) {
  state.entry = entry; state.mappings = mappings;
  const { default: Page } = await import("../app/use-cases/[slug]/page");
  return renderToStaticMarkup(<Page params={{ slug: entry.slug }} />);
}
const text = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&#x27;/g, "'").trim();

describe("use-case evidence summary", () => {
  it("counts only current direct or proxy mappings and distinct configurations", () => {
    const summary = summariseUseCaseEvidence([
      mapping("a", "proxy", ["c1", "c2"]),
      mapping("b", "direct", ["c2", "c3"]),
      mapping("c", "proxy", ["c9"], "needs_review"),
      mapping("d", "outside_scope", ["c8"]),
    ], 2);
    expect(summary).toEqual({ endpoints: 2, configurations: 3, relevance: "mixed", gaps: 2 });
    expect(evidenceSummaryParts(summary)).toEqual(["2 evaluated endpoints", "3 tested configurations", "Direct and proxy evidence", "2 recorded evidence gaps"]);
    expect(summariseUseCaseEvidence([], 0).relevance).toBe("none");
    expect(evidenceSummaryParts(summariseUseCaseEvidence([mapping("a", "proxy", ["c1"])], 1))).toEqual(["1 evaluated endpoint", "1 tested configuration", "Proxy evidence only", "1 recorded evidence gap"]);
  });
});

describe("use-case detail template", () => {
  it("has one h1, section navigation that matches h2 headings, and no skipped heading levels", async () => {
    const html = await detail(base);
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    const nav = html.slice(html.indexOf('aria-label="On this page"'));
    const links = [...nav.slice(0, nav.indexOf("</nav>")).matchAll(/<a href="#([^"]+)"[^>]*>([^<]+)<\/a>/g)].map(([, id, label]) => [id, label]);
    const headings = [...html.matchAll(/<section id="([^"]+)"[^>]*><h2>([^<]+)<\/h2>/g)].map(([, id, label]) => [id, label]);
    expect(links).toEqual(headings);
    expect(links.map(([id]) => id)).toEqual(["question", "inputs", "evidence", "gaps", "sources"]);
    const levels = [...html.matchAll(/<h([1-6])\b/g)].map(([, level]) => Number(level));
    levels.forEach((level, index) => { if (index) expect(level - levels[index - 1]).toBeLessThanOrEqual(1); });
  });
  it("keeps the research-only boundary beside applicability and preserves the old clinical-scope anchor", async () => {
    const html = await detail(base);
    expect(html).toContain('id="clinical-scope"');
    expect(html).not.toContain(">Clinical research scope</a>");
    expect(text(html)).toContain("Research use only. No diagnostic validity.");
    expect(text(html)).toContain("Research only");
  });
  it("adds a clinical research scope section only when the use case has that context", async () => {
    const html = await detail({ ...base, contexts: ["research", "clinical_research"], clinical_scope: "Clinical pathogenicity is not established." });
    expect(html).toContain('<section id="clinical-scope"');
    expect(html).toContain("<h2>Clinical research scope</h2>");
    expect(html).toContain('href="#clinical-scope"');
    expect(text(html)).toContain("Clinical pathogenicity is not established.");
  });
  it("summarises evidence coverage in the header and links the breadcrumb back to the index", async () => {
    const html = await detail(base);
    expect(text(html)).toContain("1 evaluated endpoint · 2 tested configurations · Proxy evidence only · 1 recorded evidence gap");
    const breadcrumb = html.slice(html.indexOf('aria-label="Breadcrumb"'), html.indexOf("</nav>", html.indexOf('aria-label="Breadcrumb"')));
    expect(breadcrumb).toContain('<a href="/use-cases/">Use cases</a>');
    expect(html).not.toContain("Back to use cases");
  });
});

describe("use-case index", () => {
  it("explains use cases with a concrete example before the explorer and offers area browsing", async () => {
    state.entry = { ...base, slug: "genetic-perturbation-response" }; state.mappings = [mapping("m1", "proxy", ["c1"])];
    const { default: Page } = await import("../app/use-cases/page");
    const html = renderToStaticMarkup(<Page />);
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    const explorer = html.indexOf('role="search"');
    expect(html.indexOf("What a use case shows")).toBeLessThan(explorer);
    expect(html.indexOf("Example")).toBeLessThan(explorer);
    expect(html.indexOf("Use cases, benchmarks or models?")).toBeLessThan(explorer);
    expect(html).toContain('aria-pressed="true"');
    expect(text(html)).toContain("Cells and tissues 1");
    expect(text(html)).toContain("Opens with 1 evaluated endpoint · 1 tested configuration · Proxy evidence only");
    expect(html).toContain('aria-describedby="use-case-context-hint"');
  });
});
