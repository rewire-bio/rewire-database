import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PredictiveEntityDetail } from "@/app/database/_entities/predictive";
import { DatasetDetail } from "@/app/database/_entities/dataset";
import { EvaluationDesignEntityDetail } from "@/app/database/_entities/evaluation-design";
import { displayValue, type OmicsRecord } from "@/lib/omics";
import type { RecordDetail } from "@/lib/entity-detail";
import { buildCatalogue } from "@/lib/catalogue-build";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

function createSampleRecordDetail(kind: "model" | "configuration" = "model"): RecordDetail {
  const record: OmicsRecord = {
    id: `catalog-${kind}-alphagenome-test`,
    kind,
    name: "AlphaGenome Foundation Model",
    description: "Deep generative model for regulatory genomics and variant effect prediction.",
    status: "source_checked",
    facets: {
      modality: ["DNA sequence"],
      task: ["variant_effect"],
    },
    source_ids: ["src-1"],
    links: [{ relation: "doi", target_id: "https://doi.org/10.1038/s41586-024-00000-0" }],
    attributes: {
      access: "Open weights via HuggingFace repository",
      version: "v2.1-checkpoint",
      min_vram_gb: 24,
      inference_latency_ms: 125,
      parameter_count_millions: 650,
      open_weights: true,
      license: "Apache-2.0",
      profile: {
        architecture: "Transformer with dilated convolutions",
        modalities: ["Genomic DNA"],
      },
    },
  };

  return {
    record,
    sources: [
      {
        id: "src-1",
        kind: "source",
        name: "AlphaGenome Nature 2024",
        description: "Primary publication",
        status: "source_checked",
        facets: {},
        source_ids: [],
        links: [{ relation: "doi", target_id: "https://doi.org/10.1038/s41586-024-00000-0" }],
        attributes: { url: "https://doi.org/10.1038/s41586-024-00000-0", version: "2024" },
      },
    ],
    direct: [],
    reverse: [],
    release_id: "fixture",
    published_comparisons: [],
    comparison_options: [],
    aggregate_comparisons: [],
  };
}

