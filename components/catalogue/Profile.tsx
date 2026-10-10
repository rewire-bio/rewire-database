import {
  isModelSubject,
  entityKindLabel,
} from "@/shared/omics/entity-kinds";
import Link from "next/link";
import type { ReactNode } from "react";
import { profileSchema } from "@/lib/omics-profile";
import ProfileDiagram from "./ProfileDiagram";
import { recordHref, safeSourceUrl, type OmicsRecord } from "@/lib/omics";
import styles from "@/app/database/database.module.css";

export function Evidence({
  ids,
  locator,
  sources,
}: {
  ids: string[];
  locator: string;
  sources: OmicsRecord[];
}) {
  return (
    <span className={styles.citation}>
      {ids.map((id, index) => {
        const source = sources.find((item) => item.id === id);
        return (
          <span key={id}>
            {index > 0 ? "; " : ""}
            <a
              href={
                safeSourceUrl(source?.attributes.url) ||
                `/database/source/${id}/`
              }
              title={locator}
            >
              {source?.name || id}
            </a>
          </span>
        );
      })}
      {locator && <span> · {locator}</span>}
    </span>
  );
}

/** Render bare http(s) URLs inside catalogue text as links. */
function LinkedText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(https?:\/\/[^\s),;]+)/).map((part, index) => {
        const url = index % 2 ? safeSourceUrl(part.replace(/\.$/, "")) : undefined;
        if (!url) return part;
        const trailing = part.endsWith(".") ? "." : "";
        return (
          <span key={index}>
            <a href={url} rel="noreferrer">
              {part.slice(0, part.length - trailing.length)}
            </a>
            {trailing}
          </span>
        );
      })}
    </>
  );
}

/** Keep precise citations one keyboard-accessible disclosure away. */
export function ProfileEvidence(props: Parameters<typeof Evidence>[0]) {
  return (
    <details className={styles.profileCitation}>
      <summary>
        Sources{props.ids.length > 1 ? ` (${props.ids.length})` : ""}
      </summary>
      <Evidence {...props} />
    </details>
  );
}

