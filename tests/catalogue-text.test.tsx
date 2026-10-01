import fs from "node:fs";
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { catalogueText } from "../lib/catalogue-text";
import { displayValue } from "../lib/omics";
import { createCatalogueQuery } from "../services/omics/src/catalogue-query";
import BenchmarkCharts from "../components/catalogue/BenchmarkCharts";
import Profile from "../components/catalogue/Profile";
import Results from "../components/catalogue/Results";
import EvidenceValue from "../components/catalogue/EvidenceValue";

const conditions =
  '{"reference_network":"Cell-type specific ChIP-Seq","gene_selection":"TFs+500"}';
const readable =
  "Reference network: Cell-type specific ChIP-Seq; Gene selection: TFs+500";
describe("catalogue condition presentation", () => {
  it("formats standalone and embedded condition strings, preserving all values", () => {
    expect(catalogueText(conditions)).toBe(readable);
    expect(
      catalogueText(`BEELINE · mESC · ${conditions}: Early Precision Ratio`),
    ).toBe(`BEELINE · mESC · ${readable}: Early Precision Ratio`);
    expect(displayValue({ inputs: conditions })).toBe(`inputs: ${readable}`);
    expect(catalogueText(catalogueText(conditions))).toBe(readable);
    expect(displayValue({})).toBe("None recorded");
    expect(catalogueText("BEELINE 2020 Figure 2 · LI · {}: AUROC")).toBe(
      "BEELINE 2020 Figure 2 · LI: AUROC",
    );
    expect(catalogueText("Input conditions: {}.")).toBe(
      "No additional input conditions recorded.",
    );
    expect(catalogueText("{}")).toBe("None recorded");
    expect(displayValue({ inputs: conditions }, true)).toBe(
      `inputs: ${conditions}`,
    );
  });
  it("does not reinterpret arbitrary JSON, commands, numbers or malformed conditions", () => {
    for (const text of [
      '{"metric":0.281}',
      '{"outer":{"reference_network":"x"}}',
      '{"reference_network":"x","extra":1}',
      '{"gene_selection":null}',
      '{"gene_selection":',
      "0.281",
      'uv run benchmark --config {"model":"ESM-2"}',
      "A { B }",
    ])
      expect(catalogueText(text)).toBe(text);
  });
  it("renders all 44 affected BEELINE comparisons, descriptions and result links without altering released records", () => {
    const catalogue = JSON.parse(
      fs.readFileSync("public/omics/catalogue.json").toString(),
    );
    const query = createCatalogueQuery(catalogue);
    const affected = catalogue.records.filter(
      (r: { kind: string; name: string }) =>
        r.kind === "protocol" && r.name.includes('"reference_network"'),
    );
    expect(affected).toHaveLength(44);
    const before = JSON.stringify(affected);
    for (const record of affected) {
      const detail = query.get({ id: record.id })!;
      const markup = renderToStaticMarkup(
        <>
          <BenchmarkCharts panels={detail.published_comparisons} />
          <Profile record={record} sources={detail.sources} part="overview" />
          <Results
            id={record.id}
            initial={query.results({ id: record.id, limit: 25 })}
          />
        </>,
      );
      expect(markup).not.toContain("reference_network");
      expect(markup).not.toContain("gene_selection");
      expect(markup).toContain("Reference network:");
      expect(markup).toContain("Gene selection:");
      const parsed = JSON.parse(record.name.match(/\{.*\}/)![0]);
      expect(markup).toContain(parsed.reference_network);
      expect(markup).toContain(parsed.gene_selection);
      expect(markup).toContain(`/database/protocol/${record.id}`);
    }
    expect(JSON.stringify(affected)).toBe(before);
  });
});

it("renders all ten empty BEELINE condition groups without JSON placeholders", () => {
  const catalogue = JSON.parse(
    fs.readFileSync("public/omics/catalogue.json").toString(),
  );
  const query = createCatalogueQuery(catalogue);
  const records = catalogue.records.filter(
    (r: { name: string; kind: string }) =>
      r.kind === "protocol" && r.name.includes(" · {}"),
  );
  expect(records).toHaveLength(10);
  for (const record of records) {
    const detail = query.get({ id: record.id })!;
    const html = renderToStaticMarkup(
      <>
        <BenchmarkCharts panels={detail.published_comparisons} />
        <Profile record={record} sources={detail.sources} part="overview" />
      </>,
    );
    expect(html).not.toContain("{}");
    expect(html).toContain("No additional input conditions recorded.");
  }
});

describe("typed evidence values", () => {
  const render = (value: unknown, fieldPath = "attributes.profile.gaps") =>
    renderToStaticMarkup(
      <EvidenceValue
        valueJson={JSON.stringify(value)}
        fallback="fallback"
        fieldPath={fieldPath}
      />,
    );
  it("renders narrative arrays as lists and structured facts as labelled expandable details", () => {
    expect(render(["Prepare data", "Score predictions"])).toBe(
      "<ul><li>Prepare data</li><li>Score predictions</li></ul>",
    );
    const facts = render(
      { scored_count: 0, unit: "fraction" },
      "attributes.coverage",
    );
    expect(facts).toContain("<summary>2 fields</summary>");
    expect(facts).toContain("<dt>scored count</dt><dd>0</dd>");
    expect(render([])).toBe("None recorded");
    expect(render(null)).toBe("Not reported");
  });
  it("preserves inner source strings, code, booleans and HTML as escaped text", () => {
    expect(render('{"metric":0.281}')).toContain("&quot;metric&quot;");
    expect(
      render(conditions, "attributes.run_recipes.0.instructions.0.code"),
    ).toContain("&quot;reference_network&quot;");
    expect(render(conditions, "attributes.comparison.inputs")).toBe(readable);
    expect(render(false)).toBe("false");
    expect(render("<script>alert(1)</script>")).toContain("&lt;script&gt;");
  });
});

describe("condition formatting boundaries", () => {
  it("preserves quoted characters and braces, multiple fragments and malformed suffixes", () => {
    const value = 'TF {curated} \"quoted\" \\ path';
    const fragment = JSON.stringify({ gene_selection: value });
    expect(catalogueText(fragment)).toBe(`Gene selection: ${value}`);
    expect(
      catalogueText(`${conditions} / ${fragment} / {"gene_selection":`),
    ).toBe(`${readable} / Gene selection: ${value} / {"gene_selection":`);
    const command = `run --conditions '${conditions}'`;
    expect(displayValue({ code: command }, true)).toBe(`code: ${command}`);
  });
  it("preserves malformed evidence fallbacks and nested executable source strings", () => {
    const fallback = renderToStaticMarkup(
      <EvidenceValue
        valueJson="bad JSON"
        fallback="Original source text"
        fieldPath="name"
      />,
    );
    expect(fallback).toBe("Original source text");
    const nested = renderToStaticMarkup(
      <EvidenceValue
        valueJson={JSON.stringify({ code: conditions })}
        fallback=""
        fieldPath="attributes.recipe"
      />,
    );
    expect(nested).toContain("&quot;reference_network&quot;");
  });
});
