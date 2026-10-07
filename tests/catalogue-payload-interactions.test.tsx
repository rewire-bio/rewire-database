import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { renderToStaticMarkup } from "react-dom/server";
import fs from "node:fs";
import { createCatalogueQuery } from "../services/omics/src/catalogue-query";
import { packComparisons } from "../lib/comparison-transport";

const api = vi.hoisted(() => ({
  results: vi.fn(),
  evidence: vi.fn(),
  comparison: vi.fn(),
}));
vi.mock("../lib/catalogue-client", () => ({ catalogueClient: () => api }));
vi.mock("next/link", () => ({
  default: ({ children, ...props }: any) => <a {...props}>{children}</a>,
}));
import { ComparisonWorkspace } from "../components/catalogue/BenchmarkCharts";
import Results from "../components/catalogue/Results";
import EvidenceTable from "../components/catalogue/EvidenceTable";
const catalogue = JSON.parse(
  fs.readFileSync("public/omics/catalogue.json").toString(),
);
const query = createCatalogueQuery(catalogue);
const id = "discovery-benchmark-cafa";
const detail = query.get({ id, include_comparisons: false })!;
const results = query.results({ id, limit: 25 });
const evidence = query.evidence({ id, scope: "individual_claim", limit: 10 });
let tree: ReactTestRenderer;
let url: URL;
let events: EventTarget;
async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}
async function changeLocation(search: string) {
  url = new URL("https://benchmarks.rewirebio.io/test/" + search);
  await act(async () => {
    events.dispatchEvent(new Event("popstate"));
  });
}
function button(label: string) {
  return tree.root
    .findAllByType("button")
    .find((node) => node.children.join("") === label)!;
}
function text() {
  return JSON.stringify(tree.toJSON());
}
beforeEach(() => {
  vi.clearAllMocks();
  url = new URL("https://benchmarks.rewirebio.io/test/");
  events = new EventTarget();
  vi.stubGlobal("window", {
    get location() {
      return url;
    },
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    history: {
      pushState: (_state: unknown, _title: string, next: URL) => {
        url = new URL(next);
      },
    },
  });
  api.results.mockResolvedValue(results);
  api.evidence.mockResolvedValue(evidence);
});
afterEach(() => {
  if (tree) act(() => tree.unmount());
  vi.unstubAllGlobals();
});

