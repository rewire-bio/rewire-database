import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import RunRecipes from "../components/catalogue/RunRecipes";
import Reproduction from "../components/catalogue/Reproduction";
import BenchmarkResearch from "../components/catalogue/BenchmarkResearch";
import type { OmicsRecord } from "../lib/omics";

const record = (
  id: string,
  kind: OmicsRecord["kind"],
  attributes = {},
): OmicsRecord => ({
  id,
  kind,
  name: id,
  description: "Repeated evaluation summary",
  status: "source_checked",
  source_ids: [],
  links: [],
  facets: {},
  attributes,
});

describe("execution and evidence hierarchy", () => {
  it("shows every ordered command and its own validation scope before the command", () => {
    const instructions = ["Install", "Prepare", "Evaluate"].map(
      (title, index) => ({
        runtime: "command_line",
        title,
        code: `command_${index}`,
        status: "source_reviewed_not_executed",
        source_ids: ["source"],
        source_locator: `Step ${index}`,
      }),
    );
    const owner = record("protocol", "protocol", {
      run_recipes: [
        {
          id: "pinned",
          protocol_id: "protocol",
          version: "1.0",
          title: "Score predictions",
          purpose: "rescore_predictions",
          summary: "Score the held-out set.",
          requirements: {
            data: "Approved cohort",
            weights: "Not required",
            licence: "Source terms",
            software: "Python",
            hardware: "CPU",
          },
          inputs: ["Predictions"],
          outputs: ["Metrics"],
          instructions,
          limitations: ["Inference is separate."],
          source_ids: ["source"],
          source_locator: "README",
        },
      ],
    });
    const html = renderToStaticMarkup(
      <RunRecipes record={owner} sources={[]} />,
    );
    expect(html).toContain("<ol");
    expect(html).toContain('aria-label="Execution steps"');
    expect(html).not.toContain("<select");
    expect(html.indexOf("Approved cohort")).toBeLessThan(
      html.indexOf("command_0"),
    );
    for (let i = 0; i < instructions.length; i++) {
      const command = html.indexOf(`command_${i}`);
      expect(command).toBeGreaterThan(0);
      expect(html.lastIndexOf("not been executed", command)).toBeGreaterThan(
        html.indexOf(`${i + 1}. ${instructions[i].title}`),
      );
      if (i > 0)
        expect(command).toBeGreaterThan(html.indexOf(`command_${i - 1}`));
    }
    expect(html).toContain("does not establish reproduction of a particular");
  });

  it("compact reproduction preserves scoring context without repeating the finding", () => {
    const model = record("exact-model", "model");
    const evaluation = record("evaluation", "evaluation", {
      comparison: {
        split: "held-out donors",
        adaptation: "frozen encoder",
        metric_implementation: "pinned scorer",
      },
    });
    evaluation.links = [{ relation: "model", target_id: model.id }];
    const html = renderToStaticMarkup(
      <Reproduction evaluation={evaluation} records={[model]} compact />,
    );
    expect(html).not.toContain("Repeated evaluation summary");
    expect(html).not.toContain("exact-model");
    expect(html).toContain("held-out donors");
    expect(html).toContain("frozen encoder");
    expect(html).toContain("pinned scorer");
    expect(html).toContain("No execution recipe has been verified");
  });

  it("keeps dated gaps collapsed and distinguishes them from present coverage", () => {
    const html = renderToStaticMarkup(
      <BenchmarkResearch
        sources={[]}
        results={12}
        research={{
          review_date: "2026-09-19",
          claim_scope: "Source inspection only.",
          primary_sources: [],
          gaps: ["Result extraction pending."],
          searched_queries: [],
          inspected_locators: [],
          status: "papers_reviewed",
        }}
      />,
    );
    expect(html).toContain(
      "<details><summary>Historical gaps recorded on 2026-09-19</summary>",
    );
    expect(html).toContain("catalogue now holds 12 result rows");
    expect(html).toContain("Result extraction pending.");
    expect(html).not.toContain("<details open");
  });
});

describe("runtime alternatives and sequential mixed-language recipes", () => {
  function fixture(id: string) {
    return {
      id,
      protocol_id: "protocol",
      version: "1.0",
      title: "Local scoring",
      purpose: "rescore_predictions" as const,
      summary: "Score supplied predictions.",
      inputs: ["Predictions"],
      outputs: ["Metrics"],
      requirements: {
        data: "Prepared",
        weights: "None",
        licence: "Source terms",
        software: "Python",
        hardware: "CPU",
      },
      instructions: [
        {
          runtime: "python" as const,
          title: "Prepare",
          code: "prepare_python()",
        },
        {
          runtime: "python" as const,
          title: "Evaluate",
          code: "evaluate_python()",
        },
        {
          runtime: "command_line" as const,
          title: "Prepare and evaluate",
          code: "rewirebench evaluate",
        },
      ].map((instruction) => ({
        ...instruction,
        status: "source_reviewed_not_executed" as const,
        source_ids: ["source"],
        source_locator: "SDK",
      })),
      limitations: ["Not independently reproduced."],
      source_ids: ["source"],
      source_locator: "SDK",
    };
  }

  it("renders one runner format with all steps in that format, not four sequential alternatives", async () => {
    const { recipeRuntimeChoices, resolveRecipeRuntime } =
      await import("../components/catalogue/RunRecipes");
    const recipe = fixture("mfass-v2-rescore");
    const html = renderToStaticMarkup(
      <RunRecipes
        record={record("protocol", "protocol", { run_recipes: [recipe] })}
        sources={[]}
      />,
    );
    expect(html).toContain("instruction formats are alternatives");
    expect(html).toContain("prepare_python()");
    expect(html).toContain("evaluate_python()");
    expect(html).not.toContain("<code>rewirebench evaluate</code>");
    expect(recipeRuntimeChoices(recipe)).toEqual(["python", "command_line"]);
    expect(resolveRecipeRuntime(recipe, "command_line")).toBe("command_line");
    expect(resolveRecipeRuntime(recipe, "stale-runtime")).toBe("python");
    expect(resolveRecipeRuntime(recipe, null)).toBe("python");
  });

  it("keeps official shell and Python steps together and clears an inapplicable runtime selection", async () => {
    const { recipeRuntimeChoices, resolveRecipeRuntime } =
      await import("../components/catalogue/RunRecipes");
    const recipe = fixture("atom3d-official");
    const html = renderToStaticMarkup(
      <RunRecipes
        record={record("protocol", "protocol", { run_recipes: [recipe] })}
        sources={[]}
      />,
    );
    expect(html).not.toContain("<select");
    expect(html).toContain("prepare_python()");
    expect(html).toContain("evaluate_python()");
    expect(html).toContain("<code>rewirebench evaluate</code>");
    expect(recipeRuntimeChoices(recipe)).toEqual([]);
    expect(resolveRecipeRuntime(recipe, "command_line")).toBe("");
  });
});
