import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { renderToStaticMarkup } from "react-dom/server";
import {
  addSourceLabelIdentities,
  applySourceLabelIdentities,
  sourceLabelRoot,
} from "../scripts/omics/source-label-identities";
import { auditSourceLabelNames } from "../scripts/omics/audit/source-label-names";
import { buildRelease } from "../scripts/omics/release";
import { readJsonl } from "../scripts/omics/inputs";
import type { RecordEntry } from "../scripts/omics/schema";
import {
  createCatalogueQuery,
  type CatalogueSnapshot,
} from "../services/omics/src/catalogue-query";
import { validateSnapshot } from "../services/omics/src/validation";
import { recordSearchText } from "../services/omics/src/source-identity";
import { filterCatalogue } from "../lib/omics-browse";
import { testedSearchText } from "../components/catalogue/BenchmarkCharts";
import RecordPage from "../app/database/[kind]/[id]/page";

const fixture = vi.hoisted(() => ({ snapshot: null as CatalogueSnapshot | null }));
vi.mock("../lib/catalogue-build", () => ({
  buildCatalogue: () => ({
    catalogue: fixture.snapshot!,
    query: createCatalogueQuery(fixture.snapshot!),
  }),
}));

const sha = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const record = (id: string, kind: RecordEntry["kind"], extra: Partial<RecordEntry> = {}): RecordEntry => ({
  id, kind, name: id, description: "", status: "source_checked", facets: {}, source_ids: [], links: [], attributes: {}, ...extra,
});

/** The real ATOM3D and HEST extraction batches, with only benchmarks and the TAPE family stubbed. */
function atom3d(): RecordEntry[] {
  const sources = readJsonl<RecordEntry>("data/omics/reviewed/benchmark-evidence-2026.jsonl").filter((item) =>
    ["evidence-expansion-atom3d-92656c20", "evidence-expansion-evidence-discovery-final-tape-6ee0c3e6",
      "evidence-expansion-p2-hest-cached-636099a73dee"].includes(item.id));
  return [
    ...sources,
    record("discovery-benchmark-atom3d", "benchmark", { name: "ATOM3D", source_ids: [sources[0].id], attributes: { entity_level: "suite" } }),
    record("discovery-benchmark-hest-benchmark", "benchmark", { name: "HEST-Benchmark", source_ids: [sources[0].id], attributes: { entity_level: "suite" } }),
    record("discovery-model-tape-transformer", "model", { name: "TAPE Transformer", source_ids: [sources[0].id], attributes: { entity_level: "method" } }),
    ...readJsonl<RecordEntry>("data/omics/reviewed/atom3d-2026.jsonl"),
    ...readJsonl<RecordEntry>("data/omics/reviewed/hest-2026.jsonl"),
  ];
}

