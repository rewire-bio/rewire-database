import Link from "next/link";
import {
  buildBaselineAudit,
  type BaselineAudit,
} from "@/lib/baseline-coverage";
import { recordHref, type OmicsCatalogue, type OmicsRecord } from "@/lib/omics";
import styles from "../../app/database/database.module.css";

const cache = new WeakMap<OmicsCatalogue, BaselineAudit>();
export function baselineAudit(catalogue: OmicsCatalogue) {
  let audit = cache.get(catalogue);
  if (!audit) {
    audit = buildBaselineAudit(catalogue);
    cache.set(catalogue, audit);
  }
  return audit;
}
export default function BaselineCoverage({
  record,
  catalogue,
}: {
  record: OmicsRecord;
  catalogue: OmicsCatalogue;
}) {
  if (!["benchmark", "protocol"].includes(record.kind)) return null;
  const audit = baselineAudit(catalogue);
  const rows = audit.protocols.filter((row) =>
    record.kind === "protocol"
      ? row.protocol_id === record.id
      : row.suite_ids.includes(record.id),
  );
  const active = rows.filter((row) => row.status !== "historical");
  const measured = active.filter((row) => row.status === "measured");
  const byId = new Map(catalogue.records.map((r) => [r.id, r]));
  const downloads = `/omics/baseline-coverage/${catalogue.release_id}`;
  return (
    <section
      id="reference-baselines"
      className={styles.section}
      aria-labelledby="reference-baselines-title"
    >
      <h2 id="reference-baselines-title">Rewire reference baselines</h2>
      <p>
        Reference methods help show what a model adds beyond simple controls. We
        track a null control and a conventional method for each protocol.
      </p>
      {rows.length ? (
        <p>
          <strong>
            {measured.length} of {active.length} active baseline roles have
            measured results in this release.
          </strong>{" "}
          {rows.length - active.length > 0
            ? `${(rows.length - active.length) / 2} historical protocols are retained separately.`
            : ""}{" "}
          A completed protocol does not establish coverage of an entire suite.
        </p>
      ) : (
        <p>
          No concrete protocols are explicitly linked to this suite. Protocol
          identification and baseline selection are outstanding.
        </p>
      )}
      {record.kind === "protocol" &&
        rows.map((row) => (
          <div key={row.role} className={styles.relationshipCard}>
            <h3>
              {row.role === "null" ? "Null control" : "Conventional reference"}
            </h3>
            <p>
              <strong>
                {row.status === "measured"
                  ? "Measured reference"
                  : row.status === "historical"
                    ? "Historical protocol"
                    : "Selection requires review"}
              </strong>
            </p>
            <p>{row.candidate}</p>
            {row.blocker && <p className={styles.muted}>{row.blocker}</p>}
            {row.status === "selection_required" && (
              <p className={styles.muted}>
                This is a suggested selection rule, not a validated method or a
                measured score.
              </p>
            )}
            {row.evaluation_ids
              .map((id) => byId.get(id))
              .filter((r): r is OmicsRecord => Boolean(r))
              .map((evaluation) => (
                <p key={evaluation.id}>
                  <Link href={recordHref(evaluation)}>
                    {evaluation.name}: methods, coverage and results
                  </Link>
                </p>
              ))}
            {row.source_locator && (
              <p className={styles.muted}>Evidence: {row.source_locator}</p>
            )}
          </div>
        ))}
      {record.kind === "benchmark" && rows.length > 0 && (
        <details>
          <summary>Baseline status by linked protocol</summary>
          <ul className={styles.list}>
            {[...new Set(rows.map((row) => row.protocol_id))].map((id) => {
              const protocol = byId.get(id)!;
              const statuses = rows.filter((row) => row.protocol_id === id);
              return (
                <li key={id}>
                  <Link href={recordHref(protocol)}>{protocol.name}</Link> ·{" "}
                  {statuses.every((row) => row.status === "historical")
                    ? "historical"
                    : `${statuses.filter((row) => row.status === "measured").length}/2 roles measured`}
                </li>
              );
            })}
          </ul>
        </details>
      )}
      <p>
        <a href={`${downloads}/protocol-baselines.csv`} download>
          Protocol coverage CSV
        </a>
        {" · "}
        <a href={`${downloads}/model-evaluation-matrix.csv`} download>
          Model evaluation matrix
        </a>
        {" · "}
        <a href={`${downloads}/sources.csv`} download>
          Source table
        </a>
        {" · "}
        <a href={`${downloads}/manifest.json`}>Release and checksums</a>
      </p>
      <p className={styles.muted}>
        Coverage is derived from release {catalogue.release_id}. Source
        citations describe the original records; they do not validate an
        unreviewed baseline proposal. No results have been generated by this
        audit.
      </p>
    </section>
  );
}
