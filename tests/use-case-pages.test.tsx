import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { CatalogueRecord } from "../shared/omics/catalogue-query";
import type { ResolvedMapping, UseCase } from "../shared/omics/use-cases";
import { evidenceCountParts, evidenceSummaryParts, summariseUseCaseEvidence } from "../lib/use-case-summary";

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
vi.mock("../lib/catalogue-build", () => ({ buildCatalogue: () => ({ query: { get: () => undefined, record: () => null } }) }));
vi.mock("../lib/use-cases-build", async () => {
  const { summariseUseCaseEvidence } = await import("../lib/use-case-summary");
  return {
  buildUseCases: () => ({
    entries: [state.entry],
    query: {
      get: () => ({ use_case: state.entry, mappings: state.mappings, sources: [], release_id: "fixture", input_sha256: "b".repeat(64) }),
      list: () => ({ release_id: "fixture", input_sha256: "b".repeat(64), items: [state.entry], total: 1, next_cursor: null, available: { areas: [state.entry.area], contexts: ["research", "clinical_research"] } }),
    },
  }),
  fullUseCaseDetail: () => ({ use_case: state.entry, mappings: state.mappings, sources: [], release_id: "fixture", input_sha256: "b".repeat(64) }),
  accumulateUseCaseDetail: (query: { get: (input: { slug: string }) => unknown }, slug: string) => query.get({ slug }),
  useCaseSummaries: () => ({ [state.entry.slug]: summariseUseCaseEvidence(state.mappings, state.entry.evidence_gaps.length) }),
  };
});

async function detail(entry: UseCase, mappings: ResolvedMapping[] = [mapping("m1", "proxy", ["c1", "c2"])]) {
  state.entry = entry; state.mappings = mappings;
  const { default: Page } = await import("../app/use-cases/[slug]/page");
  return renderToStaticMarkup(<Page params={{ slug: entry.slug }} />);
}
/** Markup with CSS-module class names reduced to their local names ("_summaryLead_1a2b3" to "summaryLead"). */
const plain = (html: string) => html.replace(/class="([^"]*)"/g, (_, names: string) => `class="${names.split(" ").map((n) => n.replace(/^_(.+)_[a-z0-9]+$/i, "$1")).join(" ")}"`);
const text = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&#x27;/g, "'").trim();

describe("use-case evidence summary", () => {
  it("counts only current direct or proxy mappings and distinct configurations", () => {
    const summary = summariseUseCaseEvidence([
      mapping("a", "proxy", ["c1", "c2"]),
      mapping("b", "direct", ["c2", "c3"]),
      mapping("c", "proxy", ["c9"], "needs_review"),
      mapping("d", "outside_scope", ["c8"]),
    ], 2);
    expect(summary).toEqual({ endpoints: 2, configurations: 3, relevance: "mixed", gaps: 2, comparisons: 3, held: 1, tools: 4 });
    expect(evidenceSummaryParts(summary)).toEqual(["3 comparisons shown", "1 held for review", "4 tools", "Direct and proxy evidence", "2 recorded evidence gaps"]);
    expect(summariseUseCaseEvidence([], 0).relevance).toBe("none");
    expect(evidenceSummaryParts(summariseUseCaseEvidence([mapping("a", "proxy", ["c1"])], 1))).toEqual(["1 comparison shown", "1 tool", "Proxy evidence only", "1 recorded evidence gap"]);
  });
});

describe("use-case counts", () => {
  it("gives index cards the same counts, in the same units, as the use-case page header", async () => {
    const mappings = [
      mapping("a", "proxy", ["c1", "c2"]),
      mapping("b", "direct", ["c2", "c3"]),
      mapping("c", "proxy", ["c9"], "needs_review"),
    ];
    const html = await detail(base, mappings);
    const header = text(html.match(/<dt>Evidence in this release<\/dt><dd>([\s\S]*?)<\/dd>/)![1]);
    expect(header).toBe(evidenceCountParts(summariseUseCaseEvidence(mappings, base.evidence_gaps.length)).join(" · "));
    expect(header).toBe("2 comparisons shown · 1 held for review · 3 tools");
  });
});

