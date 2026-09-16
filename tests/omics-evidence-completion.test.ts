import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { restoreReleaseBundles } from "../scripts/omics/archives";
import { enrichMetadata } from "../scripts/omics/metadata";
import { evidenceSources, readJsonl } from "../scripts/omics/inputs";
import { profileSchema, validateProfileSources } from "../lib/omics-profile";
import { type RecordEntry } from "../scripts/omics/schema";
const sources = evidenceSources();
const byId = new Map(sources.map((source) => [source.id, source]));
describe("evidence completion and immutable publication", () => {
  it("ties each catalogue profile to its reviewed bytes and pinned evidence artifacts", () => {
    const canonical = (value: any): any =>
      Array.isArray(value)
        ? value.map(canonical)
        : value && typeof value === "object"
          ? Object.fromEntries(
              Object.keys(value)
                .sort()
                .map((key) => [key, canonical(value[key])]),
            )
          : value;
    const profiles = ["model", "benchmark"].flatMap((kind) =>
      readJsonl<{ id: string; profile: unknown }>(
        `data/omics/${kind}-profiles.jsonl`,
      ),
    );
    const receipts = readJsonl<any>(
      "data/omics/reviews/2026-09-16-profile-review.jsonl",
    );
    const records = [
      ...["migrated", "discovery"].flatMap((name) =>
        readJsonl<RecordEntry>(`data/omics/${name}.jsonl`),
      ),
      ...sources,
    ];
    const sourceIndex = new Map(
      records
        .filter((record) => record.kind === "source")
        .map((record) => [record.id, record]),
    );
    expect(receipts).toHaveLength(profiles.length);
    for (const item of profiles) {
      const receipt = receipts.find((row) => row.id === item.id);
      expect(receipt?.profile_sha256).toBe(
        createHash("sha256")
          .update(JSON.stringify(canonical(item.profile)))
          .digest("hex"),
      );
      for (const source of receipt.source_artifacts)
        expect(sourceIndex.get(source.id)?.attributes.artifact_sha256).toBe(
          source.sha256,
        );
    }
  });
  it("requires complete summary citations and validates their targets", () => {
    const profile = profileSchema.parse(
      readJsonl<{ id: string; profile: unknown }>(
        "data/omics/model-profiles.jsonl",
      ).find((item) => item.id === "discovery-model-alphafold-3")!.profile,
    );
    expect(() =>
      profileSchema.parse({ ...profile, summary_source_locator: undefined }),
    ).toThrow("Summary evidence");
    expect(() =>
      validateProfileSources(
        { ...profile, summary_source_ids: ["missing"] },
        byId,
      ),
    ).toThrow("missing source");
    expect(
      profile.facts.find((fact) => fact.label === "Parameters")?.status,
    ).toBe("unreported");
  });
  it("labels original discovery gaps as historical when adding reviewed profile facts", async () => {
    const { enrichProfiles } = await import("../lib/omics-profile");
    const { currentCatalogueBase } = await import("../scripts/omics/inputs");
    const base = ["migrated", "discovery"].flatMap((name) =>
      readJsonl<RecordEntry>(`data/omics/${name}.jsonl`),
    );
    const records = enrichProfiles(
      currentCatalogueBase(base),
      readJsonl("data/omics/model-profiles.jsonl"),
    );
    const original = base.find(
      (record) => record.id === "discovery-model-dnabert-2",
    )!;
    const current = records.find((record) => record.id === original.id)!;
    expect(current.attributes.missing_metadata).toBeUndefined();
    expect(current.attributes.historical_missing_metadata).toEqual(
      original.attributes.missing_metadata,
    );
    expect(current.attributes.metadata_review_scope).toContain("profile.facts");
    expect(
      base.find((record) => record.id === original.id)!.attributes
        .missing_metadata,
    ).toEqual(original.attributes.missing_metadata);
  });
  it("keeps hosted service restrictions distinct from the local model and logs identity corrections", () => {
    const base = ["migrated", "discovery"].flatMap((name) =>
      readJsonl<RecordEntry>(`data/omics/${name}.jsonl`),
    );
    const corrections = readJsonl("data/omics/metadata-corrections.jsonl");
    const enriched = enrichMetadata([...base, ...sources], corrections);
    expect(
      enriched.find(
        (record) => record.id === "catalog-model-alphafold-3-server",
      )!.attributes.entity_level,
    ).toBe("service");
    expect(
      enriched.find((record) => record.id === "discovery-model-alphafold-3")!
        .attributes.entity_level,
    ).toBe("family");
    expect(
      enriched.find((record) => record.id.startsWith("metadata-correction-"))!
        .attributes.previous_value,
    ).toBe("family");
    expect(() =>
      enrichMetadata(
        [...base, ...sources],
        [{ ...(corrections[0] as object), id: "b2-barcodebert-2026" }],
      ),
    ).toThrow("Invalid metadata correction subject");
    for (const result of base.filter((record) => record.kind === "result"))
      expect(enriched.find((record) => record.id === result.id)).toEqual(
        result,
      );
  });
  it("restores the previously published release from a clean directory and rejects tampered exports", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "rewire-archive-test-"));
    try {
      const input = path.join(root, "input");
      fs.mkdirSync(input);
      const id = "2026-09-16-d74d282221a9";
      for (const ext of [".json", ".bundle.json.gz"])
        fs.copyFileSync(
          `data/omics/releases/${id}${ext}`,
          path.join(input, id + ext),
        );
      const output = path.join(root, "output");
      restoreReleaseBundles(input, output);
      restoreReleaseBundles(input, output);
      expect(
        fs.readFileSync(path.join(output, id, "manifest.json"), "utf8"),
      ).toBe(fs.readFileSync(path.join(input, id + ".json"), "utf8"));
      fs.writeFileSync(path.join(output, id, "records.csv"), "changed");
      expect(() => restoreReleaseBundles(input, output)).toThrow(
        "Immutable release conflict",
      );
      fs.writeFileSync(
        path.join(input, id + ".bundle.json.gz"),
        gzipSync(
          JSON.stringify({
            "../escape": "x",
            "manifest.json": fs.readFileSync(
              path.join(input, id + ".json"),
              "utf8",
            ),
          }),
        ),
      );
      expect(() => restoreReleaseBundles(input, output)).toThrow(
        "Unexpected archived files",
      );
      expect(fs.existsSync(path.join(root, "escape"))).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("unresolved primary-source concerns", () => {
  it("retains the printed score but prevents comparison and surfaces the precise concern", async () => {
    const { currentCatalogueBase } = await import("../scripts/omics/inputs");
    const { createCatalogueQuery } =
      await import("../services/omics/src/catalogue-query");
    const { buildRelease } = await import("../scripts/omics/release");
    const { renderToStaticMarkup, createElement } =
      await import("react-dom/server").then(async (server) => ({
        ...server,
        createElement: (await import("react")).createElement,
      }));
    const { EvidenceConcerns } =
      await import("../components/catalogue/Profile");
    const base = ["migrated", "discovery"].flatMap((name) =>
      readJsonl<RecordEntry>(`data/omics/${name}.jsonl`),
    );
    const query = createCatalogueQuery(
      buildRelease(currentCatalogueBase(base), "2026-09-16T21:00:00Z").snapshot,
    );
    const row = query.results({ id: "lit-b4-017" }).items[0];
    expect(row.result).toEqual(
      base.find((record) => record.id === "lit-b4-017"),
    );
    const comparison = query.compare({
      ids: ["lit-b4-017", "b2-barcodebert-2026"],
    });
    expect(comparison.compatible).toBe(false);
    expect(comparison.reasons).toContain(
      "A source has unresolved evidence concerns; this result cannot support a comparison.",
    );
    const html = renderToStaticMarkup(
      createElement(EvidenceConcerns, { sources: row.sources }),
    );
    expect(html).toContain("Section 4.3");
    expect(html).toContain("excluded from comparisons");
  });
});
