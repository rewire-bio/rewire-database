import { describe, expect, it, vi } from "vitest";
import { create } from "react-test-renderer";
import { renderToStaticMarkup } from "react-dom/server";
import { ExplorerFilters } from "../app/database/ExplorerFilters";
import { ExplorerSearch } from "../app/database/ExplorerSearch";
import { ExplorerPagination } from "../app/database/ExplorerPagination";
import { ExplorerComparison } from "../app/database/ExplorerComparison";
import { ExplorerStatus } from "../app/database/ExplorerStatus";
import { ExplorerRows } from "../app/database/ExplorerRows";
import { defaultFilters } from "../lib/omics-browse";
import type { CataloguePage, CatalogueRelease, Comparison } from "../lib/catalogue-client";
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));
const release = { facets: { areas: ["dna-genomes"], statuses: ["source_checked"], counts: { model: 1 } } } as unknown as CatalogueRelease;
const data = { items: [], total: 0, next_cursor: null } as unknown as CataloguePage;
const applied = { filters: defaultFilters, cursor: undefined };

describe("catalogue controls", () => {
  it("changes search scope and expands supporting record types", () => {
    const change = vi.fn(), setMoreOpen = vi.fn();
    const tree = create(<ExplorerSearch filters={defaultFilters} moreOpen={false} setMoreOpen={setMoreOpen} change={change} release={release} />);
    tree.root.findByType("input").props.onChange({ target: { value: "BRCA" } });
    expect(change).toHaveBeenCalledWith("q", "BRCA");
    tree.root.findAllByType("button").forEach((button) => button.props.onClick());
    expect(change).toHaveBeenCalledWith("kind", "model");
    expect(change).toHaveBeenCalledWith("kind", "protocol");
    tree.root.findByType("details").props.onToggle({ currentTarget: { open: true } });
    expect(setMoreOpen).toHaveBeenCalledWith(true);
    tree.update(<ExplorerSearch filters={{ ...defaultFilters, kind: "protocol" }} moreOpen setMoreOpen={setMoreOpen} change={change} release={release} />);
    expect(JSON.stringify(tree.toJSON())).toContain("More record types"); tree.unmount();
  });
  it("dispatches all filters, preserves missing options and clears within the active type", () => {
    const change = vi.fn(), navigate = vi.fn();
    const filters = { ...defaultFilters, kind: "result" as const, area: "missing-area", status: "missing-status" };
    const tree = create(<ExplorerFilters filters={filters} change={change} navigate={navigate} data={data} release={release} />);
    tree.root.findAllByType("select").forEach((select, i) => select.props.onChange({ target: { value: i ? "source_checked" : "dna-genomes" } }));
    expect(change).toHaveBeenCalledWith("area", "dna-genomes"); expect(change).toHaveBeenCalledWith("status", "source_checked");
    tree.root.findAllByType("button").forEach((button) => button.props.onClick());
    expect(change).toHaveBeenCalledWith("origin", "literature");
    expect(navigate).toHaveBeenCalledWith({ ...defaultFilters, kind: "result" });
    expect(JSON.stringify(tree.toJSON())).toContain("missing-area");
    tree.update(<ExplorerFilters filters={{ ...defaultFilters, kind: "evaluation", readiness: "replay" }} change={change} navigate={navigate} data={{ ...data, available: { areas: { "dna-genomes": 2, proteins: 1 }, statuses: { source_checked: 1, pending: 2 } } } as CataloguePage} release={release} />);
    const selects = tree.root.findAllByType("select");
    expect(selects).toHaveLength(3); selects[2].props.onChange({ target: { value: "replay" } });
    expect(change).toHaveBeenCalledWith("readiness", "replay"); tree.unmount();
  });
  it("navigates cursors and disables pagination during errors or loading", () => {
    const navigate = vi.fn();
    const tree = create(<ExplorerPagination data={{ ...data, total: 4, range_start: 2, range_end: 3, previous_cursor: "prev", next_cursor: "next" }} loading={false} error="" navigate={navigate} applied={applied} />);
    tree.root.findAllByType("button").forEach((button) => button.props.onClick());
    expect(navigate).toHaveBeenCalledWith(defaultFilters, "prev"); expect(navigate).toHaveBeenCalledWith(defaultFilters, "next");
    for (const state of [{ loading: true, error: "" }, { loading: false, error: "failed" }, { loading: false, error: "" }]) {
      tree.update(<ExplorerPagination data={data} {...state} navigate={navigate} applied={applied} />);
      expect(tree.root.findAllByType("button").every((button) => button.props.disabled)).toBe(true);
    }
    tree.root.findAllByType("button").forEach((button) => button.props.onClick());
    expect(navigate).toHaveBeenCalledWith(defaultFilters, undefined); tree.unmount();
  });
  it("shows compatibility outcomes and clears selections", () => {
    const clearSelection = vi.fn();
    const tree = create(<ExplorerComparison selected={[]} comparison={null} clearSelection={clearSelection} />);
    expect(tree.root.findAllByType("button")).toHaveLength(0);
    for (const compatible of [true, false]) {
      tree.update(<ExplorerComparison selected={["a", "b"]} comparison={{ compatible, reasons: ["Protocol conditions"] } as Comparison} clearSelection={clearSelection} />);
      expect(JSON.stringify(tree.toJSON())).toContain(compatible ? "Recorded comparison conditions match" : "cannot be compared automatically");
    }
    tree.root.findByType("button").props.onClick(); expect(clearSelection).toHaveBeenCalledOnce(); tree.unmount();
  });
  it("announces singular and plural totals and preserves context on retry", () => {
    const retry = vi.fn();
    const tree = create(<ExplorerStatus busy filters={defaultFilters} showResults={false} data={data} applied={applied} error="" retry={retry} />);
    expect(JSON.stringify(tree.toJSON())).toContain("Loading");
    for (const total of [1, 2]) {
      tree.update(<ExplorerStatus busy={false} filters={defaultFilters} showResults data={{ ...data, total }} applied={applied} error="Offline" retry={retry} />);
      expect(tree.root.findAllByType("p")[0].children.join("")).toContain(`${total} matching`);
      expect(JSON.stringify(tree.toJSON())).toContain("Showing:");
    }
    tree.root.findByType("button").props.onClick(); expect(retry).toHaveBeenCalledOnce();
    tree.update(<ExplorerStatus busy={false} filters={defaultFilters} showResults={false} data={data} applied={applied} error="Offline" retry={retry} />);
    expect(JSON.stringify(tree.toJSON())).not.toContain("Showing:"); tree.unmount();
  });
  it("selects and deselects results and enforces the comparison limit", () => {
    const record = { id: "result-a", kind: "result", name: "Result", description: "Description", status: "source_checked", attributes: { printed_value: "0.9", metric: "AUROC" }, facets: {}, source_ids: [], links: [] };
    const page = { ...data, items: [record] } as CataloguePage;
    const setSelected = vi.fn();
    const tree = create(<ExplorerRows data={page} loading={false} selected={[]} setSelected={setSelected} returnTo="/?kind=result#browse" />);
    tree.root.findByType("input").props.onChange({ target: { checked: true } }); expect(setSelected).toHaveBeenCalledWith(["result-a"]);
    tree.update(<ExplorerRows data={page} loading={false} selected={["result-a"]} setSelected={setSelected} returnTo="/" />);
    tree.root.findByType("input").props.onChange({ target: { checked: false } }); expect(setSelected).toHaveBeenCalledWith([]);
    tree.update(<ExplorerRows data={page} loading={false} selected={Array.from({ length: 20 }, (_, i) => `${i}`)} setSelected={setSelected} returnTo="/" />);
    expect(tree.root.findByType("input").props.disabled).toBe(true); tree.unmount();
    for (const evaluation_count of [0, 2]) {
      const html = renderToStaticMarkup(<ExplorerRows data={{ ...data, items: [{ ...record, kind: "model", attributes: { profile: { summary: "Profile" } }, facets: { areas: ["dna-genomes"] }, source_ids: ["source"] }], evaluation_summaries: { "result-a": { evaluation_count, result_count: 3 } } } as CataloguePage} loading={false} selected={[]} setSelected={setSelected} returnTo="/" />);
      expect(html).toContain(evaluation_count ? "2 evaluations" : "No evaluations linked");
    }
  });
});
