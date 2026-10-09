import type { UseCase } from "@/shared/omics/use-cases";
import { evidenceCollectedLabel, type EvidenceSummary } from "@/lib/use-case-summary";
import styles from "./UseCases.module.css";

type CollectionPlan = NonNullable<UseCase["collection_plan"]>;

export function UseCaseCollectionStatus({ status }: { status: CollectionPlan["status"] }) {
  return <span className={styles.collectionStatus}>{status === "planned" ? "Collection planned" : "Collecting evidence"}</span>;
}

export default function UseCaseCollectionPlan({ plan, summary }: { plan: CollectionPlan; summary: EvidenceSummary }) {
  const hasEvidence = summary.endpoints > 0;
  return <section id="collection-plan" className={`${styles.section} ${styles.collectionPlan}`} aria-labelledby="collection-plan-heading">
    <div className={styles.planHeading}>
      <h2 id="collection-plan-heading">Evidence collection plan</h2>
      <UseCaseCollectionStatus status={plan.status} />
    </div>
    <p>
      {hasEvidence
        ? <>{evidenceCollectedLabel(summary)}, in the evaluated evidence above. The status above describes only the specific comparison in this plan, which remains open; it does not mean no evidence has been collected.</>
        : plan.status === "planned" ? "Evidence collection is planned for this question." : "Evidence collection is in progress for this question."}
      {" "}The plan defines a comparison to investigate; it does not establish model performance or suitability.
    </p>
    <h3>Comparison question</h3>
    <p className={styles.intro}>{plan.comparison_question}</p>
    <details className={styles.disclosure}>
      <summary>Baselines, outcomes and validation requirements</summary>
      <div className={styles.planGrid}>
        <div>
          <h3>Baselines to include</h3>
          <ul>{plan.baselines.map((baseline) => <li key={baseline}>{baseline}</li>)}</ul>
        </div>
        <div>
          <h3>Outcomes to measure</h3>
          <ul>{plan.outcomes.map((outcome) => <li key={outcome}>{outcome}</li>)}</ul>
        </div>
      </div>
      <h3>Validation requirements</h3>
      <ul>{plan.validation_requirements.map((requirement) => <li key={requirement}>{requirement}</li>)}</ul>
    </details>
    <div className={styles.nextCollectionTask}>
      <h3>Next collection task</h3>
      <p>{plan.next_step}</p>
    </div>
  </section>;
}
