import { afterEach, describe, expect, it, vi } from "vitest";
import { preparedFromSnapshot } from "./helpers/prepared";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { renderToStaticMarkup } from "react-dom/server";
import { CatalogueDownloads } from "../components/catalogue/CatalogueDownloads";
import { CatalogueEvidence } from "../components/catalogue/CatalogueEvidence";
import ResearchReadiness, { ResearchReadinessSummary } from "../components/catalogue/ResearchReadiness";
import RunGuide from "../components/catalogue/RunGuide";
import RunRecipes from "../components/catalogue/RunRecipes";
import type { CatalogueRecord, CatalogueSnapshot } from "../shared/omics/catalogue-query";
import type { ResearchManifest, ResearchReadiness as Assessment } from "../shared/omics/research";
import type { RunRecipe } from "../shared/omics/run-recipe";

let tree: ReactTestRenderer | undefined;
afterEach(() => { if (tree) act(() => tree!.unmount()); tree = undefined; vi.unstubAllGlobals(); });
const record = (id: string, kind: CatalogueRecord["kind"], attributes: Record<string, unknown> = {}): CatalogueRecord => ({ id, kind, name: id, description: "Synthetic evidence", status: "source_checked", source_ids: [], links: [], facets: {}, attributes });
const source = record("source", "source", { url: "https://example.org/source" });
const cited = { source_ids: ["source"], source_locator: "Methods" };
const recipe = (id = "mfass-v2-rescore"): RunRecipe => ({
  id, protocol_id: "protocol", version: "1", title: id, purpose: "rescore_predictions", summary: "Recompute fixed metrics", inputs: ["Keyed predictions"], outputs: ["Metrics"],
  requirements: { data: "Held-out inputs", weights: "None", licence: "Research use", software: "Python", hardware: "CPU" },
  instructions: ["python", "command_line"].map((runtime) => ({ runtime: runtime as "python" | "command_line", title: `Execute ${runtime}`, code: `run_${runtime}()`, status: "source_reviewed_not_executed", ...cited })), limitations: ["Rescoring does not rerun inference"], ...cited,
});
function browser(search = "") {
  let url = new URL(`https://benchmarks.rewirebio.io/database/protocol/protocol/${search}`);
  const events = new EventTarget();
  const remove = vi.fn(events.removeEventListener.bind(events));
  vi.stubGlobal("window", { get location() { return url; }, history: { state: null, pushState: (_state: unknown, _title: string, next: URL | string) => { url = new URL(next, url); } }, addEventListener: events.addEventListener.bind(events), removeEventListener: remove });
  return { get url() { return url; }, navigate(search: string) { url.search = search; events.dispatchEvent(new Event("popstate")); }, remove };
}
function assessment(ready = false): Assessment {
  const capability = { ready, blockers: ready ? [] : ["Independent cohort missing"], evidence: ready ? ["Pinned metrics checked"] : [], verified_at: ready ? "2026-10-01T00:00:00Z" : null };
  return { record_id: "dataset", kind: "dataset", name: "Dataset", release_id: "fixture", manifest_ids: [], evidence_source_ids: [], verified_at: null, capabilities: { replay: capability, analysis: capability, local_run: capability, validation: capability }, limitations: ["Synthetic evidence only"], artifact_availability: "unrecorded" };
}

