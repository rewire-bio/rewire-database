import type { UseCaseLinks } from "@/lib/use-cases-client";
import type { CatalogueRecord } from "@/shared/omics/catalogue-query";
import { catalogueText } from "@/lib/catalogue-text";
import { recordHref } from "@/lib/omics";
import styles from "./UseCases.module.css";

export default function UseCaseBacklinks({ links, configurations }: { links: UseCaseLinks; configurations: Record<string, Pick<CatalogueRecord, "id" | "kind" | "name">> }) {
  if (!links.items.length) return null;
  return <aside className={styles.backlinks} aria-labelledby="related-use-cases">
    <h2 id="related-use-cases">Research questions informed by this evidence</h2>
    <ul>{links.items.map((link) => <li key={link.mapping_id}>
      <a href={`/use-cases/${link.slug}/#mapping-${link.mapping_id}`}>{link.title}</a>
      <small>{link.configuration_ids.length ? <>Evidence from {link.configuration_ids.map((id, index) => <span key={id}>{index > 0 && "; "}{configurations[id] ? <a href={recordHref(configurations[id])}>{catalogueText(configurations[id].name)}</a> : id}</span>)}. </> : "No evaluated configuration is linked. "}See the use case for scope and transfer limitations.</small>
    </li>)}</ul>
  </aside>;
}
