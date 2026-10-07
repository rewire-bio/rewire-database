import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import BenchmarkCharts from "../components/catalogue/BenchmarkCharts";
import type { ResolvedComparison } from "../services/omics/src/published-comparisons";
import type { CatalogueRecord, ResultRow } from "../services/omics/src/catalogue-query";
const api = vi.hoisted(() => ({ comparison: vi.fn(), results: vi.fn() }));
vi.mock("../lib/catalogue-client", () => ({ catalogueClient: () => api }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));
vi.mock("../components/catalogue/Results", () => ({ default: () => <p>Loaded all evaluations</p> }));
const record = (id: string, kind: CatalogueRecord["kind"], attributes = {}): CatalogueRecord => ({ id, kind, name: id, description: "", status: "source_checked", facets: {}, source_ids: [], links: [], attributes });
function fixture(): ResolvedComparison {
  const rows: ResultRow[] = Array.from({ length: 15 }, (_, i) => ({ result: record(`result-${i}`, "result", { numeric_value: i < 13 ? i / 20 : null, printed_value: i < 13 ? String(i / 20) : "N/A", uncertainty: i === 10 ? { type: "standard_error", value: 0.01 } : null }), evaluation: null, models: [record(`model-${i}`, "model"), ...(i === 0 ? [record("other-model", "model")] : [])], benchmarks: [], methods: [], configurations: [], pipelines: [], services: [], tasks: [], protocols: [], evaluators: [], datasets: [], dataset_subsets: [], sources: [], origin: "author_reported", review_status: "source_checked" }));
  return { id: "panel-a", title: "Panel A", protocol_id: "protocol-a", dataset_id: "dataset-a", metric: "AUROC", unit: "fraction", direction: "higher", result_ids: rows.map((row) => row.result.id), source_ids: [], source_locator: "Table 1", context: "Context", caveats: ["Specific limitation", "No interval assigned unless printed in source cell."], review: { method: "automated_source_review", date: "2026-10-01" }, rows, sources: [], protocol: record("protocol-a", "protocol"), dataset: record("dataset-a", "dataset") };
}
let tree: ReactTestRenderer | undefined;
const text = () => JSON.stringify(tree!.toJSON());
const button = (name: string) => tree!.root.findAllByType("button").find((node) => node.children.join("") === name)!;
const click = async (name: string) => { await act(async () => button(name).props.onClick()); };
beforeEach(() => {
  api.comparison.mockReset(); api.results.mockReset();
  let url = new URL("https://example.test/database/benchmark/a/");
  vi.stubGlobal("window", { get location() { return url; }, history: { pushState: (_a: unknown, _b: unknown, next: string) => { url = new URL(next); } }, addEventListener: vi.fn(), removeEventListener: vi.fn() });
});
afterEach(() => { if (tree) act(() => tree!.unmount()); tree = undefined; vi.unstubAllGlobals(); });

describe("comparison chart controls", () => {
  it("searches scopes, selects scope and metric, and clears excluded selections", async () => {
    const panel = fixture();
    const panels = [panel, { ...panel, id: "panel-b", title: "Panel B", protocol: record("protocol-b", "protocol") }];
    const options = [...panels, ...Array.from({ length: 11 }, (_, i) => ({ id: `option-${i}`, title: `Other ${i}`, metric: "Accuracy" }))];
    await act(async () => { tree = create(<BenchmarkCharts panels={panels} options={options} />); });
    act(() => tree!.root.findAllByType("select")[0].props.onChange({ target: { value: "protocol-b::dataset-a" } }));
    expect(window.location.search).toContain("results_panel=panel-b");
    act(() => tree!.root.findAllByType("select")[1].props.onChange({ target: { value: "panel-a" } }));
    expect(text()).toContain("Panel A");
    act(() => tree!.root.findAllByType("select")[0].props.onChange({ target: { value: "missing" } }));
    act(() => tree!.root.findAllByType("input")[0].props.onChange({ target: { value: "Absent scope" } }));
    expect(text()).toContain("current, outside");
    await click("Clear search");
    expect(window.location.search).not.toContain("scope_search");
  });
  it("switches chart/table, expands rows, zooms and resets row searches", async () => {
    await act(async () => { tree = create(<BenchmarkCharts panels={[fixture()]} />); });
    await click("Show all 15"); expect(text()).toContain("Show first 12");
    await click("Show first 12");
    const zoom = () => tree!.root.findAllByType("input").find((node) => node.props.type === "checkbox")!;
    act(() => zoom().props.onChange({ target: { checked: true } })); expect(window.location.search).toContain("results_zoom=1");
    act(() => zoom().props.onChange({ target: { checked: false } }));
    await click("Table"); expect(tree!.root.findAllByType("table")).toHaveLength(1);
    await click("Chart"); expect(tree!.root.findAllByType("table")).toHaveLength(0);
    act(() => tree!.root.findAllByType("input").find((node) => node.props.type === "search")!.props.onChange({ target: { value: "No such model" } }));
    expect(text()).toContain("No rows match"); await click("Reset search"); expect(text()).toContain("Show all 15");
  });
  it("retains the last panel when a remote comparison fails and retries", async () => {
    const panel = fixture();
    const options = [panel, { id: "remote", title: "Remote", metric: "AUROC" }];
    api.comparison.mockResolvedValueOnce({ panel: null }).mockResolvedValueOnce({ panel: { ...panel, id: "remote", title: "Remote loaded" } });
    await act(async () => { tree = create(<BenchmarkCharts panels={[panel]} options={options} recordId="record" releaseId="release" />); });
    await act(async () => tree!.root.findAllByType("select")[1].props.onChange({ target: { value: "remote" } }));
    expect(text()).toContain("Displayed comparison:"); expect(text()).toContain("could not be loaded");
    await click("Retry"); expect(text()).toContain("Remote loaded"); expect(tree!.root.findAllByProps({ role: "alert" })).toHaveLength(0);
  });
  it("shows an unavailable scope without remote identifiers", async () => {
    const panel = fixture();
    await act(async () => { tree = create(<BenchmarkCharts panels={[panel]} options={[panel, { id: "missing", title: "Missing", metric: "AUROC" }]} />); });
    act(() => tree!.root.findAllByType("select")[1].props.onChange({ target: { value: "missing" } }));
    expect(text()).toContain("This comparison is unavailable");
  });
  it("loads all evaluations, retries failures and switches back to the published comparison", async () => {
    api.results.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ items: [], total: 0, evaluation_count: 0 });
    await act(async () => { tree = create(<BenchmarkCharts panels={[fixture()]} recordId="record" releaseId="release" resultSummary={{ total: 15, evaluation_count: 2 }} />); });
    await click("All evaluations (2)"); expect(text()).toContain("All evaluations could not be loaded");
    await click("Retry evaluations"); expect(text()).toContain("Loaded all evaluations");
    await click("Published comparisons"); expect(text()).toContain("Panel A");
  });
});
