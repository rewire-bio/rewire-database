import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createCatalogueQuery,
  type CatalogueSnapshot,
} from "../services/omics/src/catalogue-query";
import { currentCatalogueBase, readJsonl } from "../scripts/omics/inputs";
import { enrichProfiles } from "../lib/omics-profile";
import { enrichAssociations } from "../scripts/omics/enrich";
import { buildRelease } from "../scripts/omics/release";
import type { RecordEntry } from "../scripts/omics/schema";
import RecordPage from "../app/database/[kind]/[id]/page";

const fixture = vi.hoisted(() => ({
  snapshot: null as CatalogueSnapshot | null,
}));
vi.mock("../lib/catalogue-build", () => ({
  buildCatalogue: () => ({
    catalogue: fixture.snapshot!,
    query: createCatalogueQuery(fixture.snapshot!),
  }),
}));

describe("configuration profile ownership", () => {
  it("shows its own reviewed facts even when a related family has more complete coverage", () => {
    const read = (name: string) => readJsonl<any>(`data/omics/${name}.jsonl`);
    const records = enrichProfiles(
      enrichAssociations(
        currentCatalogueBase([...read("migrated"), ...read("discovery")]),
        [
          ...read("model-profile-associations"),
          ...read("benchmark-profile-associations"),
        ],
      ),
      [...read("model-profiles"), ...read("benchmark-profiles")],
    );
    const configured = records.find(
      (record) =>
        record.kind === "model" &&
        record.links.some((link) => link.relation === "family"),
    )!;
    const profile = structuredClone(configured.attributes.profile) as any;
    profile.coverage = "limited";
    profile.summary = "This exact configuration has its own evidence.";
    profile.gaps = ["A configuration detail remains unresolved."];
    profile.facts.push({
      label: "Configuration-specific fact",
      value: "Do not replace me with family metadata.",
      status: "source_checked",
      source_ids: profile.facts[0].source_ids,
      source_locator: profile.facts[0].source_locator,
    });
    const patched = records.map((record) =>
      record.id === configured.id
        ? { ...record, attributes: { ...record.attributes, profile } }
        : record,
    );
    fixture.snapshot = buildRelease(
      patched as RecordEntry[],
      "2026-09-16T20:00:00Z",
    ).snapshot;
    const html = renderToStaticMarkup(
      <RecordPage params={{ kind: "model", id: configured.id }} />,
    );
    expect(html).toContain("This exact configuration has its own evidence.");
    expect(html).toContain("Do not replace me with family metadata.");
    expect(html).toContain("Related family profile:");
    expect(html).toContain("Configuration-specific fact");
  });
});
