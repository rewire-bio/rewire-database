import { kindLabels } from "../lib/omics-browse";
import fs from "node:fs";
import { preparedFromSnapshot } from "./helpers/prepared";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { type CatalogueSnapshot } from "../shared/omics/catalogue-query";
import { omicsKinds, recordHref, type OmicsRecord } from "../lib/omics";
import { recordBreadcrumbs, safeJsonLd, SOCIAL_IMAGE } from "../lib/catalogue-sharing";
import Breadcrumbs from "../components/catalogue/Breadcrumbs";
import StaticIndex from "../components/catalogue/StaticIndex";
import { indexMetadata } from "../lib/catalogue-index";
import ModelPage, { generateMetadata as modelMetadata } from "../app/database/model/[id]/page";
import MethodPage, { generateMetadata as methodMetadata } from "../app/database/method/[id]/page";
import ConfigurationPage, { generateMetadata as configurationMetadata } from "../app/database/configuration/[id]/page";
import PipelinePage, { generateMetadata as pipelineMetadata } from "../app/database/pipeline/[id]/page";
import ServicePage, { generateMetadata as serviceMetadata } from "../app/database/service/[id]/page";
import BenchmarkPage, { generateMetadata as benchmarkMetadata } from "../app/database/benchmark/[id]/page";
import TaskPage, { generateMetadata as taskMetadata } from "../app/database/task/[id]/page";
import ProtocolPage, { generateMetadata as protocolMetadata } from "../app/database/protocol/[id]/page";
import EvaluatorPage, { generateMetadata as evaluatorMetadata } from "../app/database/evaluator/[id]/page";
import DatasetPage, { generateMetadata as datasetMetadata } from "../app/database/dataset/[id]/page";
import DatasetSubsetPage, { generateMetadata as datasetSubsetMetadata } from "../app/database/dataset_subset/[id]/page";
import BaselinePage, { generateMetadata as baselineMetadata } from "../app/database/baseline/[id]/page";
import EvaluationPage, { generateMetadata as evaluationMetadata } from "../app/database/evaluation/[id]/page";
import ResultPage, { generateMetadata as resultMetadata } from "../app/database/result/[id]/page";
import SourcePage, { generateMetadata as sourceMetadata } from "../app/database/source/[id]/page";
import ClaimPage, { generateMetadata as claimMetadata } from "../app/database/claim/[id]/page";
import { generateMetadata as useCaseMetadata } from "../app/database/use_case/[id]/page";
import { metadata as homeMetadata } from "../app/page";

const pageFor = {
  model: ModelPage, method: MethodPage, configuration: ConfigurationPage,
  pipeline: PipelinePage, service: ServicePage, benchmark: BenchmarkPage,
  task: TaskPage, protocol: ProtocolPage, evaluator: EvaluatorPage,
  dataset: DatasetPage, dataset_subset: DatasetSubsetPage, baseline: BaselinePage,
  evaluation: EvaluationPage, result: ResultPage, source: SourcePage, claim: ClaimPage,
} as const;
const metadataFor = {
  model: modelMetadata, method: methodMetadata, configuration: configurationMetadata,
  pipeline: pipelineMetadata, service: serviceMetadata, benchmark: benchmarkMetadata,
  task: taskMetadata, protocol: protocolMetadata, evaluator: evaluatorMetadata,
  dataset: datasetMetadata, dataset_subset: datasetSubsetMetadata, baseline: baselineMetadata,
  evaluation: evaluationMetadata, result: resultMetadata, source: sourceMetadata, claim: claimMetadata,
  use_case: useCaseMetadata,
} as const;

const fixture = vi.hoisted(() => ({ snapshot: null as CatalogueSnapshot | null }));
vi.mock("../lib/catalogue-build", () => ({ buildCatalogue: () => ({ catalogue: fixture.snapshot!, query: preparedFromSnapshot(fixture.snapshot!) }) }));
const records: OmicsRecord[] = omicsKinds.map((kind) => ({
  id: `test-${kind.replace(/_/g, "-")}`, kind, name: `Example ${kind}`,
  description: `Available evidence for example ${kind}.`, status: "source_checked",
  facets: {}, links: [], source_ids: [], attributes: {},
}));
fixture.snapshot = { schema_version: "1.1", release_id: "test-release", released_at: "2026-09-01T00:00:00Z", records, coverage: {} };
function jsonLd(html: string) {
  return JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1]);
}

