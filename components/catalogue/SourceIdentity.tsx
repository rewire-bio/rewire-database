import Link from "next/link";
import { catalogueText } from "@/lib/catalogue-text";
import { recordHref, type OmicsRecord } from "@/lib/omics";
import {
  sourceLabel,
  subjectIdentitySchema,
  linkedIdentitySchema,
} from "@/shared/omics/source-identity";
import { Evidence } from "./Profile";
import styles from "@/app/database/database.module.css";

/** Printed citation label shown beside a readable name in result rows. */
export function CitedAs({ record }: { record: OmicsRecord }) {
  const label = sourceLabel(record);
  if (!label || record.name.includes(label)) return null;
  return <span className={styles.muted}> (cited as {catalogueText(label)})</span>;
}

/** Explains a display name that replaced a citation printed by the source. */
export default function SourceIdentityNotice({
  record,
  sources,
  subject,
}: {
  record: OmicsRecord;
  sources: OmicsRecord[];
  subject?: OmicsRecord;
}) {
  const label = sourceLabel(record);
  if (!label) return null;
  const own = subjectIdentitySchema.safeParse(record.attributes.source_identity);
  if (!own.success) {
    const linked = linkedIdentitySchema.safeParse(record.attributes.source_identity);
    if (!linked.success) return null;
    return (
      <p className={styles.notice} data-source-identity={linked.data.status}>
        {linked.data.status === "resolved"
          ? `The source table prints the tested method as ${label}. `
          : `The source table cites ${label}, and the method it refers to is unresolved. `}
        {subject ? (
          <Link href={recordHref(subject)}>
            Evidence for this identity: {catalogueText(subject.name)}
          </Link>
        ) : null}
      </p>
    );
  }
  const identity = own.data;
  return (
    <aside className={styles.notice} data-source-identity={identity.status}>
      <p>
        {identity.status === "resolved"
          ? `Identified as ${identity.identity}. The source table prints ${label}.`
          : `Method unresolved. The source table prints ${label}, and the sources do not establish which method it refers to.`}
      </p>
      {identity.configuration && <p>Configuration: {identity.configuration}</p>}
      <p>{identity.basis}</p>
      {identity.known_details.length > 0 && (
        <ul>
          {identity.known_details.map((item) => (
            <li key={item.label}>
              {item.label}: {item.value}
            </li>
          ))}
        </ul>
      )}
      <p>
        Not established:{" "}
        {identity.unknown.map((item) => `${item.label}. ${item.note}`).join(" ")}
      </p>
      <p className={styles.muted}>
        <Evidence
          ids={identity.source_ids}
          locator={identity.source_locator}
          sources={sources}
        />
        . AI-assisted source review on {identity.review.date}; no human
        scientific review.
      </p>
    </aside>
  );
}
