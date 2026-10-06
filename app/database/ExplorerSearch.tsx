import type { CatalogueRelease } from "@/lib/catalogue-client";
import {
  kindLabels,
  kindDescriptions,
  primaryKinds,
  secondaryKinds,
} from "@/lib/omics-browse";
import styles from "./database.module.css";
import ui from "./Explorer.module.css";
import type { ExplorerState } from "./useCatalogueExplorer";

export function ExplorerSearch({
  filters,
  moreOpen,
  setMoreOpen,
  change,
  release,
}: Pick<ExplorerState, "filters" | "moreOpen" | "setMoreOpen" | "change"> & {
  release: CatalogueRelease;
}) {
  return (
    <div className={ui.searchPanel}>
      <label className={ui.search} htmlFor="catalogue-search">
        Search the database
      </label>
      <input
        id="catalogue-search"
        className={ui.searchInput}
        type="search"
        value={filters.q}
        placeholder="Model name, benchmark, organism or biological task"
        aria-describedby="catalogue-search-scope"
        onChange={(event) => change("q", event.target.value)}
      />
      <div className={ui.scope}>
        <span id="catalogue-search-scope" className={ui.scopeLabel}>
          Search in
          <span className="sr-only">
            {" "}
            {kindLabels[filters.kind].toLowerCase()}
          </span>
        </span>
        <div className={ui.kinds} role="group" aria-label="Record type">
          {primaryKinds.map((kind) => (
            <button
              key={kind}
              className={ui.kind}
              aria-pressed={filters.kind === kind}
              onClick={() => change("kind", kind)}
            >
              {kindLabels[kind]}{" "}
              <span className={styles.tabCount}>
                {(release.facets.counts[kind] || 0).toLocaleString()}
              </span>
            </button>
          ))}
        </div>
      </div>
      <details
        className={ui.more}
        open={moreOpen}
        onToggle={(event) => setMoreOpen(event.currentTarget.open)}
      >
        <summary>
          More record types
          {!primaryKinds.some((kind) => kind === filters.kind)
            ? `: ${kindLabels[filters.kind]}`
            : ""}
        </summary>
        <div
          className={styles.supporting}
          role="group"
          aria-label="Methods, evaluation design and supporting records"
        >
          <span className={styles.browseGroupLabel}>
            Methods and evaluation records
          </span>
          {secondaryKinds.map((kind) => (
            <button
              key={kind}
              aria-pressed={filters.kind === kind}
              onClick={() => change("kind", kind)}
            >
              {kindLabels[kind]}
            </button>
          ))}
        </div>
      </details>
      <p className={ui.kindDescription}>{kindDescriptions[filters.kind]}</p>
    </div>
  );
}
