import { downloadHref } from "@/lib/downloads";
import Breadcrumbs from "@/components/catalogue/Breadcrumbs";
import { recordBreadcrumbs } from "@/lib/catalogue-sharing";
import { catalogueText } from "@/lib/catalogue-text";
import Link from "next/link";
import { Fragment } from "react";
import { buildCatalogue } from "@/lib/catalogue-build";
import UseCaseBacklinks from "@/components/catalogue/UseCaseBacklinks";
import { recordHref, displayValue, safeSourceUrl } from "@/lib/omics";
import { profileSchema } from "@/lib/omics-profile";
import { EvidenceConcerns, ProfileEvidence } from "@/components/catalogue/Profile";
import EvidenceTable from "@/components/catalogue/EvidenceTable";
import Results from "@/components/catalogue/Results";
import SourceIdentityNotice from "@/components/catalogue/SourceIdentity";
import SectionNavigation, {
  BrowseReturn,
} from "@/components/catalogue/SectionNavigation";
import ResearchReadiness from "@/components/catalogue/ResearchReadiness";
import { InvestigationList } from "@/components/catalogue/ResearchInvestigation";
import { countLabel, kindLabels, singularKindLabels, groupEntities, uniqueRecords } from "@/lib/omics-browse";
import { loadUseCaseContext, verifiedAssociation, type RecordDetail } from "@/lib/entity-detail";
import styles from "../database.module.css";

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

/** Shared composition for the dataset family: dataset and dataset_subset
 * (`datasetSubjectKinds` in entity-kinds.ts). Evaluation results, derived
 * subsets and research readiness. Branches on `record.kind` only for the
 * "subset" wording; both kind route files import this directly, and so
 * does model's alias dispatch for the one anomalous dataset-on-model case.
 * See workbench/entity-page-split-checkpoint.md. */
export function DatasetDetail({ detail }: { detail: RecordDetail }) {
  const { query, catalogue } = buildCatalogue();
  const { record } = detail;
  const { useCaseLinks, useCaseConfigurations } = loadUseCaseContext(
    query,
    record,
  );
  const readiness = query.researchReadiness({ id: record.id, limit: 1 }).items[0];
  const manifests = readiness
    ? query.research().manifests.filter((manifest) =>
        readiness.manifest_ids.includes(manifest.id),
      )
    : [];
  const investigations = readiness
    ? query.investigations({ record_id: record.id, limit: 25 })
    : undefined;
  const results = query.results({ id: record.id, limit: 25 });
  const evidence = query.evidence({
    id: record.id,
    scope: "record_context",
    limit: 10,
  });
  const family = detail.direct.find(
    (item) =>
      ["family", "variant_of", "configuration_of", "alias_of"].includes(item.relation) &&
      verifiedAssociation(query, record.id, item.relation, item.record.id),
  );
  const localProfile = profileSchema.safeParse(record.attributes.profile);
  const shared =
    family &&
    profileSchema.safeParse(
      query.get({ id: family.record.id })?.record.attributes.profile,
    ).success
      ? query.get({ id: family.record.id })
      : null;
  const profileOwner = shared && !localProfile.success ? shared : detail;
  const profile = profileSchema.safeParse(
    profileOwner.record.attributes.profile,
  );
  const summary = catalogueText(
    (profileOwner.record.attributes.profile as { summary?: string } | undefined)
      ?.summary || record.description,
  );
  const protocolLinks = uniqueRecords([
    ...detail.direct
      .filter(
        (item) =>
          ["part_of", "evaluates_task"].includes(item.relation) &&
          verifiedAssociation(query, record.id, item.relation, item.record.id),
      )
      .map((item) => item.record),
    ...detail.reverse
      .filter(
        (item) =>
          ["part_of", "evaluates_task"].includes(item.relation) &&
          verifiedAssociation(query, item.record.id, item.relation, record.id),
      )
      .map((item) => item.record),
  ]);
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
              <p className="intro">{summary}</p>
              <SourceIdentityNotice
                record={record}
                sources={detail.sources}
                subject={identitySubject}
              />
              {profile.success && profile.data.summary_source_ids && (
                <ProfileEvidence
                  ids={profile.data.summary_source_ids}
                  locator={profile.data.summary_source_locator || ""}
                  sources={profileOwner.sources}
                />
              )}
            </div>
          </div>
        </div>
      </header>
      <section className="block first">
        <div className="wrap">
          <UseCaseBacklinks links={useCaseLinks} configurations={useCaseConfigurations} />
          <SectionNavigation
            sections={[
              { id: "finding", label: "Overview" },
              ...(results.total > 0 ? [{ id: "results", label: "Results" }] : []),
              ...(readiness ? [{ id: "research-readiness", label: "Readiness" }] : []),
              { id: "evidence", label: "Evidence" },
            ]}
          />
          {record.status === "superseded" && (
            <aside className={styles.notice}>
              This record is superseded and retained for its history. Consult
              its correction links before using these results.
            </aside>
          )}
          {results.total > 0 ? (
            <Results
              key={`${catalogue.release_id}:${record.id}`}
              id={record.id}
              initial={results}
              title="Evaluation results"
            />
          ) : (
            <p className={styles.muted}>No reviewed evaluations of this {singularKindLabels[record.kind].toLowerCase()} are linked in this release.</p>
          )}
          {readiness && (
            <ResearchReadiness
              assessment={readiness}
              manifests={manifests}
              records={manifests.flatMap((manifest) => {
                const protocol = query.get({
                  id: manifest.protocol_id,
                  include_comparisons: false,
                })?.record;
                return protocol ? [protocol] : [];
              })}
            />
          )}
          {investigations && investigations.items.length > 0 && (
            <section className={styles.section}>
              <h2>Reviewed investigations</h2>
              <InvestigationList reports={investigations.items} />
              {investigations.next_cursor && (
                <p>
                  <Link href="/investigations/">View all reviewed investigations</Link>
                </p>
              )}
            </section>
          )}
          <section className={styles.section} aria-label="Dataset context">
            <h2>
              {record.kind === "dataset_subset"
                ? "Subset and evaluation context"
                : "Dataset and evaluation context"}
            </h2>
            <p>
              {record.kind === "dataset_subset"
                ? "This record describes a particular subset or cohort used in an evaluation. Its results do not describe the full dataset."
                : "A dataset supplies biological observations. The evaluation protocol defines how those observations are split, used and scored."}
            </p>
            {protocolLinks.length > 0 && (
              <div className={styles.relationshipGrid}>
                {groupEntities(protocolLinks).map((group) => (
                  <section key={group.kind} className={styles.relationshipCard}>
                    <h3>{kindLabels[group.kind]}</h3>
                    <ul className={styles.list}>
                      {group.records.map((item) => (
                        <li key={item.id}>
                          <Link href={recordHref(item)}>
                            {catalogueText(item.name)}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </section>
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
