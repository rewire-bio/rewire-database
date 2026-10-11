import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ResultDetail } from "../app/database/result/[id]/detail";
import Results from "../components/catalogue/Results";
import ResultMatrix from "../components/catalogue/ResultMatrix";
import { readRecordPage, type ResultRecordPage } from "../lib/record-page";
import { recordPageBuilder } from "../lib/record-pages";
import { resultMatrix } from "../lib/result-matrix";
import { recordSearchMetadata } from "../lib/catalogue-seo";
import { DERIVED_LABEL, derivationScriptUrl, resultDerivation } from "../lib/derivation";
import { formatReading, readValue } from "../lib/use-case-values";
import { dataPin } from "../lib/data-pin";
import { buildCatalogue } from "../lib/catalogue-build";
import { preparedFromSnapshot } from "./helpers/prepared";
import type { CatalogueRecord, CatalogueSnapshot } from "../shared/omics/catalogue-query";

const snapshot = JSON.parse(fs.readFileSync("public/omics/catalogue.json", "utf8")) as CatalogueSnapshot;
const source = snapshot.records.find((record) => record.kind === "source" && typeof record.attributes.url === "string")!;
const derivation = {
  method: "computed-from-source-data",
  inputs: [{ source_id: source.id, artifact_sha256: "a".repeat(64), locator: 'MOESM3, sheet "Panel A"', row_filter: 'method == "gears"', row_count: 310 }],
  aggregation: "mean over five seeds",
  aggregation_source_id: source.id,
  aggregation_locator: "Fig. 1 legend",
  script: "scripts/omics/derive/ahlmann-eltze-2025.py",
  script_sha256: "b".repeat(64),
  precision: "rounded half to even to 3 decimal places",
};
const derive = (record: CatalogueRecord): CatalogueRecord => ({ ...record, attributes: { ...record.attributes, derivation } });
const RESULT_ID = "somatic-20261009-result-wang2020-neusomatic-pass-colo829-snv-f1-score";

describe("result derivation", () => {
  it("reads the derivation attribute and pins its script to the data release commit", () => {
    expect(resultDerivation({})).toBeNull();
    expect(resultDerivation({ derivation: { inputs: [] } })).toBeNull();
    expect(resultDerivation({ derivation })!.inputs[0].row_count).toBe(310);
    const revision = "c".repeat(40);
    expect(derivationScriptUrl(derivation.script, revision)).toBe(`https://github.com/rewire-bio/rewire-benchmark-data/blob/${revision}/${derivation.script}`);
    for (const script of ["../secrets", "a b.py", "https://evil.example/x.py"]) expect(derivationScriptUrl(script, revision)).toBeUndefined();
    expect(derivationScriptUrl(derivation.script, "main")).toBeUndefined();
  });
  it("labels a computed value on its result page and lists its inputs, aggregation and script", () => {
    const page = readRecordPage("result", RESULT_ID) as ResultRecordPage;
    const plain = renderToStaticMarkup(<ResultDetail page={page} />);
    expect(plain).not.toContain('id="derivation"');
    expect(plain).not.toContain("Computed by Rewire");
    const computed: ResultRecordPage = {
      ...page,
      detail: { ...page.detail, record: derive(page.detail.record) },
      context: [...page.context, source],
    };
    const html = renderToStaticMarkup(<ResultDetail page={computed} />);
    expect(html).toContain('id="derivation"');
    expect(html).toContain("How this value was computed");
    expect(html).toContain(DERIVED_LABEL.replace("'", "&#x27;"));
    expect(html).toMatch(/title="Computed value: /);
    expect(html).toMatch(new RegExp(`href="/database/source/${source.id}/?"`));
    expect(html).toContain("Data file");
    expect(html).toContain("MOESM3, sheet &quot;Panel A&quot;");
    expect(html).toContain("<code>method == &quot;gears&quot;</code>");
    expect(html).toContain("310 rows");
    expect(html).toContain("<q>mean over five seeds</q>");
    expect(html).toContain(`href="https://github.com/rewire-bio/rewire-benchmark-data/blob/${dataPin().revision}/${derivation.script}"`);
    expect(html).toContain(`title="SHA-256 ${"b".repeat(64)}"`);
    expect(html).toContain("rounded half to even to 3 decimal places");
    expect(html).toMatch(/href="#derivation"[^>]*>Computation<\/a>/);
  });
  it("brings a computed value's input sources into its record page context", () => {
    const result = snapshot.records.find((record) => record.id === RESULT_ID)!;
    const changed = { ...snapshot, records: snapshot.records.map((record) => (record.id === RESULT_ID ? derive(record) : record)) };
    const query = preparedFromSnapshot(changed);
    const page = recordPageBuilder(query, query.useCases())("result", result.id) as ResultRecordPage;
    expect(page.context.map((record) => record.id)).toContain(source.id);
    // Search metadata says the value was computed.
    expect(recordSearchMetadata(derive(result), changed.records).description).toContain(DERIVED_LABEL);
    expect(recordSearchMetadata(result, snapshot.records).description).not.toContain(DERIVED_LABEL);
  });
  it("marks computed values in results tables and result matrices", () => {
    const { query } = buildCatalogue();
    const initial = query.results({ id: RESULT_ID, limit: 25 });
    expect(renderToStaticMarkup(<Results id={RESULT_ID} initial={initial} />)).not.toContain("Computed by Rewire");
    const derived = { ...initial, items: initial.items.map((row) => ({ ...row, result: derive(row.result) })) };
    expect(renderToStaticMarkup(<Results id={RESULT_ID} initial={derived} />)).toContain("Computed by Rewire");
    const protocol = query.results({ id: "somatic-20261009-protocol-wang2020-mb-snv", limit: 25 });
    const matrix = resultMatrix(protocol.items.map((row) => ({ ...row, result: derive(row.result) })));
    expect(matrix).not.toBeNull();
    const html = renderToStaticMarkup(<ResultMatrix matrix={matrix!} label="Results" />);
    expect(html).toContain("Computed by Rewire");
    expect(html).toContain('title="Computed value: ');
  });
  it("labels computed values in use-case comparison cells instead of calling them printed", () => {
    const printed = formatReading(readValue({ printed: "0.8125", numeric: 0.8125, unit: null }), 2);
    expect(printed.title).toBe("Printed 0.8125");
    expect(printed.derived).toBeUndefined();
    const computed = formatReading(readValue({ printed: "0.8125", numeric: 0.8125, unit: null, derived: true }), 2);
    expect(computed.title).toBe(`${DERIVED_LABEL}: 0.8125`);
    expect(computed.derived).toBe(true);
    expect(formatReading(readValue({ printed: "0.81", numeric: 0.81, unit: null, derived: true })).title).toBe(DERIVED_LABEL);
  });
});
