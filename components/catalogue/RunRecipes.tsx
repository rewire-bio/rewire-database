"use client";
import { Fragment, useState, useMemo, useEffect } from "react";

const runtimeLabel = (runtime: string) =>
  ({
    python: "Python",
    command_line: "Command line",
    podman: "Podman",
    apptainer: "Apptainer",
    slurm: "Slurm",
  })[runtime] || runtime;
import Link from "next/link";
import {
  runRecipeSchema,
  type RunRecipe,
} from "@/services/omics/src/run-recipe";
import { recordHref, type OmicsRecord } from "@/lib/omics";
import { Evidence } from "./Profile";
import styles from "@/app/database/database.module.css";
import guideStyles from "./ExecutionGuide.module.css";

// These released runner recipes provide equivalent entry points for each
// runtime. Official instructions can mix shell installation and Python steps,
// so runtime alone is not evidence that instructions are alternatives.
const alternativeRuntimeRecipes = new Set([
  "mfass-v2-rescore",
  "mfass-v2-baseline",
  "mfass-v2-dnabert2",
  "proteingym-v1-3-rescore",
  "proteingym-v1-3-esm2",
  "dart-task1-runner-rescore-v1",
  "flip2-runner-rescore-v1",
  "flip2-runner-control-v1",
  "mrnabench-sample-runner-rescore-v1",
  "mrnabench-sample-runner-control-v1",
]);

export function recipeRuntimeChoices(recipe: RunRecipe | undefined) {
  if (!recipe || !alternativeRuntimeRecipes.has(recipe.id)) return [];
  return [
    ...new Set(recipe.instructions.map((instruction) => instruction.runtime)),
  ];
}

export function resolveRecipeRuntime(
  recipe: RunRecipe | undefined,
  requested: string | null,
) {
  const choices = recipeRuntimeChoices(recipe);
  return choices.find((choice) => choice === requested) || choices[0] || "";
}

