import Link from "next/link";
import type { CataloguePage, CatalogueRelease } from "@/lib/catalogue-client";
import {
  defaultFilters,
  researchAreaLabel,
  statusLabel,
} from "@/lib/omics-browse";
import {
  researchCapabilityLabels,
  researchKinds,
} from "@/components/catalogue/ResearchLabels";
import researchStyles from "@/components/catalogue/Research.module.css";
import styles from "./database.module.css";
import ui from "./Explorer.module.css";
import type { ExplorerState } from "./useCatalogueExplorer";

export function ExplorerFilters({
  filters,
  change,
  navigate,
  data,
  release,
}: Pick<ExplorerState, "filters" | "change" | "navigate"> & {
  data: CataloguePage;
  release: CatalogueRelease;
}) {
  // Scoped facet counts come back with each page of results, so an option that is
  // offered always leads somewhere. Fall back to the release-wide lists only
  // before the first response has arrived.
  const entries = (
    counts: Record<string, number> | undefined,
    fallback: string[],
  ): [string, number][] =>
    counts
      ? Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0]))
      : fallback.map((value) => [value, 0] as [string, number]);
  const availableAreas = entries(
    (data as { available?: { areas: Record<string, number> } }).available
      ?.areas,
    release.facets.areas,
  );
  if (filters.area && !availableAreas.some(([area]) => area === filters.area))
    availableAreas.push([filters.area, 0]);
  const availableStatuses = entries(
    (data as { available?: { statuses: Record<string, number> } }).available
      ?.statuses,
    release.facets.statuses,
  );
  if (
    filters.status &&
    !availableStatuses.some(([status]) => status === filters.status)
  )
    availableStatuses.push([filters.status, 0]);
  return (
    <>
      <div className={ui.refine} role="group" aria-labelledby="refine-label">
        <span id="refine-label" className={ui.refineLabel}>
          Narrow these results
        </span>
        <label className={ui.filter}>
          Research area
          <select
            value={filters.area}
            onChange={(event) => change("area", event.target.value)}
          >
            <option value="">All areas</option>
            {availableAreas.map(([area, count]) => (
              <option key={area} value={area}>
                {researchAreaLabel(area)} ({count})
              </option>
            ))}
          </select>
        </label>
        <label className={ui.filter}>
          Evidence status
          <select
            value={filters.status}
            onChange={(event) => change("status", event.target.value)}
          >
            <option value="">All statuses</option>
            {availableStatuses.map(([status, count]) => (
              <option key={status} value={status}>
                {statusLabel(status)} ({count})
              </option>
            ))}
          </select>
        </label>
        {["result", "evaluation"].includes(filters.kind) && (
          <div
            className={ui.origin}
            role="group"
            aria-label="Result provenance"
          >
            <span>Evidence from</span>
            {[
              ["", "All evaluations"],
              ["literature", "Published evaluations"],
              ["rewire", "Rewire evaluations"],
            ].map(([value, label]) => (
              <button
                key={value}
                className={ui.kind}
                aria-pressed={filters.origin === value}
                onClick={() => change("origin", value)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {(filters.q ||
          filters.area ||
          filters.status ||
          filters.origin ||
          filters.readiness) && (
          <button
            className={ui.clear}
            onClick={() => navigate({ ...defaultFilters, kind: filters.kind })}
          >
            Clear search and filters
          </button>
        )}
      </div>
      {researchKinds.includes(filters.kind) && (
        <div className={researchStyles.filters}>
          <label className={researchStyles.filter}>
            Research readiness
            <select
              value={filters.readiness}
              onChange={(event) => change("readiness", event.target.value)}
            >
              <option value="">All records, including evidence gaps</option>
              {Object.entries(researchCapabilityLabels).map(
                ([value, label]) => (
                  <option key={value} value={value}>
                    {label}: evidence complete
                  </option>
                ),
              )}
            </select>
          </label>
          <p className={styles.muted}>
            Readiness requires connected artifacts and verification. Source
            review alone is insufficient.{" "}
            <Link href="/investigations/">About investigations</Link>
          </p>
        </div>
      )}
    </>
  );
}
