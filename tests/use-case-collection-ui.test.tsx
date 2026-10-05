import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import UseCasesPage from "../app/use-cases/page";
import UseCasePage from "../app/use-cases/[slug]/page";
import UseCaseExplorer from "../components/catalogue/UseCaseExplorer";
import UseCaseCollectionPlan from "../components/catalogue/UseCaseCollectionPlan";
import type { UseCaseDetail, UseCasePage as QuestionPage } from "../lib/use-cases-client";
import type { CatalogueRecord } from "../services/omics/src/catalogue-query";
import type { ResolvedMapping, UseCase } from "../services/omics/src/use-cases";

const state = vi.hoisted(() => ({ search: "", get: vi.fn(), initial: vi.fn(), list: vi.fn() }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(state.search),
  notFound: () => { throw new Error("Question not found"); },
}));
vi.mock("@/lib/use-cases-build", () => ({
  buildUseCases: () => ({ entries: [], query: { get: state.get, list: state.initial } }),
  fullUseCaseDetail: (slug: string) => state.get({ slug }),
  accumulateUseCaseDetail: (_query: unknown, slug: string) => state.get({ slug }),
}));
vi.mock("@/lib/catalogue-build", () => ({ buildCatalogue: () => ({ query: { get: () => null } }) }));
vi.mock("@/lib/use-cases-client", async (original) => ({ ...(await original<object>()), createUseCasesClient: () => ({ list: state.list }) }));

type CollectionPlan = NonNullable<UseCase["collection_plan"]>;
const review = { method: "automated_source_review" as const, actor: "Fixture curator", reviewed_at: "2026-09-28T12:00:00Z", note: "Independent clinical review is still needed." };
const question: UseCase = {
  id: "somatic-evidence", slug: "somatic-evidence", title: "Review somatic variant evidence",
  question: "Which evidence supports somatic variant interpretation?", area: "dna-genomes",
  contexts: ["clinical_research"], search_terms: ["cancer"], intended_users: ["Molecular scientist"],
  decision: "Choose an evidence review method", inputs: ["Tumour variant and clinical context"],
  output: "Evidence for expert review", setting: "A dated molecular tumour board review",
  exclusions: ["Selecting a patient's treatment"], clinical_scope: "Evidence retrieval does not establish treatment benefit.",
  evidence_gaps: ["Independent case adjudication"], citations: [{ source_id: "source", locator: "Methods: scope" }], review, planned_work: [],
};
function plan(status: CollectionPlan["status"] = "planned"): CollectionPlan {
  return {
    status, comparison_question: "Does retrieval with evidence checking reduce unsupported assertions?",
    baselines: ["Manual source review", "Retrieval without verification"],
    outcomes: ["Unsupported assertion rate", "Expert review time"],
    validation_requirements: ["Hold out primary studies", "Adjudicate cases independently"],
    next_step: "Collect dated cases and have two curators adjudicate the supporting sources.",
  };
}
function plannedQuestion(status: CollectionPlan["status"] = "planned"): UseCase {
  return { ...question, collection_plan: plan(status) };
}
function page(items: UseCase[]): QuestionPage {
  return { release_id: "fixture", input_sha256: "a".repeat(64), items, total: items.length, next_cursor: null, available: { areas: ["dna-genomes"], contexts: ["research", "clinical_research"] } };
}
function record(id: string, kind: CatalogueRecord["kind"]): CatalogueRecord {
  return { id, kind, name: `Fixture ${id}`, description: "Synthetic source evidence", status: "source_checked", facets: {}, source_ids: [], links: [], attributes: {} };
}
function mapping(): ResolvedMapping {
  return {
    id: "existing-mapping", use_case_id: question.id, lifecycle: "active", revision: 1,
    reason: "Existing reviewed evidence", protocol_id: "protocol", evaluation_ids: [],
    endpoint: "Existing scoped endpoint", relevance: "proxy", rationale: "The stated assay has limited transfer.",
    constraints: ["Keep the original assay scope"], limitations: ["Clinical performance is untested"],
    citations: [], review, evidence_sha256: "b".repeat(64),
    protocol: record("protocol", "protocol"), task: null, evaluations: [], sources: [],
  };
}
function detail(entry: UseCase, mappings: ResolvedMapping[] = []): UseCaseDetail {
  return {
    release_id: "fixture", input_sha256: "a".repeat(64), use_case: entry, mappings, sources: [record("source", "source")],
    evaluations_total: mappings.reduce((sum, mapping) => sum + mapping.evaluations.length, 0), evaluations_next_cursor: null,
  };
}
function detailMarkup(entry: UseCase, mappings: ResolvedMapping[] = []) {
  state.get.mockReturnValue(detail(entry, mappings));
  return renderToStaticMarkup(<UseCasePage params={{ slug: entry.slug }} />);
}

