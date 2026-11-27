import Link from "next/link";
import { catalogueText } from "@/lib/catalogue-text";
import { recordHref, type OmicsRecord } from "@/lib/omics";
import { countLabel, kindLabels, singularKindLabels } from "@/lib/omics-browse";
import type { linkedResultRecords } from "@/lib/entity-detail";
import styles from "@/app/database/database.module.css";

type Linked = ReturnType<typeof linkedResultRecords>;
type Item = Linked["items"][number];

/** "3 configurations" when the entries share a kind, else "3 related entries". */
export function linkedCount(linked: Linked): string {
  const kinds = [...new Set(linked.items.map((item) => item.record.kind))];
  return kinds.length === 1
    ? countLabel(linked.items.length, singularKindLabels[kinds[0]].toLowerCase(), kindLabels[kinds[0]].toLowerCase())
    : countLabel(linked.items.length, "related entry", "related entries");
}

const plural = (count: number, one: string, many = `${one}s`) => (count === 1 ? one : many);

/** How a group of entries relates to the page's subject, in a visitor's words. `noun` is
 * what one entry is called; null means the entries' own kind, such as "protocol". */
const relations: Record<
  string,
  { noun: [string, string] | null; heading: (things: string, name: string, count: number) => string; label: (kind: string) => string }
> = {
  configuration_of: { noun: ["configuration", "configurations"], heading: (t, n) => `Results for ${t} of ${n}`, label: () => "Configurations" },
  variant_of: { noun: ["version", "versions"], heading: (t, n) => `Results for ${t} of ${n}`, label: () => "Versions" },
  family: { noun: ["model", "models"], heading: (t, n) => `Results for ${t} in the ${n} family`, label: () => "Models in this family" },
  alias_of: { noun: ["other name", "other names"], heading: (t, n) => `Results under ${t} for ${n}`, label: (k) => `Other names for this ${k}` },
  uses_model: {
    noun: ["tool", "tools"],
    heading: (t, n, c) => `Results for ${t} that ${plural(c, "uses", "use")} ${n}`,
    label: (k) => `Tools that use this ${k}`,
  },
  part_of: { noun: null, heading: (t, n) => `Results for ${t} in ${n}`, label: (k) => `Parts of this ${k}` },
  evaluates_task: {
    noun: null,
    heading: (t, n, c) => `Results for ${t} that ${plural(c, "evaluates", "evaluate")} ${n}`,
    label: (k) => `Evaluations of this ${k}`,
  },
  implemented_by: { noun: ["implementation", "implementations"], heading: (t, n) => `Results for ${t} of ${n}`, label: () => "Implementation" },
};

function groupBy(items: Item[]) {
  const groups = new Map<string, Item[]>();
  for (const item of items) groups.set(item.relation, [...(groups.get(item.relation) ?? []), item]);
  const total = (list: Item[]) => list.reduce((sum, item) => sum + item.results, 0);
  return [...groups.entries()]
    .map(([relation, list]) => ({ relation, items: [...list].sort((a, b) => b.results - a.results) }))
    .sort((a, b) => total(b.items) - total(a.items));
}

/** What the entries in one group are called, or null when they need their kind shown. */
function groupNoun(relation: string, items: Item[]): [string, string] | null {
  const noun = relations[relation]?.noun;
  if (noun) return noun;
  const kinds = [...new Set(items.map((item) => item.record.kind))];
  return kinds.length === 1 ? [singularKindLabels[kinds[0]].toLowerCase(), kindLabels[kinds[0]].toLowerCase()] : null;
}

const needsKind = (items: Item[], noun: [string, string] | null) =>
  !noun || items.some((item) => singularKindLabels[item.record.kind].toLowerCase() !== noun[0]);

function Entries({ items, showKind }: { items: Item[]; showKind: boolean }) {
  return (
    <ul className={styles.configurationList}>
      {items.map((item) => (
        <li key={item.record.id}>
          <Link href={`${recordHref(item.record)}#results`}>{catalogueText(item.record.name)}</Link>{" "}
          <span>
            {showKind ? `${singularKindLabels[item.record.kind]} · ` : ""}
            {countLabel(item.evaluations, "evaluation")} · {countLabel(item.results, "result")}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Other entries that hold results for this model or benchmark: its configurations,
 * versions, family members, parts and uses. Their scores stay on their own pages. */
export default function LinkedResults({
  record,
  linked,
  alongside = false,
}: {
  record: OmicsRecord;
  linked: Linked;
  /** The record has results of its own; these entries hold further results not counted in them. */
  alongside?: boolean;
}) {
  const kind = singularKindLabels[record.kind].toLowerCase();
  const name = catalogueText(record.name);
  const count = linked.items.length;
  const groups = groupBy(linked.items);
  const single = groups.length === 1 ? groups[0] : null;
  const noun = single ? groupNoun(single.relation, single.items) : null;
  const things = noun ? plural(count, ...noun) : plural(count, "entry", "entries");
  const heading =
    single && noun && relations[single.relation]
      ? relations[single.relation].heading(countLabel(count, ...noun), name, count)
      : `Results for other entries related to ${name}`;
  const one = count === 1;
  return (
    <section id={alongside ? "linked-results" : "results"} className={styles.section}>
      <h2>{heading}</h2>
      <p>
        {alongside
          ? one
            ? `This ${things} has results too. We have not yet checked that they belong with the scores above, so they are kept out of that table. They are on its own page.`
            : `These ${things} have results too. We have not yet checked that they belong with the scores above, so they are kept out of that table. Each has its scores on its own page.`
          : one
            ? `This ${kind} has no results of its own. The ${things} below does. It was run with its own settings, and its scores are on its own page.`
            : `This ${kind} has no results of its own. The ${things} below do. Each was run with its own settings, and its scores are on its own page.`}
      </p>
      {single ? (
        <Entries items={single.items} showKind={needsKind(single.items, noun)} />
      ) : (
        groups.map((group) => (
          <div key={group.relation}>
            <h3>{relations[group.relation]?.label(kind) ?? group.relation.replace(/_/g, " ")}</h3>
            <Entries items={group.items} showKind={needsKind(group.items, groupNoun(group.relation, group.items))} />
          </div>
        ))
      )}
      {linked.unchecked > 0 && (
        <p className={styles.muted}>
          {countLabel(linked.unchecked, "more related entry", "more related entries")} {linked.unchecked === 1 ? "is" : "are"}{" "}
          listed without result counts under Related records at the end of this page.
        </p>
      )}
    </section>
  );
}