describe("reviewed source-label identities", () => {
  const input = atom3d();
  const output = addSourceLabelIdentities(input);
  const byId = new Map(output.map((item) => [item.id, item]));

  it("replaces citation-only tested names while preserving IDs, links, values and locators", () => {
    const before = new Map(input.map((item) => [item.id, item]));
    const lba = byId.get("atom3d-method-karimi-et-al-2019")!;
    expect(lba.name).toBe("DeepAffinity (unified RNN/RNN-CNN; DSSP-derived SPS)");
    expect(lba.attributes.source_label).toBe("[Karimi et al., 2019]");
    expect(byId.get("atom3d-method-zt-rk-et-al-2018")!.name).toBe("DeepDTA (ATOM3D baseline)");
    for (const item of output.filter((entry) => entry.kind === "result" && before.has(entry.id))) {
      const original = before.get(item.id)!;
      const { source_label, source_identity, ...attributes } = item.attributes;
      expect(attributes).toEqual(original.attributes);
      expect(item.links).toEqual(original.links);
      expect(item.source_ids).toEqual(original.source_ids);
      // Bracketed citations leave the name; a surname may remain as attribution.
      const subject = byId.get((source_identity as any)?.subject_id);
      if (source_label && (subject?.attributes.source_identity as any)?.label_form === "bracketed_citation")
        expect(item.name).not.toContain(String(source_label));
      if (source_label) expect(item.name).not.toBe(String(source_label));
    }
    expect(auditSourceLabelNames(output).citation_only_without_identity).toEqual([]);
    expect(auditSourceLabelNames(input).citation_only_without_identity).toHaveLength(8);
    expect(auditSourceLabelNames(input).shorthand_without_identity).toEqual(["hest-method-ciga"]);
    expect(auditSourceLabelNames(output).shorthand_without_identity).toEqual([]);
  });

  it("keeps the shared DeepDTA configuration for LBA and LEP and links reviewed families only", () => {
    const evaluations = output.filter((item) => item.kind === "evaluation" &&
      item.links.some((link) => link.target_id === "atom3d-method-zt-rk-et-al-2018"));
    expect(evaluations.map((item) => item.id).sort()).toEqual([
      "atom3d-evaluation-zt-rk-et-al-2018-lba-rmse",
      "atom3d-evaluation-zt-rk-et-al-2018-lba-rp",
      "atom3d-evaluation-zt-rk-et-al-2018-lba-rs",
      "atom3d-evaluation-zt-rk-et-al-2018-lep-auroc",
    ]);
    const families = output.filter((item) => item.links.some((link) => link.relation === "family"))
      .map((item) => [item.id, item.links.find((link) => link.relation === "family")!.target_id]);
    expect(families).toEqual([
      ["atom3d-method-rao-et-al-2019", "discovery-model-tape-transformer"],
      ["atom3d-method-zt-rk-et-al-2018", "identity-model-deepdta"],
      ["atom3d-method-karimi-et-al-2019", "identity-model-deepaffinity"],
    ]);
    const deepaffinity = byId.get("atom3d-method-karimi-et-al-2019")!.attributes.source_identity as any;
    expect(deepaffinity.known_details.map((item: any) => item.label)).toContain("SPS annotations");
    expect(deepaffinity.unknown.map((item: any) => item.label)).toEqual(
      expect.arrayContaining(["LBA split", "Attention and ensemble choice", "Checkpoint"]));
    // Base profiles carry no scores.
    expect(output.filter((item) => item.links.some((link) => link.target_id === "identity-model-deepdta" && link.relation === "model"))).toEqual([]);
  });

  it("keeps the conflicting RSR citation and unestablished scorer explicit", () => {
    const watkins = byId.get("atom3d-method-watkins-et-al-2020")!;
    expect(watkins.name).toBe("Rosetta scoring function (RSR configuration unresolved)");
    expect(watkins.attributes.source_label).toBe("[Watkins et al., 2020]");
    expect((watkins.attributes.source_identity as any).unknown.map((item: any) => item.label))
      .toEqual(["Citation conflict", "Score function and settings"]);
    expect(watkins.links).toEqual([]);
    expect(byId.get("atom3d-method-pag-s-et-al-2019")!.name).toBe("ProQ3D (CAD-trained; rotameric optimization), reported by Pagès et al.");
  });

  it("renames the reviewed HEST surname label without touching its evaluation conditions", () => {
    const before = new Map(input.map((item) => [item.id, item]));
    const ciga = byId.get("hest-method-ciga")!;
    expect(ciga.name).toBe("SimCLR histology encoder + random forest (HEST; Ciga et al.)");
    expect(ciga.attributes.source_label).toBe("Ciga");
    const identity = ciga.attributes.source_identity as any;
    expect(identity.label_form).toBe("author_surname");
    expect(identity.unknown.map((item: any) => item.label)).toEqual(["Backbone", "Training recipe", "Checkpoint"]);
    const evaluations = output.filter((item) => item.kind === "evaluation" && item.links.some((link) => link.target_id === ciga.id));
    expect(evaluations).toHaveLength(10);
    for (const evaluation of evaluations) {
      const { source_label, source_identity, ...attributes } = evaluation.attributes;
      expect(attributes).toEqual(before.get(evaluation.id)!.attributes);
      expect(evaluation.links).toEqual(before.get(evaluation.id)!.links);
      expect(evaluation.name.startsWith("SimCLR histology encoder + random forest (HEST; Ciga et al.) on HEST-Benchmark")).toBe(true);
    }
    expect(byId.get("hest-result-ciga-ccrcc-pearson-r")!.name)
      .toBe("SimCLR histology encoder + random forest (HEST; Ciga et al.) · HEST-Benchmark CCRCC · Pearson correlation");
  });

  it("searches readable names and printed labels in the query API, browse and chart rows", () => {
    const snapshot = buildRelease(output, "2026-09-24T12:00:00Z", { entity_schema_version: "1.1" }).snapshot;
    expect(() => validateSnapshot(snapshot)).not.toThrow();
    const query = createCatalogueQuery(snapshot);
    const ids = (q: string) => query.list({ kind: "configuration", q, limit: 50 }).items.map((item) => item.id);
    expect(ids("deepaffinity")).toEqual(["atom3d-method-karimi-et-al-2019"]);
    expect(ids("[Öztürk et al., 2018]")).toEqual(["atom3d-method-zt-rk-et-al-2018"]);
    expect(ids("ciga")).toEqual(["hest-method-ciga"]);
    expect(ids("simclr histology")).toEqual(["hest-method-ciga"]);
    expect(filterCatalogue(snapshot.records as any, { kind: "result", readiness: "", q: "karimi et al", area: "", status: "", origin: "" })
      .map((item) => item.id)).toContain("atom3d-result-karimi-et-al-2019-lba-rmse-rmse");
    const detail = query.get({ id: "atom3d-task-lba-rmse" })!;
    const rows = detail.published_comparisons.flatMap((panel) => panel.rows);
    expect(rows.filter((row) => testedSearchText(row).includes("[karimi et al., 2019]"))).toHaveLength(1);
    expect(rows.filter((row) => testedSearchText(row).includes("deepdta"))).toHaveLength(1);
  });

  it("renders identity notices on configuration and result pages and cited labels in tables", () => {
    fixture.snapshot = buildRelease(output, "2026-09-24T12:00:00Z", { entity_schema_version: "1.1" }).snapshot;
    const configuration = renderToStaticMarkup(
      <RecordPage params={{ kind: "configuration", id: "atom3d-method-karimi-et-al-2019" }} />);
    expect(configuration).toContain("Identified as DeepAffinity. The source table prints [Karimi et al., 2019].");
    expect(configuration).toContain("DSSP");
    expect(configuration).toContain("/database/model/identity-model-deepaffinity");
    expect(configuration).toContain("no human scientific review");
    const result = renderToStaticMarkup(
      <RecordPage params={{ kind: "result", id: "hest-result-ciga-ccrcc-pearson-r" }} />);
    expect(result).toContain("The source table prints the tested method as Ciga.");
    expect(result).toContain("/database/configuration/hest-method-ciga");
    const hest = renderToStaticMarkup(<RecordPage params={{ kind: "configuration", id: "hest-method-ciga" }} />);
    expect(hest).toContain("Not established: Backbone.");
    expect(hest).toContain("labels the recipe");
    const task = renderToStaticMarkup(<RecordPage params={{ kind: "task", id: "atom3d-task-lba-rmse" }} />);
    expect(task).toContain("DeepDTA (ATOM3D baseline)");
    expect(task).toContain("(cited as [Öztürk et al., 2018])");
    expect(task).not.toMatch(/>\[Karimi et al\., 2019\]</);
  });
});

