import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createCatalogueQuery,
  type CatalogueSnapshot,
} from "../services/omics/src/catalogue-query";
import { profileSchema } from "../lib/omics-profile";
import Profile from "../components/catalogue/Profile";
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
fixture.snapshot = JSON.parse(fs.readFileSync("tests/fixtures/profile-hierarchy.json", "utf8"));
const query = createCatalogueQuery(fixture.snapshot!);
const render = (id: string) =>
  renderToStaticMarkup(
    <RecordPage params={{ id, kind: query.get({ id })!.record.kind }} />,
  );
const escaped = (value: string) => renderToStaticMarkup(<>{value}</>);

describe("model profile information hierarchy", () => {
  it("leads with a sourced image and key facts, then results before detailed methods and evidence", () => {
    const html = render("discovery-model-alphafold-3");
    const sections = [
      "overview",
      "results",
      "how-it-works",
      "strengths-limitations",
      "specifications",
      "evidence",
      "sources",
    ];
    const positions = sections.map((id) => html.indexOf(`id="${id}"`));
    expect(positions.every((index) => index >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(html.indexOf('role="img"')).toBeLessThan(positions[0]);
    expect(html).not.toContain("Read the diagram as text");
    expect(html).toContain("No evaluations linked in this release");
    expect(html).not.toContain('aria-label="Evaluation setup"');
    expect(html).toContain(
      "/database/service/catalog-model-alphafold-3-server",
    );
    expect(html).toContain("Their results, where available, are not assigned");
    expect(html.slice(positions[0], positions[1])).not.toContain("<table");
  });
  it("retains every original fact, methodological section, limitation and source locator behind disclosures", () => {
    const detail = query.get({ id: "discovery-model-alphafold-3" })!;
    const profile = profileSchema.parse(detail.record.attributes.profile);
    const html = render(detail.record.id);
    for (const fact of profile.facts)
      expect(html).toContain(escaped(fact.value));
    for (const section of profile.sections) {
      expect(html).toContain(escaped(section.body));
      expect(html).toContain(escaped(section.source_locator));
    }
    for (const claim of [...profile.strengths, ...profile.limitations])
      expect(html).toContain(escaped(claim.text));
    expect(html).toContain("Not reported in inspected sources");
    expect(html).toContain(
      "<summary>Inspect claims, sources and review details</summary>",
    );
    const methods = html.slice(
      html.indexOf('id="how-it-works"'),
      html.indexOf('id="strengths-limitations"'),
    );
    expect(methods).toContain("<details");
    expect(methods).not.toContain('open=""');
  });
  it("provides every current model with its own reviewed diagram and exact explanatory labels", () => {
    const models = fixture.snapshot!.records.filter(
      (record) => record.kind === "model",
    );
    expect(models.length).toBe(59);
    for (const record of models) {
      const profile = profileSchema.parse(record.attributes.profile);
      expect(profile.diagram, record.id).toBeDefined();
      const html = renderToStaticMarkup(
        <Profile
          record={record}
          sources={query.get({ id: record.id })!.sources}
          part="visual"
        />,
      );
      expect(html).toContain(escaped(profile.diagram!.title));
      for (const step of profile.diagram!.steps)
        expect(html).toContain(escaped(step));
      expect(html).toContain(escaped(profile.diagram!.source_locator));
      expect(html).toContain("aria-describedby=");
    }
  });
  it("preserves exact configuration results and source links without inventing facts on sparse profiles", () => {
    const barcode = render("reported-model-05103f72325fe5");
    expect(barcode).toContain("78.5%");
    expect(barcode).toContain("Table 1");
    expect(barcode).toContain("Author-reported evaluation");
    const sparse = render("paper-model-0f40787fb7b5e487d1");
    expect(sparse).toContain("Key specifications have not been extracted");
    expect(sparse).toContain("Not extracted or verified for this record.");
    expect(sparse).toContain('id="results"');
  });
});
