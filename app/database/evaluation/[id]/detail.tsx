import { downloadHref } from "@/lib/downloads";
import Breadcrumbs from "@/components/catalogue/Breadcrumbs";
import { recordBreadcrumbs } from "@/lib/catalogue-sharing";
import { catalogueText } from "@/lib/catalogue-text";
import Link from "next/link";
import { Fragment } from "react";
import UseCaseBacklinks from "@/components/catalogue/UseCaseBacklinks";
import { recordHref, displayValue, originLabel, safeSourceUrl, type OmicsRecord } from "@/lib/omics";
import { EvidenceConcerns } from "@/components/catalogue/Profile";
import EvidenceTable from "@/components/catalogue/EvidenceTable";
import Reproduction from "@/components/catalogue/Reproduction";
import Results from "@/components/catalogue/Results";
import { resultsPayload } from "@/lib/results-payload";
import ResultMatrix from "@/components/catalogue/ResultMatrix";
import { resultMatrix } from "@/lib/result-matrix";
import { procedureReference } from "@/lib/result-labels";
import SourceIdentityNotice from "@/components/catalogue/SourceIdentity";
import SectionNavigation, {
  BrowseReturn,
} from "@/components/catalogue/SectionNavigation";
import ResearchReadiness from "@/components/catalogue/ResearchReadiness";
import { InvestigationList } from "@/components/catalogue/ResearchInvestigation";
import { countLabel, singularKindLabels, groupEntities, testedEntities, evaluationEntities, datasetEntities } from "@/lib/omics-browse";
import type { EvaluationRecordPage } from "@/lib/record-page";
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
 * own reviewed research readiness. Renders only the prepared page, which the
 * importer builds with the release's query engine. */
export function EvaluationDetail({ page }: { page: EvaluationRecordPage }) {
  const { detail, results, evidence, manifests } = page;
  const { record } = detail;
  const useCaseLinks = page.use_case_links;
  const useCaseConfigurations = page.use_case_configurations;
  const context = new Map(page.context.map((item) => [item.id, item]));
  const readiness = page.readiness ?? undefined;
  const investigations = page.investigations ?? undefined;
  const first = results.items[0];
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
        .filter((item) => ["data", "dataset", "dataset_subset"].includes(item.relation))
        .map((item) => item.record);
  const contextGroups = groupEntities([
    ...modelLinks,
    ...benchmarkLinks,
    ...datasetLinks,
  ]);
  const identitySubject = page.identity_subject ?? undefined;
  const proposals = [...detail.direct, ...detail.reverse].filter(
    (item) => item.relation === "applicable_to",
  );
  // The prepared page holds the first rows; pivot only when they are all of them.
  const matrix = results.total <= results.items.length ? resultMatrix(results.items) : null;
  const procedure = procedureReference(record.attributes.protocol, (id) => context.get(id));
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
              { id: "results", label: "Results" },
              { id: "methods", label: "Methods" },
              ...(readiness ? [{ id: "research-readiness", label: "Readiness" }] : []),
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
          <Results
            key={`${page.release_id}:${record.id}`}
            id={record.id}
            initial={resultsPayload(results)}
            title="Evaluation results"
            summary={matrix && <ResultMatrix matrix={matrix} label={`Results for ${catalogueText(record.name)}`} />}
          />
          {readiness && (
            <ResearchReadiness
              assessment={readiness}
              manifests={manifests}
              records={page.manifest_protocols}
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
          <section id="methods" className={styles.section}>
            <span id="protocol" />
            <h2>Evaluation procedure</h2>
            {procedure && (
              <p>
                {"record" in procedure ? (
                  <Link href={recordHref(procedure.record)}>{catalogueText(procedure.record.name)}</Link>
                ) : (
                  catalogueText(procedure.text)
                )}
              </p>
            )}
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
            records={page.context}
            recordById={(id) => context.get(id)}
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
              key={`${page.release_id}:${record.id}:evidence`}
              id={record.id}
              initial={evidence}
              initialScope="record_context"
              collapsed
              sectionId="evidence-claims"
            />
            <section id="sources" className={styles.section}>
              <h2>Sources and history</h2>
              <p className={styles.muted}>
                Release {page.release_id} · Record review:{" "}
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
                  href={downloadHref(`/omics/releases/${page.release_id}/records.jsonl`)}
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