export default function RunRecipes({
  record,
  sources,
  protocols = [],
}: {
  record: OmicsRecord;
  sources: OmicsRecord[];
  protocols?: OmicsRecord[];
}) {
  const recipes = useMemo(
    () =>
      Array.isArray(record.attributes.run_recipes)
        ? record.attributes.run_recipes.flatMap((value) => {
            const parsed = runRecipeSchema.safeParse(value);
            return parsed.success ? [parsed.data] : [];
          })
        : [],
    [record.attributes.run_recipes],
  );
  const [recipeIndex, setRecipeIndex] = useState(0);
  const [runtime, setRuntime] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    const apply = () => {
      const params = new URLSearchParams(window.location.search);
      const id = params.get("recipe");
      const index = recipes.findIndex((recipe) => recipe.id === id);
      const selectedIndex = index < 0 ? 0 : index;
      setRecipeIndex(selectedIndex);
      setRuntime(
        resolveRecipeRuntime(
          recipes[selectedIndex],
          params.get("recipe_runtime"),
        ),
      );
      setMessage("");
    };
    apply();
    window.addEventListener("popstate", apply);
    return () => window.removeEventListener("popstate", apply);
  }, [recipes]);
  const recipe = recipes[recipeIndex];
  const runtimeChoices = recipeRuntimeChoices(recipe);
  const selectedRuntime = resolveRecipeRuntime(recipe, runtime);
  const instructions = (recipe?.instructions || []).filter(
    (instruction) =>
      !runtimeChoices.length || instruction.runtime === selectedRuntime,
  );
  if (!recipe && !protocols.length) return null;
  return (
    <section
      id="run-recipes"
      className={`${styles.section} ${styles.runGuide}`}
      aria-labelledby="recipes-title"
    >
      {recipe && <span id="run" />}
      <h2 id="recipes-title">Run this benchmark</h2>
      {protocols.length > 0 && (
        <>
          <p>
            Choose a concrete protocol before running an evaluation. Its inputs,
            split and scoring rules determine which results can be compared.
          </p>
          <ul className={styles.list}>
            {protocols.map((protocol) => (
              <li key={protocol.id}>
                <Link
                  href={`${recordHref(protocol)}#${protocol.attributes.run_recipes ? "run-recipes" : "run"}`}
                >
                  {protocol.name}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
      {recipe && (
        <>
          {recipes.length > 1 && (
            <label className={styles.label}>
              Evaluation recipe
              <select
                value={recipeIndex}
                onChange={(e) => {
                  const index = Number(e.target.value);
                  setRecipeIndex(index);
                  const nextRuntime = resolveRecipeRuntime(
                    recipes[index],
                    runtime,
                  );
                  setRuntime(nextRuntime);
                  const url = new URL(window.location.href);
                  url.searchParams.set("recipe", recipes[index].id);
                  if (nextRuntime)
                    url.searchParams.set("recipe_runtime", nextRuntime);
                  else url.searchParams.delete("recipe_runtime");
                  window.history.pushState(window.history.state, "", url);
                  setMessage("");
                }}
              >
                {recipes.map((r, i) => (
                  <option key={r.id} value={i}>
                    {r.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          <h3>{recipe.title}</h3>
          <p>{recipe.summary}</p>
          <p className={styles.muted}>
            {recipe.purpose === "rescore_predictions"
              ? "Recompute metrics from supplied predictions."
              : "Generate predictions and evaluate them."}{" "}
            This recipe does not establish reproduction of a particular
            published score.
          </p>
          <dl className={styles.details}>
            {Object.entries(recipe.requirements).map(([key, value]) => (
              <Fragment key={key}>
                <dt>
                  {
                    (
                      {
                        data: "Dataset access",
                        weights: "Model and weights",
                        licence: "Licences",
                        software: "Software",
                        hardware: "Hardware",
                      } as Record<string, string>
                    )[key]
                  }
                </dt>
                <dd>{value}</dd>
              </Fragment>
            ))}
          </dl>
          <details>
            <summary>Required inputs and expected outputs</summary>
            <h4>Inputs</h4>
            <ul>
              {recipe.inputs.map((v) => (
                <li key={v}>{v}</li>
              ))}
            </ul>
            <h4>Outputs</h4>
            <ul>
              {recipe.outputs.map((v) => (
                <li key={v}>{v}</li>
              ))}
            </ul>
          </details>
          {runtimeChoices.length > 1 && (
            <div>
              <p>
                Choose one way to run this recipe. These instruction formats are
                alternatives.
              </p>
              <label className={styles.label}>
                Instruction format
                <select
                  value={selectedRuntime}
                  onChange={(event) => {
                    setRuntime(event.target.value);
                    setMessage("");
                    const url = new URL(window.location.href);
                    url.searchParams.set("recipe", recipe.id);
                    url.searchParams.set("recipe_runtime", event.target.value);
                    window.history.pushState(window.history.state, "", url);
                  }}
                >
                  {runtimeChoices.map((choice) => (
                    <option key={choice} value={choice}>
                      {runtimeLabel(choice)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <h3>Execution steps</h3>
          <ol className={guideStyles.steps} aria-label="Execution steps">
            {instructions.map((instruction, index) => (
              <li key={`${recipe.id}-${index}`} className={guideStyles.step}>
                <h4>{`${index + 1}. ${instruction.title} (${runtimeLabel(instruction.runtime)})`}</h4>
                <p className={styles.muted}>
                  {instruction.status === "source_reviewed_not_executed"
                    ? "Source reviewed; these instructions have not been executed by rewire."
                    : instruction.status === "smoke_tested"
                      ? "A small smoke test passed. This is not a full benchmark run."
                      : "Execution checked for the scope in the validation receipt."}
                </p>
                {instruction.validation_receipt && (
                  <div>
                    <p>
                      Validation scope:{" "}
                      {instruction.validation_receipt.scope.replace(/_/g, " ")}
                      {" · "}
                      {instruction.validation_receipt.platform}
                    </p>
                    <Evidence
                      ids={[instruction.validation_receipt.source_id]}
                      locator={instruction.validation_receipt.source_locator}
                      sources={sources}
                    />
                  </div>
                )}
                <button
                  type="button"
                  className={styles.runCopy}
                  aria-label={`Copy instructions: ${instruction.title}`}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(instruction.code);
                      setMessage(`${instruction.title}: instructions copied.`);
                    } catch {
                      setMessage(
                        "Copy unavailable. Select the instructions below to copy them.",
                      );
                    }
                  }}
                >
                  Copy instructions
                </button>
                <pre
                  className={styles.runCode}
                  tabIndex={0}
                  aria-label={`${instruction.title} instructions`}
                >
                  <code>{instruction.code}</code>
                </pre>
                <Evidence
                  ids={instruction.source_ids}
                  locator={instruction.source_locator}
                  sources={sources}
                />
              </li>
            ))}
          </ol>
          <p role="status" aria-live="polite">
            {message}
          </p>
          <details>
            <summary>Use your own model</summary>
            <p>
              Run your model locally and return predictions keyed by the input
              IDs. The evaluator supplies biological inputs without test labels
              and owns scoring. This interface is not a sandbox for model code.
            </p>
            {recipe.protocol_id === "mfass-v2-frozen-encoder" ? (
              <>
                <p>
                  Implement <code>embed(inputs)</code> and return a mapping from
                  each ID to{" "}
                  <code>{'{"reference": vector, "mutant": vector}'}</code>. The
                  evaluator fits the fixed head using training rows only.
                </p>
              </>
            ) : (
              <>
                <p>
                  Pass your existing prediction function into this adapter. Its
                  output direction must match the selected protocol.
                </p>
                <pre className={styles.runCode} tabIndex={0}>
                  <code>{`class MyModelAdapter:
    def __init__(self, score):
        self.score = score

    def predict(self, inputs):
        return {row["id"]: float(self.score(row)) for row in inputs}

# adapter = MyModelAdapter(your_prediction_function)
# report = rewirebench.run(prepared, adapter, output="runs/my-model")`}</code>
                </pre>
              </>
            )}
            <p>
              Alternatively, generate a keyed prediction file in your existing
              model environment and use the score-only recipe. Your model code
              and weights do not need to be shared.
            </p>
            <Evidence
              ids={recipe.source_ids}
              locator={recipe.source_locator}
              sources={sources}
            />
          </details>
          <details>
            <summary>Scope and limitations</summary>
            <ul>
              {recipe.limitations.map((v) => (
                <li key={v}>{v}</li>
              ))}
            </ul>
          </details>
          <p>
            <Link href="/contribute/">Contribute a result for review</Link>. The
            library can submit an exported evaluation for private review when
            intake is open. Check the contribution page for access and sign-in.
          </p>
        </>
      )}
    </section>
  );
}
