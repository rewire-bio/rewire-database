import { describe, expect, it } from "vitest";
import { getLiterature, parseCsv, validateLiterature } from "../lib/benchmark-literature";

describe("paper-reported benchmark data", () => {
  it("reads quoted commas, doubled quotes and line breaks in CSV fields", () => {
    expect(parseCsv('a,b\r\n"one, two","a ""quote""\nnext"\r\n')).toEqual([
      ["a", "b"],
      ["one, two", 'a "quote"\nnext'],
    ]);
    expect(() => parseCsv('a,"unfinished')).toThrow("Unclosed quoted CSV field");
    expect(parseCsv('a,""')).toEqual([["a", ""]]);
    expect(() => parseCsv('a,"0.9"2')).toThrow("Unexpected character after closing CSV quote");
    expect(() => parseCsv('a,"""')).toThrow("Unclosed quoted CSV field");
  });

  it("loads the audited batch with complete paper and source references", () => {
    const { papers, results } = getLiterature();
    expect(papers.length).toBeGreaterThanOrEqual(24);
    expect(results.length).toBeGreaterThanOrEqual(papers.length);
    expect(new Set(papers.map((paper) => paper.primary_domain)).size).toBe(6);
    expect(results.every((row) => row.source_locator && row.source_url && row.reviewed_utc)).toBe(true);
    expect(() => validateLiterature(papers, results)).not.toThrow();
  });

  it("rejects a duplicated row and a changed numeric result", () => {
    const { papers, results } = getLiterature();
    expect(() => validateLiterature(papers, [...results, results[0]])).toThrow("Missing/duplicate result id");
    expect(() => validateLiterature(papers, [{ ...results[0], value: "not a number" }, ...results.slice(1)])).toThrow("Non-numeric reported result");
  });

  it("rejects missing scores rather than interpreting them as zero", () => {
    const { papers, results } = getLiterature();
    for (const value of ["", "   "]) {
      expect(() => validateLiterature(papers, [{ ...results[0], value }, ...results.slice(1)])).toThrow("Non-numeric reported result");
    }
    expect(() => validateLiterature(papers, [{ ...results[0], value: "0" }, ...results.slice(1)])).not.toThrow();
  });

  it("rejects changed provenance, duplicate evidence and impossible review dates", () => {
    const { papers, results } = getLiterature();
    expect(() => validateLiterature(papers, [{ ...results[0], source_url: "https://example.com/another-paper" }, ...results.slice(1)])).toThrow("Paper/source mismatch");
    expect(() => validateLiterature(papers, [...results, { ...results[0], id: "another-id" }])).toThrow("Duplicate paper/model/test/metric result");
    expect(() => validateLiterature(papers, [{ ...results[0], reviewed_utc: "2026-02-30T12:00:00Z" }, ...results.slice(1)])).toThrow("Missing review timestamp");
    expect(() => validateLiterature([...papers, { ...papers[0], id: "another-paper-id" }], results)).toThrow("Duplicate primary paper source");
  });

  it("distinguishes model and dataset versions while rejecting repeated evidence in the runtime validator", () => {
    const { papers, results } = getLiterature();
    const modelRevision = { ...results[0], id: "model-revision", model_version: "another-model-revision" };
    const datasetRevision = { ...results[0], id: "dataset-revision", dataset_version: "another-dataset-release" };
    const distinctVersions = [...results, modelRevision, datasetRevision];
    const repeatedVersion = [...distinctVersions, { ...modelRevision, id: "repeated-model-revision" }];
    expect(() => validateLiterature(papers, distinctVersions)).not.toThrow();
    expect(() => validateLiterature(papers, repeatedVersion)).toThrow("Duplicate paper/model/test/metric result");

  });
});