export default function Profile({
  record,
  sources,
  part,
  about,
}: {
  record: OmicsRecord;
  sources: OmicsRecord[];
  part: "overview" | "mechanism" | "limitations" | "visual" | "specifications";
  /** Without a profile, the overview shows this instead of repeating the header's description. */
  about?: ReactNode;
}) {
  const parsed = profileSchema.safeParse(record.attributes.profile);
  if (!parsed.success)
    return part !== "overview" ? null : (
      <section id="overview" className={styles.section}>
        <h2>Overview</h2>
        {about || (
          <p>An explanatory profile has not yet been reviewed for this record.</p>
        )}
        <p className={styles.muted}>
          Consult the linked sources for architecture or protocol details.
          Missing evidence is not evidence of a missing capability.
        </p>
      </section>
    );
  const profile = parsed.data;
  const predictive = isModelSubject(record.kind);
  const expected: [string, RegExp][] =
    record.kind === "method"
      ? [
          ["Method or algorithm", /type|class|algorithm|procedure/i],
          ["Inputs", /input/i],
          ["Outputs", /output/i],
          ["Implementation", /implementation|code|version/i],
          ["Assumptions", /assumption|condition|limitation/i],
          ["Code licence", /licen[cs]/i],
        ]
      : record.kind === "pipeline"
        ? [
            [
              "Components",
              /component|feature|encoder|classifier|method|architecture/i,
            ],
            ["Inputs", /input/i],
            ["Outputs", /output/i],
            ["Adaptation", /adaptation|training|fitting/i],
            ["Implementation", /implementation|code|version/i],
          ]
        : record.kind === "service"
          ? [
              ["Inputs", /input/i],
              ["Outputs", /output/i],
              ["Service version", /version|release/i],
              ["Access and terms", /access|terms|licen[cs]/i],
            ]
          : isModelSubject(record.kind)
            ? [
                ["Model type", /type|class|architecture|objective/i],
                ["Inputs", /input/i],
                ["Outputs", /output/i],
                ["Parameters", /parameter|model size/i],
                [
                  "Known versions",
                  /version|configuration|checkpoint|released model/i,
                ],
                ["Training data", /training/i],
                ["Context limits", /context|length/i],
                ["Access", /access/i],
                ["Code licence", /code.*licen[cs]/i],
                ["Weights licence", /weights?.*licen[cs]/i],
              ]
            : record.kind === "dataset" || record.kind === "dataset_subset"
              ? [
                  ["Data and labels", /data|label|reference|library/i],
                  ["Organisms", /organism|species/i],
                  ["Assays", /assay/i],
                  ["Version and access", /version|access|release/i],
                  ["Splits", /split|subset/i],
                ]
              : record.kind === "evaluator"
                ? [
                    ["Required inputs", /input|prediction|ground.truth/i],
                    ["Metrics", /metric|assessment|scor/i],
                    ["Implementation", /implementation|code|version/i],
                  ]
                : [
                    ["Datasets", /dataset|cohort/i],
                    ["Organisms", /organism|species/i],
                    ["Assays", /assay/i],
                    ["Splits", /split/i],
                    ["Allowed inputs", /inputs/i],
                    ["Adaptation", /adaptation|training/i],
                    ["Metrics", /metric|assessment/i],
                    ["Baselines", /baseline|comparator/i],
                  ];
  const unmatched = expected
    .filter(
      ([, pattern]) => !profile.facts.some((fact) => pattern.test(fact.label)),
    )
    .map(([label]) => label);

  const keyFacts = (
    predictive
      ? [
          /^(model type|method or algorithm|method type|architecture|components|model class|algorithm)$/i,
          /^(biological inputs|inputs|required inputs|input)$/i,
          /^(biological outputs|outputs|output)$/i,
          /^(access|availability|access and terms|local access)$/i,
        ]
      : [
          /^(datasets?|data and labels)$/i,
          /^(metrics?|scoring)$/i,
          /^(allowed inputs|inputs|required inputs)$/i,
        ]
  ).flatMap((pattern) => {
    const fact = profile.facts.find((item) => pattern.test(item.label));
    return fact ? [fact] : [];
  });
  // When every key fact cites the same sources, list them once for the section.
  const citationKey = (fact: (typeof keyFacts)[number]) =>
    `${[...fact.source_ids].sort().join(",")}|${fact.source_locator}`;
  const sharedFactSources =
    keyFacts.length > 1 &&
    keyFacts.every((fact) => citationKey(fact) === citationKey(keyFacts[0]))
      ? keyFacts[0]
      : null;
  const diagram = profile.diagram && (
    <figure className={styles.profileVisual}>
      <div className={styles.visualHeading}>
        <span>How it works</span>
        <strong>{profile.diagram.title}</strong>
      </div>
      <ProfileDiagram diagram={profile.diagram} id={record.id} />
      <figcaption>
        <p>{profile.diagram.caption}</p>
        <ProfileEvidence
          ids={profile.diagram.source_ids}
          locator={profile.diagram.source_locator}
          sources={sources}
        />
      </figcaption>
    </figure>
  );

  return (
    <>
      {part === "visual" && diagram}
      {part === "overview" && (
        <section id="overview" className={styles.section}>
          <h2>Overview</h2>
          {keyFacts.length > 0 && (
            <div className={styles.keyFacts}>
              {keyFacts.map((fact) => (
                <article key={fact.label}>
                  <h3>{fact.label}</h3>
                  <p>
                    <LinkedText text={fact.value} />
                  </p>
                  {fact.status && fact.status !== "source_checked" && (
                    <p className={styles.muted}>
                      {fact.status.replace(/_/g, " ")}
                    </p>
                  )}
                  {!sharedFactSources && (
                    <ProfileEvidence
                      ids={fact.source_ids}
                      locator={fact.source_locator}
                      sources={sources}
                    />
                  )}
                </article>
              ))}
            </div>
          )}
          {sharedFactSources && (
            <ProfileEvidence
              ids={sharedFactSources.source_ids}
              locator={sharedFactSources.source_locator}
              sources={sources}
            />
          )}
          {keyFacts.length === 0 && (
            <p>
              Key specifications have not been extracted for this record. See
              the linked evaluation and sources for the reported setup.
            </p>
          )}
          {!predictive && diagram && (
            <details className={styles.profileDisclosure}>
              <summary>Evaluation procedure diagram</summary>
              {diagram}
            </details>
          )}
          <p className={styles.muted}>
            {profile.coverage === "reviewed"
              ? "Source reviewed"
              : "limited source coverage"}
            {" · "}Automated source review, {profile.review.date}.{" "}
            <a href="#specifications">All specifications and missing details</a>
          </p>
        </section>
      )}
      {part === "specifications" && (
        <section id="specifications" className={styles.section}>
          <h2>Specifications</h2>
          <details className={styles.profileDisclosure}>
            <summary>Inputs, training, access and other details</summary>
            <p className={styles.muted}>
              Explanatory profile:{" "}
              {profile.coverage === "reviewed"
                ? "source reviewed"
                : "limited source coverage"}{" "}
              · Automated source review, {profile.review.date}. Review applies
              to the cited claims; unresolved fields are listed below. Numerical
              results retain their own review status.
            </p>
            {(profile.facts.length > 0 || unmatched.length > 0) && (
              <div
                className={styles.tableScroll}
                tabIndex={0}
                role="region"
                aria-label="Key facts"
              >
                <table className={styles.resultTable}>
                  <caption>
                    {isModelSubject(record.kind)
                      ? "Inputs, outputs and configuration"
                      : "Data, procedure and scoring"}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Property</th>
                      <th scope="col">Description and evidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profile.facts.map((fact, i) => (
                      <tr key={i}>
                        <th scope="row">{fact.label}</th>
                        <td>
                          <LinkedText text={fact.value} />
                          {fact.status && fact.status !== "source_checked" && (
                            <span className={styles.muted}>
                              {" "}
                              ·{" "}
                              {
                                {
                                  unreported:
                                    "Not reported in inspected sources",
                                  unextracted: "Needs further source review",
                                  unavailable: "Source unavailable",
                                  inapplicable: "Not applicable",
                                }[fact.status]
                              }
                            </span>
                          )}
                          <ProfileEvidence
                            ids={fact.source_ids}
                            locator={fact.source_locator}
                            sources={sources}
                          />
                        </td>
                      </tr>
                    ))}
                    {unmatched.map((label) => (
                      <tr key={label}>
                        <th scope="row">{label}</th>
                        <td>
                          {label === "Entity type"
                            ? entityKindLabel(record.kind)
                            : "Not extracted or verified for this record."}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </details>
        </section>
      )}
      {part === "mechanism" && (
        <section id="how-it-works" className={styles.section}>
          <h2>How it works</h2>

          {profile.sections.map((section, i) => (
            <details key={i} className={styles.profileDisclosure}>
              <summary>{section.title}</summary>
              <p>{section.body}</p>
              <ProfileEvidence
                ids={section.source_ids}
                locator={section.source_locator}
                sources={sources}
              />
            </details>
          ))}
        </section>
      )}
      {part === "limitations" && (
        <section id="strengths-limitations" className={styles.section}>
          <h2>Strengths and limitations</h2>
          <div className={styles.referenceGrid}>
            {(
              [
                [
                  profile.coverage === "reviewed"
                    ? "Strengths supported by sources"
                    : "Strengths and considerations",
                  profile.strengths,
                ],
                ["Limitations and conditions", profile.limitations],
              ] as const
            ).map(([title, claims]) => (
              <article key={title}>
                <h3>{title}</h3>
                {claims.length ? (
                  <ul className={styles.list}>
                    {claims.map((claim, i) => (
                      <li key={i}>
                        {claim.text}
                        <ProfileEvidence
                          ids={claim.source_ids}
                          locator={claim.source_locator}
                          sources={sources}
                        />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>
                    No source-reviewed explanatory claims are recorded here yet.
                  </p>
                )}
              </article>
            ))}
          </div>
          {profile.gaps.length > 0 && (
            <aside className={styles.notice}>
              <h3>What remains unknown</h3>
              <ul className={styles.list}>
                {profile.gaps.map((gap, i) => (
                  <li key={i}>{gap}</li>
                ))}
              </ul>
            </aside>
          )}
          <details>
            <summary>Profile review details</summary>
            <p>{profile.review.note}</p>
            <Link href={recordHref(record)}>Stable record: {record.id}</Link>
          </details>
        </section>
      )}
    </>
  );
}

export function EvidenceConcerns({ sources }: { sources: OmicsRecord[] }) {
  const concerns = sources.flatMap((source) => {
    const items = source.attributes.evidence_concerns;
    return Array.isArray(items)
      ? items
          .filter(
            (item): item is { message: string; source_locator: string } =>
              !!item &&
              typeof item === "object" &&
              typeof item.message === "string" &&
              typeof item.source_locator === "string",
          )
          .map((item) => ({ ...item, source }))
      : [];
  });
  if (!concerns.length) return null;
  return (
    <aside className={styles.notice} aria-label="Evidence concerns">
      <strong>Evidence concern: excluded from comparisons</strong>
      {concerns.map((item, index) => (
        <p key={index}>
          {item.message}
          <Evidence
            ids={[item.source.id]}
            locator={item.source_locator}
            sources={sources}
          />
        </p>
      ))}
    </aside>
  );
}