let tree: ReactTestRenderer | undefined;
beforeEach(() => {
  state.search = "";
  state.get.mockReset(); state.initial.mockReset(); state.list.mockReset();
});
afterEach(() => {
  if (tree) act(() => tree!.unmount());
  tree = undefined;
  vi.unstubAllGlobals();
});

describe("use-case evidence collection plans", () => {
  it("distinguishes planned, collecting and unlabelled historical cards before hydration", () => {
    const collecting = { ...plannedQuestion("collecting"), id: "collecting", slug: "collecting", title: "Collection in progress fixture" };
    const old = { ...question, id: "historical", slug: "historical", title: "Historical question fixture" };
    const markup = renderToStaticMarkup(<UseCaseExplorer initial={page([plannedQuestion(), collecting, old])} />);
    const cards = [...markup.matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/g)].map(([card]) => card);
    expect(cards).toHaveLength(3);
    expect(cards[0]).toContain("Collection planned");
    expect(cards[0]).toContain('href="/use-cases/somatic-evidence/#collection-plan"');
    expect(cards[0]).toContain("View question and evidence plan");
    expect(cards[1]).toContain("Collecting evidence");
    expect(cards[1]).not.toContain("Collection planned");
    expect(cards[2]).toContain("Inspect evidence and limitations");
    expect(cards[2]).not.toContain("Collection planned");
    expect(cards[2]).not.toContain("Collecting evidence");
    expect(cards[2]).not.toContain("#collection-plan");
  });

  it("exports the complete plan as primary visible content and keeps scope and review alongside it", () => {
    const entry = plannedQuestion();
    const markup = detailMarkup(entry);
    expect(markup).toContain('aria-labelledby="collection-plan-heading"');
    expect(markup).toContain('href="#collection-plan"');
    expect(markup.indexOf('id="collection-plan"')).toBeLessThan(markup.indexOf('id="question"'));
    expect(markup.indexOf('id="collection-plan"')).toBeLessThan(markup.indexOf('id="evidence"'));
    for (const value of [entry.collection_plan!.comparison_question, ...entry.collection_plan!.baselines, ...entry.collection_plan!.outcomes, ...entry.collection_plan!.validation_requirements, entry.collection_plan!.next_step]) expect(markup).toContain(value);
    expect(markup).toContain("Next collection task");
    expect(markup).toContain("No model comparison has been collected for this question yet");
    expect(markup).toContain("Relevant methods and studies may exist outside this collection");
    expect(markup).toContain(entry.clinical_scope);
    expect(markup).toContain("Clinical research");
    expect(markup).toContain("Automated source review");
    expect(markup).toContain(review.note);
    expect(markup).not.toContain("No applicability mappings");
    expect(markup).not.toContain("Evaluated configurations");
    const planMarkup = renderToStaticMarkup(<UseCaseCollectionPlan plan={entry.collection_plan!} />);
    expect(planMarkup).not.toContain("<details");
    expect(planMarkup).not.toContain("<table");
  });

  it("reports collecting as in progress while retaining the honest zero-comparison state", () => {
    const markup = detailMarkup(plannedQuestion("collecting"));
    expect(markup).toContain("Collecting evidence");
    expect(markup).toContain("Evidence collection is in progress for this question");
    expect(markup).not.toContain("Collection planned");
    expect(markup).not.toContain("Evidence collection is planned for this question");
    expect(markup).toContain("No model comparison has been collected for this question yet");
  });

  it("does not infer a collection plan from a historical question with no mappings", () => {
    const markup = detailMarkup(question);
    expect(markup).toContain("No model comparison has been collected for this question yet");
    expect(markup).not.toContain('id="collection-plan"');
    expect(markup).not.toContain('href="#collection-plan"');
    expect(markup).not.toContain("Collection planned");
    expect(markup).not.toContain("Collecting evidence");
    expect(markup).not.toContain("Next collection task");
    expect(question).not.toHaveProperty("collection_plan");
  });

  it("preserves existing evidence rendering with or without an explicit collection plan", () => {
    for (const entry of [question, plannedQuestion("collecting")]) {
      const markup = detailMarkup(entry, [mapping()]);
      expect(markup).toContain('id="mapping-existing-mapping"');
      expect(markup).toContain("Existing scoped endpoint");
      expect(markup).toContain("Current source-reviewed mapping");
      expect(markup).toContain("Proxy evidence");
      expect(markup).toContain("Clinical performance is untested");
      expect(markup).not.toContain("No model comparison has been collected for this question yet");
      expect(markup.includes('id="collection-plan"')).toBe(Boolean(entry.collection_plan));
    }
  });

  it("preserves filtered pagination and return context for plans loaded through the client", async () => {
    let url = new URL("https://benchmarks.rewirebio.io/use-cases/?q=cancer&context=clinical_research&cursor=page-two");
    const events = new EventTarget();
    vi.stubGlobal("window", {
      get location() { return url; },
      history: { state: null, pushState: (_state: unknown, _title: string, next: string) => { url = new URL(next, url); } },
      addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events),
    });
    const second = { ...page([plannedQuestion()]), next_cursor: "page-three", total: 17 };
    state.list.mockResolvedValueOnce(second).mockResolvedValueOnce(page([plannedQuestion("collecting")]));
    await act(async () => { tree = create(<UseCaseExplorer initial={page([question])} />); });
    const planLink = () => tree!.root.findAllByType("a").find((link) => String(link.children[0]).startsWith("View question and evidence plan"))!;
    expect(state.list.mock.calls[0][0]).toMatchObject({ q: "cancer", context: "clinical_research", cursor: "page-two", limit: 10 });
    expect(planLink().props.href).toBe("/use-cases/somatic-evidence/?q=cancer&context=clinical_research&cursor=page-two#collection-plan");
    await act(async () => { tree!.root.findAllByType("button").find((button) => button.children[0] === "Next page")!.props.onClick(); });
    expect(state.list.mock.calls[1][0]).toMatchObject({ q: "cancer", context: "clinical_research", cursor: "page-three", limit: 10 });
    expect(JSON.stringify(tree!.toJSON())).toContain("Collecting evidence");
    expect(planLink().props.href).toBe("/use-cases/somatic-evidence/?q=cancer&context=clinical_research&cursor=page-three#collection-plan");
    state.search = url.search;
    expect(detailMarkup(plannedQuestion("collecting"))).toContain('href="/use-cases/?q=cancer&amp;context=clinical_research&amp;cursor=page-three"');
  });

  it("explains that questions lead collection even before a model comparison exists", () => {
    state.initial.mockReturnValue(page([plannedQuestion()]));
    const markup = renderToStaticMarkup(<UseCasesPage />);
    expect(markup).toContain("User questions lead evidence gathering");
    expect(markup).toContain("before model comparisons have been collected");
    expect(markup).toContain("Research relevance and clinical evidence");
    expect(markup).toContain("reviewed evidence is available");
  });
});
