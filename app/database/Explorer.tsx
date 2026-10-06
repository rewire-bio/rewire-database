"use client";
import type { CataloguePage, CatalogueRelease } from "@/lib/catalogue-client";
import { defaultFilters } from "@/lib/omics-browse";
import { useCatalogueExplorer } from "./useCatalogueExplorer";
import { ExplorerSearch } from "./ExplorerSearch";
import { ExplorerFilters } from "./ExplorerFilters";
import { ExplorerStatus } from "./ExplorerStatus";
import { ExplorerComparison } from "./ExplorerComparison";
import { ExplorerRows } from "./ExplorerRows";
import { ExplorerPagination } from "./ExplorerPagination";
import styles from "./database.module.css";
import ui from "./Explorer.module.css";

export default function Explorer({
  initial,
  release,
}: {
  initial: CataloguePage;
  release: CatalogueRelease;
}) {
  const state = useCatalogueExplorer(initial, release);
  const {
    showResults,
    applied,
    selected,
    comparison,
    setSelected,
    data,
    loading,
    error,
    navigate,
    filters,
  } = state;
  return (
    <>
      <ExplorerSearch
        filters={filters}
        moreOpen={state.moreOpen}
        setMoreOpen={state.setMoreOpen}
        change={state.change}
        release={release}
      />
      <ExplorerFilters
        filters={filters}
        change={state.change}
        navigate={navigate}
        data={data}
        release={release}
      />
      <ExplorerStatus
        busy={state.busy}
        filters={filters}
        showResults={showResults}
        data={data}
        applied={applied}
        error={error}
        retry={state.retry}
      />
      {showResults && applied.filters.kind === "result" && (
        <ExplorerComparison
          selected={selected}
          comparison={comparison}
          clearSelection={() => setSelected([])}
        />
      )}
      {showResults ? (
        <ExplorerRows
          data={data}
          loading={loading}
          selected={selected}
          setSelected={setSelected}
          returnTo={state.returnTo}
        />
      ) : (
        <div className={ui.rows} aria-busy={loading} />
      )}
      {showResults && !data.total && !loading && !error && (
        <div className={ui.empty}>
          <p>No records match these filters.</p>
          <button
            className={styles.button}
            onClick={() => navigate({ ...defaultFilters, kind: filters.kind })}
          >
            Reset filters
          </button>
        </div>
      )}
      {showResults && (
        <ExplorerPagination
          data={data}
          loading={loading}
          error={error}
          navigate={navigate}
          applied={applied}
        />
      )}
    </>
  );
}
