import fs from "node:fs";
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { catalogueText } from "../lib/catalogue-text";
import { displayValue } from "../lib/omics";
import { createCatalogueQuery } from "../shared/omics/catalogue-query";
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
  it("renders legacy embedded and empty BEELINE conditions readably without altering records", () => {
    // Releases before 2026-10-10-cbb3da59bc08 printed BEELINE conditions as JSON in
    // protocol names. Two released protocols are given those legacy forms in a copy,
    // so the display rule stays covered whatever the current release holds.
    const release = JSON.parse(fs.readFileSync("public/omics/catalogue.json").toString());
    const protocols = release.records.filter((r: { kind: string; name: string }) => r.kind === "protocol" && r.name.startsWith("BEELINE"));
    const [embedded, empty] = protocols.length >= 2 ? protocols : release.records.filter((r: { kind: string }) => r.kind === "protocol");
    const legacy = new Map([
      [embedded.id, { ...embedded, name: `BEELINE 2020 Figure 5 · mESC · ${conditions}` }],
      [empty.id, { ...empty, name: "BEELINE 2020 Figure 2 · LI · {}" }],
    ]);
    const catalogue = { ...release, records: release.records.map((r: { id: string }) => legacy.get(r.id) ?? r) };
    const before = JSON.stringify([...legacy.values()]);
    const query = createCatalogueQuery(catalogue);
    const render = (record: { id: string; name: string }) => {
      const detail = query.get({ id: record.id })!;
      return renderToStaticMarkup(
        <>
          <BenchmarkCharts panels={detail.published_comparisons} />
          <Profile record={record as never} sources={detail.sources} part="overview" />
          <Results id={record.id} initial={query.results({ id: record.id, limit: 25 })} />
        </>,
      );
    };
    const markup = render(legacy.get(embedded.id)!);
    expect(markup).not.toContain("reference_network");
    expect(markup).not.toContain("gene_selection");
    expect(markup).toContain(readable);
    expect(markup).toContain(`/database/protocol/${embedded.id}`);
    const emptyMarkup = render(legacy.get(empty.id)!);
    expect(emptyMarkup).not.toContain("· {}");
    expect(emptyMarkup).toContain("BEELINE 2020 Figure 2 · LI");
    expect(JSON.stringify([...legacy.values()])).toBe(before);
  });
  it("renders every released BEELINE protocol without condition JSON or empty placeholders", () => {
    const catalogue = JSON.parse(fs.readFileSync("public/omics/catalogue.json").toString());
    const query = createCatalogueQuery(catalogue);
    const records = catalogue.records.filter((r: { kind: string; name: string; status: string }) =>
      r.kind === "protocol" && r.status !== "excluded" && r.name.startsWith("BEELINE"));
    for (const record of records) {
      const detail = query.get({ id: record.id })!;
      const html = renderToStaticMarkup(
        <>
          <BenchmarkCharts panels={detail.published_comparisons} />
          <Profile record={record} sources={detail.sources} part="overview" />
        </>,
      );
      expect(html, record.id).not.toMatch(/\{&quot;|\{"|reference_network|gene_selection|· \{\}/);
      expect(html, record.id).toContain(`/database/protocol/${record.id}`);
    }
  });
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
