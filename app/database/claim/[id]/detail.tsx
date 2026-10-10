import { downloadHref } from "@/lib/downloads";
import Breadcrumbs from "@/components/catalogue/Breadcrumbs";
import { recordBreadcrumbs } from "@/lib/catalogue-sharing";
import { catalogueText } from "@/lib/catalogue-text";
import Link from "next/link";
import { Fragment } from "react";
import { buildCatalogue } from "@/lib/catalogue-build";
import UseCaseBacklinks from "@/components/catalogue/UseCaseBacklinks";
import { recordHref, displayValue, safeSourceUrl } from "@/lib/omics";
import { EvidenceConcerns } from "@/components/catalogue/Profile";
import EvidenceTable from "@/components/catalogue/EvidenceTable";
import SourceIdentityNotice from "@/components/catalogue/SourceIdentity";
import SectionNavigation, {
  BrowseReturn,
} from "@/components/catalogue/SectionNavigation";
import { countLabel, singularKindLabels } from "@/lib/omics-browse";
import { claimFieldLabel } from "@/lib/evidence-labels";
import { loadUseCaseContext, type RecordDetail } from "@/lib/entity-detail";
import styles from "../../database.module.css";

function Fields({
  fields,
  verbatim = false,
}: {
  fields: Record<string, unknown>;
  verbatim?: boolean;
}) {
  return (
    <dl className={styles.details}>
      {Object.entries(fields).map(([key, value]) => (
        <Fragment key={key}>
          <dt>{key.replace(/_/g, " ")}</dt>
          <dd>{displayValue(value, verbatim)}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

/** A claim record: an individual evidence assertion and its citation. No
 * alias records currently route to the `claim` legacy segment (see
 * workbench/entity-page-split-checkpoint.md). */
export function ClaimDetail({ detail }: { detail: RecordDetail }) {
  const { query, catalogue } = buildCatalogue();
  const { record } = detail;
  const { useCaseLinks, useCaseConfigurations } = loadUseCaseContext(
    query,
    record,
  );
  const evidence = query.evidence({
    id: record.id,
    scope: "record_context",
    limit: 10,
  });
  const summary = catalogueText(record.description);
  const identitySubjectId = (
    record.attributes.source_identity as { subject_id?: unknown } | undefined
  )?.subject_id;
  const identitySubject =
    typeof identitySubjectId === "string"
      ? query.get({ id: identitySubjectId, include_comparisons: false })?.record
      : undefined;
  const proposals = [...detail.direct, ...detail.reverse].filter(
    (item) => item.relation === "applicable_to",
  );
  const subject = detail.direct.find((item) => item.relation === "subject")?.record;
  const field = typeof record.attributes.field === "string" ? record.attributes.field : "";
  const link = /^links:([a-z_]+):(.+)$/.exec(field);
  const target = link ? query.record(link[2]) : null;
  const value = record.attributes.value;
  const reviewed = Array.isArray(record.attributes.reviewed_evaluations)
    ? record.attributes.reviewed_evaluations.flatMap((id) => {
        const evaluation = typeof id === "string" ? query.record(id) : null;
        return evaluation ? [evaluation] : [];
      })
    : [];
  const text = (key: string) =>
    typeof record.attributes[key] === "string" ? (record.attributes[key] as string) : "";
  return (
    <>
      <header className="page-head" id="finding">
        <div className="wrap">
          <Breadcrumbs items={recordBreadcrumbs(record)} />
          <div className={styles.nav}>
            <BrowseReturn fallback={`/?kind=${record.kind}#browse`} />
          </div>
          <div>
            <div>
              <span className="kick">{singularKindLabels[record.kind]}</span>
              <h1>{catalogueText(record.name)}</h1>
              <EvidenceConcerns sources={detail.sources} />
              {link ? (
                <dl className={styles.details}>
                  <dt>{subject?.kind === "use_case" ? "Use case" : "Subject"}</dt>
                  <dd>{subject ? <Link href={recordHref(subject)}>{catalogueText(subject.name)}</Link> : "Not linked"}</dd>
                  <dt>{link[1] === "assessed_by" ? "Assessed by" : claimFieldLabel(link[1])}</dt>
                  <dd>{target ? <Link href={recordHref(target)}>{catalogueText(target.name)}</Link> : link[2]}</dd>
                  {text("relevance") && (<><dt>Relevance</dt><dd>{text("relevance") === "direct" ? "Direct evidence" : text("relevance") === "proxy" ? "Proxy evidence" : text("relevance")}</dd></>)}
                  {text("endpoint") && (<><dt>Endpoint</dt><dd>{catalogueText(text("endpoint"))}</dd></>)}
                </dl>
              ) : field && value !== undefined ? (
                <>
                  <p className={styles.muted}>
                    {claimFieldLabel(field)}
                    {subject && <> of <Link href={recordHref(subject)}>{catalogueText(subject.name)}</Link></>}
                  </p>
                  <blockquote className={styles.claimStatement}>{displayValue(value)}</blockquote>
                </>
              ) : null}
              <p className="intro">{summary}</p>
              {reviewed.length > 0 && (
                <details className={styles.profileDisclosure} open={reviewed.length <= 6}>
                  <summary>{countLabel(reviewed.length, "reviewed evaluation")}</summary>
                  <ul className={styles.list}>
                    {reviewed.map((evaluation) => (
                      <li key={evaluation.id}>
                        <Link href={recordHref(evaluation)}>{catalogueText(evaluation.name)}</Link>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <SourceIdentityNotice
                record={record}
                sources={detail.sources}
                subject={identitySubject}
              />
            </div>
          </div>
        </div>
      </header>
      <section className="block first">
        <div className="wrap">
          <UseCaseBacklinks links={useCaseLinks} configurations={useCaseConfigurations} />
          <SectionNavigation
            sections={[
              { id: "finding", label: "Claim" },
              { id: "evidence", label: "Evidence" },
            ]}
          />
          {record.status === "superseded" && (
            <aside className={styles.notice}>
              This record is superseded and retained for its history. Consult
              its correction links before using these results.
            </aside>
          )}
          {proposals.length > 0 && (
            <details className={styles.profileDisclosure}>
              <summary>Applicable tests and references</summary>
              <p>Applicability is distinct from a completed evaluation.</p>
              <ul className={styles.list}>
                {proposals.map((item, i) => (
                  <li key={i}>
                    <Link href={recordHref(item.record)}>
                      {catalogueText(item.record.name)}
                    </Link>{" "}
                    ·{" "}
                    {String(
                      item.record.attributes.applicability ||
                        "Proposed association",
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <section id="evidence" className={styles.section}>
            <h2>Evidence</h2>
            <p className={styles.muted}>
              Source checking verifies the cited claim or transcription. It does
              not establish independent reproduction.
            </p>
            <EvidenceTable
              key={`${catalogue.release_id}:${record.id}:evidence`}
              id={record.id}
              initial={evidence}
              initialScope="record_context"
              collapsed
              sectionId="evidence-claims"
            />
            <section id="sources" className={styles.section}>
              <h2>Sources and history</h2>
              <p className={styles.muted}>
                Release {catalogue.release_id} · Record review:{" "}
                {record.status.replace(/_/g, " ")}
              </p>
              <details className={styles.profileDisclosure}>
                <summary>
                  {detail.sources.length
                    ? `${countLabel(detail.sources.length, "source record")} and release history`
                    : "Release history"}
                </summary>
                {detail.sources.length ? (
                  <ul className={styles.list}>
                    {detail.sources.map((source) => (
                      <li key={source.id}>
                        <Link href={recordHref(source)}>
                          {catalogueText(source.name)}
                        </Link>
                        {safeSourceUrl(source.attributes.url) && (
                          <>
                            {" "}
                            ·{" "}
                            <a href={safeSourceUrl(source.attributes.url)}>
                              Original source
                            </a>
                          </>
                        )}{" "}
                        · {displayValue(source.attributes.version)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No supporting source is linked yet.</p>
                )}
                {detail.direct
                  .filter((item) => item.relation === "supersedes")
                  .map((item) => (
                    <p key={item.record.id}>
                      Supersedes{" "}
                      <Link href={recordHref(item.record)}>
                        {catalogueText(item.record.name)}
                      </Link>
                    </p>
                  ))}
                {detail.reverse
                  .filter((item) => item.relation === "supersedes")
                  .map((item) => (
                    <p key={item.record.id}>
                      Superseded by{" "}
                      <Link href={recordHref(item.record)}>
                        {catalogueText(item.record.name)}
                      </Link>
                    </p>
                  ))}
                <a
                  href={downloadHref(`/omics/releases/${catalogue.release_id}/records.jsonl`)}
                >
                  Download this release (gzip)
                </a>
              </details>
            </section>
            <details className={styles.section}>
              <summary>Technical metadata and extraction receipts</summary>
              <p>Stable ID: {record.id}</p>
              <Fields
                verbatim
                fields={{
                  ...record.facets,
                  ...Object.fromEntries(
                    Object.entries(record.attributes).filter(
                      ([key]) => key !== "profile",
                    ),
                  ),
                }}
              />
            </details>
            <details className={styles.section}>
              <summary>Related records</summary>
              <ul className={styles.list}>
                {[...detail.direct, ...detail.reverse].map((item, i) => (
                  <li key={i}>
                    {item.relation.replace(/_/g, " ")}:{" "}
                    <Link href={recordHref(item.record)}>
                      {catalogueText(item.record.name)}
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          </section>
          <p>
            <a
              href={`/contribute/?type=correction&target_id=${encodeURIComponent(record.id)}`}
            >
              Suggest a correction
            </a>
          </p>
        </div>
      </section>
    </>
  );
}
