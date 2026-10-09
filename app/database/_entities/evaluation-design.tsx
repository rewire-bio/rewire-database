import { downloadHref } from "@/lib/downloads";
import Breadcrumbs from "@/components/catalogue/Breadcrumbs";
import BenchmarkCoverage from "@/components/catalogue/BenchmarkCoverage";
import { recordBreadcrumbs } from "@/lib/catalogue-sharing";
import { catalogueText } from "@/lib/catalogue-text";
import Link from "next/link";
import { Fragment } from "react";
import { buildCatalogue } from "@/lib/catalogue-build";
import { packComparisons } from "@/lib/comparison-transport";
import UseCaseBacklinks from "@/components/catalogue/UseCaseBacklinks";
import { recordHref, displayValue, safeSourceUrl, type OmicsRecord } from "@/lib/omics";
import { profileSchema } from "@/lib/omics-profile";
import Profile, {
  EvidenceConcerns,
  ProfileEvidence,
} from "@/components/catalogue/Profile";
import EvidenceTable from "@/components/catalogue/EvidenceTable";
import RunRecipes from "@/components/catalogue/RunRecipes";
import BaselineCoverage from "@/components/catalogue/BaselineCoverage";
import RunGuide from "@/components/catalogue/RunGuide";
import SourceIdentityNotice from "@/components/catalogue/SourceIdentity";
import { ComparisonWorkspace } from "@/components/catalogue/BenchmarkCharts";
import SectionNavigation, {
  BrowseReturn,
} from "@/components/catalogue/SectionNavigation";
import BenchmarkResearch, {
  type BenchmarkResearchData,
} from "@/components/catalogue/BenchmarkResearch";
import { kindLabels, singularKindLabels, countLabel, uniqueRecords, groupEntities } from "@/lib/omics-browse";
import { loadUseCaseContext, verifiedAssociation, type RecordDetail } from "@/lib/entity-detail";
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

/** Shared composition for the evaluation-design family: benchmark, task,
 * protocol and evaluator (`benchmarkSubjectKinds` in entity-kinds.ts /
 * `evaluationKinds` in omics-browse.ts). Coverage, comparison charts,
 * recorded evaluations and run instructions. Each of the four kind route
 * files imports this directly; it is not a generic all-kinds dispatcher.
 * See workbench/entity-page-split-checkpoint.md. */
export function EvaluationDesignEntityDetail({ detail }: { detail: RecordDetail }) {
  const { query, catalogue } = buildCatalogue();
  const { record } = detail;
  const { useCaseLinks, useCaseConfigurations } = loadUseCaseContext(
    query,
    record,
  );
  const results = query.results({ id: record.id, limit: 25 });
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
  const evaluatedDownstream = downstream
    .map((item) => ({ ...item, counts: query.results({ id: item.record.id, limit: 1 }) }))
    .filter((item) => item.counts.total > 0);
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
  const linkedEvaluations = uniqueRecords(
    detail.reverse
      .filter(
        (item) =>
          item.record.kind === "evaluation" &&
          ["assessment", "benchmark", "task", "protocol", "evaluator"].includes(item.relation),
      )
      .map((item) => item.record),
  );
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
                  {evaluatedDownstream.length
                    ? "Results are available for configurations using this model. Their fitted heads, extra inputs and evaluation settings are kept separate below."
                    : broaderFamilyOnly
                      ? "The broader model family has published results, but their attribution to this exact checkpoint has not been verified."
                      : "No reviewed evaluations are linked here in this release. See the sources and separately identified configurations below."}
                </p>
              )}
              <p className={styles.heroActions}>
                {(results.total > 0 || (!evaluatedDownstream.length && !broaderFamilyOnly)) && (
                  <a href="#results" className={styles.resultCount}>
                    {countLabel(results.evaluation_count, "evaluation")} ·{" "}
                    {countLabel(results.total, "result")}
                  </a>
                )}
                {evaluatedDownstream.length > 0 && (
                  <>
                    <a href="#configurations" className={styles.resultCount}>
                      {evaluatedDownstream.length} evaluated{" "}
                      {evaluatedDownstream.length === 1
                        ? "configuration"
                        : "configurations"}{" "}
                      using this model
                    </a>
                  </>
                )}
                {broaderFamilyOnly && !evaluatedDownstream.length && family && (
                  <Link href={`${recordHref(family.record)}#results`} className={styles.resultCount}>
                    View {countLabel(familyResults!.total, "result")} for the broader family
                  </Link>
                )}
              </p>
            </div>
          </div>
        </div>
      </header>
      <section className="block first">
        <div className="wrap">
          <UseCaseBacklinks links={useCaseLinks} configurations={useCaseConfigurations} />
          <SectionNavigation
            sections={[
              { id: "overview", label: "Overview" },
              { id: "results", label: "Results" },
              { id: "execution", label: "How to run" },
              { id: "evidence", label: "Evidence" },
            ]}
          />
          <Profile record={profileOwner.record} sources={profileOwner.sources} part="overview" />
          {record.status === "superseded" && (
            <aside className={styles.notice}>
              This record is superseded and retained for its history. Consult
              its correction links before using these results.
            </aside>
          )}
          <BenchmarkCoverage
            results={results.total}
            evaluations={results.evaluation_count}
            charts={detail.comparison_options.length}
          />
          <ComparisonWorkspace
            key={`${catalogue.release_id}:${record.id}`}
            initialResults={
              detail.published_comparisons.length ? undefined : results
            }
            resultSummary={{
              total: results.total,
              evaluation_count: results.evaluation_count,
            }}
            panels={packComparisons(detail.published_comparisons)}
            options={detail.comparison_options}
            recordId={record.id}
            releaseId={catalogue.release_id}
          />
          {downstream.length > 0 && (
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
          <section id="methods" className={styles.section}>
            <h2>Methods and evaluation design</h2>
            <details className={styles.profileDisclosure}>
              <summary>Procedure, tasks and evaluated configurations</summary>
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
              {linkedEvaluations.length > 0 && (
                <section className={styles.section}>
                  <h2>Recorded evaluations</h2>
                  <p>
                    Each evaluation records what was tested and under which
                    conditions.
                  </p>
                  <ul className={styles.list}>
                    {linkedEvaluations.slice(0, 12).map((item) => (
                      <li key={item.id}>
                        <Link href={recordHref(item)}>
                          {catalogueText(item.name)}
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {linkedEvaluations.length > 12 && (
                    <p>
                      <a href="#results">Explore all linked results</a>
                    </p>
                  )}
                </section>
              )}
            </details>
          </section>
          <div id="execution" />
          <BaselineCoverage record={record} query={query} />
          <RunRecipes
            record={record}
            sources={detail.sources}
            protocols={protocolLinks.filter((item) => item.kind === "protocol")}
          />
          {record.attributes.run_recipes ? (
            <details className={styles.section}>
              <summary>Original repository instructions</summary>
              <RunGuide record={record} sources={detail.sources} />
            </details>
          ) : (
            <RunGuide record={record} sources={detail.sources} />
          )}
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
            {record.attributes.benchmark_research ? (
              <BenchmarkResearch
                research={record.attributes.benchmark_research as BenchmarkResearchData}
                sources={detail.sources}
                results={results.total}
              />
            ) : null}
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
                  {detail.sources.length} source records and release history
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
