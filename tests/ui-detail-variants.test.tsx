import { describe, expect, it, vi } from "vitest";
import { preparedFromSnapshot } from "./helpers/prepared";
import type { PreparedCatalogue } from "../services/omics/src/prepared-catalogue";
import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentType } from "react";
import { createCatalogueQuery, type CatalogueRecord, type CatalogueSnapshot } from "../services/omics/src/catalogue-query";
import type { RecordDetail } from "../lib/entity-detail";
import { ClaimDetail } from "../app/database/claim/[id]/detail";
import { SourceDetail } from "../app/database/source/[id]/detail";
import { BaselineDetail } from "../app/database/baseline/[id]/detail";
import { EvaluationDetail } from "../app/database/evaluation/[id]/detail";
import { ResultDetail } from "../app/database/result/[id]/detail";
import { DatasetDetail } from "../app/database/_entities/dataset";
import { PredictiveEntityDetail } from "../app/database/_entities/predictive";
import { EvaluationDesignEntityDetail } from "../app/database/_entities/evaluation-design";
import { recordPageBuilder, type EvaluationRecordPage, type RecordPageKind, type ResultRecordPage } from "../services/omics/src/record-pages";
import { buildUseCases } from "../lib/use-cases-build";

const fixture = vi.hoisted(() => ({ snapshot: null as CatalogueSnapshot | null }));
vi.mock("../lib/catalogue-build", () => ({ buildCatalogue: () => ({ catalogue: fixture.snapshot!, query: preparedFromSnapshot(fixture.snapshot!) }) }));
vi.mock("../lib/use-cases-build", () => ({ buildUseCases: () => ({ query: { links: () => ({ release_id: "fixture", input_sha256: "a".repeat(64), items: [] }) } }) }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), notFound: () => { throw Error("Not found"); } }));

const record = (id: string, kind: CatalogueRecord["kind"], attributes: Record<string, unknown> = {}, links: CatalogueRecord["links"] = []): CatalogueRecord => ({
  id, kind, name: `Fixture ${id}`, description: "Synthetic scope description", status: "source_checked", facets: {}, source_ids: [], links, attributes,
});
// Result and evaluation pages render the prepared page the importer builds.
type Renderer = ComponentType<{ detail: RecordDetail }> | typeof ResultDetail | typeof EvaluationDetail;
const renderers: [CatalogueRecord["kind"], Renderer][] = [
  ["claim", ClaimDetail], ["source", SourceDetail], ["baseline", BaselineDetail], ["evaluation", EvaluationDetail],
  ["result", ResultDetail], ["dataset", DatasetDetail], ["dataset_subset", DatasetDetail], ["model", PredictiveEntityDetail],
  ["configuration", PredictiveEntityDetail], ["benchmark", EvaluationDesignEntityDetail], ["protocol", EvaluationDesignEntityDetail],
];
function element(Component: Renderer, query: PreparedCatalogue, id: string) {
  const page = (kind: RecordPageKind) => recordPageBuilder(query, buildUseCases().query)(kind, id)!;
  if (Component === ResultDetail) return <ResultDetail page={page("result") as ResultRecordPage} />;
  if (Component === EvaluationDetail) return <EvaluationDetail page={page("evaluation") as EvaluationRecordPage} />;
  const Detail = Component as ComponentType<{ detail: RecordDetail }>;
  return <Detail detail={query.get({ id })!} />;
}
function render(kind: CatalogueRecord["kind"], Component: Renderer, history = false) {
  const subject = record("subject", kind, { missing_value: null, printed_value: "0.25", metric: "Fixture metric" });
  const records = [subject];
  if (history) {
    subject.status = "superseded";
    subject.attributes.source_identity = { subject_id: "identity" };
    subject.attributes.url = "https://example.org/subject";
    subject.source_ids = ["safe-source", "unsafe-source"];
    subject.links = [{ relation: "supersedes", target_id: "previous" }, { relation: "applicable_to", target_id: "proposal" }];
    records.push(
      record("safe-source", "source", { url: "https://example.org/source", version: "v1" }),
      record("unsafe-source", "source", { url: "javascript:alert(1)" }),
      record("identity", "model"), record("previous", kind), record("proposal", "protocol"),
      record("replacement", kind, {}, [{ relation: "supersedes", target_id: "subject" }]),
      record("explicit-proposal", "protocol", { applicability: "Requires prospective validation" }, [{ relation: "applicable_to", target_id: "subject" }]),
    );
  }
  fixture.snapshot = { schema_version: "1.1", release_id: "fixture", released_at: "2026-10-01T00:00:00Z", coverage: history ? { audit_history: true } : {}, records };
  const query = preparedFromSnapshot(fixture.snapshot);
  return renderToStaticMarkup(element(Component, query, subject.id));
}

describe("detail pages with incomplete and historical evidence", () => {
  it.each(renderers)("keeps %s pages usable without linked evidence", (kind, Component) => {
    const html = render(kind, Component);
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain("No supporting source is linked yet");
    expect(html).toContain("Technical metadata and extraction receipts");
    expect(html).toContain("Suggest a correction");
    expect(html).toContain('href="/omics/releases/fixture/records.jsonl"');
    expect(html).not.toContain("Applicable tests and references");
    expect(html).not.toContain("Original source</a>");
    if (kind === "result") {
      expect(html).toContain("Not linked");
      expect(html).not.toContain('href="#reproduction"');
    }
    if (kind === "dataset_subset") expect(html).toContain("Its results do not describe the full dataset");
  });

  it.each(renderers)("preserves %s correction history, safe sources and proposed applicability", (kind, Component) => {
    const html = render(kind, Component, true);
    expect(html).toContain("This record is superseded");
    expect(html).toContain("Supersedes");
    expect(html).toContain("Superseded by");
    expect(html).toContain("Fixture previous");
    expect(html).toContain("Fixture replacement");
    expect(html).toContain("Applicability is distinct from a completed evaluation");
    expect(html).toContain("Requires prospective validation");
    expect(html).toContain("Proposed association");
    expect(html).toContain('href="https://example.org/source"');
    expect(html).not.toContain('href="javascript:');
    expect(html).toMatch(/href="\/audits\/?\?record=subject"/);
    if (kind === "source") expect(html).toContain("Read original source");
  });
});

