import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import UseCaseExplorer from "../components/catalogue/UseCaseExplorer";
import type { UseCasePage } from "../lib/use-cases-client";

const { list } = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("@/lib/use-cases-client", async (original) => ({ ...(await original<object>()), createUseCasesClient: () => ({ list }) }));

function page(title = "Initial question", total = 1): UseCasePage {
  return { release_id: "fixture", input_sha256: "a".repeat(64), total, next_cursor: null, available: { areas: ["dna-genomes"], contexts: ["research", "clinical_research"] }, items: total ? [{ id: title, slug: "splicing-follow-up", title, question: "Which SNVs warrant a splicing experiment?", area: "dna-genomes", contexts: ["research"], search_terms: ["RNA"], intended_users: ["Researcher"], decision: "Choose a method", inputs: ["Human SNVs"], output: "Ranked variants", setting: "Reporter assay", exclusions: [], clinical_scope: "No clinical validation", evidence_gaps: [], citations: [], review: { method: "automated_source_review", actor: "Fixture", reviewed_at: "2026-09-25T12:00:00Z", note: "Fixture" }, planned_work: [] }] : [] };
}
function deferred() {
  let resolve!: (page: UseCasePage) => void;
  let reject!: (error: Error) => void;
  return { promise: new Promise<UseCasePage>((yes, no) => { resolve = yes; reject = no; }), resolve: (page: UseCasePage) => resolve(page), reject: (error: Error) => reject(error) };
}
let tree: ReactTestRenderer | undefined;
let url: URL;
let events: EventTarget;
function text() { return JSON.stringify(tree!.toJSON()); }
async function render(search = "?q=RNA") {
  url = new URL(`https://benchmarks.rewirebio.io/use-cases/${search}`);
  await act(async () => { tree = create(<UseCaseExplorer initial={page()} />); });
}
beforeEach(() => {
  vi.useFakeTimers(); list.mockReset(); events = new EventTarget();
  vi.stubGlobal("window", {
    get location() { return url; },
    history: { state: null, pushState: (_state: unknown, _title: string, next: string) => { url = new URL(next, url); } },
    addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events),
  });
});
afterEach(() => { if (tree) act(() => tree!.unmount()); tree = undefined; vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("use-case question discovery", () => {
  it("renders meaningful first-page question links before hydration", () => {
    const markup = renderToStaticMarkup(<UseCaseExplorer initial={page()} />);
    expect(markup).toContain("Which SNVs warrant a splicing experiment?");
    expect(markup).toContain('href="/use-cases/splicing-follow-up/"');
    expect(markup).toContain("Human SNVs");
    expect(markup).toContain("1 matching use case");
  });
  it("hides unrelated initial questions until a pinned deep-link search completes", async () => {
    const request = deferred(); list.mockReturnValue(request.promise);
    await render("?q=RNA&context=clinical_research");
    expect(text()).not.toContain("Initial question");
    expect(text()).toContain("Loading matching use cases");
    expect(list.mock.calls[0][0]).toMatchObject({ q: "RNA", context: "clinical_research", limit: 10 });
    await act(async () => request.resolve(page("Relevant question")));
    expect(text()).toContain("Relevant question");
    const link = tree!.root.findAllByType("a").find((a) => a.children[0] === "Relevant question")!;
    expect(link.props.href).toBe("/use-cases/splicing-follow-up/?q=RNA&context=clinical_research");
  });
  it("ignores out-of-order responses when browser history changes filters", async () => {
    const first = deferred(); const next = deferred(); list.mockReturnValueOnce(first.promise).mockReturnValueOnce(next.promise);
    await render(); const signal = list.mock.calls[0][1] as AbortSignal;
    await act(async () => { url = new URL("https://benchmarks.rewirebio.io/use-cases/?q=protein"); events.dispatchEvent(new Event("popstate")); });
    expect(signal.aborted).toBe(true);
    await act(async () => next.resolve(page("Current protein question")));
    await act(async () => first.resolve(page("Stale RNA question")));
    expect(text()).toContain("Current protein question");
    expect(text()).not.toContain("Stale RNA question");
  });
  it("times out, retries and restores the static questions when filters clear", async () => {
    const stalled = deferred(); const retried = deferred(); list.mockReturnValueOnce(stalled.promise).mockReturnValueOnce(retried.promise);
    await render(); const signal = list.mock.calls[0][1] as AbortSignal;
    await act(async () => { vi.advanceTimersByTime(15_000); });
    expect(signal.aborted).toBe(true); expect(text()).toContain("took too long");
    const click = async (label: string) => act(async () => { tree!.root.findAllByType("button").find((button) => button.children[0] === label)!.props.onClick(); });
    await click("Retry"); await act(async () => retried.resolve(page("Retried question")));
    expect(text()).toContain("Retried question");
    await act(async () => stalled.resolve(page("Stale question")));
    expect(text()).not.toContain("Stale question");
    await click("Clear filters"); expect(text()).toContain("Initial question"); expect(url.pathname).toBe("/use-cases/"); expect(url.search).toBe("");
  });
  it("shows honest empty and error states instead of stale question counts", async () => {
    const request = deferred(); list.mockReturnValue(request.promise); await render();
    await act(async () => request.resolve(page("", 0)));
    expect(text()).toContain("No use cases match"); expect(text()).toContain("absence does not establish");
    const failed = deferred(); list.mockReturnValue(failed.promise);
    await act(async () => { url = new URL("https://benchmarks.rewirebio.io/use-cases/?q=other"); events.dispatchEvent(new Event("popstate")); });
    await act(async () => failed.reject(new Error("service unavailable")));
    expect(text()).toContain("could not be loaded"); expect(text()).not.toContain("No use cases match"); expect(text()).not.toContain("0 matching use cases");
  });
});
