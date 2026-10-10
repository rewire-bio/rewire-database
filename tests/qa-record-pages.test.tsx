import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import MethodPage from "../app/database/method/[id]/page";
import BenchmarkPage from "../app/database/benchmark/[id]/page";
import BaselinePage from "../app/database/baseline/[id]/page";
import ConfigurationPage from "../app/database/configuration/[id]/page";
import ProtocolPage from "../app/database/protocol/[id]/page";
import DatasetPage from "../app/database/dataset/[id]/page";
import ClaimPage from "../app/database/claim/[id]/page";
import SourcePage from "../app/database/source/[id]/page";
import { EvaluationDetail } from "../app/database/evaluation/[id]/detail";
import { ResultDetail } from "../app/database/result/[id]/detail";
import { readRecordPage, type EvaluationRecordPage, type ResultRecordPage } from "../lib/record-page";
import { resultMatrix } from "../lib/result-matrix";
import { metricName, procedureReference, resultTitle } from "../lib/result-labels";
import { claimFieldLabel, evidencePropertyLabel } from "../lib/evidence-labels";
import { provenanceOnly } from "../lib/entity-detail";
import { blockerText } from "../components/catalogue/ResearchReadiness";
import type { ResultRow } from "../shared/omics/catalogue-query";
import Results from "../components/catalogue/Results";
import { resultsPayload } from "../lib/results-payload";
import { buildCatalogue } from "../lib/catalogue-build";

// Pages from the pinned release, for the record pages named in the QA audit issues.
const page = (Page: (props: { params: { id: string } }) => JSX.Element, id: string) =>
  renderToStaticMarkup(<Page params={{ id }} />);
const emptyPager = /0[^0-9]*0 of 0 rows/;

describe("parent records list the linked records that hold their results (#138)", () => {
  it("lists a method's configurations with their result counts above the overview", () => {
    const html = page(MethodPage, "somatic-oncogenicity-20261009-method-metalr");
    expect(html).not.toContain("0 evaluations · 0 results");
    expect(html).not.toMatch(emptyPager);
    expect(html).toContain("3 configurations with results");
    expect(html).toContain('href="/database/configuration/somatic-oncogenicity-20261009-config-chen2020-metalr#results"');
    expect(html).toContain("20 results");
    expect(html.indexOf("Results on linked records")).toBeLessThan(html.indexOf('id="overview"'));
    expect(html).toContain("not assigned to the underlying method");
  });
  it("lists a benchmark's protocols instead of reporting results still to collect", () => {
    const html = page(BenchmarkPage, "dna-pathogen-20261009-benchmark-portik2022-mock-communities");
    expect(html).toContain("6 protocols with results");
    expect(html).toContain("part of this benchmark");
    expect(html).not.toContain("Published results still to collect");
    expect(html).not.toMatch(emptyPager);
  });
  it("lists the configuration that implements a baseline", () => {
    const html = page(BaselinePage, "uc20260930-jores-baseline-tobacco-leaves");
    expect(html).toContain("1 configuration with results");
    expect(html).toContain("uc20260930-jores-config-tobacco-leaves-gc-motif-linear");
    expect(html).not.toContain("No evaluations linked in this release");
  });
});

describe("results tables pivot to one row per configuration (#147)", () => {
  it("shows a protocol's results as configurations by metrics, with the row table in a disclosure", () => {
    const html = page(ProtocolPage, "somatic-20261009-protocol-wang2020-mb-snv");
    const matrix = html.indexOf("<th scope=\"col\">Tested configuration</th>");
    expect(matrix).toBeGreaterThan(0);
    expect(html.slice(matrix, html.indexOf("</thead>", matrix))).toContain(">F1 (SNV only)<");
    expect(html).toContain("All 60 result rows with coverage");
    expect(html.indexOf("All 60 result rows")).toBeGreaterThan(matrix);
  });
  it("keeps the flat table when two results would share a cell", () => {
    const row = (id: string, aggregation: string) => ({
      result: { id, kind: "result", name: id, description: "", status: "source_checked", facets: {}, source_ids: [], links: [], attributes: { metric: "f1-score", printed_value: "0.5", aggregation } },
      evaluation: { id: "evaluation", kind: "evaluation", name: "Evaluation", description: "", status: "source_checked", facets: {}, source_ids: [], links: [], attributes: {} },
      models: [], benchmarks: [], methods: [], configurations: [], pipelines: [], services: [], tasks: [], protocols: [], evaluators: [], datasets: [], dataset_subsets: [], sources: [],
      origin: "author_reported", review_status: "source_checked",
    }) as unknown as ResultRow;
    expect(resultMatrix([row("a", "mean"), row("b", "median")])).toBeNull();
  });
});

