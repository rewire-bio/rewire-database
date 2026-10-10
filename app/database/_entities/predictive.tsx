import { downloadHref } from "@/lib/downloads";
import Breadcrumbs from "@/components/catalogue/Breadcrumbs";
import { recordBreadcrumbs } from "@/lib/catalogue-sharing";
import { catalogueText } from "@/lib/catalogue-text";
import Link from "next/link";
import { Fragment } from "react";
import { buildCatalogue } from "@/lib/catalogue-build";
import UseCaseBacklinks from "@/components/catalogue/UseCaseBacklinks";
import { recordHref, displayValue, safeSourceUrl, type OmicsRecord } from "@/lib/omics";
import { profileSchema } from "@/lib/omics-profile";
import Profile, {
  EvidenceConcerns,
  ProfileEvidence,
} from "@/components/catalogue/Profile";
import EvidenceTable from "@/components/catalogue/EvidenceTable";
import Results from "@/components/catalogue/Results";
import { resultsPayload } from "@/lib/results-payload";
import ResultMatrix from "@/components/catalogue/ResultMatrix";
import LinkedResults, { linkedCount } from "@/components/catalogue/LinkedResults";
import SourceIdentityNotice from "@/components/catalogue/SourceIdentity";
import SectionNavigation, {
  BrowseReturn,
} from "@/components/catalogue/SectionNavigation";
import { kindLabels, singularKindLabels, countLabel, uniqueRecords, groupEntities } from "@/lib/omics-browse";
import {
  linkedResultRecords,
  loadResultMatrix,
  loadUseCaseContext,
  provenanceOnly,
  verifiedAssociation,
  type RecordDetail,
} from "@/lib/entity-detail";
import styles from "../database.module.css";

function Links({ records }: { records: OmicsRecord[] }) {
  return (
    <>
      {records.length
        ? records.map((record, i) => (
            <span key={record.id}>
              {i > 0 ? "; " : ""}
              <Link href={recordHref(record)}>
                {catalogueText(record.name)}
              </Link>
            </span>
          ))
        : "Not reported"}
    </>
  );
}

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

/** Shared composition for the predictive-entity family: model, method,
 * configuration, pipeline and service (`modelSubjectKinds` in
 * entity-kinds.ts / `predictiveKinds` in omics-browse.ts). A profile, its
 * evaluations and results, and the configurations built on it. Each of the
 * five kind route files imports this directly; it is not a generic
 * all-kinds dispatcher — the four other families (evaluation-design,
 * dataset, and the five standalone kinds) each have their own composition.
 * See workbench/entity-page-split-checkpoint.md. */
