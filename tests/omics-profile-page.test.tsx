import fs from "node:fs";
import { preparedFromSnapshot } from "./helpers/prepared";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  type CatalogueSnapshot,
} from "../shared/omics/catalogue-query";
import ModelPage from "../app/database/model/[id]/page";
import ConfigurationPage from "../app/database/configuration/[id]/page";

const pageFor = { model: ModelPage, configuration: ConfigurationPage } as const;

const fixture = vi.hoisted(() => ({
  snapshot: null as CatalogueSnapshot | null,
}));
vi.mock("../lib/catalogue-build", () => ({
  buildCatalogue: () => ({
    catalogue: fixture.snapshot!,
    query: preparedFromSnapshot(fixture.snapshot!),
  }),
}));

describe("configuration profile ownership", () => {
  it("shows its own reviewed facts even when a related family has more complete coverage", () => {
    const snapshot: CatalogueSnapshot = JSON.parse(fs.readFileSync("public/omics/catalogue.json", "utf8"));
    const records = snapshot.records;
    const configured = records.find(
      (record) =>
        ["model", "configuration"].includes(record.kind) &&
        Boolean(record.attributes.profile) &&
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
    fixture.snapshot = { ...snapshot, records: patched };
    const RecordPage = pageFor[configured.kind as keyof typeof pageFor];
    const html = renderToStaticMarkup(
      <RecordPage params={{ id: configured.id }} />,
    );
    expect(html).toContain("This exact configuration has its own evidence.");
    expect(html).toContain("Do not replace me with family metadata.");
    expect(html).toContain("Related profile:");
    expect(html).toContain(
      `/database/model/${configured.links.find((link) => link.relation === "family")!.target_id}`,
    );
    expect(html).toContain("Configuration-specific fact");
  });
});