describe("release-pinned payload and request behaviour", () => {
  it("keeps the default scientific chart and sources identical after transport packing", () => {
    for (const name of [
      "cafa",
      "casp",
      "scib",
      "virtual-cell-challenge-2026",
    ]) {
      const recordId = `discovery-benchmark-${name}`;
      const record = query.get({ id: recordId, include_comparisons: false })!;
      const page = query.results({ id: recordId, limit: 25 });
      const common = {
        recordId,
        releaseId: catalogue.release_id,
        options: record.comparison_options,
      };
      const before = renderToStaticMarkup(
        <ComparisonWorkspace
          {...common}
          panels={record.published_comparisons}
          initialResults={page}
        />,
      );
      const after = renderToStaticMarkup(
        <ComparisonWorkspace
          {...common}
          panels={packComparisons(record.published_comparisons)}
          resultSummary={{
            total: page.total,
            evaluation_count: page.evaluation_count,
          }}
        />,
      );
      expect(after).toBe(before);
    }
  });
  it("does not fetch hidden evaluations; loads once on demand and reuses them on returning", async () => {
    await act(async () => {
      tree = create(
        <ComparisonWorkspace
          recordId={id}
          releaseId={catalogue.release_id}
          panels={packComparisons(detail.published_comparisons)}
          options={detail.comparison_options}
          resultSummary={results}
        />,
      );
    });
    expect(api.results).not.toHaveBeenCalled();
    expect(api.evidence).not.toHaveBeenCalled();
    await act(async () =>
      button(`All evaluations (${results.evaluation_count})`).props.onClick(),
    );
    await flush();
    expect(api.results).toHaveBeenCalledTimes(1);
    expect(api.results).toHaveBeenCalledWith({ id, limit: 25 });
    expect(text()).toContain(results.items[0].result.attributes.printed_value);
    await act(async () => button("Published comparisons").props.onClick());
    await act(async () =>
      button(`All evaluations (${results.evaluation_count})`).props.onClick(),
    );
    expect(api.results).toHaveBeenCalledTimes(1);
  });
  it("labels deferred failures and supports retry without inventing an empty result", async () => {
    api.results.mockRejectedValueOnce(new Error("offline"));
    await act(async () => {
      tree = create(
        <ComparisonWorkspace
          recordId={id}
          releaseId={catalogue.release_id}
          panels={detail.published_comparisons}
          options={detail.comparison_options}
          resultSummary={results}
        />,
      );
    });
    await act(async () =>
      button(`All evaluations (${results.evaluation_count})`).props.onClick(),
    );
    expect(text()).toContain("All evaluations could not be loaded");
    expect(text()).not.toContain("No evaluations linked");
    await act(async () => button("Retry evaluations").props.onClick());
    expect(api.results).toHaveBeenCalledTimes(2);
    expect(text()).not.toContain("All evaluations could not be loaded");
  });
  it("honours a direct all-evaluations URL and retains comparison fallback on tab change", async () => {
    url.search = "?results_mode=all";
    await act(async () => {
      tree = create(
        <ComparisonWorkspace
          recordId={id}
          releaseId={catalogue.release_id}
          panels={detail.published_comparisons}
          options={detail.comparison_options}
          resultSummary={results}
        />,
      );
    });
    expect(api.results).toHaveBeenCalledTimes(1);
    expect(text()).toContain("All evaluations");
    await changeLocation("");
    expect(text()).toContain("dot plot; use Table");
  });
  it("keeps static results until a requested filter changes and restores them on reset", async () => {
    await act(async () => {
      tree = create(<Results id={id} initial={results} />);
    });
    expect(api.results).not.toHaveBeenCalled();
    api.results.mockRejectedValueOnce(new Error("offline"));
    await changeLocation("?results_metric=unavailable");
    expect(api.results).toHaveBeenCalledTimes(1);
    expect(text()).toContain("last successful results");
    expect(text()).toContain(results.items[0].result.attributes.printed_value);
    await changeLocation("");
    expect(api.results).toHaveBeenCalledTimes(1);
    expect(text()).not.toContain("last successful results");
    expect(text()).toContain(results.items[0].result.attributes.printed_value);
  });
  it("ignores a filtered response that arrives after returning to the static results", async () => {
    let resolvePending!: (page: typeof results) => void;
    api.results.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePending = resolve;
        }),
    );
    await act(async () => {
      tree = create(<Results id={id} initial={results} />);
    });
    await changeLocation("?results_metric=unavailable");
    expect(api.results).toHaveBeenCalledTimes(1);
    await changeLocation("");
    await act(async () =>
      resolvePending({ ...results, items: [], total: 0, evaluation_count: 0 }),
    );
    expect(text()).toContain(results.items[0].result.attributes.printed_value);
    expect(api.results).toHaveBeenCalledTimes(1);
  });
  it("discards a deferred evaluation response after leaving its tab", async () => {
    let resolvePending!: (page: typeof results) => void;
    api.results.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePending = resolve;
        }),
    );
    await act(async () => {
      tree = create(
        <ComparisonWorkspace
          recordId={id}
          releaseId={catalogue.release_id}
          panels={detail.published_comparisons}
          options={detail.comparison_options}
          resultSummary={results}
        />,
      );
    });
    await act(async () =>
      button(`All evaluations (${results.evaluation_count})`).props.onClick(),
    );
    expect(text()).toContain("Loading all evaluations");
    await act(async () => button("Published comparisons").props.onClick());
    await act(async () =>
      resolvePending({ ...results, items: [], total: 0, evaluation_count: 0 }),
    );
    expect(text()).toContain("dot plot; use Table");
    await act(async () =>
      button(`All evaluations (${results.evaluation_count})`).props.onClick(),
    );
    expect(api.results).toHaveBeenCalledTimes(2);
    expect(text()).toContain(results.items[0].result.attributes.printed_value);
  });
  it("keeps initial evidence without a duplicate request but fetches changed scopes", async () => {
    await act(async () => {
      tree = create(
        <EvidenceTable
          id={id}
          initial={evidence}
          initialScope="individual_claim"
          collapsed
        />,
      );
    });
    expect(api.evidence).not.toHaveBeenCalled();
    const select = tree.root.findByType("select");
    await act(async () =>
      select.props.onChange({ target: { value: "record_context" } }),
    );
    expect(api.evidence).toHaveBeenCalledWith({
      id,
      q: undefined,
      scope: "record_context",
      cursor: undefined,
      limit: 10,
    });
    await act(async () =>
      select.props.onChange({ target: { value: "individual_claim" } }),
    );
    expect(api.evidence).toHaveBeenCalledTimes(1);
  });
});

