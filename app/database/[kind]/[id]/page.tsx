import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment } from "react";
import { buildCatalogue } from "@/lib/catalogue-build";
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
import RunGuide from "@/components/catalogue/RunGuide";
import Results from "@/components/catalogue/Results";
import BenchmarkCharts from "@/components/catalogue/BenchmarkCharts";
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
  const item = buildCatalogue().query.get({ id: params.id });
  if (
    !item ||
    !recordRouteKinds(item.record).some((kind) => kind === params.kind)
  )
    return {};
  return {
    title: item.record.name,
    description:
      (item.record.attributes.profile as { summary?: string } | undefined)
        ?.summary || item.record.description,
    alternates: {
      canonical: `https://benchmarks.rewire.it${recordHref(item.record)}`,
    },
  };
}
function Links({ records }: { records: OmicsRecord[] }) {
  return (
    <>
      {records.length
        ? records.map((record, i) => (
            <span key={record.id}>
              {i > 0 ? "; " : ""}
              <Link href={recordHref(record)}>{record.name}</Link>
            </span>
          ))
        : "Not reported"}
    </>
  );
}
function Fields({ fields }: { fields: Record<string, unknown> }) {
  return (
    <dl className={styles.details}>
      {Object.entries(fields).map(([key, value]) => (
        <Fragment key={key}>
          <dt>{key.replace(/_/g, " ")}</dt>
          <dd>{displayValue(value)}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

export default function RecordPage({ params }: { params: Params }) {
  const { query, catalogue } = buildCatalogue();
  const detail = query.get({ id: params.id });
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
    record.attributes.run_guide || record.attributes.run_documentation,
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
  const localProfile = profileSchema.safeParse(record.attributes.profile);
  const shared =
    family && profileSchema.safeParse(family.record.attributes.profile).success
      ? query.get({ id: family.record.id })
      : null;
  const profileOwner = shared && !localProfile.success ? shared : detail;
  const profile = profileSchema.safeParse(
    profileOwner.record.attributes.profile,
  );
  const summary =
    (profileOwner.record.attributes.profile as { summary?: string } | undefined)
      ?.summary || record.description;
  const finding =
    record.kind === "result"
      ? `${displayValue(record.attributes.printed_value)}${record.attributes.unit === "percent" ? "%" : ""} ${displayValue(record.attributes.metric)}`
      : record.name;
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
      <header className="page-head">
        <div className="wrap">
          {predictive && (
            <nav className={styles.nav} aria-label="Breadcrumb">
              <Link href="/">Benchmark database</Link>
              <Link href={`/?kind=${record.kind}#browse`}>
                {kindLabels[record.kind]}
              </Link>
            </nav>
          )}
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
                {record.kind === "result" ? record.name : summary}
              </p>
              {profile.success && profile.data.summary_source_ids && (
                <ProfileEvidence
                  ids={profile.data.summary_source_ids}
                  locator={profile.data.summary_source_locator || ""}
                  sources={profileOwner.sources}
                />
              )}
              {entity && (
                <p>
                  <a href="#results" className={styles.resultCount}>
                    {results.evaluation_count}{" "}
                    {results.evaluation_count === 1
                      ? "evaluation"
                      : "evaluations"}{" "}
                    · {results.total}{" "}
                    {results.total === 1 ? "metric row" : "metric rows"}
                  </a>
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
          {!predictive && (
            <nav className={styles.nav} aria-label="Breadcrumb">
              <Link href="/">Benchmark database</Link>
              <Link href={`/?kind=${record.kind}#browse`}>
                {kindLabels[record.kind]}
              </Link>
            </nav>
          )}
          {entity && (
            <nav className={styles.sectionNav} aria-label="On this page">
              <a href="#overview">At a glance</a>
              {predictive && <a href="#results">Results</a>}
              <a href="#how-it-works">How it works</a>
              {hasRunInstructions && <a href="#run">How to run</a>}
              {!predictive && <a href="#results">Results</a>}
              {detail.published_comparisons.length > 0 && (
                <a href="#charts">Charts</a>
              )}
              {record.attributes.benchmark_research ? (
                <a href="#papers">Papers</a>
              ) : null}
              <a href="#strengths-limitations">Strengths and limitations</a>
              {predictive && <a href="#specifications">Specifications</a>}
              {!predictive && <a href="#evidence">Evidence table</a>}
              <a href={predictive ? "#evidence" : "#sources"}>
                {predictive ? "Sources and evidence" : "Sources and history"}
              </a>
            </nav>
          )}
          {record.status === "superseded" && (
            <aside className={styles.notice}>
              This record is superseded and retained for its history. Consult
              its correction links before using these results.
            </aside>
          )}
          {record.kind === "result" && (
            <section
              className={styles.finding}
              aria-label="Finding and evaluation context"
            >
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
                    <Link href={recordHref(evaluated)}>{evaluated.name}</Link>
                  ) : (
                    "Not linked"
                  )}
                </dd>
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
          {entity && (
            <>
              {family && (
                <p className={styles.notice}>
                  Related profile:{" "}
                  <Link href={recordHref(family.record)}>
                    {family.record.name}
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
              <Profile
                record={profileOwner.record}
                sources={profileOwner.sources}
                part="overview"
              />
              {predictive &&
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
              {downstream.length > 0 && (
                <section id="configurations" className={styles.section}>
                  <h2>Configurations, pipelines and services</h2>
                  <p>
                    These services and pipelines use this model within their own
                    configurations. Their results, where available, are not
                    assigned to the underlying model.
                  </p>
                  <ul className={styles.configurationList}>
                    {downstream.map((item) => (
                      <li key={item.record.id}>
                        <Link href={recordHref(item.record)}>
                          {item.record.name}
                        </Link>{" "}
                        <span>
                          {singularKindLabels[item.record.kind]} ·{" "}
                          {
                            query.results({ id: item.record.id, limit: 1 })
                              .total
                          }{" "}
                          metric rows
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {profileOwner.record.id !== record.id && (
                <section className={styles.section}>
                  <h2>This configuration</h2>
                  <p>
                    {localProfile.success
                      ? localProfile.data.summary
                      : record.description}
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
                        <Link href={recordHref(item.record)}>
                          {item.record.name}
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
                              <Link href={recordHref(item)}>{item.name}</Link>
                            </li>
                          ))}
                        </ul>
                      </section>
                    ))}
                  </div>
                  <p className={styles.muted}>
                    These source-backed links do not make different protocols or
                    scores interchangeable.
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
                        <Link href={recordHref(item)}>{item.name}</Link>
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
            </>
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
                            <Link href={recordHref(item)}>{item.name}</Link>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              )}
            </section>
          )}
          {hasRunInstructions && (
            <RunGuide record={record} sources={detail.sources} />
          )}
          {record.kind === "evaluation" && (
            <section id="protocol" className={styles.section}>
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
          {evaluationDesign && (
            <BenchmarkCharts panels={detail.published_comparisons} />
          )}
          {!predictive &&
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
          {evaluationDesign && record.attributes.benchmark_research ? (
            <BenchmarkResearch
              research={
                record.attributes.benchmark_research as BenchmarkResearchData
              }
              sources={detail.sources}
            />
          ) : null}
          {entity && (
            <Profile
              record={profileOwner.record}
              sources={profileOwner.sources}
              part="limitations"
            />
          )}
          {predictive && (
            <Profile
              record={profileOwner.record}
              sources={profileOwner.sources}
              part="specifications"
            />
          )}
          {proposals.length > 0 && (
            <section className={styles.section}>
              <h2>Applicable tests and references</h2>
              <p>Applicability is distinct from a completed evaluation.</p>
              <ul className={styles.list}>
                {proposals.map((item, i) => (
                  <li key={i}>
                    <Link href={recordHref(item.record)}>
                      {item.record.name}
                    </Link>{" "}
                    ·{" "}
                    {String(
                      item.record.attributes.applicability ||
                        "Proposed association",
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <EvidenceTable
            key={`${catalogue.release_id}:${record.id}:evidence`}
            id={record.id}
            initial={evidence}
            initialScope={evidenceScope}
            collapsed={predictive}
          />
          <section id="sources" className={styles.section}>
            <h2>Sources and history</h2>
            <p className={styles.muted}>
              Release {catalogue.release_id} · Record review:{" "}
              {record.status.replace(/_/g, " ")}
            </p>
            <details className={styles.profileDisclosure} open={!predictive}>
              <summary>
                {detail.sources.length} source records and release history
              </summary>
              {detail.sources.length ? (
                <ul className={styles.list}>
                  {detail.sources.map((source) => (
                    <li key={source.id}>
                      <Link href={recordHref(source)}>{source.name}</Link>
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
                      {item.record.name}
                    </Link>
                  </p>
                ))}
              {detail.reverse
                .filter((item) => item.relation === "supersedes")
                .map((item) => (
                  <p key={item.record.id}>
                    Superseded by{" "}
                    <Link href={recordHref(item.record)}>
                      {item.record.name}
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
                  <Link href={recordHref(item.record)}>{item.record.name}</Link>
                </li>
              ))}
            </ul>
          </details>
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
