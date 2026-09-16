import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import fs from "node:fs";
import Profile from "../components/catalogue/Profile";
import Results from "../components/catalogue/Results";
import { createCatalogueQuery } from "../services/omics/src/catalogue-query";
import { enrichProfiles } from "../lib/omics-profile";
import { enrichAssociations } from "../scripts/omics/enrich";
import { buildRelease } from "../scripts/omics/release";
const read = (name: string) =>
  fs
    .readFileSync(`data/omics/${name}.jsonl`, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
const records = enrichProfiles(
  enrichAssociations(
    [...read("migrated"), ...read("discovery")],
    [
      ...read("model-profile-associations"),
      ...read("benchmark-profile-associations"),
    ],
  ),
  [...read("model-profiles"), ...read("benchmark-profiles")],
);
const query = createCatalogueQuery(
  buildRelease(records, "2026-09-16T17:14:09Z").snapshot,
);
describe("scientific profile rendering", () => {
  it("renders BarcodeBERT's exact result with direct model, task, dataset and source links", () => {
    const initial = query.results({ id: "reported-model-05103f72325fe5" });
    const html = renderToStaticMarkup(
      <Results
        id="reported-model-05103f72325fe5"
        initial={initial}
        title="Benchmarks and results"
      />,
    );
    expect(html).toContain("78.5%");
    for (const entity of [
      ...initial.items[0].models,
      ...initial.items[0].benchmarks,
      ...initial.items[0].datasets,
    ])
      expect(html).toContain(`/database/${entity.kind}/${entity.id}`);
    expect(html).toContain("Table 1");
    expect(html).toContain("Author-reported evaluation");
  });
  it("renders accessible procedure diagrams and distinguishes missing evaluations", () => {
    const detail = query.get({ id: "catalog-task-cell-batch-integration" })!;
    const html = renderToStaticMarkup(
      <Profile
        record={detail.record}
        sources={detail.sources}
        part="mechanism"
      />,
    );
    expect(html).toContain('role="img"');
    expect(html).toContain("<desc");
    expect(html).toContain("Read the diagram as text");
    expect(html.toLowerCase()).toContain("conceptual");
    const results = renderToStaticMarkup(
      <Results
        id={detail.record.id}
        initial={query.results({ id: detail.record.id })}
        title="Tested models and results"
      />,
    );
    expect(results).toContain("No evaluations linked in this release");
    expect(results).not.toContain("never been evaluated");
  });
  it("labels limited explanatory claims without implying numerical or human verification", () => {
    const detail = query.get({
      id: records.find(
        (record) =>
          record.kind === "model" &&
          (record.attributes.profile as { coverage?: string })?.coverage ===
            "limited",
      )!.id,
    })!;
    const overview = renderToStaticMarkup(
      <Profile
        record={detail.record}
        sources={detail.sources}
        part="overview"
      />,
    );
    const limits = renderToStaticMarkup(
      <Profile
        record={detail.record}
        sources={detail.sources}
        part="limitations"
      />,
    );
    expect(overview).toContain("limited source coverage");
    expect(overview).toContain("Automated source review");
    expect(limits).toContain("Strengths and considerations");
    expect(limits).toContain("What remains unknown");
  });
});