describe("comparison score ordering", () => {
  const values = [null, -2, 3, 3, 0, 1, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
  function orderedIds() {
    return tree.root
      .findAllByType("a")
      .map((node) => node.props.href as string)
      .filter((href) => href?.startsWith("/database/result/ordering-"))
      .map((href) => Number(href.match(/ordering-(\d+)/)![1]));
  }
  for (const direction of ["higher", "lower"] as const) {
    it(`sorts ${direction}-is-better metrics numerically descending before truncation, with matching charts and tables`, async () => {
      const original = detail.published_comparisons[0];
      const panel = {
        ...original,
        id: "ordering-fixture",
        metric: "test-score",
        unit: "arbitrary",
        direction,
        rows: values.map((value, index) => ({
          ...original.rows[0],
          result: {
            ...original.rows[0].result,
            id: `ordering-${index}`,
            attributes: {
              ...original.rows[0].result.attributes,
              numeric_value: value,
              printed_value: value === null ? "Not reported" : String(value),
              uncertainty: null,
            },
          },
        })),
      };
      const snapshot = JSON.stringify(panel);
      const expected = [15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 2, 3, 5, 4, 1, 0];
      await act(async () => {
        tree = create(<ComparisonWorkspace panels={[panel]} />);
      });
      expect(orderedIds()).toEqual(expected.slice(0, 12));
      await act(async () => button("Show all 16").props.onClick());
      expect(orderedIds()).toEqual(expected);
      await act(async () => button("Table").props.onClick());
      expect(orderedIds()).toEqual(expected);
      expect(JSON.stringify(panel)).toBe(snapshot);
      expect(text()).not.toMatch(
        /Lowest scores first|Highest scores first|best first|Source order/,
      );
      expect(
        tree.root.findAllByType("option").some(node => node.props.value === "score"),
      ).toBe(false);
      for (const order of ["score", "source", "name"]) {
        await changeLocation(
          `?results_order=${order}&results_view=table&results_all=1`,
        );
        expect(orderedIds()).toEqual(expected);
      }
    });
  }
});

describe("table filter controls", () => {
  it("applies result facets, resets empty matches, retries errors and pages both directions", async () => {
    const paged = {...results, next_cursor:"next", previous_cursor:"previous"};
    api.results.mockResolvedValue(paged);
    await act(async()=>{tree=create(<Results id={id} initial={paged}/>)});
    for (const select of tree.root.findAllByType("select")) {
      const option=select.findAllByType("option")[1];
      await act(async()=>select.props.onChange({target:{value:option?.props.value || "synthetic"}}));
    }
    expect(api.results).toHaveBeenCalled();
    await act(async()=>button("Next").props.onClick()); expect(api.results.mock.calls.at(-1)![0].cursor).toBe("next");
    await act(async()=>button("Previous").props.onClick()); expect(api.results.mock.calls.at(-1)![0].cursor).toBe("previous");
    await act(async()=>button("Reset filters").props.onClick()); expect(url.search).toBe("");
    api.results.mockRejectedValueOnce(Error("offline")); await act(async()=>tree.root.findAllByType("select")[0].props.onChange({target:{value:"missing"}}));
    expect(text()).toContain("could not be loaded"); await act(async()=>button("Retry").props.onClick()); expect(text()).not.toContain("could not be loaded");
    api.results.mockResolvedValueOnce({...results,items:[],total:0}); await act(async()=>tree.root.findAllByType("select")[0].props.onChange({target:{value:"empty"}}));
    expect(text()).toContain("No results match"); await act(async()=>tree.root.findAllByType("button").filter(n=>n.children.join("")==="Reset filters")[1].props.onClick());
    expect(text()).not.toContain("No results match");
  });
  it("searches evidence, changes scope, retries and navigates evidence pages", async () => {
    const paged={...evidence,next_cursor:"next"}; api.evidence.mockResolvedValue(paged);
    await act(async()=>{tree=create(<EvidenceTable id={id} initial={paged} initialScope="individual_claim"/>)});
    await act(async()=>tree.root.findByType("input").props.onChange({target:{value:"claim"}}));
    await act(async()=>tree.root.findByType("form").props.onSubmit({preventDefault:vi.fn()}));
    expect(api.evidence.mock.calls.at(-1)![0].q).toBe("claim");
    await act(async()=>button("Next evidence rows").props.onClick()); expect(api.evidence.mock.calls.at(-1)![0].cursor).toBe("next");
    await act(async()=>button("First evidence page").props.onClick()); expect(api.evidence.mock.calls.at(-1)![0].cursor).toBeUndefined();
    api.evidence.mockRejectedValueOnce(Error("offline")); await act(async()=>tree.root.findByType("select").props.onChange({target:{value:""}}));
    expect(text()).toContain("Evidence could not be refreshed"); await act(async()=>button("Retry evidence").props.onClick()); expect(text()).not.toContain("Evidence could not be refreshed");
  });
});
