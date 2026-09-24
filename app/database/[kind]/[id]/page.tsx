import Breadcrumbs from "@/components/catalogue/Breadcrumbs";
import { recordBreadcrumbs, socialMetadata } from "@/lib/catalogue-sharing";
import { formatScore } from "@/lib/score-display";
import { recordSearchMetadata } from "@/lib/catalogue-seo";
import { catalogueText } from "@/lib/catalogue-text";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment } from "react";
import { buildCatalogue } from "@/lib/catalogue-build";
import { packComparisons } from "@/lib/comparison-transport";
import {
  recordHref,
  recordRouteKinds,
  displayValue,
  safeSourceUrl,
  originLabel,
  type OmicsRecord,
} from "@/lib/omics";
import { profileSchema } from "@/lib/omics-profile";
import Profile, {
  Evidence,
  EvidenceConcerns,
  ProfileEvidence,
} from "@/components/catalogue/Profile";
import EvidenceTable from "@/components/catalogue/EvidenceTable";
import RunRecipes from "@/components/catalogue/RunRecipes";
import BaselineCoverage from "@/components/catalogue/BaselineCoverage";
import Reproduction from "@/components/catalogue/Reproduction";
import RunGuide from "@/components/catalogue/RunGuide";
import Results from "@/components/catalogue/Results";
import { ComparisonWorkspace } from "@/components/catalogue/BenchmarkCharts";
import SectionNavigation, {
  BrowseReturn,
} from "@/components/catalogue/SectionNavigation";
import BenchmarkResearch, {
  type BenchmarkResearchData,
} from "@/components/catalogue/BenchmarkResearch";
import {
  kindLabels,
  singularKindLabels,
  profileKinds,
  predictiveKinds,
  evaluationKinds,
  testedEntities,
  evaluationEntities,
  datasetEntities,
  groupEntities,
  uniqueRecords,
} from "@/lib/omics-browse";
import styles from "../../database.module.css";

type Params = { kind: string; id: string };
export function generateStaticParams() {
  return buildCatalogue().catalogue.records.flatMap((record) =>
    recordRouteKinds(record).map((kind) => ({ kind, id: record.id })),
  );
}
export function generateMetadata({ params }: { params: Params }): Metadata {
  const item = buildCatalogue().query.get({
    id: params.id,
    include_comparisons: false,
  });
  if (
    !item ||
    !recordRouteKinds(item.record).some((kind) => kind === params.kind)
  )
    return {};
  const metadata = recordSearchMetadata(item.record, buildCatalogue().catalogue.records);
  return {
    ...metadata,
    ...socialMetadata({
      title: metadata.title,
      description: metadata.description,
      path: metadata.alternates.canonical,
    }),
  };
}
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

