import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import BenchmarkResearch from "../components/catalogue/BenchmarkResearch";
import { benchmarkResearchSchema } from "../shared/omics/benchmark-research";
import fs from "node:fs";
import { it, expect } from "vitest";
const visible = JSON.parse(fs.readFileSync("public/omics/catalogue.json", "utf8")).records;
const byId = new Map<string, any>(visible.map((r: any) => [r.id, r]));

it("renders every released literature-audit section and rejects unnormalized search receipts", () => {
  const owners = visible.filter((r: any) => r.attributes.benchmark_research);
  expect(owners.length).toBeGreaterThanOrEqual(221);
  for (const record of owners) {
    const research = benchmarkResearchSchema.parse(
      record.attributes.benchmark_research,
    );
    const sources = record.source_ids.map((id: string) => byId.get(id)!);
    const html = renderToStaticMarkup(
      createElement(BenchmarkResearch, { research, sources }),
    );
    expect(html).toContain("Papers and result coverage");
    expect(html).toContain("Read source");
    expect(() =>
      benchmarkResearchSchema.parse({
        ...research,
        searched_queries: [{ query: "unflattened receipt" }],
      }),
    ).toThrow();
  }
});
