import Breadcrumbs from "@/components/catalogue/Breadcrumbs";
import { recordBreadcrumbs } from "@/lib/catalogue-sharing";
import { catalogueText } from "@/lib/catalogue-text";
import Link from "next/link";
import { Fragment } from "react";
import { buildCatalogue } from "@/lib/catalogue-build";
import UseCaseBacklinks from "@/components/catalogue/UseCaseBacklinks";
import { recordHref, displayValue, originLabel, safeSourceUrl, type OmicsRecord } from "@/lib/omics";
import { EvidenceConcerns } from "@/components/catalogue/Profile";
import EvidenceTable from "@/components/catalogue/EvidenceTable";
import Reproduction from "@/components/catalogue/Reproduction";
import Results from "@/components/catalogue/Results";
import SourceIdentityNotice from "@/components/catalogue/SourceIdentity";
import SectionNavigation, {
  BrowseReturn,
} from "@/components/catalogue/SectionNavigation";
import ResearchReadiness from "@/components/catalogue/ResearchReadiness";
import { InvestigationList } from "@/components/catalogue/ResearchInvestigation";
import { getResearch } from "@/services/omics/src/research";
import { singularKindLabels, groupEntities, testedEntities, evaluationEntities, datasetEntities } from "@/lib/omics-browse";
import { loadUseCaseContext, type RecordDetail } from "@/lib/entity-detail";
import styles from "../../database.module.css";

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

/** An evaluation: the model, data and conditions behind a result, plus its
 * own reviewed research readiness. No alias records currently route to the
 * `evaluation` legacy segment (see workbench/entity-page-split-checkpoint.md). */
export function EvaluationDetail({ detail }: { detail: RecordDetail }) {
  const { query, catalogue } = buildCatalogue();
  const { record } = detail;
  const { useCaseLinks, useCaseConfigurations } = loadUseCaseContext(
    query,
    record,
  );
  const readiness = query.researchReadiness({ id: record.id, limit: 1 }).items[0];
  const manifests = readiness
    ? getResearch(catalogue).manifests.filter((manifest) =>
        readiness.manifest_ids.includes(manifest.id),
      )
    : [];
  const investigations = readiness
    ? query.investigations({ record_id: record.id, limit: 25 })
    : undefined;
  const results = query.results({ id: record.id, limit: 25 });
  const first = results.items[0];
  const evidence = query.evidence({
    id: record.id,
    scope: "record_context",
    limit: 10,
  });
  const summary = catalogueText(record.description);
  const modelLinks = first
    ? testedEntities(first)
    : detail.direct
        .filter((item) =>
          ["model", "method", "configuration", "pipeline", "service"].includes(
            item.relation,
          ),
        )
        .map((item) => item.record);
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
  const contextGroups = groupEntities([
    ...modelLinks,
    ...benchmarkLinks,
    ...datasetLinks,
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
            </div>
          </div>
        </div>
      </header>
      <section className="block first">
        <div className="wrap">
          <UseCaseBacklinks links={useCaseLinks} configurations={useCaseConfigurations} />
          <SectionNavigation
            sections={[
              { id: "finding", label: "Finding" },
              { id: "methods", label: "Methods" },
              { id: "reproduction", label: "Reproduction" },
              { id: "evidence", label: "Evidence" },
            ]}
          />
          {record.status === "superseded" && (
            <aside className={styles.notice}>
              This record is superseded and retained for its history. Consult
              its correction links before using these results.
            </aside>
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
          <Results
            key={`${catalogue.release_id}:${record.id}`}
            id={record.id}
            initial={results}
            title="Evaluation results"
          />
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
                ...((record.attributes.comparison as Record<string, unknown>) ||
                  {}),
              }}
            />
            <p className={styles.notice}>
              Metadata review: {record.status.replace(/_/g, " ")}. Unreported
              conditions prevent automatic comparisons.
            </p>
          </section>
          <Reproduction
            evaluation={record}
            records={catalogue.records}
            recordById={query.record}
            compact
          />
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
