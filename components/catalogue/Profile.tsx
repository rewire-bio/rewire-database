import {
  isModelSubject,
  entityKindLabel,
} from "@/services/omics/src/entity-kinds";
import Link from "next/link";
import { profileSchema } from "@/lib/omics-profile";
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

export default function Profile({
  record,
  sources,
  part,
}: {
  record: OmicsRecord;
  sources: OmicsRecord[];
  part: "overview" | "mechanism" | "limitations";
}) {
  const parsed = profileSchema.safeParse(record.attributes.profile);
  if (!parsed.success)
    return part !== "overview" ? null : (
      <section id="overview" className={styles.section}>
        <h2>Overview</h2>
        <p>
          {record.description ||
            "An explanatory profile has not yet been reviewed for this record."}
        </p>
        <p className={styles.muted}>
          Consult the linked sources for architecture or protocol details.
          Missing evidence is not evidence of a missing capability.
        </p>
      </section>
    );
  const profile = parsed.data;
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

  let diagramHeight = 0;
  const diagramSteps =
    profile.diagram?.steps.map((step) => {
      const lines: string[] = [];
      let line = "";
      for (const word of step.split(/\s+/)) {
        if (line && `${line} ${word}`.length > 32) {
          lines.push(line);
          line = word;
        } else line += `${line ? " " : ""}${word}`;
      }
      if (line) lines.push(line);
      const height = Math.max(72, lines.length * 18 + 28);
      const y = diagramHeight;
      diagramHeight += height + 24;
      return { lines, height, y };
    }) || [];

  return (
    <>
      {part === "overview" && (
        <section id="overview" className={styles.section}>
          <h2>At a glance</h2>

          <p className={styles.muted}>
            Explanatory profile:{" "}
            {profile.coverage === "reviewed"
              ? "source reviewed"
              : "limited source coverage"}{" "}
            · Automated source review, {profile.review.date}. Review applies to
            the cited claims; unresolved fields are listed below. Numerical
            results retain their own review status.
          </p>
          {profile.facts.length > 0 && (
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
                        {fact.value}
                        {fact.status && fact.status !== "source_checked" && (
                          <span className={styles.muted}>
                            {" "}
                            ·{" "}
                            {
                              {
                                unreported: "Not reported in inspected sources",
                                unextracted: "Needs further source review",
                                unavailable: "Source unavailable",
                                inapplicable: "Not applicable",
                              }[fact.status]
                            }
                          </span>
                        )}
                        <Evidence
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
        </section>
      )}
      {part === "mechanism" && (
        <section id="how-it-works" className={styles.section}>
          <h2>How it works</h2>
          {profile.diagram && (
            <figure className={styles.diagram}>
              <figcaption>
                <strong>{profile.diagram.title}</strong>
                <p>{profile.diagram.caption}</p>
              </figcaption>
              <svg
                role="img"
                aria-labelledby={`diagram-title-${record.id} diagram-desc-${record.id}`}
                viewBox={`0 0 360 ${diagramHeight}`}
              >
                <title id={`diagram-title-${record.id}`}>
                  {profile.diagram.title}
                </title>
                <desc id={`diagram-desc-${record.id}`}>
                  {profile.diagram.steps.join(". Then: ")}
                </desc>
                {diagramSteps.map(({ lines, height, y }, i) => (
                  <g key={i}>
                    <rect
                      x="16"
                      y={y + 8}
                      width="328"
                      height={height}
                      rx="8"
                      fill="var(--accent-soft)"
                      stroke="var(--line-2)"
                    />
                    <text x="32" y={y + 35} fill="var(--ink)" fontSize="16">
                      {lines.map((text, j) => (
                        <tspan key={j} x="32" dy={j ? 18 : 0}>
                          {text}
                        </tspan>
                      ))}
                    </text>
                    {i < diagramSteps.length - 1 && (
                      <path
                        d={`M180 ${y + height + 9}v13m-5 -5l5 5 5 -5`}
                        fill="none"
                        stroke="var(--accent-ink)"
                        strokeWidth="2"
                      />
                    )}
                  </g>
                ))}
              </svg>
              <Evidence
                ids={profile.diagram.source_ids}
                locator={profile.diagram.source_locator}
                sources={sources}
              />
            </figure>
          )}
          {profile.sections.map((section, i) => (
            <section key={i} className={styles.section}>
              {section.title.trim().toLowerCase() !== "how it works" && (
                <h3>{section.title}</h3>
              )}
              <p>{section.body}</p>
              <Evidence
                ids={section.source_ids}
                locator={section.source_locator}
                sources={sources}
              />
            </section>
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
                        <Evidence
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
