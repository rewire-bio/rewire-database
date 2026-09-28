import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { safeBrowseReturnTo } from "../lib/omics-browse";
import { readUseCaseFilters, encodeUseCaseSearch } from "../lib/use-cases-client";
import type { CatalogueRecord } from "../services/omics/src/catalogue-query";
import type { ResolvedMapping, UseCase } from "../services/omics/src/use-cases";
import UseCaseEvidence from "../components/catalogue/UseCaseEvidence";
import UseCaseBacklinks from "../components/catalogue/UseCaseBacklinks";
import { UseCaseRecordLink, UseCaseReturn } from "../components/catalogue/UseCaseNavigation";

const state = vi.hoisted(() => ({ search: "" }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(state.search) }));

const record = (id: string, kind: CatalogueRecord["kind"], attributes: Record<string, unknown> = {}): CatalogueRecord => ({ id, kind, name: `Fixture ${id}`, description: "Synthetic evaluation", status: "source_checked", facets: {}, source_ids: [], links: [], attributes });
const review = { method: "automated_source_review" as const, actor: "Fixture curator", reviewed_at: "2026-09-25T12:00:00Z", note: "Not independent human scientific review" };
export const question: UseCase = {
  id: "question", slug: "splicing-follow-up", title: "Splicing follow-up", question: "Which SNVs warrant a splicing experiment?", area: "dna-genomes", contexts: ["research", "clinical_research"], search_terms: ["RNA"], intended_users: ["Researcher"], decision: "Choose a method for experimental follow-up", inputs: ["Human SNVs"], output: "Ranked variants", setting: "Reporter assay", exclusions: ["Patient-RNA validation"], clinical_scope: "Clinical pathogenicity is not established.", evidence_gaps: ["Patient RNA"], citations: [{ source_id: "source", locator: "Scope" }], review, planned_work: [],
};

function mapping(): ResolvedMapping {
  const evaluation = record("evaluation", "evaluation", { origin: "rewire_run", comparison: { split: "Held out", population: "Scored subset", budget: "One execution" } });
  const configuration = record("configuration", "configuration");
  const result = record("result", "result", { printed_value: "0.75", metric: "AUPRC", unit: "dimensionless", coverage: "8297/8324", uncertainty: null });
  return {
    id: "mapping", use_case_id: "question", lifecycle: "active", revision: 1, reason: "Reviewed source", protocol_id: "protocol", task_id: "task", evaluation_ids: ["evaluation"], endpoint: "Reporter assay splicing", relevance: "proxy", rationale: "The assay is a proxy for broader follow-up", constraints: ["Human SNVs"], limitations: ["Missing predictions are not negatives"], citations: [{ source_id: "source", locator: "/coverage" }], review, evidence_sha256: "a".repeat(64),
    protocol: record("protocol", "protocol"), task: { ...record("task", "task"), status: "discovered" }, sources: [record("source", "source", { url: "https://example.org/source" })],
    evaluations: [{ evaluation, configurations: [configuration], results: [{ result, evaluation, configurations: [configuration], models: [], benchmarks: [], methods: [], pipelines: [], services: [], tasks: [], protocols: [], evaluators: [], datasets: [], dataset_subsets: [], sources: [], origin: "rewire_run", review_status: "source_checked" }] }],
  };
}
function html(value = mapping()) {
  state.search = "";
  return renderToStaticMarkup(<UseCaseEvidence mapping={value} useCasePath="/use-cases/splicing-follow-up/" executionLinks={{}} />);
}

describe("use-case navigation and safe return context", () => {
  it("round trips question filters and cursor, including reserved characters", () => {
    const filters = { q: "A&B + RNA 10%", area: "dna-genomes", context: "clinical_research" as const };
    const search = encodeUseCaseSearch(filters, "opaque+cursor/==");
    expect(readUseCaseFilters(search)).toEqual(filters);
    expect(new URLSearchParams(search).get("cursor")).toBe("opaque+cursor/==");
    expect(safeBrowseReturnTo(`/use-cases/splicing-follow-up/${search}`)).toBe(`/use-cases/splicing-follow-up/${search}`);
    expect(safeBrowseReturnTo(`/use-cases/${search}`)).toBe(`/use-cases/${search}`);
  });
  it("rejects traversal, encoded separators, controls, external and arbitrary paths", () => {
    for (const value of ["//evil.test/", "https://evil.test/", "/use-cases/../contribute/", "/use-cases/%2e%2e/", "/use-cases/one%2ftwo/", "/use-cases/one/two/", "/use-cases/one/?q=%0a", "/use-cases/one/?q=%250d", "/use-cases/one/?q=%252525250a", "/use-cases/one/?q=%255c", "/use-cases/one/\\", "/contribute/", "/use-cases/one/?q=\r"]) expect(safeBrowseReturnTo(value), value).toBeNull();
  });
  it("preserves the full question journey from index through detail and recipe back to results", () => {
    state.search = "q=splicing&area=dna-genomes&context=research&cursor=page2";
    const markup = renderToStaticMarkup(<UseCaseRecordLink href="/database/protocol/protocol/?recipe=existing#run-recipes" useCasePath="/use-cases/splicing-follow-up/">Recipe</UseCaseRecordLink>);
    const href = markup.match(/href="([^"]+)"/)![1].replaceAll("&amp;", "&");
    const url = new URL(href, "https://benchmarks.rewire.it");
    expect(url.searchParams.get("recipe")).toBe("existing");
    expect(url.hash).toBe("#run-recipes");
    expect(url.searchParams.get("return_to")).toBe(`/use-cases/splicing-follow-up/?${state.search}`);
    expect(safeBrowseReturnTo(url.searchParams.get("return_to"))).not.toBeNull();
    expect(renderToStaticMarkup(<UseCaseReturn />)).toContain('href="/use-cases/?q=splicing&amp;area=dna-genomes&amp;context=research&amp;cursor=page2"');
  });
});

