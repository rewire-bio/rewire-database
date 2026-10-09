import { catalogueText } from "@/lib/catalogue-text";
import { Fragment } from "react";
import Link from "next/link";
import { reproductionSchema } from "@/shared/omics/run-recipe";
import { displayValue, recordHref, type OmicsRecord } from "@/lib/omics";
import { Evidence } from "./Profile";
import styles from "@/app/database/database.module.css";

export default function Reproduction({
  evaluation,
  records,
  compact = false,
  recordById,
}: {
  evaluation?: OmicsRecord | null;
  records: OmicsRecord[];
  compact?: boolean;
  recordById?: (id: string) => OmicsRecord | null | undefined;
}) {
  if (!evaluation) return null;
  // Static record pages already have an index for this immutable catalogue.
  const byId = recordById ? undefined : new Map(records.map((r) => [r.id, r]));
  const lookup = recordById || ((id: string) => byId!.get(id));
  const context = evaluation.links.flatMap((link) => {
    const target = lookup(link.target_id);
    return target &&
      [
        "model",
        "method",
        "configuration",
        "pipeline",
        "service",
        "benchmark",
        "task",
        "protocol",
        "evaluator",
        "dataset",
        "dataset_subset",
      ].includes(link.relation)
      ? [{ ...target, role: link.relation }]
      : [];
  });
  const parsed = reproductionSchema.safeParse(
    evaluation.attributes.reproduction,
  );
  const recipeOwner = parsed.success
    ? lookup(parsed.data.recipe_owner_id)
    : undefined;
  const comparison = (evaluation.attributes.comparison || {}) as Record<
    string,
    unknown
  >;
  const designs = context.filter((r) =>
    ["assessment", "benchmark", "task", "protocol", "evaluator"].includes(r.role),
  );
  return (
    <section
      id="reproduction"
      className={styles.section}
      aria-labelledby="reproduction-title"
    >
      <h2 id="reproduction-title">
        {compact ? "Reproduction" : "Methods and reproduction"}
      </h2>
      {!compact && <p>{catalogueText(evaluation.description)}</p>}
      <dl className={styles.details}>
        {!compact &&
          context.map((record) => (
            <Fragment key={`${record.role}-${record.id}`}>
              <dt>{record.kind.replace(/_/g, " ")}</dt>
              <dd>
                <Link href={recordHref(record)}>
                  {catalogueText(record.name)}
                </Link>
              </dd>
            </Fragment>
          ))}
        <dt>Split</dt>
        <dd>{displayValue(comparison.split)}</dd>
        <dt>Adaptation</dt>
        <dd>{displayValue(comparison.adaptation)}</dd>
        <dt>Scoring implementation</dt>
        <dd>{displayValue(comparison.metric_implementation)}</dd>
      </dl>
      {parsed.success && recipeOwner ? (
        <>
          <p>
            <Link
              href={`${recordHref(recipeOwner)}?recipe=${encodeURIComponent(parsed.data.recipe_id)}#run-recipes`}
            >
              {parsed.data.applicability === "rescore_predictions"
                ? "Recompute metrics from existing predictions"
                : "Generate and evaluate predictions"}
            </Link>
          </p>
          <p>{parsed.data.explanation}</p>
          <Evidence
            ids={parsed.data.source_ids}
            locator={parsed.data.source_locator}
            sources={records.filter((r) =>
              parsed.data.source_ids.includes(r.id),
            )}
          />
        </>
      ) : (
        <p className={styles.notice}>
          No execution recipe has been verified for this exact configuration and
          evaluation. A benchmark&apos;s general instructions may use different
          inputs, splits or model settings.
        </p>
      )}
      {designs.length > 0 && (
        <ul className={styles.list}>
          {designs.map((design) => (
            <li key={design.id}>
              <Link
                href={`${recordHref(design)}#${design.attributes.run_recipes ? "run-recipes" : "run"}`}
              >
                Access requirements and official instructions:{" "}
                {catalogueText(design.name)}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className={styles.muted}>
        Reproducing this published result requires matching its model
        configuration, data, split and scorer. Source checking or a successful
        smoke test does not establish score reproduction.
      </p>
    </section>
  );
}
