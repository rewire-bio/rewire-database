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
import { runRecipeSchema } from "@/services/omics/src/run-recipe";
import { recordHref, type OmicsRecord } from "@/lib/omics";
import { Evidence } from "./Profile";
import styles from "@/app/database/database.module.css";

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
  const [step, setStep] = useState(0);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const apply = () => {
      const id = new URLSearchParams(window.location.search).get("recipe");
      const index = recipes.findIndex((recipe) => recipe.id === id);
      setRecipeIndex(index < 0 ? 0 : index);
      setStep(0);
      setMessage("");
    };
    apply();
    window.addEventListener("popstate", apply);
    return () => window.removeEventListener("popstate", apply);
  }, [recipes]);
  const recipe = recipes[recipeIndex];
  const instructions = recipe?.instructions || [];
  // Selected by position, not by runtime: a recipe can have several steps that
  // run the same way, and keying on the runtime hides all but the first.
  const selected = instructions[step] || instructions[0];
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
                  const url = new URL(window.location.href);
                  url.searchParams.set("recipe", recipes[index].id);
                  window.history.replaceState(window.history.state, "", url);
                  setStep(0);
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
          <label className={styles.label}>
            Step
            <select
              value={String(instructions.indexOf(selected))}
              onChange={(e) => {
                setStep(Number(e.target.value));
                setMessage("");
              }}
            >
              {instructions.map((i, index) => (
                <option key={`${index}-${i.title}`} value={String(index)}>
                  {index + 1}. {i.title} ({runtimeLabel(i.runtime)})
                </option>
              ))}
            </select>
          </label>
          <h3>{selected.title}</h3>
          <p className={styles.muted}>
            {selected.status === "source_reviewed_not_executed"
              ? "Source reviewed; these instructions have not been executed by rewire."
              : selected.status === "smoke_tested"
                ? "A small smoke test passed. This is not a full benchmark run."
                : "Execution checked for the scope in the validation receipt."}
          </p>
          {selected.validation_receipt && (
            <div>
              <p>
                Validation scope:{" "}
                {selected.validation_receipt.scope.replace(/_/g, " ")} ·{" "}
                {selected.validation_receipt.platform}
              </p>
              <Evidence
                ids={[selected.validation_receipt.source_id]}
                locator={selected.validation_receipt.source_locator}
                sources={sources}
              />
            </div>
          )}
          <button
            type="button"
            className={styles.runCopy}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(selected.code);
                setMessage("Instructions copied.");
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
            aria-label={`${selected.title} instructions`}
          >
            <code>{selected.code}</code>
          </pre>
          <p role="status" aria-live="polite">
            {message}
          </p>
          <Evidence
            ids={selected.source_ids}
            locator={selected.source_locator}
            sources={sources}
          />
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
            library can prepare a private submission; production submissions
            remain disabled until verified email delivery is enabled.
          </p>
        </>
      )}
    </section>
  );
}
