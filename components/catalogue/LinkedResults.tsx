import Link from "next/link";
import { catalogueText } from "@/lib/catalogue-text";
import { recordHref, type OmicsRecord } from "@/lib/omics";
import { countLabel, kindLabels, singularKindLabels } from "@/lib/omics-browse";
import type { linkedResultRecords } from "@/lib/entity-detail";
import styles from "@/app/database/database.module.css";

type Linked = ReturnType<typeof linkedResultRecords>;

const relationText: Record<string, string> = {
  configuration_of: "configuration",
  variant_of: "version",
  family: "family member",
  alias_of: "alias",
  uses_model: "uses this model",
  evaluates_task: "evaluates this task",
  implemented_by: "implementation",
};

/** "3 configurations" when the linked records share a kind, else "3 linked records". */
export function linkedCount(linked: Linked): string {
  const kinds = [...new Set(linked.items.map((item) => item.record.kind))];
  return kinds.length === 1
    ? countLabel(linked.items.length, singularKindLabels[kinds[0]].toLowerCase(), kindLabels[kinds[0]].toLowerCase())
    : countLabel(linked.items.length, "linked record");
}

/** The records holding results for a parent with none of its own. Their
 * results are not assigned to the parent, so each links to its own table. */
export default function LinkedResults({
  record,
  linked,
  alongside = false,
}: {
  record: OmicsRecord;
  linked: Linked;
  /** The record has results of its own; these linked records hold further results not counted in them. */
  alongside?: boolean;
}) {
  const kind = singularKindLabels[record.kind].toLowerCase();
  const holders = linked.items.length === 1 ? "One linked record has" : `${linked.items.length} linked records have`;
  return (
    <section id={alongside ? "linked-results" : "results"} className={styles.section}>
      <h2>{alongside ? "Further results on linked records" : "Results on linked records"}</h2>
      {alongside ? (
        <p>
          {holders} results that are not included above, because no reviewed claim yet ties the link to this {kind}.
          Each record keeps its own settings and evaluations, and its scores are on its own page.
        </p>
      ) : (
        <p>
          This {kind} has no results of its own in this release.{" "}
          {holders}{" "}
          results. They are not assigned to the underlying {kind}: each record keeps its own settings and evaluations, and its scores are on its own page.
        </p>
      )}
      <ul className={styles.configurationList}>
        {linked.items.map((item) => (
          <li key={item.record.id}>
            <Link href={`${recordHref(item.record)}#results`}>{catalogueText(item.record.name)}</Link>{" "}
            <span>
              {singularKindLabels[item.record.kind]} · {item.relation === "part_of" ? `part of this ${kind}` : relationText[item.relation] || item.relation.replace(/_/g, " ")} ·{" "}
              {countLabel(item.evaluations, "evaluation")} · {countLabel(item.results, "result")}
            </span>
          </li>
        ))}
      </ul>
      {linked.unchecked > 0 && (
        <p className={styles.muted}>
          {countLabel(linked.unchecked, "further linked record")} {linked.unchecked === 1 ? "is" : "are"} listed under Related records.
        </p>
      )}
    </section>
  );
}
