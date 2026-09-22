import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
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
    expect(html).toContain("submit an exported evaluation for private review");
    expect(html).toContain("sdk.py: evaluate");
  });
  it("offers every step of a recipe, including repeats of one runtime", () => {
    // A project's instructions are usually several command line steps in order.
    // Keying the picker on the runtime made all but the first unreachable.
    const { owner, source } = fixture();
    const steps = ["Generate the dataset", "Train a probe", "Evaluate"];
    owner.attributes.run_recipes = [
      {
        ...recipe(),
        instructions: steps.map((title, i) => ({
          runtime: "command_line",
          title,
          code: `python -m step_${i}`,
          status: "source_reviewed_not_executed",
          source_ids: ["source"],
          source_locator: `README.md, lines ${i + 1}-${i + 1}`,
        })),
      },
    ];
    const html = renderToStaticMarkup(
      <RunRecipes record={owner} sources={[source]} />,
    );
    for (const [i, title] of steps.entries())
      expect(html).toContain(`${i + 1}. ${title} (Command line)`);
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

describe("recipes quoted from each project's own instructions", () => {
  const overlays: {
    id: string;
    source_ids?: string[];
    run_recipes?: {
      id: string;
      instructions: {
        code: string;
        status: string;
        source_ids: string[];
        source_locator: string;
      }[];
    }[];
  }[] = JSON.parse(
    readFileSync("data/omics/reviewed/run-recipes/overlays.json", "utf8"),
  );
  const sources = new Map(
    readFileSync("data/omics/reviewed/run-recipes/records.jsonl", "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .map((r) => [r.id, r]),
  );
  const generated = overlays.filter((overlay) =>
    overlay.run_recipes?.some(
      (recipe) =>
        recipe.id.endsWith("-official") || recipe.id.endsWith("-rewirebench"),
    ),
  );
  const quoted = generated.map((overlay) => ({
    ...overlay,
    run_recipes: overlay.run_recipes!.filter(
      (recipe) =>
        recipe.id.endsWith("-official") || recipe.id.endsWith("-rewirebench"),
    ),
  }));

  it("covers the benchmarks whose projects publish commands", () => {
    expect(quoted.length).toBeGreaterThanOrEqual(14);
  });

  it("offers the runner's own recipe where rewirebench implements the scoring", () => {
    const runner = quoted.filter((overlay) =>
      overlay.run_recipes!.some((recipe) => recipe.id.endsWith("-rewirebench")),
    );
    expect(runner.map((overlay) => overlay.id).sort()).toEqual([
      "discovery-benchmark-genomic-benchmarks",
      "discovery-benchmark-tdc-molecular-tasks",
    ]);
    for (const overlay of runner) expect(overlay.run_recipes).toHaveLength(2);
  });

  it("pins every quoted instruction to a line range in a hashed file", () => {
    for (const overlay of quoted)
      for (const recipe of overlay.run_recipes!)
        for (const instruction of recipe.instructions) {
          expect(instruction.status).toBe("source_reviewed_not_executed");
          // Either the project's own README or the runner's own docs, always
          // a named file at a pinned commit and an exact line range.
          expect(instruction.source_locator).toMatch(
            /^(README\.md|docs\/[\w.-]+\.md) at [0-9a-f]{8}, .+, lines \d+-\d+$/,
          );
          for (const id of instruction.source_ids) {
            const source = sources.get(id);
            expect(source, `${overlay.id} cites ${id}`).toBeDefined();
            expect(String(source.attributes.artifact_sha256)).toMatch(
              /^[a-f0-9]{64}$/,
            );
          }
          // A quote is code, not the prose around it.
          expect(instruction.code).not.toMatch(/^\s*(```|~~~)/m);
          expect(instruction.code.trim().length).toBeGreaterThan(0);
        }
  });

  it("says plainly that nothing here was executed", () => {
    for (const overlay of quoted)
      for (const recipe of overlay.run_recipes!)
        expect(
          (recipe as unknown as { limitations: string[] }).limitations.join(
            " ",
          ),
        ).toMatch(/not executed by (rewire|this repository)/);
  });
});
