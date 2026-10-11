import { DERIVED_LABEL, resultDerivation } from "@/lib/derivation";
import styles from "@/app/database/database.module.css";

/** Marks a value Rewire computed from a source's own data. The result page explains how. */
export default function DerivedMark({ attributes, derived }: { attributes?: Record<string, unknown>; derived?: boolean }) {
  if (!(derived ?? !!resultDerivation(attributes))) return null;
  return (
    <span className={styles.derived} title={DERIVED_LABEL}>
      Computed by Rewire<span className="sr-only"> from the authors&apos; source data</span>
    </span>
  );
}
