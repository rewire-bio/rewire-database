"use client";
import { useState } from "react";
import {
  runGuideSchema,
  runDocumentationSchema,
} from "@/services/omics/src/run-guide";
import type { OmicsRecord } from "@/lib/omics";
import { Evidence } from "./Profile";
import styles from "@/app/database/database.module.css";
import guideStyles from "./ExecutionGuide.module.css";
export default function RunGuide({
  record,
  sources,
}: {
  record: OmicsRecord;
  sources: OmicsRecord[];
}) {
  const sectionId = record.attributes.run_recipes ? "run-upstream" : "run";
  const [copied, setCopied] = useState<number | null>(null);
  const [error, setError] = useState("");
  const parsed = runGuideSchema.safeParse(record.attributes.run_guide);
  if (!parsed.success) {
    const documentation = runDocumentationSchema.safeParse(
      record.attributes.run_documentation,
    );
    if (!documentation.success) {
      if (!["benchmark", "task", "protocol", "evaluator"].includes(record.kind))
        return null;
      return (
        <section
          id={sectionId}
          className={`${styles.section} ${styles.runGuide}`}
          aria-labelledby="run-title"
        >
          <h2 id="run-title">Run instructions</h2>
          <p>
            No runnable recipe has been reviewed for this {record.kind}. Dataset
            access, model requirements, licences and compute requirements must
            be checked against its sources before execution.
          </p>
          {record.kind === "task" && (
            <p>
              A task describes a biological question. Choose a linked protocol
              to obtain concrete split and scoring instructions.
            </p>
          )}
        </section>
      );
    }
    return (
      <section
        id={sectionId}
        className={`${styles.section} ${styles.runGuide}`}
        aria-labelledby="run-title"
      >
        <h2 id="run-title">Run this benchmark</h2>
        <p>{documentation.data.summary}</p>
        <p className={styles.muted}>
          A maintained rewire runner has not been verified for this benchmark.
          Check data access, weights, licences, dependencies and hardware in the
          linked official documentation; requirements have not been fully
          extracted.
        </p>
        <Evidence
          ids={documentation.data.source_ids}
          locator={documentation.data.source_locator}
          sources={sources}
        />
      </section>
    );
  }
  const guide = parsed.data;
  async function copy(shell: string, index: number) {
    try {
      await navigator.clipboard.writeText(shell);
      setCopied(index);
      setError("");
    } catch {
      setError(
        "Copy is unavailable in this browser. Select and copy the command below.",
      );
    }
  }
  return (
    <section
      id={sectionId}
      className={`${styles.section} ${styles.runGuide}`}
      aria-labelledby="run-title"
    >
      <h2 id="run-title">Official run instructions</h2>
      <p>{guide.summary}</p>
      <p className={styles.muted}>
        Checked against the official instructions on {guide.review.date}. These
        commands have not been executed by rewire. Running them does not
        automatically reproduce the published scores.
      </p>
      <h3>Before you start</h3>
      <ul>
        {guide.prerequisites.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
      <ol className={guideStyles.steps} aria-label="Official execution steps">
        {guide.steps.map((step, i) => (
          <li key={i} className={guideStyles.step}>
            <h3>
              {i + 1}. {step.title}
            </h3>
            <p>{step.explanation}</p>
            <button
              type="button"
              className={styles.runCopy}
              onClick={() => copy(step.shell, i)}
              aria-label={`Copy commands: ${step.title}`}
            >
              {copied === i ? "Copied" : "Copy commands"}
            </button>
            <pre
              className={styles.runCode}
              tabIndex={0}
              aria-label={`${step.title}: shell commands`}
            >
              <code>{step.shell}</code>
            </pre>
            <Evidence
              ids={step.source_ids}
              locator={step.source_locator}
              sources={sources}
            />
          </li>
        ))}
      </ol>
      <p role="status" aria-live="polite">
        {error || (copied !== null ? "Commands copied to clipboard." : "")}
      </p>
      {guide.outputs.length > 0 && (
        <>
          <h3>Expected outputs</h3>
          <ul>
            {guide.outputs.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </>
      )}
      <h3>Scope and limitations</h3>
      <ul>
        {guide.limitations.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </section>
  );
}
