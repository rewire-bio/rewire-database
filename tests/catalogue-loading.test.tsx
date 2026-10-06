import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Explorer from "../app/database/Explorer";

const { list, compare } = vi.hoisted(() => ({
  list: vi.fn(),
  compare: vi.fn(),
}));
vi.mock("@/lib/catalogue-client", () => ({
  catalogueClient: () => ({ list, compare }),
}));

vi.mock("next/link", () => ({
  default: ({ children, ...props }: any) => <a {...props}>{children}</a>,
}));
const page = (kind = "model", name = "Initial model") => ({
  release_id: "test",
  total: 1,
  next_cursor: null,
  items: [
    {
      id: name,
      kind,
      name,
      description: "",
      status: "discovered",
      attributes: {},
      facets: { areas: [] },
      source_ids: [],
    },
  ],
});
const release = {
  release_id: "test",
  facets: { areas: [], statuses: [], counts: {} },
};
function deferred() {
  let resolve!: (value: ReturnType<typeof page>) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<ReturnType<typeof page>>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
let tree: ReactTestRenderer;
let url: URL;
let events: EventTarget;
async function render(search = "?kind=benchmark") {
  url = new URL(`https://benchmarks.rewirebio.io/${search}#browse`);
  await act(async () => {
    tree = create(
      <Explorer initial={page() as never} release={release as never} />,
    );
  });
  await act(async () => {
    vi.advanceTimersByTime(200);
  });
}
async function click(label: string) {
  const button = tree.root
    .findAllByType("button")
    .find((b) => b.children[0] === label);
  expect(button, label).toBeTruthy();
  await act(async () => button!.props.onClick());
  await act(async () => {
    vi.advanceTimersByTime(200);
  });
}
function rows() {
  return tree.root.findAllByType("article");
}
function text(): string {
  const flatten = (node: any): string =>
    typeof node === "string"
      ? node
      : Array.isArray(node)
        ? node.map(flatten).join("")
        : (node?.children || []).map(flatten).join("");
  return flatten(tree.toJSON());
}

beforeEach(() => {
  vi.useFakeTimers();
  list.mockReset();
  compare.mockReset();
  events = new EventTarget();
  const changeUrl = (_state: unknown, _title: string, next: string) => {
    url = new URL(next, url);
  };
  vi.stubGlobal("window", {
    get location() {
      return url;
    },
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    history: { pushState: changeUrl, replaceState: changeUrl },
  });
});
afterEach(() => {
  if (tree) act(() => tree.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("requested catalogue results", () => {
  it("hides initial models on a benchmark deep link until benchmarks arrive", async () => {
    const request = deferred();
    list.mockReturnValue(request.promise);
    await render();
    expect(text()).toContain("Loading benchmarks…");
    expect(rows()).toHaveLength(0);
    expect(tree.root.findAllByType("nav")).toHaveLength(0);
    expect(list.mock.calls[0][0].kind).toBe("benchmark");
    await act(async () =>
      request.resolve(page("benchmark", "Benchmark result")),
    );
    expect(rows()).toHaveLength(1);
    expect(text()).toContain("Benchmark result");
    expect(text()).not.toContain("Loading benchmarks");
    await act(async () => {
      vi.advanceTimersByTime(15_000);
    });
    expect(text()).not.toContain("took too long");
  });

  it("aborts a stalled request, permits retry and ignores its late response", async () => {
    const stalled = deferred();
    const retried = deferred();
    list
      .mockReturnValueOnce(stalled.promise)
      .mockReturnValueOnce(retried.promise);
    await render();
    const signal = list.mock.calls[0][1] as AbortSignal;
    await act(async () => {
      vi.advanceTimersByTime(15_000);
    });
    expect(signal.aborted).toBe(true);
    expect(text()).toContain("took too long");
    expect(text()).not.toContain("Loading benchmarks");
    expect(rows()).toHaveLength(0);
    await click("Retry");
    await act(async () =>
      retried.resolve(page("benchmark", "Retried benchmark")),
    );
    await act(async () =>
      stalled.resolve(page("benchmark", "Stale benchmark")),
    );
    expect(text()).toContain("Retried benchmark");
    expect(text()).not.toContain("Stale benchmark");
  });

  it("shows an error rather than models when the benchmark request fails", async () => {
    const request = deferred();
    list.mockReturnValue(request.promise);
    await render();
    await act(async () => request.reject(new Error("unavailable")));
    expect(text()).toContain("could not be loaded");
    expect(rows()).toHaveLength(0);
    expect(text()).not.toContain("1 matching records");
  });

  it("cancels superseded filters and ignores out-of-order responses", async () => {
    const benchmark = deferred();
    const dataset = deferred();
    list
      .mockReturnValueOnce(benchmark.promise)
      .mockReturnValueOnce(dataset.promise);
    await render();
    const oldSignal = list.mock.calls[0][1] as AbortSignal;
    await click("Datasets");
    expect(oldSignal.aborted).toBe(true);
    await act(async () => dataset.resolve(page("dataset", "Current dataset")));
    await act(async () =>
      benchmark.resolve(page("benchmark", "Old benchmark")),
    );
    expect(text()).toContain("Current dataset");
    expect(text()).not.toContain("Old benchmark");
  });

  it("hides stale rows on browser history navigation and same-kind filter changes", async () => {
    const first = deferred();
    const next = deferred();
    list.mockReturnValueOnce(first.promise).mockReturnValueOnce(next.promise);
    await render();
    await act(async () => first.resolve(page("benchmark", "First benchmark")));
    await act(async () => {
      window.history.replaceState(
        null,
        "",
        "/?kind=benchmark&q=other&cursor=page2#browse",
      );
      events.dispatchEvent(new Event("popstate"));
    });
    expect(rows()).toHaveLength(0);
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(list.mock.calls[1][0]).toMatchObject({
      kind: "benchmark",
      q: "other",
      cursor: "page2",
    });
    await act(async () => next.resolve(page("benchmark", "Other benchmark")));
    expect(text()).toContain("Other benchmark");
  });
});

describe("explorer controls after component extraction", () => {
  it("clears a readiness-only filter and its cursor while retaining the record type", async () => {
    list.mockResolvedValue(page("dataset", "Ready dataset"));
    await render("?kind=dataset&readiness=replay&cursor=page2");
    expect(list.mock.calls[0][0]).toMatchObject({
      readiness: "replay",
      cursor: "page2",
    });
    await click("Clear search and filters");
    expect(url.searchParams.get("kind")).toBe("dataset");
    expect(url.searchParams.has("readiness")).toBe(false);
    expect(url.searchParams.has("cursor")).toBe(false);
    expect(list.mock.lastCall![0]).toMatchObject({
      kind: "dataset",
      readiness: undefined,
      cursor: undefined,
    });
  });

  it("uses server pagination cursors and clears them when searching", async () => {
    list.mockResolvedValue({
      ...page("benchmark", "Benchmark"),
      next_cursor: "next+opaque/==",
      previous_cursor: null,
      range_start: 1,
      range_end: 1,
    });
    await render();
    await click("Next");
    expect(url.searchParams.get("cursor")).toBe("next+opaque/==");
    expect(list.mock.lastCall![0].cursor).toBe("next+opaque/==");
    await act(async () =>
      tree.root
        .findByProps({ id: "catalogue-search" })
        .props.onChange({ target: { value: "RNA" } }),
    );
    expect(url.searchParams.get("q")).toBe("RNA");
    expect(url.searchParams.has("cursor")).toBe(false);
    expect(rows()).toHaveLength(0);
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(list.mock.lastCall![0]).toMatchObject({
      q: "RNA",
      cursor: undefined,
    });
  });

  it("ignores a compatibility response after selection has been cleared", async () => {
    const pending = deferred();
    compare.mockReturnValue(pending.promise);
    list.mockResolvedValue({
      ...page("result", "First"),
      total: 2,
      items: [
        ...page("result", "First").items,
        ...page("result", "Second").items,
      ],
    });
    await render("?kind=result");
    const checks = () => tree.root.findAllByProps({ type: "checkbox" });
    await act(async () =>
      checks()[0].props.onChange({ target: { checked: true } }),
    );
    await act(async () =>
      checks()[1].props.onChange({ target: { checked: true } }),
    );
    expect(compare).toHaveBeenCalledWith({ ids: ["First", "Second"] });
    await click("Clear selection");
    await act(async () =>
      pending.resolve({
        compatible: false,
        reasons: ["Stale comparison"],
        release_id: "test",
      } as never),
    );
    expect(text()).not.toContain("Stale comparison");
    expect(checks().every((check) => !check.props.checked)).toBe(true);
  });
});