describe("source-label identity guards", () => {
  const graph = () => [
    record("paper", "source", { attributes: { url: "https://example.org", artifact_sha256: "a".repeat(64), retrieved_at: "2026-09-24", version: "1" } }),
    record("config", "configuration", { name: "[Smith et al., 2020]", source_ids: ["paper"] }),
    record("plain", "configuration", { name: "CNN (Smith et al.)", source_ids: ["paper"] }),
    record("benchmark", "task"),
    record("data", "dataset"),
    record("evaluation", "evaluation", { name: "[Smith et al., 2020] on Task", description: "Evaluation of [Smith et al., 2020] on Task.",
      links: [{ relation: "model", target_id: "config" }, { relation: "benchmark", target_id: "benchmark" }, { relation: "dataset", target_id: "data" }],
      attributes: { origin: "author_reported", comparison: {} } }),
    record("result", "result", { name: "[Smith et al., 2020] · Task", source_ids: ["paper"], links: [{ relation: "evaluation", target_id: "evaluation" }],
      attributes: { numeric_value: "0.5", printed_value: "0.50", metric: "auroc", unit: "fraction", metric_direction: "higher", source_locator: "Table 1", review: {} } }),
  ];
  const entry = (input: RecordEntry[], changes: Record<string, unknown> = {}) => ({
    subject_id: "config", previous_record_sha256: sha(input[1]), source_label: "[Smith et al., 2020]", label_form: "bracketed_citation",
    status: "unresolved", display_name: "Unresolved method, cited as [Smith et al., 2020]", identity: null,
    configuration: null, description: null, source_ids: ["paper"], source_locator: "Table 1", basis: "Citation conflicts.",
    known_details: [], unknown: [{ label: "Method identity", note: "Not established." }], link: null, ...changes,
  });

  it("renders an unresolved identity on linked result pages", () => {
    const input = graph();
    fixture.snapshot = buildRelease(applySourceLabelIdentities(input, [entry(input)]), "2026-09-24T12:00:00Z", { entity_schema_version: "1.1" }).snapshot;
    const html = renderToStaticMarkup(<RecordPage params={{ kind: "result", id: "result" }} />);
    expect(html).toContain("the method it refers to is unresolved");
    expect(html).toContain('data-source-identity="unresolved"');
    expect(html).toContain("/database/configuration/config");
  });

  it("keeps an unresolved label and does not touch numbers", () => {
    const input = graph();
    const output = applySourceLabelIdentities(input, [entry(input)]);
    const result = output.find((item) => item.id === "result")!;
    expect(result.name).toBe("Unresolved method, cited as [Smith et al., 2020] · Task");
    expect(result.attributes.numeric_value).toBe("0.5");
    expect(output.find((item) => item.id === "evaluation")!.description)
      .toBe("Evaluation of an unresolved method cited as [Smith et al., 2020] on Task.");
    expect(recordSearchText(result)).toContain("[smith et al., 2020]");
  });

  it("rejects inferred names, stale inputs and non-citation subjects", () => {
    const input = graph();
    expect(() => applySourceLabelIdentities(input, [entry(input, { display_name: "Smith model" })])).toThrow("Unresolved identities");
    expect(() => applySourceLabelIdentities(input, [entry(input, { status: "resolved", display_name: "[Smith, 2020]", identity: "X" })])).toThrow("citation-only");
    expect(() => applySourceLabelIdentities(input, [entry(input, { status: "resolved", identity: null, display_name: "Model X" })])).toThrow("needs a method");
    expect(() => applySourceLabelIdentities(input, [entry(input, { previous_record_sha256: "0".repeat(64) })])).toThrow("precondition changed");
    expect(() => applySourceLabelIdentities(input, [entry(input, { subject_id: "plain", previous_record_sha256: sha(input[2]) })])).toThrow("citation-only names");
    expect(() => applySourceLabelIdentities(input, [entry(input, { source_ids: ["missing"] })])).toThrow("Missing identity source");
    expect(() => applySourceLabelIdentities(input, [entry(input), entry(input)])).toThrow("Duplicate");
    // A surname label must be declared as such, and must match whole words only.
    const surname = graph().map((item) => ({ ...item, name: item.name.replaceAll("[Smith et al., 2020]", "Smith"),
      description: item.description.replaceAll("[Smith et al., 2020]", "Smith") }));
    const named = { source_label: "Smith", display_name: "Method X (Smith et al.)", status: "resolved", identity: "Method X",
      previous_record_sha256: sha(surname[1]) };
    expect(() => applySourceLabelIdentities(surname, [entry(surname, { ...named })])).toThrow("citation-only names");
    const renamed = applySourceLabelIdentities(surname, [entry(surname, { ...named, label_form: "author_surname" })]);
    expect(renamed.find((item) => item.id === "result")!.name).toBe("Method X (Smith et al.) · Task");
    const smithson = surname.map((item) => item.id === "evaluation" ? { ...item, name: "Smith on Smithsonian task" } : item);
    expect(applySourceLabelIdentities(smithson, [entry(smithson, { ...named, label_form: "author_surname" })])
      .find((item) => item.id === "evaluation")!.name).toBe("Method X (Smith et al.) on Smithsonian task");
  });

  it("rejects published citation-only names that claim a reviewed identity", () => {
    const input = graph();
    const snapshot = buildRelease(applySourceLabelIdentities(input, [entry(input)]), "2026-09-24T12:00:00Z", { entity_schema_version: "1.1" }).snapshot;
    const broken = structuredClone(snapshot);
    const config = broken.records.find((item) => item.id === "config")!;
    config.name = "[Smith et al., 2020]";
    (config.attributes.source_identity as any).display_name = config.name;
    expect(() => validateSnapshot(broken)).toThrow("citation-only");
    const unlabelled = structuredClone(snapshot);
    delete unlabelled.records.find((item) => item.id === "result")!.attributes.source_label;
    expect(() => validateSnapshot(unlabelled)).toThrow("label and identity");
  });

  it("binds linked identities to the tested subject reached through the record graph", () => {
    const input = [...graph(),
      record("other", "configuration", { name: "Unresolved method, cited as [Smith et al., 2020]", source_ids: ["paper"] })];
    const snapshot = buildRelease(applySourceLabelIdentities(input, [entry(input)]), "2026-09-24T12:00:00Z", { entity_schema_version: "1.1" }).snapshot;
    expect(() => validateSnapshot(snapshot)).not.toThrow();
    const mutate = (id: string, change: (item: any, all: any[]) => void) => {
      const copy = structuredClone(snapshot);
      change(copy.records.find((item) => item.id === id)!, copy.records);
      return copy;
    };
    // An evaluation cannot cite itself as identity evidence.
    expect(() => validateSnapshot(mutate("evaluation", (item) => { item.attributes.source_identity.subject_id = "evaluation"; })))
      .toThrow("cannot cite its own record");
    // A subject must be a tested entity with a full reviewed identity.
    expect(() => validateSnapshot(mutate("result", (item) => { item.attributes.source_identity.subject_id = "benchmark"; })))
      .toThrow("tested model");
    expect(() => validateSnapshot(mutate("result", (item) => { item.attributes.source_identity.subject_id = "other"; })))
      .toThrow("does not match its tested subject");
    // Relinking the evaluation to another configuration leaves its copied identity stale.
    expect(() => validateSnapshot(mutate("evaluation", (item) => {
      item.links = item.links.map((link: any) => link.relation === "model" ? { ...link, target_id: "plain" } : link);
    }))).toThrow("does not test the identity subject");
    // A result must reach the subject through its own evaluation.
    expect(() => validateSnapshot(mutate("result", (item, all) => {
      const evaluation = structuredClone(all.find((entry: any) => entry.id === "evaluation"));
      all.push({ ...evaluation, id: "evaluation-2", name: "CNN (Smith et al.) on Task",
        links: evaluation.links.map((link: any) => link.relation === "model" ? { ...link, target_id: "plain" } : link),
        attributes: { origin: "author_reported", comparison: {} } });
      item.links = [{ relation: "evaluation", target_id: "evaluation-2" }];
    }))).toThrow("not linked to an evaluation of the identity subject");
  });

  it("seals every committed batch file", () => {
    const receipt = JSON.parse(fs.readFileSync(`${sourceLabelRoot}/review.json`, "utf8"));
    expect(receipt.human_scientific_review).toBe("not_performed");
    for (const [name, hash] of Object.entries(receipt.files))
      expect(createHash("sha256").update(fs.readFileSync(`${sourceLabelRoot}/${name}`)).digest("hex")).toBe(hash);
  });
});
