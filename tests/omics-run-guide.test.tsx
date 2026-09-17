import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import RunGuide from "../components/catalogue/RunGuide";
import { validateRunGuide } from "../services/omics/src/run-guide";
import type { OmicsRecord } from "../lib/omics";

function record(
  id: string,
  kind: OmicsRecord["kind"],
  attributes: Record<string, unknown> = {},
): OmicsRecord {
  return {
    id,
    kind,
    name: id,
    description: "",
    status: "source_checked",
    facets: {},
    links: [],
    source_ids: ["official-source"],
    attributes,
  };
}
function fixture() {
  const source = record("official-source", "source", {
    url: "https://github.com/example/benchmark/blob/abc/README.md",
    artifact_sha256: "a".repeat(64),
    version: "abc",
  });
  const benchmark = record("protocol", "protocol", {
    run_documentation: {
      record_id: "protocol",
      status: "official_documentation_linked",
      summary: "Follow the official installation and evaluation documentation.",
      source_ids: [source.id],
      source_locator: "README: Installation and Evaluation",
    },
  });
  return {
    source,
    benchmark,
    byId: new Map([
      [source.id, source],
      [benchmark.id, benchmark],
    ]),
  };
}
function guide() {
  return {
    record_id: "protocol",
    status: "source_reviewed_not_executed",
    summary: "Evaluate prepared predictions with the official scorer.",
    prerequisites: ["Prepare predictions under the specified protocol."],
    steps: [
      {
        title: "Score predictions",
        shell: "python score.py --input predictions.csv",
        explanation: "Use the documented evaluator.",
        source_ids: ["official-source"],
        source_locator: "README: Evaluate predictions",
      },
    ],
    outputs: ["A metrics CSV."],
    limitations: ["The commands do not establish score reproduction."],
    source_ids: ["official-source"],
    review: { method: "official_repository_review", date: "2026-09-17" },
  };
}
describe("reviewed run instructions", () => {
  it("renders documentation-only guidance with its exact source and locator", () => {
    const { source, benchmark, byId } = fixture();
    expect(() => validateRunGuide(benchmark, byId)).not.toThrow();
    const html = renderToStaticMarkup(
      <RunGuide record={benchmark} sources={[source]} />,
    );
    expect(html).toContain('id="run"');
    expect(html).toContain("Running this benchmark");
    expect(html).toContain("README: Installation and Evaluation");
    expect(html).toContain(String(source.attributes.url));
    expect(html).not.toContain("Copy commands");
    expect(html).not.toContain("source_reviewed_not_executed");
  });
  it("renders commands, citations, prerequisites and explicit non-execution scope", () => {
    const { source, benchmark, byId } = fixture();
    benchmark.attributes.run_guide = guide();
    expect(() => validateRunGuide(benchmark, byId)).not.toThrow();
    const html = renderToStaticMarkup(
      <RunGuide record={benchmark} sources={[source]} />,
    );
    expect(html).toContain("How to run");
    expect(html).toContain("python score.py --input predictions.csv");
    expect(html).toContain("README: Evaluate predictions");
    expect(html).toContain(String(source.attributes.url));
    expect(html).toContain("Prepare predictions under the specified protocol.");
    expect(html).toContain("These commands have not been executed by rewire");
    expect(html).toContain(
      "does not automatically reproduce the published scores",
    );
    expect(html).toContain('aria-label="Copy commands: Score predictions"');
    expect(html).toContain('tabindex="0"');
    expect(html).not.toContain("Running this benchmark");
  });
  it("does not render arbitrary malformed instructions", () => {
    const { source, benchmark } = fixture();
    benchmark.attributes = {
      run_guide: { shell: "unreviewed command" },
      run_documentation: { summary: "uncited" },
    };
    expect(
      renderToStaticMarkup(<RunGuide record={benchmark} sources={[source]} />),
    ).toBe("");
  });
  it("rejects documentation assigned to a different record", () => {
    const { benchmark, byId } = fixture();
    (
      benchmark.attributes.run_documentation as Record<string, unknown>
    ).record_id = "another-protocol";
    expect(() => validateRunGuide(benchmark, byId)).toThrow(
      "Invalid run documentation owner",
    );
  });
  it("rejects guides assigned to models or another benchmark", () => {
    const { benchmark, byId } = fixture();
    benchmark.attributes = { run_guide: { ...guide(), record_id: "other" } };
    expect(() => validateRunGuide(benchmark, byId)).toThrow(
      "Run guide belongs to another record",
    );
    benchmark.kind = "model";
    expect(() => validateRunGuide(benchmark, byId)).toThrow(
      "Run instructions require",
    );
  });
  it("requires an artifact hash and a record-level source link", () => {
    const { source, benchmark, byId } = fixture();
    delete source.attributes.artifact_sha256;
    expect(() => validateRunGuide(benchmark, byId)).toThrow(
      "Unpinned run documentation",
    );
    source.attributes.artifact_sha256 = "a".repeat(64);
    benchmark.source_ids = [];
    expect(() => validateRunGuide(benchmark, byId)).toThrow(
      "Unpinned run documentation",
    );
  });
  it("validates every command citation independently of the guide citation", () => {
    const { benchmark, byId } = fixture();
    const instructions = guide();
    instructions.steps[0].source_ids = ["missing-step-source"];
    benchmark.attributes = { run_guide: instructions };
    expect(() => validateRunGuide(benchmark, byId)).toThrow(
      "missing-step-source",
    );
  });
  it("rejects unsupported execution claims and missing evidence locators", () => {
    const { benchmark, byId } = fixture();
    benchmark.attributes = { run_guide: { ...guide(), status: "reproduced" } };
    expect(() => validateRunGuide(benchmark, byId)).toThrow();
    const instructions = guide();
    instructions.steps[0].source_locator = "";
    benchmark.attributes = { run_guide: instructions };
    expect(() => validateRunGuide(benchmark, byId)).toThrow();
  });
});
