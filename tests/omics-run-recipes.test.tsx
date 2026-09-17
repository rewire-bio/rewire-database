import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import RunRecipes from "../components/catalogue/RunRecipes";
import Reproduction from "../components/catalogue/Reproduction";
import {
  validateRunRecipes,
  runRecipeSchema,
} from "../services/omics/src/run-recipe";
import type { OmicsRecord } from "../lib/omics";
const record = (
  id: string,
  kind: OmicsRecord["kind"],
  attributes: Record<string, unknown> = {},
): OmicsRecord => ({
  id,
  kind,
  name: id,
  description: "Explanation",
  status: "source_checked",
  source_ids: ["source"],
  links: [],
  facets: {},
  attributes,
});
const recipe = () => ({
  id: "local-scoring",
  protocol_id: "mfass-v2",
  version: "0.2.0",
  title: "MFASS scoring",
  purpose: "rescore_predictions",
  summary: "Score held-out variants under the canonical split.",
  inputs: ["Keyed predictions"],
  outputs: ["Metrics and coverage"],
  requirements: {
    data: "Obtain the original assay cohort",
    weights: "None for rescoring",
    licence: "Source terms unreported",
    software: "Python",
    hardware: "CPU; memory not measured",
  },
  instructions: [
    {
      runtime: "python",
      title: "Score predictions",
      code: "report = rewirebench.evaluate(prepared, predictions, output='run')",
      status: "source_reviewed_not_executed",
      source_ids: ["source"],
      source_locator: "sdk.py: evaluate",
    },
  ],
  limitations: ["This does not generate predictions."],
  source_ids: ["source"],
  source_locator: "sdk.py",
});
const fixture = () => {
  const source = record("source", "source", {
    artifact_sha256: "a".repeat(64),
    url: "https://example.org/pinned.py",
  });
  const owner = record("protocol", "protocol", { run_recipes: [recipe()] });
  const evaluation = record("evaluation", "evaluation", {
    reproduction: {
      recipe_owner_id: owner.id,
      recipe_id: "local-scoring",
      applicability: "rescore_predictions",
      explanation: "Exact scoring protocol only; model inference is separate.",
      source_ids: [source.id],
      source_locator: "Methods",
    },
  });
  evaluation.links = [{ relation: "protocol", target_id: owner.id }];
  return {
    source,
    owner,
    evaluation,
    byId: new Map([source, owner, evaluation].map((r) => [r.id, r])),
  };
};
describe("reviewed local execution recipes", () => {
  it("renders runtime instructions, access requirements and explicit execution limits", () => {
    const { owner, source } = fixture();
    const html = renderToStaticMarkup(
      <RunRecipes record={owner} sources={[source]} />,
    );
    expect(html).toContain("Run this benchmark");
    expect(html).toContain("Dataset access");
    expect(html).toContain("Copy instructions");
    expect(html).toContain("not been executed");
    expect(html).toContain("production submissions remain disabled");
    expect(html).toContain("sdk.py: evaluate");
  });
  it("allows precise evaluation links without inferring score reproduction", () => {
    const { owner, evaluation, source, byId } = fixture();
    expect(() => validateRunRecipes(owner, byId)).not.toThrow();
    expect(() => validateRunRecipes(evaluation, byId)).not.toThrow();
    const html = renderToStaticMarkup(
      <Reproduction
        evaluation={evaluation}
        records={[owner, evaluation, source]}
      />,
    );
    expect(html).toContain("Recompute metrics from existing predictions");
    expect(html).toContain("?recipe=local-scoring#run-recipes");
    expect(html).toContain("does not establish score reproduction");
  });
  it("shows an explicit gap instead of borrowing a similarly named recipe", () => {
    const { evaluation, owner, source } = fixture();
    delete evaluation.attributes.reproduction;
    const html = renderToStaticMarkup(
      <Reproduction evaluation={evaluation} records={[owner, source]} />,
    );
    expect(html).toContain(
      "No execution recipe has been verified for this exact configuration",
    );
    expect(html).not.toContain("Recompute metrics from existing predictions");
  });
  it("rejects unpinned evidence, unrelated designs, wrong purposes and unsupported execution claims", () => {
    const { source, owner, evaluation, byId } = fixture();
    source.attributes.artifact_sha256 = "unknown";
    expect(() => validateRunRecipes(owner, byId)).toThrow(
      "Unpinned recipe evidence",
    );
    source.attributes.artifact_sha256 = "a".repeat(64);
    evaluation.links = [];
    expect(() => validateRunRecipes(evaluation, byId)).toThrow("exact design");
    evaluation.links = [{ relation: "protocol", target_id: owner.id }];
    (
      evaluation.attributes.reproduction as Record<string, unknown>
    ).applicability = "generate_and_evaluate";
    expect(() => validateRunRecipes(evaluation, byId)).toThrow("incompatible");
    const untested = recipe();
    untested.instructions[0].status = "executed";
    expect(runRecipeSchema.safeParse(untested).success).toBe(false);
  });
});
