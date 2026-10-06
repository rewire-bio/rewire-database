import {
  kindLabels,
  singularKindLabels,
  browseFilterSummary,
} from "@/lib/omics-browse";
import styles from "./database.module.css";
import type { ExplorerState } from "./useCatalogueExplorer";

export function ExplorerStatus({
  busy,
  filters,
  showResults,
  data,
  applied,
  error,
  retry,
}: Pick<
  ExplorerState,
  "busy" | "filters" | "showResults" | "data" | "applied" | "error" | "retry"
>) {
  return (
    <div aria-live="polite">
      {busy ? (
        <p>Loading {kindLabels[filters.kind].toLowerCase()}…</p>
      ) : showResults ? (
        <p className={styles.muted}>
          {data.total.toLocaleString()} matching{" "}
          {data.total === 1
            ? singularKindLabels[applied.filters.kind].toLowerCase()
            : kindLabels[applied.filters.kind].toLowerCase()}
        </p>
      ) : null}
      {error && (
        <div className={styles.error}>
          <p>{error}</p>
          {showResults && (
            <p>
              <strong>Showing:</strong> {browseFilterSummary(applied.filters)}
            </p>
          )}
          <button className={styles.button} onClick={retry}>
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