export default function RecordPage({ params }: { params: Params }) {
  const { query, catalogue } = buildCatalogue();
  const detail = query.get({ id: params.id, include_comparisons: false });
  if (
    !detail ||
    !recordRouteKinds(detail.record).some((kind) => kind === params.kind)
  )
    notFound();
  const { record } = detail;
  const results = query.results({ id: record.id, limit: 25 });
  const first = results.items[0];
  const evidenceScope = [...profileKinds, "result"].includes(record.kind)
    ? "individual_claim"
    : record.kind === "source"
      ? "source_metadata"
      : "record_context";
  const evidence = query.evidence({
    id: record.id,
    scope: evidenceScope,
    limit: 10,
  });
  const evaluated = record.kind === "evaluation" ? record : first?.evaluation;
  const entity = profileKinds.includes(record.kind);
  const predictive = predictiveKinds.includes(record.kind);
  const evaluationDesign = evaluationKinds.includes(record.kind);
  const hasRunInstructions = Boolean(
    evaluationDesign ||
    record.attributes.run_guide ||
    record.attributes.run_documentation,
  );
  const verifiedAssociation = (
    subject: string,
    relation: string,
    target: string,
  ) =>
    catalogue.records.some(
      (item) =>
        item.kind === "claim" &&
        item.attributes.field === `links:${relation}:${target}` &&
        item.links.some(
          (link) => link.relation === "subject" && link.target_id === subject,
        ) &&
        ["source_checked", "reproduced"].includes(item.status) &&
        item.source_ids.length > 0 &&
        !!item.attributes.source_locator,
    );
  const family = detail.direct.find(
    (item) =>
      ["family", "variant_of", "alias_of"].includes(item.relation) &&
      predictiveKinds.includes(item.record.kind) &&
      verifiedAssociation(record.id, item.relation, item.record.id),
  );
  const familyResults = family ? query.results({ id: family.record.id, limit: 1 }) : null;
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
  const finding =
    record.kind === "result"
      ? `${formatScore(record.attributes.printed_value)}${record.attributes.unit === "percent" && !/%/.test(String(record.attributes.printed_value)) ? "%" : ""} ${displayValue(record.attributes.metric)}`
      : catalogueText(record.name);
  const modelLinks = first
    ? testedEntities(first)
    : detail.direct
        .filter((item) =>
          ["model", "method", "configuration", "pipeline", "service"].includes(
            item.relation,
          ),
        )
        .map((item) => item.record);
  const modelFamilies = modelLinks.flatMap((model) =>
    model.links
      .filter(
        (link) =>
          ["family", "variant_of", "alias_of"].includes(link.relation) &&
          verifiedAssociation(model.id, link.relation, link.target_id),
      )
      .flatMap((link) => {
        const target = query.get({ id: link.target_id });
        return target ? [target.record] : [];
      }),
  );
  const benchmarkLinks = first
    ? evaluationEntities(first)
    : detail.direct
        .filter((item) =>
          ["benchmark", "task", "protocol", "evaluator"].includes(
            item.relation,
          ),
        )
        .map((item) => item.record);
  const datasetLinks = first
    ? datasetEntities(first)
    : detail.direct
        .filter((item) => ["dataset", "dataset_subset"].includes(item.relation))
        .map((item) => item.record);
  const memberLinks = detail.reverse.filter(
    (item) =>
      ["family", "variant_of", "alias_of"].includes(item.relation) &&
      verifiedAssociation(item.record.id, item.relation, record.id),
  );
  const usesModels = detail.direct.filter(
    (item) =>
      item.relation === "uses_model" &&
      verifiedAssociation(record.id, item.relation, item.record.id),
  );
  const downstream = detail.reverse.filter(
    (item) =>
      item.relation === "uses_model" &&
      verifiedAssociation(item.record.id, item.relation, record.id),
  );
  const evaluatedDownstream = downstream
    .map(item => ({ ...item, counts: query.results({ id: item.record.id, limit: 1 }) }))
    .filter(item => item.counts.total > 0);
  const protocolLinks = uniqueRecords([
    ...detail.direct
      .filter(
        (item) =>
          ["part_of", "evaluates_task"].includes(item.relation) &&
          verifiedAssociation(record.id, item.relation, item.record.id),
      )
      .map((item) => item.record),
    ...detail.reverse
      .filter(
        (item) =>
          ["part_of", "evaluates_task"].includes(item.relation) &&
          verifiedAssociation(item.record.id, item.relation, record.id),
      )
      .map((item) => item.record),
  ]);
  const linkedEvaluations = uniqueRecords(
    detail.reverse
      .filter(
        (item) =>
          item.record.kind === "evaluation" &&
          ["benchmark", "task", "protocol", "evaluator"].includes(
            item.relation,
          ),
      )
      .map((item) => item.record),
  );
  const contextGroups = groupEntities([
    ...modelLinks,
    ...benchmarkLinks,
    ...datasetLinks,
  ]);
  const proposals = [...detail.direct, ...detail.reverse].filter(
    (item) => item.relation === "applicable_to",
  );
  return (
    <>
      <header className="page-head" id="finding">
        <div className="wrap">
          <Breadcrumbs items={recordBreadcrumbs(record)} className={styles.nav} />
          <div className={styles.nav}>
            <BrowseReturn fallback={`/?kind=${record.kind}#browse`} />
            <Link href={`/?kind=${record.kind}#browse`}>Search and filter {kindLabels[record.kind].toLowerCase()}</Link>
          </div>
          <div
            className={
              predictive && profile.success && profile.data.diagram
                ? styles.profileHero
                : undefined
            }
          >
            <div>
              <span className="kick">{singularKindLabels[record.kind]}</span>
              <h1>{finding}</h1>
              <EvidenceConcerns
                sources={record.kind === "source" ? [record] : detail.sources}
              />
              <p className="intro">
                {record.kind === "result"
                  ? catalogueText(record.name)
                  : summary}
              </p>
              {profile.success && profile.data.summary_source_ids && (
                <ProfileEvidence
                  ids={profile.data.summary_source_ids}
                  locator={profile.data.summary_source_locator || ""}
                  sources={profileOwner.sources}
                />
              )}
              {entity && results.total === 0 && (
                <p className={styles.muted}>
                  {evaluatedDownstream.length
                    ? "Results are available for configurations using this model. Their fitted heads, extra inputs and evaluation settings are kept separate below."
                    : broaderFamilyOnly
                      ? "The broader model family has published results, but their attribution to this exact checkpoint has not been verified."
                      : "No reviewed evaluations are linked here in this release. See the sources and separately identified configurations below."}
                </p>
              )}
              {entity && (
                <p>
                  {(results.total > 0 || (!evaluatedDownstream.length && !broaderFamilyOnly)) && (
                    <a href="#results" className={styles.resultCount}>
                    {results.evaluation_count}{" "}
                    {results.evaluation_count === 1
                      ? "evaluation"
                      : "evaluations"}{" "}
                    · {results.total}{" "}
                    {results.total === 1 ? "metric row" : "metric rows"}
                    </a>
                  )}
                  {evaluatedDownstream.length > 0 && (
                    <>
                      {results.total > 0 ? " · " : ""}
                      <a href="#configurations" className={styles.resultCount}>
                        {evaluatedDownstream.length} evaluated {evaluatedDownstream.length === 1 ? "configuration" : "configurations"} using this model
                      </a>
                    </>
                  )}
                  {broaderFamilyOnly && !evaluatedDownstream.length && family && (
                    <Link href={`${recordHref(family.record)}#results`} className={styles.resultCount}>
                      View {familyResults!.total} metric rows for the broader family
                    </Link>
                  )}
                </p>
              )}
            </div>
            {predictive && (
              <Profile
                record={profileOwner.record}
                sources={profileOwner.sources}
                part="visual"
              />
            )}
          </div>
        </div>
      </header>
      <section className="block first">
        <div className="wrap">
          <SectionNavigation
            sections={
              entity
                ? [
                    { id: "overview", label: "Overview" },
                    { id: "results", label: "Results" },
                    ...(evaluationDesign || hasRunInstructions
                      ? [{ id: "execution", label: "How to run" }]
                      : predictive
                        ? [{ id: "use-model", label: "Use this model" }]
                        : []),
                    { id: "evidence", label: "Evidence" },
                  ]
                : [
                    { id: "finding", label: "Finding" },
                    ...(["result", "evaluation"].includes(record.kind)
                      ? [
                          { id: "methods", label: "Methods" },
                          ...(evaluated
                            ? [{ id: "reproduction", label: "Reproduction" }]
                            : []),
                        ]
                      : []),
                    { id: "evidence", label: "Evidence" },
                  ]
            }
          />
          {entity && (
            <Profile
              record={profileOwner.record}
              sources={profileOwner.sources}
              part="overview"
            />
          )}
          {record.status === "superseded" && (
            <aside className={styles.notice}>
              This record is superseded and retained for its history. Consult
              its correction links before using these results.
            </aside>
          )}
          {record.kind === "result" && (
            <section
              id="methods"
              className={styles.finding}
              aria-label="Finding and evaluation context"
            >
              <span id="results" />
              <dl className={styles.details}>
                {contextGroups.map((group) => (
                  <Fragment key={group.kind}>
                    <dt>
                      {predictiveKinds.includes(group.kind)
                        ? `Tested ${group.label.toLowerCase()}`
                        : group.label}
                    </dt>
                    <dd>
                      <Links records={group.records} />
                    </dd>
                  </Fragment>
                ))}
                {modelFamilies.length > 0 && (
                  <>
                    <dt>Related family profiles</dt>
                    <dd>
                      <Links records={modelFamilies} />
                    </dd>
                  </>
                )}

                <dt>Procedure</dt>
                <dd>{displayValue(evaluated?.attributes.protocol)}</dd>
                <dt>Evaluation</dt>
                <dd>
                  {evaluated ? (
                    <Link href={recordHref(evaluated)}>
                      {catalogueText(evaluated.name)}
                    </Link>
                  ) : (
                    "Not linked"
                  )}
                </dd>
                <dt>Coverage</dt>
                <dd>
                  {displayValue(
                    record.attributes.coverage || {
                      scored: record.attributes.scored_count ?? "unreported",
                      eligible:
                        record.attributes.eligible_count ?? "unreported",
                    },
                  )}
                </dd>
                <dt>Uncertainty</dt>
                <dd>{displayValue(record.attributes.uncertainty)}</dd>
                <dt>Evidence</dt>
                <dd>
                  {originLabel(evaluated?.attributes.origin)} ·{" "}
                  {record.status.replace(/_/g, " ")}
                  <Evidence
                    ids={record.source_ids}
                    locator={String(
                      record.attributes.source_locator || "Not reported",
                    )}
                    sources={detail.sources}
                  />
                </dd>
              </dl>
              <p className={styles.notice}>
                A source-checked result verifies the numerical transcription,
                not every model or protocol detail. Evaluation metadata:{" "}
                {evaluated?.status.replace(/_/g, " ") || "not reported"}. Source
                checked does not mean independently reproduced.
              </p>
            </section>
          )}
          {evaluationDesign && (
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
          )}
          {!entity &&
            record.kind !== "result" &&
            [
              ...profileKinds,
              "dataset",
              "dataset_subset",
              "evaluation",
              "result",
              "baseline",
            ].includes(record.kind) && (
              <Results
                key={`${catalogue.release_id}:${record.id}`}
                id={record.id}
                initial={results}
                title={
                  evaluationDesign
                    ? "Tested entities and results"
                    : predictive
                      ? "Evaluations and results"
                      : "Evaluation results"
                }
              />
            )}
          {predictive && (results.total > 0 || (!evaluatedDownstream.length && !broaderFamilyOnly)) && (
            <Results
              key={`${catalogue.release_id}:${record.id}`}
              id={record.id}
              initial={results}
              title="Evaluations and results"
            />
          )}
          {predictive && results.total === 0 && (evaluatedDownstream.length > 0 || broaderFamilyOnly) && <span id="results" />}
          {predictive && broaderFamilyOnly && !evaluatedDownstream.length && family && (
            <section className={styles.section}>
              <h2>Results for the broader model family</h2>
              <p>Published evaluations are available for {catalogueText(family.record.name)}. The cited sources do not establish that this exact checkpoint was used, so those scores are kept on the family profile.</p>
              <Link href={`${recordHref(family.record)}#results`}>View the family’s evaluations and exact configurations</Link>
            </section>
          )}
          {predictive && downstream.length > 0 && (
            <section id="configurations" className={styles.section}>
              <h2>Related configurations, pipelines and services</h2>
              <p>
                These configurations, services and pipelines use this model within their
                own configurations. Their results, where available, are
                not assigned to the underlying model.
              </p>
              <ul className={styles.configurationList}>
                {downstream.map((item) => (
                  <li key={item.record.id}>
                    <Link href={`${recordHref(item.record)}#results`}>
                      {catalogueText(item.record.name)}
                    </Link>{" "}
                    <span>
                      {singularKindLabels[item.record.kind]} ·{" "}
                      {query.results({ id: item.record.id, limit: 1 }).total}{" "}
                      metric rows
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {entity && (
            <section
              id={predictive ? "use-model" : "methods"}
              className={styles.section}
            >
              <h2>
                {predictive
                  ? "Use this model"
                  : "Methods and evaluation design"}
              </h2>
              <details className={styles.profileDisclosure}>
                <summary>
                  {predictive
                    ? "How it works, versions and access"
                    : "Procedure, tasks and evaluated configurations"}
                </summary>
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
                    Underlying model:{" "}
                    <Links records={usesModels.map((item) => item.record)} />.
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
                          record.attributes.version ||
                          record.attributes.checkpoint,
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
                <Profile
                  record={profileOwner.record}
                  sources={profileOwner.sources}
                  part="mechanism"
                />
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
                        <section
                          key={group.kind}
                          className={styles.relationshipCard}
                        >
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
                {evaluationDesign && linkedEvaluations.length > 0 && (
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
          )}
          {["dataset", "dataset_subset"].includes(record.kind) && (
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
                    <section
                      key={group.kind}
                      className={styles.relationshipCard}
                    >
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
          )}
          {(evaluationDesign || hasRunInstructions) && <div id="execution" />}
          <BaselineCoverage record={record} catalogue={catalogue} />
          {evaluationDesign && (
            <RunRecipes
              record={record}
              sources={detail.sources}
              protocols={protocolLinks.filter(
                (item) => item.kind === "protocol",
              )}
            />
          )}
          {record.kind === "evaluation" && (
            <section id="methods" className={styles.section}>
              <span id="protocol" />
              <h2>Evaluation procedure</h2>
              <p>{displayValue(record.attributes.protocol)}</p>
              <dl className={styles.details}>
                {contextGroups.map((group) => (
                  <Fragment key={group.kind}>
                    <dt>{group.label}</dt>
                    <dd>
                      <Links records={group.records} />
                    </dd>
                  </Fragment>
                ))}
              </dl>
              <Fields
                fields={{
                  origin: originLabel(record.attributes.origin),
                  configuration: record.attributes.version,
                  ...((record.attributes.comparison as Record<
                    string,
                    unknown
                  >) || {}),
                }}
              />
              <p className={styles.notice}>
                Metadata review: {record.status.replace(/_/g, " ")}. Unreported
                conditions prevent automatic comparisons.
              </p>
            </section>
          )}
          {["result", "evaluation"].includes(record.kind) && (
            <Reproduction
              evaluation={evaluated}
              records={catalogue.records}
              compact
            />
          )}
          {hasRunInstructions &&
            (record.attributes.run_recipes ? (
              <details className={styles.section}>
                <summary>Original repository instructions</summary>
                <RunGuide record={record} sources={detail.sources} />
              </details>
            ) : (
              <RunGuide record={record} sources={detail.sources} />
            ))}
          {entity && (
            <details className={styles.profileDisclosure}>
              <summary>Strengths, limitations and unresolved questions</summary>
              <Profile
                record={profileOwner.record}
                sources={profileOwner.sources}
                part="limitations"
              />
            </details>
          )}
          {entity && (
            <Profile
              record={profileOwner.record}
              sources={profileOwner.sources}
              part="specifications"
            />
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
            {evaluationDesign && record.attributes.benchmark_research ? (
              <BenchmarkResearch
                research={
                  record.attributes.benchmark_research as BenchmarkResearchData
                }
                sources={detail.sources}
                results={results.total}
              />
            ) : null}
            <EvidenceTable
              key={`${catalogue.release_id}:${record.id}:evidence`}
              id={record.id}
              initial={evidence}
              initialScope={evidenceScope}
              collapsed
              sectionId="evidence-claims"
            />
            <section id="sources" className={styles.section}>
              <h2>Sources and history</h2>
              {!!catalogue.coverage.audit_history && (
                <p>
                  <Link
                    href={`/audits/?record=${encodeURIComponent(record.id)}`}
                  >
                    View linked audit checks and correction history
                  </Link>
                </p>
              )}
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
                {record.kind === "source" &&
                  safeSourceUrl(record.attributes.url) && (
                    <p>
                      <a href={safeSourceUrl(record.attributes.url)}>
                        Read original source
                      </a>
                    </p>
                  )}
                <a
                  href={`/omics/releases/${catalogue.release_id}/records.jsonl`}
                  download
                >
                  Download this release
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