describe("catalogue information panels", () => {
  it("links downloads to the selected immutable release and distinguishes archived literature", () => {
    const html = renderToStaticMarkup(<CatalogueDownloads releaseId="fixture" releasedAt="2026-10-01T12:34:56Z" />);
    for (const file of ["records.jsonl", "records.csv", "evidence.csv", "evidence.jsonl", "manifest.json"]) expect(html).toContain(`/omics/releases/fixture/${file}`);
    expect(html).toContain("2026-10-01");
    expect(html).toContain("six result rows excluded");
  });
  it("counts evidence provenance separately from catalogue coverage, including missing benchmark evidence", () => {
    const benchmark = record("benchmark", "benchmark");
    const covered = record("covered", "benchmark");
    const evaluation = record("evaluation", "evaluation"); evaluation.links = [{ relation: "benchmark", target_id: "covered" }];
    const published = record("published", "result"); published.links = [{ relation: "evaluation", target_id: "evaluation" }];
    const reproduced = { ...record("reproduced", "result"), status: "reproduced" as const };
    const records = [benchmark, covered, evaluation, published, reproduced, source].map((item) => ({ ...item, facets: { areas: ["dna-genomes"] } }));
    const catalogue: CatalogueSnapshot = { schema_version: "1.1", release_id: "fixture", released_at: "2026-10-01T00:00:00Z", coverage: { note: "Dated collection" }, records };
    const html = renderToStaticMarkup(<CatalogueEvidence query={preparedFromSnapshot(catalogue)} />);
    expect(html).toContain("1 source-checked published results");
    expect(html).toContain("1 results from existing rewire runs");
    expect(html).toContain("Source checked does not mean independently reproduced");
    expect(html).toContain("DNA and genomes");
    expect(html).toContain("Dated collection");
    expect(html).toContain("MFASS v1 is superseded");
  });
  it("shows absent readiness evidence without suggesting analysis can start", () => {
    const value = assessment();
    const html = renderToStaticMarkup(<ResearchReadiness assessment={value} manifests={[]} />);
    expect(html).toContain("No verified artifact manifest");
    expect(html).toContain("Independent cohort missing");
    expect(html).toContain("Evidence incomplete");
    expect(renderToStaticMarkup(<ResearchReadinessSummary assessment={value} href="/database/dataset/dataset/" />)).toContain("More evidence is needed");
    expect(renderToStaticMarkup(<ResearchReadinessSummary assessment={assessment(true)} href="/database/dataset/dataset/" />)).toContain("Evidence ready to replay metrics");
  });
  it("preserves public and local artifact availability, checksums, exposure and protocol links", () => {
    const manifest: ResearchManifest = {
      schema_version: "1.0", id: "manifest", title: "Verified manifest", question: "Can metrics be replayed?", catalogue_release_id: "fixture", dataset_id: "dataset", evaluation_ids: [], protocol_id: "protocol", sdk_protocol_id: "sdk-v1",
      artifacts: [{ id: "public", role: "table", sha256: "a".repeat(64), semantic_sha256: "b".repeat(64), format: "json", uri: "https://example.org/artifact" }, { id: "local", role: "table", sha256: "c".repeat(64), format: "json", uri: null }], table_artifact_id: "public",
      semantics: { target: "continuous", outcome: "y", unit: "units", score_direction: "higher", join_key: "id", independent_unit: null, subgroup_fields: [], exposed: true, split: "test" }, expected_metrics: {}, metric_tolerance: .001,
      verification: { verified_at: "2026-10-01T00:00:00Z", checks: [], limitations: [] }, local_recipes: [],
    };
    for (const exposed of [true, false]) {
      manifest.semantics.exposed = exposed;
      const value = { ...assessment(true), artifact_availability: exposed ? "public_references" as const : "local_resolver_required" as const };
      const html = renderToStaticMarkup(<ResearchReadiness assessment={value} manifests={[manifest]} records={[record("protocol", "protocol")]} />);
      expect(html).toContain("Artifact source");
      expect(html).toContain("No public download in this release");
      expect(html).toContain("Semantic SHA-256");
      expect(html).toContain("Evaluation protocol and run instructions");
      expect(html).toContain(exposed ? "Already used for exploration" : "See exposure and validation evidence");
      expect(html).toContain(exposed ? "Public source links are recorded" : "One or more artifacts need a local resolver");
    }
  });
});

