import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createCatalogueQuery,
  type CatalogueSnapshot,
} from "../services/omics/src/catalogue-query";
import BenchmarkPage from "../app/database/benchmark/[id]/page";
import ResultPage from "../app/database/result/[id]/page";
import EvaluationPage from "../app/database/evaluation/[id]/page";

const pageFor = {
  benchmark: BenchmarkPage,
  result: ResultPage,
  evaluation: EvaluationPage,
} as const;

const fixture = vi.hoisted(() => ({
  snapshot: null as CatalogueSnapshot | null,
  query: null as ReturnType<typeof createCatalogueQuery> | null,
}));
vi.mock("../lib/catalogue-build", () => ({
  buildCatalogue: () => ({
    catalogue: fixture.snapshot!,
    query: fixture.query!,
  }),
}));
fixture.snapshot = JSON.parse(
  fs.readFileSync("public/omics/catalogue.json").toString(),
);
fixture.query = createCatalogueQuery(fixture.snapshot!);
vi.mock("../lib/record-page", async (original) => (await import("./fixtures/record-pages")).localRecordPages(original));
// Server-rendered routes are async; static routes return elements directly.
const render = async (id: string) => {
  const kind = fixture.query!.get({ id })!.record.kind as keyof typeof pageFor;
  const RecordPage = pageFor[kind] as (props: { params: { id: string } }) => JSX.Element | Promise<JSX.Element>;
  return renderToStaticMarkup(await RecordPage({ params: { id } }));
};

describe("catalogue detail UX on the published release", () => {
  it("puts an overview before results and keeps all 30 benchmark pages navigable", async () => {
    const legacy = JSON.parse(fs.readFileSync("tests/fixtures/legacy-coverage-ids.json", "utf8")).benchmark_ids as string[];
    expect(legacy).toHaveLength(30);
    const benchmarks = fixture.snapshot!.records.filter(
      (record) => record.kind === "benchmark" && legacy.includes(record.id),
    );
    expect(benchmarks).toHaveLength(30);
    for (const record of benchmarks) {
      const html = await render(record.id);
      const positions = ["overview", "results", "execution", "evidence"].map(
        (id) => html.indexOf(`id="${id}"`),
      );
      expect(
        positions.every((position) => position >= 0),
        record.id,
      ).toBe(true);
      expect(positions, record.id).toEqual(
        [...positions].sort((a, b) => a - b),
      );
      const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(
        (match) => match[1],
      );
      expect(new Set(ids).size, `Duplicate IDs: ${record.id}`).toBe(ids.length);
      for (const match of html.matchAll(/href="#([^"]+)"/g))
        expect(ids, `${record.id} #${match[1]}`).toContain(match[1]);
      expect(html).not.toContain("Read the diagram as text");
    }
  }, 30000);
  it("retains real coverage on result findings and avoids repeating a single metric table", async () => {
    const html = await render(
      "rewire-result-baseline-kmer-position-v2-average-precision",
    );
    expect(html).toContain("8324/8324");
    expect(html).toContain("0.2864167459589237");
    expect(html).toContain('id="methods"');
    expect(html).toContain('id="results"');
    expect(html).toContain('id="reproduction"');
    expect(html).not.toContain("Other metrics from this evaluation");
  });
  it("preserves percentages already present in printed values with uncertainty", async () => {
    const row = fixture.snapshot!.records.find(
      (record) =>
        record.kind === "result" &&
        record.attributes.unit === "percent" &&
        /%.*±/.test(String(record.attributes.printed_value)),
    );
    expect(row).toBeDefined();
    const html = await render(row!.id);
    const escaped = renderToStaticMarkup(
      <>{row!.attributes.printed_value as string}</>,
    );
    expect(html).toContain(`${escaped} ${row!.attributes.metric}`);
    expect(html).not.toContain(`${escaped}%`);
  });
  it("keeps execution before evidence and methods before reproduction on evaluations", async () => {
    const html = await render("evaluation-b2-barcodebert-2026");
    expect(html.indexOf('id="methods"')).toBeLessThan(
      html.indexOf('id="reproduction"'),
    );
    expect(html.indexOf('id="reproduction"')).toBeLessThan(
      html.indexOf('id="evidence"'),
    );
    expect(html).toContain('id="protocol"');
  });
});