describe("evaluation and dataset pages lead with results (#146)", () => {
  it("puts evaluation results before a one-line readiness status", () => {
    const evaluation = readRecordPage("evaluation", "brca-20261009-eval-cubuk2021-vest4-brca1") as EvaluationRecordPage;
    const html = renderToStaticMarkup(<EvaluationDetail page={evaluation} />);
    expect(html.indexOf('id="results"')).toBeLessThan(html.indexOf('id="research-readiness"'));
    expect(html).toMatch(/0 of 4 readiness checks met/);
    expect(html).not.toContain("join integrity: verification is missing");
    expect(html).not.toContain("/investigations/");
  });
  it("puts dataset results before readiness", () => {
    const html = page(DatasetPage, "rare-ranking-20261009-data-ddd-305-solved");
    expect(html.indexOf('id="results"')).toBeLessThan(html.indexOf('id="research-readiness"'));
  });
  it("names readiness checks in plain language", () => {
    expect(blockerText("join integrity: verification is missing")).toBe("Predictions are matched to the right samples: not yet verified");
    expect(blockerText("No pinned local execution recipe is declared.")).toBe("No pinned local execution recipe is declared.");
  });
});

describe("claim pages show the claim (#149)", () => {
  it("shows a summary claim's statement in the header", () => {
    const html = page(ClaimPage, "use-case-summary-cnv-detection-characterisation");
    const statement = html.indexOf("On HG002 deletions, DRAGEN 4.2");
    expect(statement).toBeGreaterThan(0);
    expect(statement).toBeLessThan(html.indexOf("</header>"));
    expect(html).toMatch(/href="#finding"[^>]*>Claim<\/a>/);
  });
  it("shows a judgement claim's use case, protocol and reviewed evaluations", () => {
    const html = page(ClaimPage, "use-case-mapping-protein-stability-20261009-chu2024-pten");
    const header = html.slice(0, html.indexOf("</header>"));
    expect(header).toContain("<dt>Use case</dt>");
    expect(header).toContain("<dt>Assessed by</dt>");
    expect(header).toContain('href="/database/protocol/protein-stability-20261009-protocol-chu2024-pten"');
    expect(header).toContain("7 reviewed evaluations");
    expect(header).toContain("Proxy evidence");
  });
  it("maps attribute paths to readable field names", () => {
    expect(evidencePropertyLabel("attributes.citation_locators")).toBe("Citation locations");
    expect(evidencePropertyLabel("attributes.comparison_group")).toBe("Comparison group");
    expect(evidencePropertyLabel("Relationship: subject")).toBe("Relationship: subject");
    expect(claimFieldLabel("links:assessed_by:protocol")).toBe("Assessed by");
  });
});

describe("source pages lead with the citation (#150)", () => {
  it("shows venue, version and a DOI link, and moves the process note", () => {
    const html = page(SourcePage, "ctdnameth-20261009-source-sun2024");
    const header = html.slice(0, html.indexOf("</header>"));
    expect(header).toContain('href="https://doi.org/10.1186/s13059-024-03456-8"');
    expect(header).toContain("Genome Biology 25:318");
    expect(header).toContain("Peer-reviewed");
    expect(header).not.toContain("Primary source retrieved and hashed");
    expect(html).toContain("Primary source retrieved and hashed");
    expect(html).not.toContain("0 source records");
    expect(html).toMatch(/href="#finding"[^>]*>Citation<\/a>/);
  });
});

