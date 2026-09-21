import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { renderToStaticMarkup } from "react-dom/server";
import BaselineCoverage from "../components/catalogue/BaselineCoverage";
import { buildBaselineAudit, candidateRule } from "../lib/baseline-coverage";
import {
  baselineAuditFiles,
  auditCsv,
} from "../scripts/omics/baseline-coverage";
import type { OmicsCatalogue, OmicsRecord } from "../lib/omics";
const record = (
  id: string,
  kind: OmicsRecord["kind"],
  attributes: Record<string, unknown> = {},
): OmicsRecord => ({
  id,
  kind,
  name: id,
  description: "",
  status: "source_checked",
  facets: {},
  source_ids: [],
  links: [],
  attributes,
});
const catalogue = (records: OmicsRecord[]): OmicsCatalogue => ({
  schema_version: "1.1",
  release_id: "2026-09-20-b2596bdf5206",
  released_at: "2026-09-20T14:44:11Z",
  coverage: {},
  records,
});
function baselineFixture() {
  const protocol = record("rewire-mfass-v2", "protocol");
  const method = record(
    "rewire-model-baseline-kmer-position-v2",
    "configuration",
  );
  const evaluation = record(
    "rewire-evaluation-baseline-kmer-position-v2",
    "evaluation",
    { origin: "rewire_run" },
  );
  evaluation.source_ids = ["source"];
  evaluation.links = [
    { relation: "benchmark", target_id: protocol.id },
    { relation: "configuration", target_id: method.id },
  ];
  const result = record("result", "result", {
    numeric_value: "0.778",
    printed_value: "0.778",
  });
  result.links = [{ relation: "evaluation", target_id: evaluation.id }];
  const source = record("source", "source", {
    url: "https://example.org/source",
  });
  return {
    protocol,
    method,
    evaluation,
    result,
    source,
    snapshot: catalogue([protocol, method, evaluation, result, source]),
  };
}
describe("baseline coverage and model evaluation audit", () => {
  it("requires two roles for every protocol, while suggestions remain unmeasured", () => {
    const protocol = record("prot", "protocol");
    protocol.source_ids = ["context"];
    const audit = buildBaselineAudit(catalogue([protocol]));
    expect(audit.protocols.map((row) => row.role)).toEqual([
      "null",
      "conventional",
    ]);
    expect(
      audit.protocols.every(
        (row) =>
          row.status === "selection_required" &&
          row.selection_review === "not_reviewed",
      ),
    ).toBe(true);
    expect(audit.protocols[0].source_ids).toEqual([]);
    expect(audit.protocols[0].context_source_ids).toEqual(["context"]);
    expect(audit.counts.measured_roles).toBe(0);
  });
  it("retains superseded protocols without treating them as active run targets", () => {
    const protocol = record("old", "protocol");
    protocol.status = "superseded";
    expect(
      buildBaselineAudit(catalogue([protocol])).protocols.every(
        (row) => row.status === "historical",
      ),
    ).toBe(true);
  });
  it("recognises exact accepted Rewire evidence without changing source scores", () => {
    const fixture = baselineFixture();
    const original = JSON.stringify(fixture.snapshot);
    const audit = buildBaselineAudit(fixture.snapshot);
    expect(audit.protocols[1].evaluation_ids).toEqual([fixture.evaluation.id]);
    expect(audit.protocols[1].result_ids).toEqual(["result"]);
    expect(audit.protocols[1].status).toBe("measured");
    expect(audit.protocols[0].status).toBe("selection_required");
    expect(JSON.stringify(fixture.snapshot)).toBe(original);
  });
  it.each(["author_reported", "independent_paper"])(
    "rejects a mapped baseline with %s origin",
    (origin) => {
      const fixture = baselineFixture();
      fixture.evaluation.attributes.origin = origin;
      expect(() => buildBaselineAudit(fixture.snapshot)).toThrow(
        "Invalid baseline evidence",
      );
    },
  );
  it("rejects wrong-protocol evidence and quarantined results", () => {
    const fixture = baselineFixture();
    fixture.result.status = "needs_review";
    expect(() => buildBaselineAudit(fixture.snapshot)).toThrow(
      "Invalid baseline evidence",
    );
    fixture.result.status = "source_checked";
    fixture.evaluation.links = [];
    expect(() => buildBaselineAudit(fixture.snapshot)).toThrow(
      "Invalid baseline evidence",
    );
  });
  it("does not infer suite membership from a shared task or name", () => {
    const suite = record("suite", "benchmark");
    const protocol = record("prot", "protocol");
    protocol.name = suite.name;
    suite.links = [{ relation: "evaluates_task", target_id: "task" }];
    protocol.links = [...suite.links];
    const audit = buildBaselineAudit(catalogue([suite, protocol]));
    expect(audit.suites[0].status).toBe("protocol_inventory_required");
    expect(audit.protocols[0].suite_ids).toEqual([]);
  });
  it("resolves nested explicit membership and terminates cyclic links", () => {
    const suite = record("suite", "benchmark");
    const a = record("a", "protocol");
    const b = record("b", "protocol");
    a.links = [{ relation: "part_of", target_id: "b" }];
    b.links = [
      { relation: "part_of", target_id: "suite" },
      { relation: "part_of", target_id: "a" },
    ];
    expect(
      buildBaselineAudit(catalogue([suite, a, b])).suites[0].protocol_ids,
    ).toEqual(["a", "b"]);
  });
  it("keeps identically named models distinct and requires an association claim", () => {
    const family = record("family", "model");
    const config = record("config", "configuration");
    family.name = config.name;
    config.links = [{ relation: "family", target_id: family.id }];
    expect(buildBaselineAudit(catalogue([family, config])).models).toHaveLength(
      2,
    );
    expect(
      buildBaselineAudit(catalogue([family, config])).models[0]
        .verified_associations,
    ).toEqual([]);
    const claim = record("claim", "claim", {
      field: "links:family:family",
      source_locator: "Model card, checkpoint table",
    });
    claim.links = [{ relation: "subject", target_id: "config" }];
    claim.source_ids = ["source"];
    expect(
      buildBaselineAudit(catalogue([family, config, claim])).models[0]
        .verified_associations,
    ).toHaveLength(1);
  });
  it("never transfers a pipeline evaluation to its underlying model", () => {
    const base = record("base", "model");
    const pipe = record("pipe", "pipeline");
    pipe.links = [{ relation: "uses_model", target_id: "base" }];
    const evaluation = record("eval", "evaluation");
    evaluation.links = [{ relation: "pipeline", target_id: "pipe" }];
    const rows = buildBaselineAudit(catalogue([base, pipe, evaluation])).models;
    expect(rows.find((r) => r.record_id === "base")?.evaluation_ids).toEqual(
      [],
    );
    expect(rows.find((r) => r.record_id === "pipe")?.evaluation_ids).toEqual([
      "eval",
    ]);
  });
  it("keeps zero-shot candidates label-free even when their task mentions regression", () => {
    const protocol = record("protein", "protocol");
    protocol.name = "ProteinGym zero-shot regression";
    const [nullControl, conventional] = candidateRule(protocol, []);
    expect(nullControl).toContain("no fitting");
    expect(conventional).toContain("label-free");
  });
  it("does not infer protocol modality or supervision from a suite title", () => {
    const protein = record("protein", "protocol");
    protein.name = "Supervised regression";
    const proteinSuite = record("protein-suite", "benchmark");
    proteinSuite.name = "ProteinGym";
    expect(candidateRule(protein, [proteinSuite])[1]).toContain("ridge");
    const rna = record("rna", "protocol");
    rna.name = "RNA abundance prediction";
    const rnaSuite = record("rna-suite", "benchmark");
    rnaSuite.name = "NABench";
    expect(candidateRule(rna, [rnaSuite])[1]).not.toContain("Thermodynamic");
  });
  it("follows explicit suite membership through task records", () => {
    const suite = record("suite", "benchmark");
    const task = record("task", "task");
    const protocol = record("protocol", "protocol");
    task.links = [{ relation: "part_of", target_id: suite.id }];
    protocol.links = [{ relation: "part_of", target_id: task.id }];
    expect(
      buildBaselineAudit(catalogue([suite, task, protocol])).protocols[0]
        .suite_ids,
    ).toEqual(["suite"]);
  });
  it("is deterministic across record ordering and never makes submission claims", () => {
    const a = record("a", "model");
    const b = record("b", "protocol");
    expect(buildBaselineAudit(catalogue([a, b]))).toEqual(
      buildBaselineAudit(catalogue([b, a])),
    );
    expect(buildBaselineAudit(catalogue([a])).models[0].submission_status).toBe(
      "not_recorded_in_public_catalogue",
    );
  });
  it("exports source hashes, precise source table and publication status", () => {
    const fixture = baselineFixture();
    const bytes = Buffer.from(JSON.stringify(fixture.snapshot));
    const generated = baselineAuditFiles(bytes, "prospective_review");
    expect(generated.manifest.catalogue_sha256).toBe(
      createHash("sha256").update(bytes).digest("hex"),
    );
    expect(generated.manifest.publication_status).toBe("prospective_review");
    expect(generated.files["sources.csv"]).toContain(
      "https://example.org/source",
    );
    expect(generated.manifest.files["coverage.json"]).toBe(
      createHash("sha256")
        .update(generated.files["coverage.json"])
        .digest("hex"),
    );
    expect(auditCsv([{ text: '=HYPERLINK("evil")' }])).toContain("'=HYPERLINK");
  });
  it("renders measured links and explicit gaps with release-pinned downloads", () => {
    const fixture = baselineFixture();
    const html = renderToStaticMarkup(
      <BaselineCoverage
        record={fixture.protocol}
        catalogue={fixture.snapshot}
      />,
    );
    expect(html).toContain("1 of 2 active baseline roles");
    expect(html).toContain("Selection requires review");
    expect(html).toContain(`/database/evaluation/${fixture.evaluation.id}`);
    expect(html).toContain(
      "/omics/baseline-coverage/2026-09-20-b2596bdf5206/protocol-baselines.csv",
    );
  });
  it("audits every protocol and model identity in the pinned production release", () => {
    const snapshot: OmicsCatalogue = JSON.parse(
      gunzipSync(
        fs.readFileSync(
          "data/omics/releases/2026-09-20-b2596bdf5206/catalogue.json.gz",
        ),
      ).toString(),
    );
    const audit = buildBaselineAudit(snapshot);
    expect(audit.counts.protocols).toBe(180);
    expect(audit.counts.suites).toBe(30);
    expect(audit.counts.model_records).toBe(59);
    expect(audit.models).toHaveLength(2442);
    expect(audit.counts.measured_roles).toBe(1);
    expect(audit.counts.historical_roles).toBe(2);
    expect(new Set(audit.protocols.map((p) => p.protocol_id)).size).toBe(180);
  });
});