describe("copying official commands and reviewed recipes", () => {
  it("reports RunGuide copy success, failure and recovery without losing the commands", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined); vi.stubGlobal("navigator", { clipboard: { writeText } });
    const owner = record("protocol", "protocol", { run_guide: { record_id: "protocol", summary: "Official guide", status: "source_reviewed_not_executed", prerequisites: ["Install dependencies"], steps: [{ title: "Evaluate", shell: "python evaluate.py", explanation: "Score the fixed cohort", ...cited }], outputs: [], limitations: ["Not independently reproduced"], source_ids: ["source"], review: { method: "official_repository_review", date: "2026-10-01" } } });
    act(() => { tree = create(<RunGuide record={owner} sources={[source]} />); });
    await act(async () => { await tree!.root.findByType("button").props.onClick(); });
    expect(writeText).toHaveBeenCalledWith("python evaluate.py");
    expect(tree!.root.findByProps({ role: "status" }).children.join("")).toBe("Commands copied to clipboard.");
    writeText.mockRejectedValueOnce(new Error("Denied"));
    await act(async () => { await tree!.root.findByType("button").props.onClick(); });
    expect(tree!.root.findByProps({ role: "status" }).children.join("")).toContain("Copy is unavailable");
    expect(tree!.root.findByType("code").children).toEqual(["python evaluate.py"]);
    await act(async () => { await tree!.root.findByType("button").props.onClick(); });
    expect(tree!.root.findByProps({ role: "status" }).children.join("")).toBe("Commands copied to clipboard.");
  });
  it("copies only the selected recipe format and keeps URL, history and error feedback in sync", async () => {
    const environment = browser("?recipe=mfass-v2-rescore&recipe_runtime=command_line&return_to=%2Fuse-cases%2Fexample%2F");
    const writeText = vi.fn().mockResolvedValue(undefined); vi.stubGlobal("navigator", { clipboard: { writeText } });
    const second = { ...recipe("official-sequence"), purpose: "generate_and_evaluate" as const, protocol_id: "mfass-v2-frozen-encoder" };
    const owner = record("protocol", "protocol", { run_recipes: [recipe(), second, { invalid: true }] });
    act(() => { tree = create(<RunRecipes record={owner} sources={[source]} />); });
    expect(tree!.root.findAllByType("button")).toHaveLength(1);
    await act(async () => { await tree!.root.findByType("button").props.onClick(); });
    expect(writeText).toHaveBeenLastCalledWith("run_command_line()");
    expect(tree!.root.findByProps({ role: "status" }).children.join("")).toContain("instructions copied");
    writeText.mockRejectedValueOnce(new Error("Denied"));
    await act(async () => { await tree!.root.findByType("button").props.onClick(); });
    expect(tree!.root.findByProps({ role: "status" }).children.join("")).toContain("Copy unavailable");
    act(() => { tree!.root.findAllByType("select")[1].props.onChange({ target: { value: "python" } }); });
    expect(environment.url.searchParams.get("recipe_runtime")).toBe("python");
    expect(tree!.root.findByProps({ role: "status" }).children).toEqual([]);
    act(() => { tree!.root.findAllByType("select")[0].props.onChange({ target: { value: "1" } }); });
    expect(environment.url.searchParams.get("recipe")).toBe("official-sequence");
    expect(environment.url.searchParams.has("recipe_runtime")).toBe(false);
    expect(environment.url.searchParams.get("return_to")).toBe("/use-cases/example/");
    expect(tree!.root.findAllByType("button")).toHaveLength(2);
    act(() => { tree!.root.findByType("select").props.onChange({ target: { value: "0" } }); });
    expect(environment.url.searchParams.get("recipe_runtime")).toBe("python");
    act(() => { environment.navigate("?recipe=mfass-v2-rescore&recipe_runtime=command_line"); });
    expect(tree!.root.findAllByType("select")[1].props.value).toBe("command_line");
    act(() => { environment.navigate("?recipe=unknown&recipe_runtime=unknown"); });
    expect(tree!.root.findAllByType("select")[0].props.value).toBe(0);
    expect(tree!.root.findAllByType("select")[1].props.value).toBe("python");
    act(() => { tree!.unmount(); }); tree = undefined;
    expect(environment.remove).toHaveBeenCalledWith("popstate", expect.any(Function));
  });
});
