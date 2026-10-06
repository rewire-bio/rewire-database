import styles from "./database.module.css";
import ui from "./Explorer.module.css";
import type { ExplorerState } from "./useCatalogueExplorer";

export function ExplorerPagination({
  data,
  loading,
  error,
  navigate,
  applied,
}: Pick<ExplorerState, "data" | "loading" | "error" | "navigate" | "applied">) {
  return (
    <nav className={ui.pagination} aria-label="Catalogue pages">
      <button
        className={styles.button}
        disabled={loading || Boolean(error) || data.previous_cursor == null}
        onClick={() =>
          navigate(applied.filters, data.previous_cursor || undefined)
        }
      >
        Previous
      </button>
      <span>
        Showing {data.range_start ?? (data.items.length ? 1 : 0)}–
        {data.range_end ?? data.items.length} of {data.total.toLocaleString()}
      </span>
      <button
        className={styles.button}
        disabled={loading || Boolean(error) || !data.next_cursor}
        onClick={() => navigate(applied.filters, data.next_cursor || undefined)}
      >
        Next
      </button>
    </nav>
  );
}
