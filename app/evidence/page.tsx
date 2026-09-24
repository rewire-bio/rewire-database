import Breadcrumbs from "@/components/catalogue/Breadcrumbs";
import { socialMetadata } from "@/lib/catalogue-sharing";
import type { Metadata } from "next";
import Link from "next/link";
import { buildCatalogue } from "@/lib/catalogue-build";
import { createEvidenceIndex } from "@/services/omics/src/evidence-table";
import styles from "@/app/database/database.module.css";

const pageMetadata = {
  title: "Evidence and source origins",
  description:
    "Trace rewire catalogue statements to original sources, exact locations, reviewed artifacts and explicitly unresolved metadata.",
  alternates: { canonical: "https://benchmarks.rewire.it/evidence/" },
};
export const metadata: Metadata = {
  ...pageMetadata,
  ...socialMetadata({
    title: pageMetadata.title,
    description: pageMetadata.description,
    path: pageMetadata.alternates.canonical,
  }),
};
export default function EvidenceGuide() {
  const { catalogue } = buildCatalogue();
  const rows = createEvidenceIndex(catalogue).all();
  const release = `/omics/releases/${catalogue.release_id}`;
  const scopes = [
    [
      "individual_claim",
      "Individual claim",
      "A specific statement has its own citation and location. Check the review status: an unreported field or conflicting claim is not a verified value.",
    ],
    [
      "record_context",
      "Context-only reference",
      "The source is attached to the record, but this individual field has not been separately checked. This includes unresolved evaluation conditions and inherited discovery metadata.",
    ],
    [
      "source_metadata",
      "Source metadata",
      "Bibliographic and retrieval metadata describes an inspected resource. A source’s review status does not verify everything it contains.",
    ],
    [
      "catalogue_metadata",
      "Catalogue metadata",
      "Rewire’s identifiers, classifications, review history and preserved migration fields. These are editorial or administrative records, not experimental observations.",
    ],
  ];
  const facts = rows.filter((row) =>
    /\.profile\.facts\.\d+\.value$/.test(row.field_path),
  );
  const uniqueFacts = new Map(
    facts.map((row) => [`${row.record_id}:${row.field_path}`, row]),
  );
  return (
    <>
      <header className="page-head">
        <div className="wrap">
          <Breadcrumbs items={[{ name: "Database", path: "/" }, { name: "Evidence and sources", path: "/evidence/" }]} />
          <span className="kick">Methods and provenance</span>
          <h1>Where the data comes from</h1>
          <p className="intro">
            Every published record has an evidence table. Use it to distinguish
            a checked scientific claim from a general reference, an unresolved
            detail or a catalogue decision.
          </p>
        </div>
      </header>
      <section className="block first">
        <div className="wrap">
          <section className={styles.section}>
            <h2>What review status means</h2>
            <dl className={styles.details}>
              <dt>Source checked</dt>
              <dd>
                The reported claim or value was checked against its cited
                source. It has not necessarily been reproduced.
              </dd>
              <dt>Independently reproduced</dt>
              <dd>
                A separate execution must be documented by its run artifacts and
                validation scope. A source check or small smoke test does not
                establish reproduction.
              </dd>
              <dt>Unreported or unextracted</dt>
              <dd>
                The source omits the information, or it has not yet been
                extracted. A missing field is not a verified value.
              </dd>
            </dl>
            <h3>What the citation supports</h3>
            <div
              className={styles.tableScroll}
              tabIndex={0}
              role="region"
              aria-label="Evidence scopes"
            >
              <table className={styles.resultTable}>
                <caption>What each evidence scope establishes</caption>
                <thead>
                  <tr>
                    <th scope="col">Scope</th>
                    <th scope="col">Rows</th>
                    <th scope="col">Meaning</th>
                  </tr>
                </thead>
                <tbody>
                  {scopes.map(([key, label, explanation]) => (
                    <tr key={key}>
                      <th scope="row">{label}</th>
                      <td>
                        {rows
                          .filter((row) => row.evidence_scope === key)
                          .length.toLocaleString("en-GB")}
                      </td>
                      <td>{explanation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              Profile explanations were checked against primary papers,
              supplements, official implementations and documentation through
              automated source review. This is not human sign-off. A
              source-checked score confirms the reported transcription; it is
              not an independent rerun. Existing rewire runs keep their original
              run history and have not been rerun for this release.
            </p>
            <p>
              A locator shared by several references is marked{" "}
              <code>shared_claim_locator</code>. It identifies the evidence for
              the statement as a whole, not a separately verified location in
              every cited source. Source disagreements and superseded records
              remain visible.
            </p>
          </section>
          <section className={styles.section}>
            <h2>Inspect an example</h2>
            <ul className={styles.list}>
              <li>
                <Link href="/database/model/discovery-model-alphafold-3/#evidence">
                  AlphaFold 3: architecture, training and separate code/weight
                  terms
                </Link>
              </li>
              <li>
                <Link href="/database/model/catalog-model-alphafold-3-server/#evidence">
                  AlphaFold Server: service limits and reproducibility
                </Link>
              </li>
              <li>
                <Link href="/database/result/b2-barcodebert-2026/#evidence">
                  BarcodeBERT: the original 78.5 result and Table 1 location
                </Link>
              </li>
            </ul>
          </section>
          <section className={styles.section}>
            <h2>Coverage and remaining gaps</h2>
            <p>
              This release contains{" "}
              {
                catalogue.records.filter((record) => record.kind === "model")
                  .length
              }{" "}
              model records and{" "}
              {
                catalogue.records.filter(
                  (record) => record.kind === "benchmark",
                ).length
              }{" "}
              top-level benchmarks, with methods, configurations, tasks,
              protocols and datasets listed separately. The catalogue’s
              explanatory profiles contain{" "}
              {uniqueFacts.size.toLocaleString("en-GB")} structured facts,
              including{" "}
              {Array.from(uniqueFacts.values())
                .filter((row) => row.review_status === "source_checked")
                .length.toLocaleString("en-GB")}{" "}
              source-checked facts. Missingness and applicability are counted
              separately:
            </p>
            <ul className={styles.list}>
              {["unreported", "unextracted", "unavailable", "inapplicable"].map(
                (status) => (
                  <li key={status}>
                    {status.replace(/_/g, " ")}:{" "}
                    {
                      Array.from(uniqueFacts.values()).filter(
                        (row) => row.review_status === status,
                      ).length
                    }
                  </li>
                ),
              )}
            </ul>
            <p>
              These counts cover profile facts only. Dataset, baseline and
              evaluation records still contain fields needing extraction or
              review, including exact checkpoints, splits, adaptation and
              scoring details. The evidence tables expose those gaps rather than
              treating a linked paper as proof. Unknown conditions prevent
              automatic comparisons.
            </p>
            <p>
              The catalogue is a dated collection, not a complete census of
              biological models. Popularity, citations and repository activity
              do not measure biological performance. Results remain attached to
              their actual configuration and protocol; we do not combine
              incompatible scores into a universal leaderboard.
            </p>
          </section>

          <section className={styles.section}>
            <h2>Download the source-origin tables</h2>
            <p>
              <Link href="/audits/">
                Browse linked audit checks and review history
              </Link>
            </p>
            <p>
              Release {catalogue.release_id}, published{" "}
              {catalogue.released_at.slice(0, 10)}. The table contains{" "}
              {rows.length.toLocaleString("en-GB")} rows across{" "}
              {catalogue.records.length.toLocaleString("en-GB")} records. A
              statement citing two sources occupies two rows; this is not a
              count of independent findings.
            </p>
            <div className={styles.downloads}>
              <a href={`${release}/evidence.csv`} download>
                Evidence table (CSV)
              </a>
              <a href={`${release}/evidence.jsonl`} download>
                Evidence table (JSONL)
              </a>
              <a href={`${release}/manifest.json`}>Release checksums</a>
            </div>
            <p>
              Each row stores the stable record and field, original value,
              source URL and DOI, version, evidence location, retrieval date,
              artifact hash and its scope, review method and review date. Empty
              cells mean that information was not recorded. Hashes identify
              inspected bytes; they are not a guarantee that a scientific claim
              is correct.
            </p>
            <p>
              Use <code>record_id</code> to select a model, benchmark or result.
              Use <code>field_path</code> to find its original field, and{" "}
              <code>source_id</code> to join the source record. The JSONL{" "}
              <code>value_json</code> preserves types, nulls and exact strings.
              CSV cells that could be spreadsheet formulas are escaped with a
              leading apostrophe; use JSONL for lossless machine processing.
            </p>
          </section>
        </div>
      </section>
    </>
  );
}
