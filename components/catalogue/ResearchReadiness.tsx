import { Fragment } from "react";
import Link from "next/link";
import { displayValue, recordHref, safeSourceUrl, type OmicsRecord } from "@/lib/omics";
import type { ResearchManifest, ResearchReadiness as Readiness } from "@/shared/omics/research";
import { researchCapabilityLabels, researchCapabilityDescriptions, researchDate } from "./ResearchLabels";
import styles from "./Research.module.css";

export function ResearchReadinessSummary({ assessment, href }: { assessment: Readiness; href: string }) {
  const ready = Object.entries(researchCapabilityLabels)
    .filter(([key]) => assessment.capabilities[key as keyof Readiness["capabilities"]].ready)
    .map(([, label]) => label.toLowerCase());
  return (
    <p className={styles.summary}>
      {ready.length ? `Evidence ready to ${ready.join(" · ")}.` : "More evidence is needed for a reproducible investigation."}{" "}
      <Link href={`${href}#research-readiness`}>Readiness and gaps</Link>
    </p>
  );
}

/** Plain names for the verification checks behind each capability (shared/omics/research.ts). */
const checkLabels: Record<string, string> = {
  "artifact hashes": "File checksums match the recorded files",
  "join integrity": "Predictions are matched to the right samples",
  "score semantics": "Score meaning and direction are confirmed",
  "metric replay": "Metrics are recomputed from the saved predictions",
  annotations: "Sample annotations are recorded",
  dependence: "Dependence between samples is assessed",
  "recipe pinned": "A pinned run recipe exists",
  "resource estimate": "Compute requirements are estimated",
  "independent validation": "Independent validation data exist",
  "overlap checked": "Overlap with training data is checked",
};

/** "artifact hashes: verification is missing" reads as "File checksums match the recorded files: not yet verified". */
export function blockerText(blocker: string): string {
  const [name, ...rest] = blocker.split(": ");
  const label = checkLabels[name];
  if (!label || !rest.length) return blocker;
  const detail = rest.join(": ");
  return `${label}: ${detail === "verification is missing" ? "not yet verified" : detail}`;
}

function Fields({ values }: { values: Record<string, unknown> }) {
  return <dl className={styles.details}>{Object.entries(values).map(([key, value]) => (
    <Fragment key={key}><dt>{key}</dt><dd>{displayValue(value)}</dd></Fragment>
  ))}</dl>;
}

export default function ResearchReadiness({ assessment, manifests, records = [] }: {
  assessment: Readiness;
  manifests: ResearchManifest[];
  records?: OmicsRecord[];
}) {
  const byId = new Map(records.map((record) => [record.id, record]));
  const capabilities = Object.keys(researchCapabilityLabels) as (keyof Readiness["capabilities"])[];
  const met = capabilities.filter((key) => assessment.capabilities[key].ready).length;
  return (
    <section id="research-readiness" className={styles.section} aria-labelledby="readiness-title">
      <h2 id="readiness-title">Research readiness</h2>
      <p>
        {met} of {capabilities.length} readiness checks met. These checks assess whether the evidence supports a reproducible investigation; a source-checked score alone does not meet them.
      </p>
      <details className={styles.disclosure}>
      <summary>Readiness checks, gaps and artifacts</summary>
      <p className={styles.muted}>Release {assessment.release_id} · Evidence verified: {researchDate(assessment.verified_at)}</p>
      <div className={styles.grid}>
        {Object.entries(researchCapabilityLabels).map(([key, label]) => {
          const capability = assessment.capabilities[key as keyof Readiness["capabilities"]];
          return (
            <article className={styles.card} key={key}>
              <span className={`${styles.status} ${capability.ready ? styles.ready : ""}`}>{capability.ready ? "Evidence complete" : "Evidence incomplete"}</span>
              <h3>{label}</h3>
              <p>{researchCapabilityDescriptions[key as keyof Readiness["capabilities"]]}</p>
              {capability.blockers.length > 0 && <><p><strong>Missing or unresolved evidence</strong></p><ul className={styles.list}>{capability.blockers.map((blocker) => <li key={blocker}>{blockerText(blocker)}</li>)}</ul></>}
              {capability.evidence.length > 0 && <details className={styles.disclosure}><summary>Supporting evidence</summary><ul className={styles.list}>{capability.evidence.map((item) => <li key={item}>{item}</li>)}</ul></details>}
              <p className={styles.muted}>Verified: {researchDate(capability.verified_at)}</p>
            </article>
          );
        })}
      </div>
      <p className={styles.notice}>Readiness describes the evidence in this release. Availability on your computer is checked separately when an investigation runs. Existing data exposure can prevent independent validation even when files are available.</p>
      {assessment.limitations.length > 0 && <><h3>Limitations</h3><ul className={styles.list}>{assessment.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul></>}
      <h3>Artifacts and reproduction</h3>
      {assessment.artifact_availability === "public_references" && <p>Public source links are recorded for the artifacts. Check access conditions and file hashes before running an analysis.</p>}
      {assessment.artifact_availability === "local_resolver_required" && <p>One or more artifacts need a local resolver. Their checksums are recorded, but this release does not provide every download.</p>}
      {!manifests.length && <p>No verified artifact manifest is connected to this record yet. The gaps above identify what is needed before analysis can begin.</p>}
      {manifests.map((manifest) => (
        <details key={manifest.id} className={styles.disclosure}>
          <summary>{manifest.title}</summary>
          <p>{manifest.question}</p>
          <Fields values={{
            "Manifest": manifest.id,
            "Prepared outcome": manifest.semantics.outcome,
            "Outcome type": manifest.semantics.target,
            "Units": manifest.semantics.unit,
            "Score direction": manifest.semantics.score_direction,
            "Join identifier": manifest.semantics.join_key,
            "Unit of independence": manifest.semantics.independent_unit,
            "Split": manifest.semantics.split,
            "Prior data exposure": manifest.semantics.exposed ? "Already used for exploration; not untouched validation" : "See exposure and validation evidence",
          }} />
          {byId.has(manifest.protocol_id) && <p><Link href={recordHref(byId.get(manifest.protocol_id)!)}>Evaluation protocol and run instructions</Link></p>}
          <p>Resolve each required artifact from its recorded source, verify its SHA-256, and retain the prepared snapshot and identifiers. A missing public URL means this release does not redistribute that file.</p>
          {manifest.artifacts.map((artifact) => (
            <div key={artifact.id} className={styles.artifact}>
              <h3>{artifact.id}</h3>
              <p>{artifact.role.replace(/_/g, " ")} · {artifact.format}</p>
              {safeSourceUrl(artifact.uri) ? <p><a href={safeSourceUrl(artifact.uri)}>Artifact source</a></p> : <p className={styles.muted}>No public download in this release. Obtain access using the documented source and terms.</p>}
              <p className={styles.muted}>File SHA-256: <code>{artifact.sha256}</code></p>
              {artifact.semantic_sha256 && <p className={styles.muted}>Semantic SHA-256: <code>{artifact.semantic_sha256}</code> (separate from the file checksum)</p>}
            </div>
          ))}
          <details className={styles.disclosure}>
            <summary>Registered recipes and verification receipt</summary>
            <Fields values={{ "Local recipes": manifest.local_recipes, "Verification": manifest.verification }} />
          </details>
        </details>
      ))}
      </details>
    </section>
  );
}