describe("use-case evidence rendering", () => {
  it("exports scoped evidence, exact configuration, sources, unknown uncertainty and recipes without inventing values", () => {
    const markup = html();
    expect(markup).toContain("Proxy evidence");
    expect(markup).toContain("Reporter assay splicing");
    expect(markup).toContain("8297/8324");
    expect(markup).toContain("0.75");
    expect(markup).toContain("Not reported");
    expect(markup).toContain("Automated source review");
    expect(markup).toContain("Not independent human scientific review");
    expect(markup).toContain("No execution recipe has been verified for this exact configuration");
    expect(markup).toContain("Runtime and memory measurements are not reported");
    expect(markup).toContain("/database/configuration/configuration/");
    expect(markup).toContain("/database/result/result/");
    expect(markup).toContain("https://example.org/source");
    expect(markup).toContain("/coverage");
    expect(markup).toContain("Not yet reviewed");
  });
  it("distinguishes recorded execution timings from complete runtime and shows individual uncertainty limitations", () => {
    const value = mapping();
    value.evaluations[0].evaluation.attributes.execution = { inference_and_fit_seconds: 0.187794, batch_size: 32, adapter_provenance: { device: "cpu" } };
    value.evaluations[0].evaluation.attributes.timing_seconds = { evaluation: 0.034251 };
    value.evaluations[0].results[0].result.attributes.missing_metadata = { uncertainty: "Paired contrast intervals are not individual-condition intervals." };
    const markup = html(value);
    expect(markup).toContain("Inference and fit section: 0.188 s");
    expect(markup).toContain("Metric evaluation section: 0.0343 s");
    expect(markup).toContain("not total runtime");
    expect(markup).toContain("Peak memory is not reported");
    expect(markup).toContain("Paired contrast intervals are not individual-condition intervals");
  });
  it("labels a content-addressed source copy separately from the original repository location", () => {
    const value = mapping();
    value.sources[0].attributes.url = "https://benchmarks.rewire.it/omics/sources/digest.md";
    value.sources[0].attributes.original_url = "https://github.com/owner/repo/blob/revision/doc.md";
    const markup = html(value);
    expect(markup).toContain("Reviewed source copy");
    expect(markup).toContain("Original repository location");
  });
  it("suppresses stale and draft assertions and measured results even if rows were accidentally supplied", () => {
    for (const lifecycle of ["needs_review", "draft", "withdrawn", "superseded"] as const) {
      const value = mapping(); value.lifecycle = lifecycle; value.reason = "Reference changed"; value.prior_release_id = "2026-09-24-111111111111";
      const markup = html(value);
      expect(markup).toContain("Reference changed");
      expect(markup).not.toContain("0.75");
      expect(markup).not.toContain("The assay is a proxy for broader follow-up");
      expect(markup).toContain("does not support a current applicability claim");
      expect(markup).toContain("/omics/releases/2026-09-24-111111111111/use-cases.json");
    }
  });
  it("keeps unassessed/outside-scope evidence distinct from zero scores", () => {
    for (const relevance of ["not_assessed", "outside_scope"] as const) {
      const value = mapping(); value.relevance = relevance;
      const markup = html(value);
      expect(markup).not.toContain("0.75");
      expect(markup).toContain("not a zero score");
    }
    const direct = mapping(); direct.relevance = "direct"; direct.evaluations = [];
    expect(html(direct)).toContain("Direct evidence for the stated endpoint");
    expect(html(direct)).toContain("No relevant evaluation is recorded");
  });
  it("identifies exact configurations behind a model or suite backlink", () => {
    const markup = renderToStaticMarkup(<UseCaseBacklinks links={{ release_id: "fixture", input_sha256: "a".repeat(64), items: [{ use_case_id: "question", slug: "splicing-follow-up", title: "Splicing follow-up", mapping_id: "mapping", configuration_ids: ["configuration"] }] }} configurations={{ configuration: record("configuration", "configuration") }} />);
    expect(markup).toContain("Fixture configuration");
    expect(markup).toContain("/use-cases/splicing-follow-up/#mapping-mapping");
    expect(markup).toContain("scope and transfer limitations");
  });
});