const profile = (summary: string) => ({
  summary, summary_source_ids: ["source"], summary_source_locator: "Introduction",
  sections: [{ title: "Mechanism", body: "Documented mechanism", source_ids: ["source"], source_locator: "Methods" }],
  facts: [{ label: "Access", value: "Download available", source_ids: ["source"], source_locator: "Availability" }],
  strengths: [{ text: "Documented strength", source_ids: ["source"], source_locator: "Results" }],
  limitations: [{ text: "Documented limitation", source_ids: ["source"], source_locator: "Discussion" }],
  coverage: "reviewed", gaps: [], review: { method: "automated_source_review", date: "2026-10-01", note: "Source review only" },
});
function familyFixture(kind: CatalogueRecord["kind"], local: boolean, evaluated: "family" | "downstream" | "none" = "none") {
  const subject = record("subject", kind, { checkpoint: "exact-v1", ...(local ? { profile: profile("Exact local summary") } : {}) });
  const family = record("family", kind, { profile: profile("Shared family summary") });
  const source = record("source", "source", { url: "https://example.org/evidence" });
  const downstream = record("downstream", "configuration");
  const records = [subject, family, source, downstream, record("member", kind), record("model-a", "model"), record("model-b", "model"), record("task", "task"), record("protocol", "protocol")];
  const link = (from: string, relation: string, to: string) => {
    records.find((item) => item.id === from)!.links.push({ relation, target_id: to });
    const claim = record(`claim-${from}-${relation}-${to}`, "claim", { field: `links:${relation}:${to}`, source_locator: "Methods" }, [{ relation: "subject", target_id: from }]);
    claim.source_ids = ["source"];
    records.push(claim);
  };
  link("subject", "family", "family");
  link("subject", "uses_model", "model-a");
  link("subject", "uses_model", "model-b");
  link("member", "variant_of", "subject");
  link("subject", "part_of", "task");
  link("protocol", "evaluates_task", "subject");
  if (evaluated !== "family") link("downstream", "uses_model", "subject");
  if (evaluated !== "none") {
    const evaluation = record("run", "evaluation", { origin: "author_reported", protocol: "Fixed held-out protocol" }, [{ relation: "model", target_id: evaluated === "family" ? "family" : "downstream" }]);
    const result = record("measured-result", "result", { printed_value: "0.75", metric: "accuracy", numeric_value: "0.75", unit: "dimensionless" }, [{ relation: "evaluation", target_id: "run" }]);
    records.push(evaluation, result);
  }
  if (kind === "benchmark") for (let i = 0; i < 13; i++) records.push(record(`linked-run-${i}`, "evaluation", {}, [{ relation: "benchmark", target_id: "subject" }]));
  for (const item of records) if (item.kind !== "source") item.source_ids = ["source"];
  fixture.snapshot = { schema_version: "1.1", release_id: "fixture", released_at: "2026-10-01T00:00:00Z", coverage: {}, records };
  return createCatalogueQuery(fixture.snapshot).get({ id: "subject" })!;
}

describe("verified entity relationships and profile ownership", () => {
  it.each([
    ["model", PredictiveEntityDetail], ["benchmark", EvaluationDesignEntityDetail], ["dataset", DatasetDetail],
  ] as const)("preserves %s local profile priority and source-backed hierarchy", (kind, Component) => {
    for (const local of [false, true]) {
      const html = renderToStaticMarkup(<Component detail={familyFixture(kind, local)} />);
      expect(html).toContain(local ? "Exact local summary" : "Shared family summary");
      if (kind !== "dataset") expect(html).toContain("Documented limitation");
      expect(html).toContain("Fixture task");
      expect(html).toContain("Fixture protocol");
      if (kind !== "dataset") {
        expect(html).toContain("Underlying model:");
        expect(html).toContain("Fixture model-a");
        expect(html).toContain("Fixture model-b");
        expect(html).toContain("Versions and evaluated configurations");
        expect(html).toContain("Fixture member");
        expect(html).toContain("Related configurations, pipelines and services");
        if (!local) expect(html).toContain("This configuration");
      }
      if (kind === "benchmark") expect(html).toContain("Recorded evaluations");
    }
  });

  it("does not assign broader family scores to an exact model checkpoint", () => {
    const html = renderToStaticMarkup(<PredictiveEntityDetail detail={familyFixture("model", false, "family")} />);
    expect(html).toContain("their attribution to this exact checkpoint has not been verified");
    expect(html).toContain("Results for the broader model family");
    expect(html).toContain("View the family");
    expect(html).not.toContain("0.75");
  });

  it("keeps evaluated downstream configuration results distinct from the underlying model", () => {
    const html = renderToStaticMarkup(<PredictiveEntityDetail detail={familyFixture("model", true, "downstream")} />);
    expect(html).toContain("Results are available for configurations using this model");
    expect(html).toContain("Fixture downstream");
    expect(html).toContain("Their results, where available, are not assigned to the underlying model");
    expect(html).toContain('id="results"');
    expect(html).not.toContain("0.75");
  });
});