describe("Predictive Entity Detail Redesign (TC-PED-01 to TC-PED-08)", () => {
  it("TC-PED-01: Model detail page HTML does NOT contain Fields verbatim or extraction receipts summary", () => {
    const detail = createSampleRecordDetail("model");
    const html = renderToStaticMarkup(<PredictiveEntityDetail detail={detail} />);

    expect(html).not.toContain("Fields verbatim");
    expect(html).not.toContain("verbatim");
    expect(html).not.toContain("extraction receipts");
    expect(html).not.toMatch(/<summary>[^<]*extraction receipts[^<]*<\/summary>/i);
  });

  it("TC-PED-02: Model detail page HTML does NOT contain raw JSON receipt hashes or profile JSON dumps", () => {
    const detail = createSampleRecordDetail("model");
    const html = renderToStaticMarkup(<PredictiveEntityDetail detail={detail} />);

    expect(html).not.toContain("extraction_receipt");
    expect(html).not.toContain("receipt_sha256");
    expect(html).not.toMatch(/\{"profile":/);
  });

  it("TC-PED-03: Model attributes render in clean structured capability card", () => {
    const detail = createSampleRecordDetail("model");
    const html = renderToStaticMarkup(<PredictiveEntityDetail detail={detail} />);

    expect(html).toMatch(/<section[^>]*class="[^"]*capability-card[^"]*"/);
    expect(html).toContain("Model Capabilities &amp; Hardware Requirements");
    expect(html).toContain("AlphaGenome Foundation Model");
  });

  it("TC-PED-04: Displays structured telemetry (parameters, VRAM, latency, context window, license)", () => {
    const detail = createSampleRecordDetail("model");
    detail.record.id = "catalog-model-esmfold";
    detail.record.name = "ESMFold";
    const html = renderToStaticMarkup(<PredictiveEntityDetail detail={detail} />);

    expect(html).toContain("Parameters");
    expect(html).toContain("Minimum VRAM");
    expect(html).toContain("Inference Latency");
    expect(html).toContain("Context Window");
    expect(html).toContain("Weights Access");
    expect(html).toContain("License");
    expect(html).toContain("Open Weights");
  });

  it("TC-PED-05: Missing or empty fields render defensively via displayValue as Not reported or None recorded", () => {
    expect(displayValue({})).toBe("None recorded");
    expect(displayValue(undefined)).toBe("Not reported");
    expect(displayValue(null)).toBe("Not reported");
    expect(displayValue("")).toBe("Not reported");
  });

  it("TC-PED-06: Source and provenance links remain accessible", () => {
    const detail = createSampleRecordDetail("model");
    const html = renderToStaticMarkup(<PredictiveEntityDetail detail={detail} />);

    expect(html).toMatch(/<a[^>]*href="(\/database\/source\/|https:\/\/doi\.org\/)[^"]*"[^>]*>/);
  });

  it("TC-PED-07: Supersedes and superseded-by relationships render as structured navigation", () => {
    const detail = createSampleRecordDetail("model");
    detail.direct = [
      {
        record: {
          id: "catalog-model-alphagenome-v1",
          kind: "model",
          name: "AlphaGenome v1",
          description: "Previous version",
          status: "superseded",
          facets: {},
          source_ids: [],
          links: [],
          attributes: {},
        },
        relation: "supersedes",
      },
    ];
    detail.reverse = [
      {
        record: {
          id: "catalog-model-alphagenome-v3",
          kind: "model",
          name: "AlphaGenome v3",
          description: "Next version",
          status: "source_checked",
          facets: {},
          source_ids: [],
          links: [],
          attributes: {},
        },
        relation: "supersedes",
      },
    ];

    const html = renderToStaticMarkup(<PredictiveEntityDetail detail={detail} />);
    expect(html).toContain("AlphaGenome v1");
    expect(html).toContain("AlphaGenome v3");
  });

  it("TC-PED-08: Dual entity type support: Evaluates cleanly for both model and configuration", () => {
    const modelDetail = createSampleRecordDetail("model");
    const configDetail = createSampleRecordDetail("configuration");

    expect(() => renderToStaticMarkup(<PredictiveEntityDetail detail={modelDetail} />)).not.toThrow();
    expect(() => renderToStaticMarkup(<PredictiveEntityDetail detail={configDetail} />)).not.toThrow();

    const configHtml = renderToStaticMarkup(<PredictiveEntityDetail detail={configDetail} />);
    expect(configHtml).toContain("Model Capabilities &amp; Hardware Requirements");
    expect(configHtml).not.toContain("Fields verbatim");
  });

  it("TC-PED-09: Robust rendering when record.attributes is empty or lacks profile", () => {
    const detail = createSampleRecordDetail("model");
    detail.record.attributes = {};
    expect(() => renderToStaticMarkup(<PredictiveEntityDetail detail={detail} />)).not.toThrow();

    const emptyAttrDetail = createSampleRecordDetail("model");
    emptyAttrDetail.record.attributes = { profile: undefined };
    const html = renderToStaticMarkup(<PredictiveEntityDetail detail={emptyAttrDetail} />);
    expect(html).not.toContain("extraction receipts");
  });

  it("TC-PED-10: Entity detail views across predictive, dataset, and evaluation design do not contain 'extraction receipts'", () => {
    const detail = createSampleRecordDetail("model");
    const predHtml = renderToStaticMarkup(<PredictiveEntityDetail detail={detail} />);
    expect(predHtml).not.toContain("extraction receipts");

    const datasetRecordDetail: RecordDetail = {
      ...detail,
      record: {
        ...detail.record,
        kind: "dataset",
        attributes: {},
      },
    };
    const datasetHtml = renderToStaticMarkup(<DatasetDetail detail={datasetRecordDetail} />);
    expect(datasetHtml).not.toContain("extraction receipts");

    const evalRecordDetail: RecordDetail = {
      ...detail,
      record: {
        ...detail.record,
        kind: "evaluation",
        attributes: {},
      },
    };
    const evalHtml = renderToStaticMarkup(<EvaluationDesignEntityDetail detail={evalRecordDetail} />);
    expect(evalHtml).not.toContain("extraction receipts");
  });
});
