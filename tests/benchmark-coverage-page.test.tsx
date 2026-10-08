import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import CoveragePage from "../app/coverage/page";
import BenchmarkCoverage from "../components/catalogue/BenchmarkCoverage";

const fixture = vi.hoisted(() => ({
  releaseId: "reviewed-release",
  read: vi.fn(),
}));
vi.mock("node:fs", () => ({ readFileSync: fixture.read }));
vi.mock("@/lib/catalogue-build", () => ({ buildCatalogue: () => ({ catalogue: { release_id: fixture.releaseId } }) }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));

const audit = {
  release_id: "reviewed-release",
  summary: { benchmark: { pages: 1, with_results: 0, with_charts: 0 } },
  pages: [{ id: "example", kind: "benchmark", name: "Example benchmark", url: "/database/benchmark/example/", evaluations: 0, metric_rows: 0, charts: 0, state: "results_not_yet_collected", gaps: ["Source table awaits review."] }],
};
beforeEach(() => { fixture.read.mockReset(); fixture.read.mockReturnValue(JSON.stringify(audit)); });

describe("release-pinned coverage presentation", () => {
  it("renders the prepared audit with release-specific download and collection-gap language", () => {
    const html = renderToStaticMarkup(<CoveragePage />);
    expect(fixture.read).toHaveBeenCalledWith("public/omics/coverage/reviewed-release.json", "utf8");
    expect(html).toContain(`href="https://raw.githubusercontent.com/rewire-bio/rewire-benchmark-data/${'a'.repeat(40)}/website/files/public/omics/coverage/reviewed-release.json.gz"`);
    expect(html).toContain("Example benchmark");
    expect(html).toContain("Published results still to collect.");
    expect(html).toContain("Source table awaits review.");
    expect(html).toContain("A metric row is not an independent experiment.");
  });
  it("rejects an audit for a different release", () => {
    fixture.read.mockReturnValue(JSON.stringify({ ...audit, release_id: "other-release" }));
    expect(() => CoveragePage()).toThrow("does not match the pinned catalogue release");
  });
  it("does not describe an empty collection as an absence of published experiments", () => {
    const html = renderToStaticMarkup(<BenchmarkCoverage results={0} evaluations={0} charts={0} />);
    expect(html).toContain("It does not mean that the benchmark has no published results.");
    expect(html).toContain('href="/coverage/"');
    expect(html).not.toContain('href="#charts"');
  });
  it("distinguishes evaluation counts, metric rows and source-scoped figures", () => {
    const html = renderToStaticMarkup(<BenchmarkCoverage results={30} evaluations={4} charts={2} />);
    expect(html).toContain("4 recorded evaluations, 30 metric rows");
    expect(html).toContain("Explore 2 source-scoped charts");
  });
});

vi.mock("../lib/downloads", async () => import("./fixtures/downloads"));
