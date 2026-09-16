import type { Metadata } from "next";
import { Fragment } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  parseCatalogue,
  recordHref,
  displayValue,
  safeSourceUrl,
  originLabel,
} from "@/lib/omics";
import styles from "../../database.module.css";
import { kindLabels } from "@/lib/omics-browse";
const load = () =>
  parseCatalogue(
    JSON.parse(
      readFileSync(join(process.cwd(), "public/omics/catalogue.json"), "utf8"),
    ),
  );
export function generateStaticParams() {
  return load().records.map((record) => ({ kind: record.kind, id: record.id }));
}
export function generateMetadata({
  params,
}: {
  params: { kind: string; id: string };
}): Metadata {
  const record = load().records.find(
    (item) => item.kind === params.kind && item.id === params.id,
  );
  return record
    ? {
        title: record.name,
        description: record.description,
        alternates: { canonical: `https://benchmarks.rewire.it${recordHref(record)}` },
      }
    : {};
}
export default function RecordPage({
  params,
}: {
  params: { kind: string; id: string };
}) {
  const catalogue = load();
  const record = catalogue.records.find(
    (item) => item.kind === params.kind && item.id === params.id,
  );
  if (!record) notFound();
  const sources = catalogue.records.filter((item) =>
    record.source_ids.includes(item.id),
  );
  const outbound = record.links
    .map((link) => ({
      relation: link.relation,
      record: catalogue.records.find((item) => item.id === link.target_id),
    }))
    .filter((item) => item.record);
  const inbound = catalogue.records.filter(
    (item) =>
      item.id !== record.id &&
      (item.links.some((link) => link.target_id === record.id) ||
        item.source_ids.includes(record.id)),
  );
  const evaluation = catalogue.records.find(
    (item) =>
      item.id ===
      record.links.find((link) => link.relation === "evaluation")?.target_id,
  );
  const sourceUrl = safeSourceUrl(record.attributes.url);
  return (
    <>
      <header className="page-head">
        <div className="wrap">
          <span className="kick">
            {record.kind} · {record.status.replace(/_/g, " ")}
          </span>
          <h1>{record.name}</h1>
          <p className="intro">{record.description}</p>
        </div>
      </header>
      <section className="block first">
        <div className="wrap">
          <nav className={styles.nav} aria-label="Breadcrumb">
            <Link href="/">Benchmark database</Link>
            <Link href={`/?kind=${record.kind}#browse`}>{kindLabels[record.kind]}</Link>
            <a
              href={`/contribute/?type=correction&target_id=${encodeURIComponent(record.id)}`}
            >
              Suggest a correction
            </a>
          </nav>
          <div className={styles.notice}>
            {record.status === "source_checked"
              ? "The recorded evidence has been checked against its source. This is not independent experimental reproduction, and does not verify every metadata field."
              : record.status === "reproduced"
                ? "Reproduction is recorded for this entry. Inspect its evaluation protocol and evidence before drawing comparisons."
                : record.status === "superseded"
                  ? "This record is superseded and retained for its history. Consult its related records for current evidence."
                  : record.status === "disputed"
                    ? "This record contains disputed evidence. Do not use it as settled evidence."
                    : "This is a discovery or review-stage record. Its metadata and evidence may be incomplete."}
            {record.kind === "baseline" &&
              record.attributes.applicability === "proposed" &&
              " This is a proposed reference method, not an observed benchmark result."}
          </div>
          {record.kind === "result" && (
            <p>{originLabel(evaluation?.attributes.origin)}</p>
          )}
          <p className={styles.muted}>
            Stable ID: {record.id} · Release: {catalogue.release_id}
          </p>
          {sourceUrl && (
            <p className={styles.downloads}>
              <a href={sourceUrl} rel="noopener noreferrer">
                Open original source
              </a>
            </p>
          )}
          <section className={styles.section}>
            <h2>Metadata</h2>
            <dl className={styles.details}>
              {Object.entries(record.facets).map(([key, value]) => (
                <Fragment key={`facet-${key}`}>
                  <dt>{key.replace(/_/g, " ")}</dt>
                  <dd>{displayValue(value)}</dd>
                </Fragment>
              ))}
              {Object.entries(record.attributes).map(([key, value]) => (
                <Fragment key={key}>
                  <dt>{key.replace(/_/g, " ")}</dt>
                  <dd>{displayValue(value)}</dd>
                </Fragment>
              ))}
            </dl>
          </section>
          <section className={styles.section}>
            <h2>Evidence</h2>
            {sources.length ? (
              <ul className={styles.list}>
                {sources.map((source) => (
                  <li key={source.id}>
                    <Link href={recordHref(source)}>{source.name}</Link>
                    {safeSourceUrl(source.attributes.url) && (
                      <>
                        {" "}
                        ·{" "}
                        <a
                          href={safeSourceUrl(source.attributes.url)}
                          rel="noopener noreferrer"
                        >
                          Original source
                        </a>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p>No supporting source has been linked yet.</p>
            )}
          </section>
          <section className={styles.section}>
            <h2>Related records</h2>
            {outbound.length + inbound.length ? (
              <ul className={styles.list}>
                {outbound.map(
                  ({ relation, record: item }, index) =>
                    item && (
                      <li key={`${item.id}-${relation}-${index}`}>
                        {relation.replace(/_/g, " ")}:{" "}
                        <Link href={recordHref(item)}>{item.name}</Link>
                      </li>
                    ),
                )}
                {inbound.map((item) => (
                  <li key={`in-${item.id}`}>
                    {item.kind}:{" "}
                    <Link href={recordHref(item)}>{item.name}</Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No related records have been linked yet.</p>
            )}
          </section>
          <p className={styles.downloads}>
            <a
              href={`/omics/releases/${catalogue.release_id}/records.jsonl`}
              download
            >
              Download this release
            </a>
          </p>
        </div>
      </section>
    </>
  );
}
