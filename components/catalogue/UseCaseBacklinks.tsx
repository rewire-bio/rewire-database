import type { UseCaseLinks } from "@/lib/use-cases-client";
import type { CatalogueRecord } from "@/shared/omics/catalogue-query";
import { catalogueText } from "@/lib/catalogue-text";
import { recordHref } from "@/lib/omics";
import styles from "./UseCases.module.css";

/** Configurations named per use case; the use case page lists the rest. */
const SHOWN = 4;

/** One entry per use case, however many of its comparisons cite this record. */
export function groupUseCaseLinks(links: UseCaseLinks["items"]) {
  const groups = new Map<string, { slug: string; title: string; mapping_ids: string[]; configuration_ids: string[] }>();
  for (const link of links) {
    const group = groups.get(link.use_case_id) || { slug: link.slug, title: link.title, mapping_ids: [], configuration_ids: [] };
    group.mapping_ids.push(link.mapping_id);
    for (const id of link.configuration_ids) if (!group.configuration_ids.includes(id)) group.configuration_ids.push(id);
    groups.set(link.use_case_id, group);
  }
  return [...groups.values()];
}

export default function UseCaseBacklinks({ links, configurations }: { links: UseCaseLinks; configurations: Record<string, Pick<CatalogueRecord, "id" | "kind" | "name">> }) {
  if (!links.items.length) return null;
  return <aside className={styles.backlinks} aria-labelledby="related-use-cases">
    <h2 id="related-use-cases">Research questions informed by this evidence</h2>
    <ul>{groupUseCaseLinks(links.items).map((group) => <li key={group.slug}>
      <a href={group.mapping_ids.length === 1 ? `/use-cases/${group.slug}/#mapping-${group.mapping_ids[0]}` : `/use-cases/${group.slug}/`}>{group.title}</a>
      <small>
        {group.mapping_ids.length > 1 && <>Used in {group.mapping_ids.length} comparisons. </>}
        {group.configuration_ids.length ? <>Evidence from {group.configuration_ids.slice(0, SHOWN).map((id, index) => <span key={id}>{index > 0 && "; "}{configurations[id] ? <a href={recordHref(configurations[id])}>{catalogueText(configurations[id].name)}</a> : id}</span>)}{group.configuration_ids.length > SHOWN && ` and ${group.configuration_ids.length - SHOWN} more`}. </> : "No evaluated configuration is linked. "}
        See the use case for scope and transfer limitations.
      </small>
    </li>)}</ul>
  </aside>;
}
