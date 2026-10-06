import Breadcrumbs from "@/components/catalogue/Breadcrumbs";
import { recordBreadcrumbs } from "@/lib/catalogue-sharing";
import { formatScore } from "@/lib/score-display";
import { catalogueText } from "@/lib/catalogue-text";
import Link from "next/link";
import { Fragment } from "react";
import { buildCatalogue } from "@/lib/catalogue-build";
import UseCaseBacklinks from "@/components/catalogue/UseCaseBacklinks";
import { recordHref, displayValue, originLabel, safeSourceUrl, type OmicsRecord } from "@/lib/omics";
import { Evidence, EvidenceConcerns } from "@/components/catalogue/Profile";
import EvidenceTable from "@/components/catalogue/EvidenceTable";
import Reproduction from "@/components/catalogue/Reproduction";
import SourceIdentityNotice from "@/components/catalogue/SourceIdentity";
import SectionNavigation, {
  BrowseReturn,
} from "@/components/catalogue/SectionNavigation";
import { singularKindLabels, predictiveKinds, groupEntities, testedEntities, evaluationEntities, datasetEntities } from "@/lib/omics-browse";
import { loadUseCaseContext, verifiedAssociation, type RecordDetail } from "@/lib/entity-detail";
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

/** A result record: a single measurement, its evaluation context and evidence.
 * No alias records currently route to the `result` legacy segment (see
 * workbench/entity-page-split-checkpoint.md), so this is canonical-only. */
export function ResultDetail({ detail }: { detail: RecordDetail }) {
  const { query, catalogue } = buildCatalogue();
  const { record } = detail;
  const { useCaseLinks, useCaseConfigurations } = loadUseCaseContext(
    query,
    record,
  );
  const results = query.results({ id: record.id, limit: 25 });
  const first = results.items[0];
  const evidence = query.evidence({
    id: record.id,
    scope: "individual_claim",
    limit: 10,
  });
  const evaluated = first?.evaluation;
  const finding = `${formatScore(record.attributes.printed_value)}${record.attributes.unit === "percent" && !/%/.test(String(record.attributes.printed_value)) ? "%" : ""} ${displayValue(record.attributes.metric)}`;
  const modelLinks = first ? testedEntities(first) : [];
  const modelFamilies = modelLinks.flatMap((model) =>
    model.links
      .filter(
        (link) =>
          ["family", "variant_of", "alias_of"].includes(link.relation) &&
          verifiedAssociation(catalogue, model.id, link.relation, link.target_id),
      )
      .flatMap((link) => {
        const target = query.get({ id: link.target_id });
        return target ? [target.record] : [];
      }),
  );
  const benchmarkLinks = first ? evaluationEntities(first) : [];
  const datasetLinks = first ? datasetEntities(first) : [];
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
              <h1>{finding}</h1>
              <EvidenceConcerns sources={detail.sources} />
              <p className="intro">{catalogueText(record.name)}</p>
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
              ...(evaluated ? [{ id: "reproduction", label: "Reproduction" }] : []),
              { id: "evidence", label: "Evidence" },
            ]}
          />
          {record.status === "superseded" && (
            <aside className={styles.notice}>
              This record is superseded and retained for its history. Consult
              its correction links before using these results.
            </aside>
          )}
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
                    eligible: record.attributes.eligible_count ?? "unreported",
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
          <Reproduction
            evaluation={evaluated}
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
              initialScope="individual_claim"
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
