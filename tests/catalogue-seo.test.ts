import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { recordSearchMetadata, recordIsIndexable } from "../lib/catalogue-seo";
import { parseCatalogue, recordHref, type OmicsRecord } from "../lib/omics";
import sitemap from "../app/sitemap";
import robots from "../app/robots";

const record = (
  id: string,
  kind: OmicsRecord["kind"],
  patch: Partial<OmicsRecord> = {},
): OmicsRecord => ({
  id,
  kind,
  name: id,
  description: "",
  status: "discovered",
  facets: {},
  source_ids: [],
  links: [],
  attributes: {},
  ...patch,
});
describe("record search metadata", () => {
  it("describes a result using its explicit evaluation links and display precision without inferring family identity", () => {
    const configuration = record("submission", "configuration", {
      name: "Team submission 12",
    });
    const unrelated = record("family", "model", {
      name: "Unverified model family",
    });
    const protocol = record("protocol", "protocol", {
      name: "Test protocol B",
    });
    const evaluation = record("evaluation", "evaluation", {
      links: [
        { relation: "model", target_id: configuration.id },
        { relation: "benchmark", target_id: protocol.id },
      ],
      attributes: { comparison: { split: "held-out test" } },
    });
    const result = record("result", "result", {
      name: "Submission measurement",
      status: "source_checked",
      links: [{ relation: "evaluation", target_id: evaluation.id }],
      attributes: {
        metric: "Pearson r",
        printed_value: "0.0000",
        numeric_value: 0,
        unit: "correlation",
        aggregation: "one assay",
      },
    });
    const records = [configuration, unrelated, protocol, evaluation, result];
    const frozen = JSON.stringify(records);
    const metadata = recordSearchMetadata(result, records);
    expect(metadata.description).toContain("Pearson r: 0");
    expect(metadata.description).toContain("Configuration: Team submission 12");
    expect(metadata.description).toContain("Protocol: Test protocol B");
    expect(metadata.description).toContain("Split: held-out test");
    expect(metadata.description).toContain(
      "Source checked; not independently reproduced.",
    );
    expect(metadata.description).not.toContain(unrelated.name);
    expect(metadata.title).toContain("0 correlation");
    expect(JSON.stringify(records)).toBe(frozen);
  });
  it("rounds only scalar display scores and avoids duplicated percent units and named scores", () => {
    const result = record("percent-result", "result", {
      name: "Accuracy: 78.5%",
      attributes: {
        metric: "Accuracy",
        printed_value: "78.5234%",
        unit: "percent",
      },
    });
    const metadata = recordSearchMetadata(result, [result]);
    expect(metadata.title).toBe("Accuracy: 78.5% | result");
    expect(metadata.description).toContain("Accuracy: 78.5%.");
    expect(metadata.description).not.toContain("% percent");
    expect(result.attributes.printed_value).toBe("78.5234%");
    const uncertain = {
      ...result,
      attributes: {
        metric: "Accuracy",
        printed_value: "0.12345 ± 0.00001",
        unit: "fraction",
      },
    };
    expect(recordSearchMetadata(uncertain, [uncertain]).description).toContain(
      "0.12345 ± 0.00001",
    );
  });
  it("does not invent missing metrics, checkpoints or review status", () => {
    const result = record("sparse-result", "result", {
      name: "Partial reported result",
    });
    const metadata = recordSearchMetadata(result, [result]);
    expect(metadata.description).toBe(
      "Partial reported result. Record status: discovered; independent reproduction is not established by this record.",
    );
    expect(metadata.title).not.toContain("=");
    expect(metadata.description).not.toContain("Source checked");
    const evaluation = record("sparse-evaluation", "evaluation", {
      attributes: { protocol: { hidden: "not text" } },
    });
    expect(
      recordSearchMetadata(evaluation, [evaluation]).description,
    ).not.toMatch(/\[object Object\]|hidden/);
  });
  it("distinguishes recorded versions while preserving distinct model canonicals", () => {
    const family = record("family", "model", {
      name: "ESM-2",
      description: "Protein sequence encoder.",
    });
    const variant = record("variant", "model", {
      ...family,
      id: "variant",
      attributes: { version: "8M" },
      links: [{ relation: "variant_of", target_id: family.id }],
    });
    const records = [family, variant];
    expect(recordSearchMetadata(variant, records).title).toContain("8M");
    expect(recordSearchMetadata(family, records).title).not.toContain("8M");
    expect(recordSearchMetadata(variant, records).alternates.canonical).toBe(
      `https://benchmarks.rewire.it${recordHref(variant)}`,
    );
  });
  it("keeps supporting claims crawlable with noindex and self-canonical", () => {
    const claim = record("claim", "claim");
    const metadata = recordSearchMetadata(claim, [claim]);
    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(metadata.alternates.canonical).toBe(
      "https://benchmarks.rewire.it/database/claim/claim/",
    );
    expect(robots().rules).toEqual({ userAgent: "*", allow: "/" });
  });
  it("covers every released record and uses exactly the same sitemap eligibility without unsupported timestamps", () => {
    const catalogue = parseCatalogue(
      JSON.parse(fs.readFileSync("public/omics/catalogue.json", "utf8")),
    );
    const entries = sitemap();
    const paths = new Set(entries.map((entry) => entry.url));
    for (const item of catalogue.records) {
      const metadata = recordSearchMetadata(item, catalogue.records);
      expect(metadata.description.trim(), item.id).not.toBe("");
      expect(`${metadata.title} ${metadata.description}`, item.id).not.toMatch(
        /\{"|\[object Object\]/,
      );
      expect(paths.has(metadata.alternates.canonical), item.id).toBe(
        recordIsIndexable(item),
      );
      expect(metadata.robots.index, item.id).toBe(item.kind !== "claim");
    }
    expect(entries.every((entry) => entry.lastModified === undefined)).toBe(
      true,
    );
  });
});