export function PredictiveEntityDetail({ detail }: { detail: RecordDetail }) {
  const { query, catalogue } = buildCatalogue();
  const { record } = detail;
  const results = query.results({ id: record.id, limit: 25 });
  const linked = results.total === 0 ? linkedResultRecords(query, detail) : null;
  const hasLinked = !!linked?.items.length;
  const matrix = loadResultMatrix(query, record.id, results.total);
  const { useCaseLinks, useCaseConfigurations } = loadUseCaseContext(
    query,
    record,
    linked?.items.map((item) => item.record),
  );
  const evidence = query.evidence({
    id: record.id,
    scope: "individual_claim",
    limit: 10,
  });
  const family = detail.direct.find(
    (item) =>
      ["family", "variant_of", "configuration_of", "alias_of"].includes(item.relation) &&
      verifiedAssociation(query, record.id, item.relation, item.record.id),
  );
  const familyResults = family
    ? query.results({ id: family.record.id, limit: 1 })
    : null;
  const broaderFamilyOnly = !!family && results.total === 0 && !!familyResults?.total;
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
  const finding = catalogueText(record.name);
  const usesModels = detail.direct.filter(
    (item) =>
      item.relation === "uses_model" &&
      verifiedAssociation(query, record.id, item.relation, item.record.id),
  );
  const downstream = detail.reverse.filter(
    (item) =>
      item.relation === "uses_model" &&
      verifiedAssociation(query, item.record.id, item.relation, record.id),
  );
  const memberLinks = detail.reverse.filter(
    (item) =>
      ["family", "variant_of", "configuration_of", "alias_of"].includes(item.relation) &&
      verifiedAssociation(query, item.record.id, item.relation, record.id),
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
  // A configuration described only by where it was run borrows the parent's description.
  const parent = provenanceOnly(record.description) && !localProfile.success
    ? detail.direct.find(
        (item) =>
          ["configuration_of", "variant_of", "family", "uses_model"].includes(item.relation) &&
          !!item.record.description &&
          !provenanceOnly(item.record.description),
      )?.record
    : undefined;
  const hasResults = results.total > 0 || hasLinked || broaderFamilyOnly;
  const kindLabel = singularKindLabels[record.kind].toLowerCase();
  return (
    <>
      <header className="page-head" id="finding">
        <div className="wrap">
          <Breadcrumbs items={recordBreadcrumbs(record)} />
          <div className={styles.nav}>
            <BrowseReturn fallback={`/?kind=${record.kind}#browse`} />
          </div>
          <div
            className={
              profile.success && profile.data.diagram
                ? styles.profileHero
                : undefined
            }
          >
            <div>
              <span className="kick">{singularKindLabels[record.kind]}</span>
              <h1>{finding}</h1>
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
              {results.total === 0 && (
                <p className={styles.muted}>
                  {hasLinked
                    ? `Results are recorded on linked configurations and versions of this ${kindLabel}. Their settings and evaluations are kept separate below.`
                    : broaderFamilyOnly
                      ? "The broader model family has published results, but their attribution to this exact checkpoint has not been verified."
                      : "No reviewed evaluations are linked here in this release. See the sources below."}
                </p>
              )}
              <p className={styles.heroActions}>
                {results.total > 0 && (
                  <a href="#results" className={styles.resultCount}>
                    {countLabel(results.evaluation_count, "evaluation")} ·{" "}
                    {countLabel(results.total, "result")}
                  </a>
                )}
                {hasLinked && (
                  <a href="#results" className={styles.resultCount}>
                    {linkedCount(linked!)} with results
                  </a>
                )}
                {broaderFamilyOnly && !hasLinked && family && (
                  <Link href={`${recordHref(family.record)}#results`} className={styles.resultCount}>
                    View {countLabel(familyResults!.total, "result")} for the broader family
                  </Link>
                )}
              </p>
            </div>
            <Profile record={profileOwner.record} sources={profileOwner.sources} part="visual" />
          </div>
        </div>
      </header>
      <section className="block first">
        <div className="wrap">
          <UseCaseBacklinks links={useCaseLinks} configurations={useCaseConfigurations} />
          <SectionNavigation
            sections={[
              ...(hasLinked ? [{ id: "results", label: "Results" }] : []),
              { id: "overview", label: "Overview" },
              ...(hasResults && !hasLinked ? [{ id: "results", label: "Results" }] : []),
              { id: "use-model", label: `Use this ${kindLabel}` },
              { id: "evidence", label: "Evidence" },
            ]}
          />
          {hasLinked && <LinkedResults record={record} linked={linked!} />}
          <Profile
            record={profileOwner.record}
            sources={profileOwner.sources}
            part="overview"
            about={
              parent && (
                <p>
                  <Link href={recordHref(parent)}>{catalogueText(parent.name)}</Link>:{" "}
                  {catalogueText(parent.description)}
                </p>
              )
            }
          />
          {record.status === "superseded" && (
            <aside className={styles.notice}>
              This record is superseded and retained for its history. Consult
              its correction links before using these results.
            </aside>
          )}
          {results.total > 0 && (
            <Results
              key={`${catalogue.release_id}:${record.id}`}
              id={record.id}
              initial={resultsPayload(results)}
              title="Evaluations and results"
              summary={matrix && <ResultMatrix matrix={matrix} label={`Results for ${catalogueText(record.name)}`} />}
            />
          )}
          {broaderFamilyOnly && !hasLinked && family && (
            <section id="results" className={styles.section}>
              <h2>Results for the broader model family</h2>
              <p>
                Published evaluations are available for{" "}
                {catalogueText(family.record.name)}. The cited sources do not
                establish that this exact checkpoint was used, so those scores
                are kept on the family profile.
              </p>
              <Link href={`${recordHref(family.record)}#results`}>
                View the family&rsquo;s evaluations and exact configurations
              </Link>
            </section>
          )}
          {downstream.length > 0 && !hasLinked && (
            <section id="configurations" className={styles.section}>
              <h2>Related configurations, pipelines and services</h2>
              <p>
                These configurations, services and pipelines use this model
                within their own configurations. Their results, where
                available, are not assigned to the underlying model.
              </p>
              <ul className={styles.configurationList}>
                {downstream.map((item) => (
                  <li key={item.record.id}>
                    <Link href={`${recordHref(item.record)}#results`}>
                      {catalogueText(item.record.name)}
                    </Link>{" "}
                    <span>
                      {singularKindLabels[item.record.kind]} ·{" "}
                      {countLabel(
                        query.results({ id: item.record.id, limit: 1 }).total,
                        "result",
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section id="use-model" className={styles.section}>
            <h2>Use this {kindLabel}</h2>
            <details className={styles.profileDisclosure}>
              <summary>How it works, versions and access</summary>
              {family && (
                <p className={styles.notice}>
                  Related profile:{" "}
                  <Link href={recordHref(family.record)}>
                    {catalogueText(family.record.name)}
                  </Link>
                  . This page retains the exact record and its evaluation
                  context.
                </p>
              )}
              {usesModels.length > 0 && (
                <p className={styles.notice}>
                  Underlying model: <Links records={usesModels.map((item) => item.record)} />.
                  Results on this page belong to this{" "}
                  {singularKindLabels[record.kind].toLowerCase()} and its
                  evaluated settings.
                </p>
              )}
              {profileOwner.record.id !== record.id && (
                <section className={styles.section}>
                  <h2>This configuration</h2>
                  <p>
                    {catalogueText(
                      localProfile.success
                        ? localProfile.data.summary
                        : record.description,
                    )}
                  </p>
                  <Fields
                    fields={{
                      record: record.name,
                      configuration:
                        record.attributes.version || record.attributes.checkpoint,
                      entity_type: singularKindLabels[record.kind],
                    }}
                  />
                </section>
              )}
              {memberLinks.length > 0 && (
                <section className={styles.section}>
                  <h2>Versions and evaluated configurations</h2>
                  <ul className={styles.list}>
                    {memberLinks.map((item) => (
                      <li key={item.record.id}>
                        <Link href={`${recordHref(item.record)}#results`}>
                          {catalogueText(item.record.name)}
                        </Link>{" "}
                        · {item.relation.replace(/_/g, " ")}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              <Profile record={profileOwner.record} sources={profileOwner.sources} part="mechanism" />
              {protocolLinks.length > 0 && (
                <section id="evaluation-design" className={styles.section}>
                  <h2>Evaluation design</h2>
                  <p>
                    Benchmarks bring together tasks and protocols. A task
                    describes the biological question; a protocol defines a
                    particular test.
                  </p>
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
                  <p className={styles.muted}>
                    These source-backed links do not make different protocols
                    or scores interchangeable.
                  </p>
                </section>
              )}
            </details>
          </section>
          <details className={styles.profileDisclosure}>
            <summary>Strengths, limitations and unresolved questions</summary>
            <Profile record={profileOwner.record} sources={profileOwner.sources} part="limitations" />
          </details>
          <Profile record={profileOwner.record} sources={profileOwner.sources} part="specifications" />
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
              initialScope="individual_claim"
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
