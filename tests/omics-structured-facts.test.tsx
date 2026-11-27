import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BenchmarkTasks, ReleasedCheckpoints, SHOWN_TASKS } from "../components/catalogue/StructuredFacts";
import { benchmarkTasksSchema, checkpointsSchema, formatParameters, recordBenchmarkTasks, recordCheckpoints } from "../lib/structured-facts";
import { currentRecords } from "../shared/omics/current";
import type { OmicsRecord } from "../lib/omics";
import fixture from "./fixtures/structured-facts.json";

function record(input: { id: string; kind: string; name: string; source_ids: string[]; attributes: Record<string, unknown> }): OmicsRecord {
  return { description: "", status: "source_checked", facets: {}, links: [], ...input } as OmicsRecord;
}
const source = (id: string): OmicsRecord =>
  record({ id, kind: "source", name: `Source ${id}`, source_ids: [], attributes: { url: `https://example.org/${id}` } });
const model = () => record(structuredClone(fixture.model));
const benchmark = () => record(structuredClone(fixture.benchmark));
const sourcesOf = (item: OmicsRecord) => item.source_ids.map(source);

describe("formatParameters", () => {
  it("prints counts in short form", () => {
    expect(formatParameters(8_000_000)).toBe("8M");
    expect(formatParameters(650_000_000)).toBe("650M");
    expect(formatParameters(2_500_000_000)).toBe("2.5B");
    expect(formatParameters(10_490_112)).toBe("10M");
    expect(formatParameters(37_757_440)).toBe("38M");
    expect(formatParameters(1_300_000)).toBe("1.3M");
    expect(formatParameters(120_000)).toBe("120K");
    expect(formatParameters(15_000_000_000_000)).toBe("15T");
  });
  it("moves to the next unit instead of printing 1000", () => {
    expect(formatParameters(999_950_000)).toBe("1B");
    expect(formatParameters(999_999)).toBe("1M");
    expect(formatParameters(999_400_000)).toBe("999M");
  });
  it("prints small counts in full", () => {
    expect(formatParameters(0)).toBe("0");
    expect(formatParameters(999)).toBe("999");
  });
});

describe("released checkpoints", () => {
  it("renders one cited row per checkpoint, with unknown values marked", () => {
    const item = model();
    const html = renderToStaticMarkup(<ReleasedCheckpoints record={item} sources={sourcesOf(item)} />);
    expect(html).toContain("Released checkpoints");
    expect((html.match(/<tr>/g) || []).length).toBe(1 + fixture.model.attributes.checkpoints.length);
    expect(html).toContain('<th scope="row">openfold3-p1 (of3_ft3_v1.pt)<span');
    expect((html.match(/ · Gated/g) || []).length).toBe(2);
    expect(html).toContain("Not recorded");
    expect(html).toContain('href="https://huggingface.co/OpenFold/OpenFold3"');
    expect(html).toContain('aria-label="Weights: openfold3-p2-155k (of3-p2-155k.pt)"');
    expect(html).toContain("Source model-pages-20261127-batch8-openfold3-source-hf-api");
    expect(html).toContain("hf-api.json: code licence, weights licence");
    expect(html).toMatch(/<details class="[^"]*factSources[^"]*"><summary>Sources \(2\)<\/summary>/);
    expect(html).toMatch(/<section [^>]*class="[^"]*factTable/);
    expect(html).toContain('role="region"');
    expect(html).not.toMatch(/[–—→]/);
  });
  it("formats parameters and context with its unit", () => {
    const item = model();
    const checkpoints = item.attributes.checkpoints as Record<string, unknown>[];
    Object.assign(checkpoints[0], { parameters: 650_000_000, context_length: 1024, context_unit: "tokens" });
    const html = renderToStaticMarkup(<ReleasedCheckpoints record={item} sources={[]} />);
    expect(html).toContain(">650M<");
    expect(html).toContain(">1,024 tokens<");
  });
  it("renders nothing without the attribute", () => {
    const item = model();
    delete item.attributes.checkpoints;
    expect(renderToStaticMarkup(<ReleasedCheckpoints record={item} sources={[]} />)).toBe("");
  });
  it("renders nothing for a malformed entry", () => {
    for (const change of [{ parameters: "650M" }, { gated: "yes" }, { released: "June 2025" }, { source_ids: [] }, { extra: 1 }]) {
      const item = model();
      Object.assign((item.attributes.checkpoints as Record<string, unknown>[])[1], change);
      expect(renderToStaticMarkup(<ReleasedCheckpoints record={item} sources={[]} />)).toBe("");
    }
    const empty = model();
    empty.attributes.checkpoints = [];
    expect(renderToStaticMarkup(<ReleasedCheckpoints record={empty} sources={[]} />)).toBe("");
  });
  it("renders nothing on a record of another kind", () => {
    const item = record({ ...structuredClone(fixture.model), kind: "method" });
    expect(recordCheckpoints(item)).toBeNull();
  });
  it("does not link unsafe URLs", () => {
    const item = model();
    for (const entry of item.attributes.checkpoints as Record<string, unknown>[])
      Object.assign(entry, { weights_url: "javascript:alert(1)", code_url: null });
    const html = renderToStaticMarkup(<ReleasedCheckpoints record={item} sources={[]} />);
    expect(html).not.toContain("javascript:");
  });
});

