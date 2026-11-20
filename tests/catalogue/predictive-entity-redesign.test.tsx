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

  it("TC-PED-04: Displays only the telemetry the record carries, never figures matched by model name", () => {
    const detail = createSampleRecordDetail("model");
    detail.record.id = "catalog-model-esmfold";
    detail.record.name = "ESMFold";
    const html = renderToStaticMarkup(<PredictiveEntityDetail detail={detail} />);

    for (const label of ["Parameters", "Minimum VRAM", "Inference Latency", "Context Window", "Access", "License"]) expect(html).toContain(label);
    expect(html).toContain("24 GB");
    expect(html).toContain("125 ms");
    expect(html).toContain("Open weights via HuggingFace repository");
    expect(html).toContain("Not recorded");

    const bare = createSampleRecordDetail("model");
    bare.record.attributes = {};
    const bareHtml = renderToStaticMarkup(<PredictiveEntityDetail detail={bare} />);
    expect(bareHtml).not.toContain("24 GB");
    expect(bareHtml).not.toContain("125 ms");
  });

  it("TC-PED-04b: the capability card shows access and licence in the record's own words (#230)", () => {
    const tile = (html: string, label: string) =>
      html.match(new RegExp(`<span class="[^"]*">${label}</span><span class="[^"]*" title="([^"]*)">([^<]*)</span>`));
    const jsonLd = (html: string) =>
      [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map((m) => JSON.parse(m[1])).find((j) => j["@type"] === "SoftwareApplication");
    const render = (attributes: Record<string, unknown>) => {
      const detail = createSampleRecordDetail("model");
      detail.record.attributes = attributes;
      return renderToStaticMarkup(<PredictiveEntityDetail detail={detail} />);
    };
    const facts = (...list: [string, string, string][]) => ({ profile: { facts: list.map(([label, value, status]) => ({ label, value, status })) } });

    // Text copied from release 2026-11-20-72316db0764b (Bacformer, Ladon).
    const bacformer = render({
      access: "Public checkpoints on Hugging Face under macwiatrak, installed through the bacformer package; inference needs protein embeddings from a base protein language model.",
      licence: "Apache-2.0 for the code and models in the Bacformer repository",
    });
    expect(tile(bacformer, "Access")![2]).toBe("Public checkpoints on Hugging Face under macwiatrak…");
    expect(tile(bacformer, "Access")![1]).toContain("inference needs protein embeddings from a base protein language model.");
    expect(tile(bacformer, "License")![2]).toBe("Apache-2.0 for the code and models in the Bacformer…");
    const ladon = render({ access: "No model weights, code repository or model licence is published with the report." });
    expect(tile(ladon, "Access")![2]).toBe("No model weights, code repository or model licence is…");
    expect(tile(ladon, "License")![2]).toBe("Not recorded");
    for (const html of [bacformer, ladon])
      for (const invented of ["Hosted API", "Open Weights", "Academic / Research", "Unspecified", "Proprietary"])
        expect([tile(html, "Access")![2], tile(html, "License")![2]].join(" ")).not.toContain(invented);

    // Only a code licence is recorded: the tile says so, and JSON-LD does not publish it as the model's licence.
    const codeOnly = render(facts(["Weights licence", "Separate checkpoint terms are not stated", "unreported"], ["Code licence", "MIT", "source_checked"]));
    expect(tile(codeOnly, "Code licence")![2]).toBe("MIT");
    expect(tile(codeOnly, "License")).toBeNull();
    expect(jsonLd(codeOnly).license).toBeUndefined();
    // A weights licence, or the code licence of a tool that has no weights, is the tool's licence.
    const weights = render(facts(["Weights licence", "CC BY-NC 4.0", "source_checked"], ["Code licence", "MIT", "source_checked"]));
    expect(tile(weights, "License")![2]).toBe("CC BY-NC 4.0");
    expect(tile(weights, "Code licence")).toBeNull();
    expect(jsonLd(weights).license).toBe("CC BY-NC 4.0");
    const noWeights = render(facts(["Weights licence", "Not applicable", "inapplicable"], ["Code licence", "GPL-3.0", "source_checked"]));
    expect(tile(noWeights, "License")![2]).toBe("GPL-3.0");
    expect(jsonLd(noWeights).license).toBe("GPL-3.0");
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