describe("use-case detail template", () => {
  it("keeps relevant reading under the page details without adding it to evaluated evidence", async () => {
    const html = await detail({ ...base, slug: "splicing-follow-up" });
    expect(html).toContain('<section id="related-articles"');
    expect(html).toContain('href="https://rewirebio.io/blog/mfass-v1/"');
    expect(html).not.toContain('href="https://rewirebio.io/blog/an-rna-sequence-is-not-a-molecular-state/"');
    const start = html.indexOf('<section id="evidence"');
    const end = html.indexOf('<section id="gaps"');
    expect(html.slice(start, end)).not.toContain('href="https://rewirebio.io/blog/');
  });
  it("omits article links and navigation for a question without relevant coverage", async () => {
    const html = await detail({ ...base, slug: "mass-spectrum-molecule-shortlisting" }, []);
    expect(html).not.toContain('id="related-articles"');
    expect(html).not.toContain('href="#related-articles"');
    expect(html).not.toContain('href="https://rewirebio.io/blog/');
  });
  it("has one h1, section navigation that matches h2 headings, and no skipped heading levels", async () => {
    const html = await detail(base);
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    const nav = html.slice(html.indexOf('aria-label="On this page"'));
    const links = [...nav.slice(0, nav.indexOf("</nav>")).matchAll(/<a href="#([^"]+)"[^>]*>([^<]+)<\/a>/g)].map(([, id, label]) => [id, label]);
    const headings = [...html.matchAll(/<section id="([^"]+)"[^>]*><h2>([^<]+)<\/h2>/g)].map(([, id, label]) => [id, label]);
    expect(links).toEqual(headings);
    expect(links.map(([id]) => id)).toEqual(["tools", "evidence", "gaps", "details"]);
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
    expect(html).toContain('id="clinical-scope"');
    expect(html).toContain("<dt>Clinical research scope</dt>");
    expect(text(html)).toContain("Clinical pathogenicity is not established.");
  });
  it("summarises evidence coverage in the header and links the breadcrumb back to the index", async () => {
    const html = await detail(base);
    expect(text(html)).toContain("1 comparison shown · 2 tools");
    const breadcrumb = html.slice(html.indexOf('aria-label="Breadcrumb"'), html.indexOf("</nav>", html.indexOf('aria-label="Breadcrumb"')));
    expect(breadcrumb).toContain('<a href="/use-cases/">Use cases</a>');
    expect(html).not.toContain("Back to use cases");
  });

  it("prints the release and use-case input digest that the live deployment check verifies", async () => {
    const html = await detail(base);
    expect(html).toContain("fixture");
    expect(html).toContain("b".repeat(64));
  });
});

describe("use-case index", () => {
  it("puts the explorer before the explanation and offers area browsing", async () => {
    state.entry = { ...base, slug: "genetic-perturbation-response" }; state.mappings = [mapping("m1", "proxy", ["c1"])];
    const { default: Page } = await import("../app/use-cases/page");
    const html = renderToStaticMarkup(<Page />);
    expect(html).toContain('href="https://rewirebio.io/blog/genomic-foundation-models-in-2026/"');
    expect(html).toContain('href="/use-cases/genetic-perturbation-response/#related-articles"');
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    // The list and its filters come first; the explainer follows for readers who need it.
    const explorer = html.indexOf('role="search"');
    expect(explorer).toBeGreaterThan(0);
    expect(html.indexOf("What a use case shows")).toBeGreaterThan(explorer);
    expect(html.indexOf("Use cases, benchmarks or models?")).toBeGreaterThan(explorer);
    expect(html).toContain('aria-pressed="true"');
    expect(text(html)).toContain("Cells and tissues 1");
    expect(text(html)).toContain("Opens with 1 comparison shown · 1 tool · Proxy evidence only");
    expect(html).toContain('aria-describedby="use-case-context-hint"');
  });
});

describe("use-case decision view", () => {
  const result = (metric: string, value: string, printed = value) => ({ result: { ...record(`r-${metric}-${value}`, "result"), attributes: { metric, printed_value: printed, numeric_value: value, metric_direction: "higher" } } });
  function scored(id: string, rows: [string, string][]): ResolvedMapping {
    const m = mapping(id, "direct", []);
    return { ...m, evaluations: rows.map(([config, value]) => ({ evaluation: record(`e-${config}`, "evaluation"), configurations: [record(config, "configuration")], results: [result("recall", value)], results_total: 1, results_next_cursor: null })) } as unknown as ResolvedMapping;
  }

  it("leads with the summary's first sentence, then the inputs as a list, without changing the reviewed text", async () => {
    const summary = { status: "reviewed", text: "Tool A recovered most variants. Smith et al. 2024 scored three tools. Values differ by cohort." };
    const html = plain(await detail({ ...base, inputs: ["Aligned reads", "The size range"], summary } as UseCase));
    expect(html).toContain('<p class="summaryLead">Tool A recovered most variants.</p><p>Smith et al. 2024 scored three tools. Values differ by cohort.</p>');
    expect(html.indexOf('id="summary"')).toBeLessThan(html.indexOf("You bring"));
    expect(html).toContain('<ul class="bringList"><li>Aligned reads</li><li>The size range</li></ul>');
  });

  it("links each tool chip, separates its type for screen readers and says when the type is not recorded", async () => {
    const html = plain(await detail(base));
    expect(html).toContain('<li><a href="/database/configuration/c1/?return_to=%2Fuse-cases%2Fresearch-question%2F">Fixture c1</a><span class="srOnly">, </span><span class="toolMeta">type not recorded</span></li>');
  });

  it("shows a single result as a metric list, without promising a highlight", async () => {
    const html = plain(await detail(base, [scored("one", [["c1", "0.9"]])]));
    expect(text(html)).toContain("Single reported result.");
    expect(html).toContain('class="metricList"');
    expect(html).not.toContain("<table");
    expect(text(html)).not.toContain("The best value in each column is highlighted.");
  });

  it("highlights only when a value is marked, and folds long tables behind a disclosure", async () => {
    const rows = Array.from({ length: 20 }, (_, i): [string, string] => [`c${String(i).padStart(2, "0")}`, String(0.5 + i / 100)]);
    const html = plain(await detail(base, [scored("sweep", rows)]));
    expect(text(html)).toContain("Showing the top 10 of 20 rows. The best value in each column is highlighted.");
    expect(html).toContain('<tbody class="extraRows">');
    expect(text(html)).toContain("Show all 20 rows");
    expect(html.match(/<tr>/g)).toHaveLength(21);
  });
});
