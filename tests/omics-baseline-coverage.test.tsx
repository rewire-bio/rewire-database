import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import BaselineCoverage from "../components/catalogue/BaselineCoverage";
import { buildBaselineAudit, candidateRule } from "../lib/baseline-coverage";
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
  it("renders measured links and explicit gaps with release-pinned downloads", () => {
    const fixture = baselineFixture();
    const html = renderToStaticMarkup(
      <BaselineCoverage
        record={fixture.protocol}
        catalogue={fixture.snapshot}
      />,
    );
    expect(html).toContain("1 of 2 active baseline roles");
    expect(html).toContain("Proposed control: requires review");
    expect(html).toContain(`/database/evaluation/${fixture.evaluation.id}`);
    expect(html).toContain(
      "/omics/baseline-coverage/2026-09-20-b2596bdf5206/protocol-baselines.csv",
    );
  });
  it("separates recipes and author evidence from Rewire measured roles", () => {
    const fixture = baselineFixture();
    fixture.protocol.attributes.run_recipes = [{ id: "example-recipe" }];
    const author = record("author-eval", "evaluation", { origin: "author_reported" });
    author.links = [{ relation: "protocol", target_id: fixture.protocol.id }];
    const score = record("author-score", "result");
    score.links = [{ relation: "evaluation", target_id: author.id }];
    fixture.snapshot.records.push(author, score);
    const audit = buildBaselineAudit(fixture.snapshot);
    expect(audit.counts.measured_roles).toBe(1);
    expect(audit.protocols[0].recipe_ids).toEqual(["example-recipe"]);
    expect(audit.protocols[0].published_evaluations_by_origin.author_reported).toEqual(["author-eval"]);
    const html = renderToStaticMarkup(<BaselineCoverage record={fixture.protocol} catalogue={fixture.snapshot} />);
    expect(html).toContain("Author-reported evaluations");
    expect(html).toContain("Published Rewire evaluations");
    expect(html).toContain("Recipe availability does not establish a completed evaluation");
  });
  it("renders an explicit empty suite instead of implying suite-wide baseline coverage", () => {
    const suite = record("empty-suite", "benchmark");
    const html = renderToStaticMarkup(<BaselineCoverage record={suite} catalogue={catalogue([suite])} />);
    expect(html).toContain("No concrete protocols are explicitly linked");
    expect(html).not.toContain("roles have published");
  });

});
