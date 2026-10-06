import type { Comparison } from "@/lib/catalogue-client";
import styles from "./database.module.css";

export function ExplorerComparison({
  selected,
  comparison,
  clearSelection,
}: {
  selected: string[];
  comparison: Comparison | null;
  clearSelection: () => void;
}) {
  return (
    <div className={styles.notice}>
      <strong>Compare results</strong>
      <p>
        Select 2–20 records to check protocol compatibility. This does not
        create a universal ranking.
      </p>
      {selected.length > 0 && (
        <>
          <p>{selected.length} selected.</p>
          {comparison && (
            <>
              <p>
                {comparison.compatible
                  ? "Recorded comparison conditions match. Inspect the original evidence before interpreting differences."
                  : "These results cannot be compared automatically."}
              </p>
              <ul className={styles.list}>
                {comparison.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </>
          )}
          <button className={styles.button} onClick={clearSelection}>
            Clear selection
          </button>
        </>
      )}
    </div>
  );
}