describe("result pages have a readable title (#145)", () => {
  it("titles a result by metric, tool and dataset, and links the procedure", () => {
    const result = readRecordPage("result", "somatic-20261009-result-wang2020-neusomatic-pass-colo829-snv-f1-score") as ResultRecordPage;
    const html = renderToStaticMarkup(<ResultDetail page={result} />);
    const h1 = /<h1>([^<]*)<\/h1>/.exec(html)![1];
    expect(h1).toMatch(/^F1 \(SNV only\) of /);
    expect(h1).not.toContain("wang2020-");
    expect(html).toContain("<h2>Methods</h2>");
    expect(html).not.toContain("<dd>somatic-20261009-protocol-wang2020-colo829-snv</dd>");
  });
  it("uses metric display names and falls back to the record name without context", () => {
    expect(metricName("f1-score")).toBe("F1");
    expect(metricName("proportion", "benign reference variants assigned bp4")).toBe("Proportion (benign reference variants assigned BP4)");
    expect(resultTitle({ name: "raw-name", attributes: { metric: "auroc" } }, [], [])).toBe("raw-name");
    expect(procedureReference("unlinked-protocol-id", () => undefined)).toBeNull();
    expect(procedureReference("Ten-fold cross validation.", () => undefined)).toEqual({ text: "Ten-fold cross validation." });
  });
});

describe("record page labels and empty states (#156, #157, #162, #165, rewire-benchmark-data#88)", () => {
  it("deduplicates use cases and shows the parent's description for a provenance-only configuration", () => {
    const html = page(ConfigurationPage, "dna-pathogen-20261009-config-portik2022-kraken2-2-1-1-pluspf");
    const box = html.slice(html.indexOf('id="related-use-cases"'), html.indexOf("</aside>"));
    expect(box.match(/Select a DNA pathogen-identification workflow/g)).toHaveLength(1);
    expect(box).toMatch(/Used in \d+ comparisons/);
    expect(html).toContain("Use this configuration");
    expect(html).not.toContain("Use this model");
    // Kraken2's own record is a catalogue placeholder, so it is not borrowed.
    expect(html).not.toContain("Existing candidate catalogue entry");
  });
  it("shows the parent method's description when a configuration's description is only provenance", () => {
    expect(provenanceOnly("Kraken2 as run in Portik et al. 2022.")).toBe(true);
    expect(provenanceOnly("Variant effect predictor for missense variants.")).toBe(false);
    const html = page(ConfigurationPage, "cnv-20261009-config-gabrielaite2021-delly");
    const start = html.indexOf('id="overview"');
    const overview = html.slice(start, html.indexOf("</section>", start));
    expect(overview).toContain('href="/database/method/cnv-20261009-method-delly"');
    expect(overview).toContain("Paired-end and split-read structural variant caller.");
  });
  it("pluralises source counts and labels empty source history", () => {
    const html = page(MethodPage, "somatic-oncogenicity-20261009-method-metalr");
    expect(html).toContain("2 source records and release history");
    expect(html).not.toMatch(/\b1 source records\b/);
  });
  it("uses h3 headings inside the benchmark papers section", () => {
    const html = page(BenchmarkPage, "discovery-benchmark-perturbench");
    expect(html).toContain("<h3>Searches</h3>");
    expect(html).not.toContain("<h4>Searches</h4>");
  });
});

describe("results payload in the page HTML (#166)", () => {
  it("renders the same results table from the trimmed first page and is smaller", () => {
    const { query } = buildCatalogue();
    for (const id of ["segmentnt-supplement-2025-dataset-human-genome-promoter-tissue-invariant-test-chromosomes-20-and-21", "somatic-20261009-protocol-wang2020-mb-snv"]) {
      const full = query.results({ id, limit: 25 });
      const trimmed = resultsPayload(full);
      expect(renderToStaticMarkup(<Results id={id} initial={trimmed} />)).toBe(renderToStaticMarkup(<Results id={id} initial={full} />));
      expect(JSON.stringify(trimmed).length).toBeLessThan(JSON.stringify(full).length * 0.6);
    }
  });
});