describe("benchmark tasks", () => {
  const tasks = fixture.benchmark.attributes.benchmark_tasks;
  it("shows the first rows and keeps the rest behind the expand control", () => {
    const item = benchmark();
    const html = renderToStaticMarkup(<BenchmarkTasks record={item} sources={sourcesOf(item)} />);
    expect(tasks.length).toBeGreaterThan(SHOWN_TASKS);
    const [shown, extra] = html.split(/<tbody class="[^"]*extraRows[^"]*">/);
    expect((shown.match(/<th scope="row">/g) || []).length).toBe(SHOWN_TASKS);
    expect((extra.match(/<th scope="row">/g) || []).length).toBe(tasks.length - SHOWN_TASKS);
    expect(html).toContain(`Show all ${tasks.length} tasks`);
    // The expand rule in database.module.css needs all three classes; a missing one leaves rows hidden.
    expect(html).toMatch(/<section [^>]*class="[^"]*factTable/);
    expect(html).toMatch(/<details class="[^"]*showAll/);
    expect(html).toContain(`<th scope="row">${tasks[0].task}</th>`);
    expect(html).toContain("MCC (higher is better)");
    expect(html).toContain("chromosomes 20 and 21, homologous test chunks removed");
    expect(html).toContain('href="https://github.com/instadeepai/nucleotide-transformer"');
    expect(html).toContain("Not recorded");
    expect(html).toContain("Source benchmark-pages-20261127-batch1-segmentnt-human-genome-annotation-source-si");
    expect((html.match(/<summary>Sources \(3\)<\/summary>/g) || []).length).toBe(tasks.length);
    expect(html).not.toMatch(/[–—→]/);
  });
  it("shows every row of a short list without the expand control", () => {
    const item = benchmark();
    item.attributes.benchmark_tasks = tasks.slice(0, 3);
    const html = renderToStaticMarkup(<BenchmarkTasks record={item} sources={[]} />);
    expect((html.match(/<th scope="row">/g) || []).length).toBe(3);
    expect(html).not.toContain("extraRows");
    expect(html).not.toContain("Show all");
  });
  it("prints a size with its unit", () => {
    const item = benchmark();
    item.attributes.benchmark_tasks = [{ ...tasks[0], size: 12500, size_unit: "variants", metric_direction: null }];
    const html = renderToStaticMarkup(<BenchmarkTasks record={item} sources={[]} />);
    expect(html).toContain(">12,500 variants<");
    expect(html).toContain(">MCC<");
  });
  it("renders nothing without the attribute or with a malformed entry", () => {
    const absent = benchmark();
    delete absent.attributes.benchmark_tasks;
    expect(renderToStaticMarkup(<BenchmarkTasks record={absent} sources={[]} />)).toBe("");
    const malformed = benchmark();
    Object.assign((malformed.attributes.benchmark_tasks as Record<string, unknown>[])[20], { metric_direction: "up" });
    expect(renderToStaticMarkup(<BenchmarkTasks record={malformed} sources={[]} />)).toBe("");
    expect(recordBenchmarkTasks({ kind: "benchmark", attributes: { benchmark_tasks: "28 tasks" } })).toBeNull();
    expect(recordBenchmarkTasks({ ...benchmark(), kind: "task" })).toBeNull();
  });
});

describe("release reading", () => {
  it("keeps both attributes unchanged, nested nulls included", () => {
    const [m, b] = currentRecords([model(), benchmark()]);
    expect(m.attributes.checkpoints).toEqual(fixture.model.attributes.checkpoints);
    expect(b.attributes.benchmark_tasks).toEqual(fixture.benchmark.attributes.benchmark_tasks);
  });
});

// Once an adopted release brings the data repository's schema into shared/omics, both must agree.
const mirrored = path.resolve(__dirname, "../shared/omics/structured-facts.ts");
describe.skipIf(!fs.existsSync(mirrored))("schema parity with shared/omics", () => {
  it("accepts and rejects the same entries", async () => {
    const shared = await import(/* @vite-ignore */ mirrored);
    const checkpoints = fixture.model.attributes.checkpoints;
    const tasks = fixture.benchmark.attributes.benchmark_tasks;
    for (const value of [checkpoints, [], [{ ...checkpoints[0], gated: "yes" }], [{ ...checkpoints[0], extra: 1 }]])
      expect(shared.checkpointsSchema.safeParse(value).success).toBe(checkpointsSchema.safeParse(value).success);
    for (const value of [tasks, [], [{ ...tasks[0], metric_direction: "up" }], [{ ...tasks[0], released: "2025-6" }]])
      expect(shared.benchmarkTasksSchema.safeParse(value).success).toBe(benchmarkTasksSchema.safeParse(value).success);
  });
});
