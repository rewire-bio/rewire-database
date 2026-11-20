import React from "react";
import { describe, it, expect, vi } from "vitest";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { renderToStaticMarkup } from "react-dom/server";
import { UnifiedLeaderboard } from "../../components/catalogue/UnifiedLeaderboard";
import { BENCHMARK_BOARD, EMPTY_BOARD, RUNTIME_BOARD, VARIANT_BOARD, fixtureRow } from "./fixtures/leaderboards";

vi.mock("next/link", () => ({
  default: ({ children, href, prefetch: _prefetch, ...props }: { children: React.ReactNode; href: string; prefetch?: boolean; [key: string]: unknown }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const textOf = (node: unknown): string => {
  if (node === null || node === undefined) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  const n = node as { children?: unknown };
  return textOf(n.children);
};

function mount(element: React.ReactElement) {
  let renderer: ReactTestRenderer;
  act(() => {
    renderer = create(element);
  });
  const rows = () => renderer!.root.findAllByType("tr").filter((tr) => tr.props["data-model-id"]).map((tr) => tr.props["data-model-id"]);
  const clickHeader = (label: string) => {
    const th = renderer!.root.findAllByType("th").find((el) => textOf(el.children).startsWith(label));
    expect(th, `header ${label}`).toBeDefined();
    act(() => th!.props.onClick());
  };
  return { renderer: renderer!, rows, clickHeader, json: () => JSON.stringify(renderer!.toJSON()) };
}

describe("UnifiedLeaderboard", () => {
  it("renders one protocol's ranking with source, evidence and coverage columns", () => {
    const html = renderToStaticMarkup(<UnifiedLeaderboard boards={[VARIANT_BOARD]} />);
    for (const text of ["<table", "Rank", "Model", "Spearman (higher is better)", "Evidence", "Coverage", "Reported by", "License", "Alpha", "#1", "#2"])
      expect(html).toContain(text);
    expect(html).toContain("Ranked on <strong>Fixture DMS substitutions, All assays</strong>");
    expect(html).not.toContain("Capability Index");
    expect(html).not.toContain("Ceiling");
  });

  it("links each value to its result record and each row to its source", () => {
    const html = renderToStaticMarkup(<UnifiedLeaderboard boards={[VARIANT_BOARD]} />);
    expect(html).toContain('href="/database/result/fixture-result-alpha/"');
    expect(html).toContain('href="/database/source/fixture-source/"');
    expect(html).toContain('href="/database/model/alpha/"');
  });

  it("shows the reproduced badge only on rows marked reproduced", () => {
    const html = renderToStaticMarkup(<UnifiedLeaderboard boards={[VARIANT_BOARD]} />);
    expect(html.match(/data-status="reproduced"/g)).toHaveLength(1);
    expect(html.match(/data-status="source_checked"/g)).toHaveLength(3);
    expect(html).toContain("Developer-reported");
    expect(html).toContain("Rewire run");
  });

  it("links a reproduced row to its run receipt and no other row to one", () => {
    const html = renderToStaticMarkup(<UnifiedLeaderboard boards={[VARIANT_BOARD]} expandedRowId="alpha" />);
    expect(html.match(/href="\/database\/source\/fixture-receipt\/"/g)).toHaveLength(2);
    expect(html).toContain("Run receipt: Fixture full-protocol run");
    // The link text is only "Reproduced", so its accessible name says where it goes.
    expect(html).toMatch(/<a href="\/database\/source\/fixture-receipt\/"[^>]*aria-label="Reproduced\. Run receipt: Fixture full-protocol run"[^>]*>Reproduced<\/a>/);
    const plain = renderToStaticMarkup(<UnifiedLeaderboard boards={[VARIANT_BOARD]} expandedRowId="beta" />);
    expect(plain.match(/href="\/database\/source\/fixture-receipt\/"/g)).toHaveLength(1);
  });

  it("says when the source does not state who ran a tool, and never styles it as independent", () => {
    const html = renderToStaticMarkup(<UnifiedLeaderboard boards={[VARIANT_BOARD]} />);
    expect(html).not.toContain("Origin not reported");
    const badge = html.match(/<span class="([^"]*)" data-origin="unreported"[^>]*>([^<]*)</)!;
    expect(badge[2]).toBe("Source does not say who ran it");
    const independent = html.match(/<span class="([^"]*)" data-origin="independent_paper"/)!;
    expect(badge[1]).not.toBe(independent[1]);
    // A Rewire run keeps its own label and does not take the independent style either.
    const rewire = html.match(/<span class="([^"]*)" data-origin="rewire_run"[^>]*>([^<]*)</)!;
    expect(rewire[2]).toBe("Rewire run");
    expect(rewire[1]).toBe(badge[1]);
  });

  it("writes out what an origin means in the row details, not only in a tooltip", () => {
    const detail = (id: string) =>
      renderToStaticMarkup(<UnifiedLeaderboard boards={[VARIANT_BOARD]} expandedRowId={id} />).match(/<dd data-origin-detail="[^"]*">([^<]*)<\/dd>/)![1];
    expect(detail("gamma")).toBe("Source does not say who ran it. The source prints the value but does not say who ran the tool, so it is not counted as independent.");
    expect(detail("alpha")).toContain("Rewire run. Run by Rewire, not transcribed from a publication.");
    expect(detail("alpha")).toContain("not counted as independent");
    expect(detail("beta")).toBe("Developer-reported. Reported by the developers of the evaluated tool.");
  });

  it("marks a licence that covers only the code", () => {
    const html = renderToStaticMarkup(<UnifiedLeaderboard boards={[VARIANT_BOARD]} expandedRowId="gamma" />);
    // The cell's own text, not only its tooltip, carries the "Code:" prefix.
    expect(html).toMatch(/<span class="[^"]*" data-licence-scope="code" title="Code: MIT">Code: MIT<\/span>/);
    expect(html).toMatch(/<span class="[^"]*" data-licence-scope="none" title="MIT">MIT<\/span>/);
    expect(html).toContain("<dt>Code licence:</dt>");
    expect(renderToStaticMarkup(<UnifiedLeaderboard boards={[VARIANT_BOARD]} expandedRowId="alpha" />)).toContain("<dt>License:</dt>");
  });

  it("sorts and searches the licence column by the text the cell shows", () => {
    const { renderer, rows, clickHeader } = mount(<UnifiedLeaderboard boards={[VARIANT_BOARD]} />);
    // Shown: Alpha "MIT", Beta "Proprietary", Gamma "Code: MIT", the baseline "Not recorded" (empty, sorted first).
    clickHeader("License");
    expect(rows()).toEqual(["baseline-a", "gamma", "alpha", "beta"]);
    const search = renderer.root.findAll((n) => n.type === "input" && n.props.type === "search")[0];
    act(() => search.props.onChange({ target: { value: "code" } }));
    expect(rows()).toEqual(["gamma"]);
  });

  it("flags open discrepancies with a link to the finding", () => {
    const html = renderToStaticMarkup(<UnifiedLeaderboard boards={[VARIANT_BOARD]} />);
    expect(html).toContain('href="/contested/finding-1/"');
    expect(html).toContain("Open discrepancy");
  });

  it("shows a margin column only when the protocol scores a baseline", () => {
    const withBaseline = renderToStaticMarkup(<UnifiedLeaderboard boards={[VARIANT_BOARD]} />);
    expect(withBaseline).toContain("vs Fixture alignment baseline");
    expect(withBaseline).toContain("+50.0%");
    expect(withBaseline).toContain("[-] Baseline");
    const without = renderToStaticMarkup(<UnifiedLeaderboard boards={[RUNTIME_BOARD]} />);
    expect(without).not.toContain("col-margin");
    expect(without).toContain("No baseline scored on this protocol.");
  });

  it("labels a proxy protocol", () => {
    const html = renderToStaticMarkup(<UnifiedLeaderboard boards={[RUNTIME_BOARD]} />);
    expect(html).toContain("Proxy protocol");
    expect(html).toContain("Runtime (lower is better)");
  });

  it("lists tools evaluated elsewhere below the ranking, unranked", () => {
    const html = renderToStaticMarkup(<UnifiedLeaderboard boards={[VARIANT_BOARD]} />);
    expect(html).toContain('data-testid="leaderboard-unranked"');
    expect(html).toContain("Delta");
    expect(html).toContain("not on this protocol, so not ranked");
  });

  it("says what each board rests on, and names the release when given one", () => {
    const html = renderToStaticMarkup(<UnifiedLeaderboard boards={[VARIANT_BOARD]} release={{ id: "2026-01-02-abcdefabcdef", released_at: "2026-01-02T03:04:05.000Z" }} />);
    const stats = html.match(/<p[^>]*data-testid="leaderboard-stats"[^>]*>([\s\S]*?)<\/p>/)![1].replace(/<!-- -->/g, "");
    expect(stats).toBe("4 tools, from 1 source. 1 of 4 results (25%) comes from an independent study; the release does not say who ran 1 of them. Data release 2026-01-02-abcdefabcdef, published 2026-01-02.");
    const plain = renderToStaticMarkup(<UnifiedLeaderboard boards={[RUNTIME_BOARD]} />);
    expect(plain).toContain("2 tools, from 1 source. 2 of 2 results (100%) come from an independent study.");
    expect(plain).not.toContain("Data release");
    expect(renderToStaticMarkup(<UnifiedLeaderboard boards={[EMPTY_BOARD]} />)).not.toContain('data-testid="leaderboard-stats"');
  });

  it("marks a proxy board on its tab as well as in its note", () => {
    const { renderer } = mount(<UnifiedLeaderboard boards={[VARIANT_BOARD, RUNTIME_BOARD]} />);
    const tabs = renderer.root.findAllByType("button").filter((b) => b.props.role === "tab");
    expect(textOf(tabs[0].children)).toBe("Fixture variant effect");
    expect(tabs[1].findAllByType("span").map((span) => textOf(span.children))).toEqual(["Proxy"]);
  });

  it("labels a benchmark board, says what it does not show, and never calls it a use case", () => {
    const html = renderToStaticMarkup(<UnifiedLeaderboard boards={[BENCHMARK_BOARD, { ...BENCHMARK_BOARD, use_case_slug: "other" }]} expandedRowId="probe-a" />);
    const note = html.match(/<p[^>]*data-testid="leaderboard-protocol"[^>]*>([\s\S]*?)<\/p>/)![1].replace(/<!-- -->/g, "").replace(/<[^>]+>/g, "").replace(/&#x27;/g, "'");
    expect(note).toContain("Benchmark board This board has no use-case judgement behind it.");
    expect(note).toContain("not which tool suits a task");
    expect(note).toContain("3 of the benchmark's 5 protocols can be ranked without a judgement");
    expect(note).toContain("How the tools were fitted, as recorded: Frozen embeddings with a linear probe; Trained from scratch.");
    expect(note).toContain("1 evaluation is left out because of an evidence concern.");
    expect(note).not.toContain("Proxy protocol");
    expect(html).toContain('href="/database/protocol/fixture-benchmark-protocol/"');
    expect(html).toContain('aria-label="Benchmark rankings"');
    expect(html).toContain('title="Rankable protocols of this benchmark that score the tool"');
    expect(html).toContain("2 of 3 rankable protocols in this benchmark");
    expect(html).toContain("evaluated elsewhere in this benchmark but not on this protocol");
    expect(html).toContain("(1 of 3 rankable protocols)");
    expect(html).toContain("No baseline or margin on a benchmark board.");
    expect(html).toContain('<a href="/database/benchmark/fixture-benchmark/">All results for Fixture benchmark</a>');
    expect(html.replace(/use-case judgement|named by a\s+use case, and no use case/g, "")).not.toMatch(/use case/i);
  });

  it("counts the protocols and withheld evaluations of a benchmark board in the singular", () => {
    const one = { ...BENCHMARK_BOARD, benchmark: { ...BENCHMARK_BOARD.benchmark!, protocols: 1, rankable: 1, adaptations: [], withheld: 0 } };
    const html = renderToStaticMarkup(<UnifiedLeaderboard boards={[one]} />).replace(/<!-- -->/g, "");
    expect(html).toContain("1 of the benchmark&#x27;s 1 protocol can be ranked");
    expect(html).not.toContain("How the tools were fitted");
    expect(html).not.toContain("left out because of an evidence concern");
    const two = { ...BENCHMARK_BOARD, benchmark: { ...BENCHMARK_BOARD.benchmark!, withheld: 2 } };
    expect(renderToStaticMarkup(<UnifiedLeaderboard boards={[two]} />).replace(/<!-- -->/g, "")).toContain("2 evaluations are left out because of an evidence concern.");
  });

  it("switches use cases with accessible tabs", () => {
    const { renderer, rows } = mount(<UnifiedLeaderboard boards={[VARIANT_BOARD, RUNTIME_BOARD]} />);
    const tabs = () => renderer.root.findAllByType("button").filter((b) => b.props.role === "tab");
    expect(tabs()).toHaveLength(2);
    expect(tabs()[0].props["aria-selected"]).toBe(true);
    act(() => tabs()[1].props.onClick());
    expect(tabs()[1].props["aria-selected"]).toBe(true);
    expect(rows()).toEqual(["fast", "slow"]);
  });

  it("starts on initialSlug and hides tabs when asked", () => {
    const { renderer, rows } = mount(<UnifiedLeaderboard boards={[VARIANT_BOARD, RUNTIME_BOARD]} initialSlug="fixture-runtime" showCategorySwitcher={false} />);
    expect(renderer.root.findAllByType("button").filter((b) => b.props.role === "tab")).toHaveLength(0);
    expect(rows()).toEqual(["fast", "slow"]);
  });

  it("sorts by rank, by value in the protocol's direction, and by name", () => {
    const { rows, clickHeader } = mount(<UnifiedLeaderboard boards={[VARIANT_BOARD]} />);
    expect(rows()).toEqual(["alpha", "beta", "gamma", "baseline-a"]);
    clickHeader("Rank");
    expect(rows()[0]).toBe("baseline-a");
    clickHeader("Spearman");
    expect(rows()[0]).toBe("alpha");
    clickHeader("Spearman");
    expect(rows()[0]).toBe("baseline-a");
    clickHeader("Model");
    expect(rows()[0]).toBe("alpha");
    clickHeader("Model");
    expect(rows()[0]).toBe("gamma");

    const runtime = mount(<UnifiedLeaderboard boards={[RUNTIME_BOARD]} />);
    runtime.clickHeader("Runtime");
    expect(runtime.rows()[0]).toBe("fast");
  });

  it("puts rows without recorded latency last in both directions", () => {
    const board = { ...VARIANT_BOARD, rows: [...VARIANT_BOARD.rows] };
    const { rows, clickHeader } = mount(<UnifiedLeaderboard boards={[board]} />);
    clickHeader("Latency");
    expect(rows().slice(0, 2)).toEqual(["alpha", "beta"]);
    clickHeader("Latency");
    expect(rows().slice(0, 2)).toEqual(["beta", "alpha"]);
    expect(rows().slice(2).sort()).toEqual(["baseline-a", "gamma"]);
  });

  it("sorts from the keyboard", () => {
    const { renderer, rows } = mount(<UnifiedLeaderboard boards={[VARIANT_BOARD]} />);
    const th = renderer.root.findAllByType("th").find((el) => textOf(el.children).startsWith("Model"))!;
    const preventDefault = vi.fn();
    act(() => th.props.onKeyDown({ key: "Enter", preventDefault }));
    expect(preventDefault).toHaveBeenCalled();
    expect(rows()[0]).toBe("alpha");
    act(() => th.props.onKeyDown({ key: " ", preventDefault }));
    expect(rows()[0]).toBe("gamma");
  });

  it("offers hardware filters only when some row records the data", () => {
    const withData = renderToStaticMarkup(<UnifiedLeaderboard boards={[VARIANT_BOARD]} />);
    expect(withData).toContain("Max VRAM:");
    expect(withData).toContain("Open Weights Only");
    const without = renderToStaticMarkup(<UnifiedLeaderboard boards={[RUNTIME_BOARD]} />);
    expect(without).not.toContain("Max VRAM:");
    expect(without).not.toContain("Open Weights Only");
    expect(without).not.toContain(">Latency<");
  });

  it("filters by open weights, VRAM and search, keeping baselines", () => {
    const { renderer, rows } = mount(<UnifiedLeaderboard boards={[VARIANT_BOARD]} />);
    const checkbox = renderer.root.findAll((n) => n.type === "input" && n.props.name === "open_weights_only")[0];
    act(() => checkbox.props.onChange({ target: { checked: true } }));
    expect(rows()).toEqual(["alpha", "baseline-a"]);
    act(() => checkbox.props.onChange({ target: { checked: false } }));

    const select = renderer.root.findByType("select");
    act(() => select.props.onChange({ target: { value: "24" } }));
    expect(rows()).toEqual(["alpha", "baseline-a"]);
    act(() => select.props.onChange({ target: { value: "all" } }));

    const search = renderer.root.findAll((n) => n.type === "input" && n.props.type === "search")[0];
    act(() => search.props.onChange({ target: { value: "gam" } }));
    expect(rows()).toEqual(["gamma"]);
    act(() => search.props.onChange({ target: { value: "variant effect predictors" } }));
    expect(rows()).toHaveLength(4);
  });

  it("shows an empty state with a reset button when filters match nothing", () => {
    const { renderer, rows, json } = mount(<UnifiedLeaderboard boards={[VARIANT_BOARD]} />);
    const search = renderer.root.findAll((n) => n.type === "input" && n.props.type === "search")[0];
    act(() => search.props.onChange({ target: { value: "no such model" } }));
    expect(rows()).toEqual([]);
    expect(json()).toContain("No matching models found");
    const reset = renderer.root.findAllByType("button").find((b) => textOf(b.children) === "Reset Filters")!;
    act(() => reset.props.onClick());
    expect(rows()).toHaveLength(4);
  });

  it("explains why a use case has no ranking", () => {
    const html = renderToStaticMarkup(<UnifiedLeaderboard boards={[EMPTY_BOARD]} />);
    expect(html).toContain("No ranking for this use case yet");
    expect(html).toContain(EMPTY_BOARD.empty_reason);
    expect(html).not.toContain("application/ld+json");
  });

  it("opens a drawer with provenance, and marks missing telemetry as not recorded", () => {
    const { renderer, json } = mount(<UnifiedLeaderboard boards={[VARIANT_BOARD]} />);
    const trigger = renderer.root.findAll((n) => n.type === "button" && n.props["aria-controls"] === "drawer-gamma")[0];
    act(() => trigger.props.onClick({ stopPropagation: () => {} }));
    const drawer = json();
    expect(drawer).toContain("Hardware & Telemetry");
    expect(drawer).toContain("Not recorded");
    expect(drawer).toContain("fixture-result-gamma");
    expect(drawer).toContain("Fixture study of variant effect predictors");
    expect(drawer).toContain("Fixture alignment baseline (0.400)");
    expect(drawer).toContain("1 of 2 comparisons in this use case");
    act(() => trigger.props.onClick({ stopPropagation: () => {} }));
    expect(json()).not.toContain("Hardware & Telemetry");
  });

  it("pre-expands expandedRowId", () => {
    const html = renderToStaticMarkup(<UnifiedLeaderboard boards={[VARIANT_BOARD]} expandedRowId="alpha" />);
    expect(html).toContain('data-drawer-for="alpha"');
    expect(html).toContain("650M");
  });

  it("emits ItemList JSON-LD with ranks and result links, unless told not to", () => {
    const html = renderToStaticMarkup(<UnifiedLeaderboard boards={[VARIANT_BOARD]} />);
    const json = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1].replace(/\\u003c/g, "<"));
    expect(json["@type"]).toBe("ItemList");
    expect(json.itemListElement.map((i: { position: number }) => i.position)).toEqual([1, 2, 2, 4]);
    expect(json.itemListElement[0].item.description).toContain("/database/result/fixture-result-alpha/");
    expect(renderToStaticMarkup(<UnifiedLeaderboard boards={[VARIANT_BOARD]} emitJsonLd={false} />)).not.toContain("application/ld+json");
  });

  it("shows the Pareto banner only when some row has recorded latency on the frontier", () => {
    const pareto = { ...VARIANT_BOARD, rows: VARIANT_BOARD.rows.map((r) => (r.model_id === "alpha" ? { ...r, pareto_optimal: true } : r)) };
    expect(renderToStaticMarkup(<UnifiedLeaderboard boards={[pareto]} showParetoHighlight />)).toContain("Pareto frontier");
    expect(renderToStaticMarkup(<UnifiedLeaderboard boards={[RUNTIME_BOARD]} showParetoHighlight />)).not.toContain("Pareto frontier");
  });

  it("renders a row with a detail label and no source", () => {
    const board = { ...RUNTIME_BOARD, rows: [fixtureRow({ model_id: "x", model_detail: "GPU build", source: null })] };
    const html = renderToStaticMarkup(<UnifiedLeaderboard boards={[board]} />);
    expect(html).toContain("GPU build");
    expect(html).toContain("Not recorded");
  });
});