describe("truthful catalogue sharing", () => {
  it("uses stable model and benchmark indexes and no fictional kind indexes", () => {
    for (const record of records) {
      const items = recordBreadcrumbs(record);
      expect(items.map((item) => item.path)).toEqual([
        "/", ...(record.kind === "model" ? ["/models/"] : record.kind === "benchmark" ? ["/benchmarks/"] : []), recordHref(record),
      ]);
      const html = renderToStaticMarkup(<Breadcrumbs items={items} />);
      const data = jsonLd(html);
      expect(data["@type"]).toBe("BreadcrumbList");
      for (const [index, item] of data.itemListElement.entries()) {
        expect(item.position).toBe(index + 1);
        expect(html).toContain(items[index].name);
        if (index < items.length - 1) expect(html).toContain(`href="${items[index].path}"`);
        expect(item.item).toBe(`https://benchmarks.rewirebio.io${items[index].path}`);
      }
    }
  });
  it("renders breadcrumbs into actual record pages, separate from return-to-filter navigation", () => {
    for (const kind of ["model", "benchmark", "source", "dataset"] as const) {
      const record = records.find((record) => record.kind === kind)!;
      const RecordPage = pageFor[kind];
      const html = renderToStaticMarkup(<RecordPage params={{ id: record.id }} />);
      expect(jsonLd(html).itemListElement.at(-1).item).toBe(`https://benchmarks.rewirebio.io${recordHref(record)}`);
      expect(html).toContain('aria-current="page"');
      expect(html).toContain(`Browse all ${kindLabels[kind].toLowerCase()}`);
      expect(html).not.toContain('"@type":"Dataset"');
    }
  });
  it("describes paginated model indexes with the visible page number", () => {
    const html = renderToStaticMarkup(<StaticIndex records={fixture.snapshot!.records.filter((record) => record.kind === "model")} releaseId={fixture.snapshot!.release_id} kind="model" page={2} />);
    expect(jsonLd(html).itemListElement.map((item: { name: string }) => item.name)).toEqual(["Database", "Models", "Page 2"]);
    expect(html).toContain('href="/models/"');
    expect(html).toContain('aria-current="page">Page 2');
  });
  it("shares each page's title, description and canonical rather than inherited homepage metadata", async () => {
    const pages = [homeMetadata, indexMetadata("model", 2), indexMetadata("benchmark"), ...await Promise.all(records.map((record) => metadataFor[record.kind]({ params: { id: record.id } })))];
    for (const metadata of pages) {
      expect(metadata.openGraph).toMatchObject({ title: metadata.title, description: metadata.description, url: metadata.alternates?.canonical, type: "website", images: [{ ...SOCIAL_IMAGE, type: "image/png" }] });
      expect(metadata.twitter).toMatchObject({ card: "summary_large_image", title: metadata.title, description: metadata.description });
    }
  });
  it("keeps legacy-kind sharing URLs canonical", () => {
    const record = records.find((record) => record.kind === "model")!;
    record.attributes.legacy_kinds = ["baseline"];
    expect(baselineMetadata({ params: { id: record.id } }).openGraph).toMatchObject({ url: `https://benchmarks.rewirebio.io${recordHref(record)}` });
    delete record.attributes.legacy_kinds;
  });
  it("prevents record strings from breaking out of JSON-LD script elements", () => {
    const name = '</script><script>alert("record")</script>';
    const value = safeJsonLd({ name });
    expect(value).not.toContain("<");
    expect(JSON.parse(value)).toEqual({ name });
    const html = renderToStaticMarkup(<Breadcrumbs items={[{ name: "Database", path: "/" }, { name, path: "/models/" }]} />);
    expect((html.match(/<script/g) || []).length).toBe(1);
    expect(jsonLd(html).itemListElement[1].name).toBe(name);
  });
  it("ships a real 1200 by 630 PNG for social crawlers", () => {
    const png = fs.readFileSync("public/images/social/catalogue.png");
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
  });
});

vi.mock("../lib/record-page", async (original) => (await import("./fixtures/record-pages")).localRecordPages(original));
