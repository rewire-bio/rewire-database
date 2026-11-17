"use client";

import React, { useId, useMemo, useState } from "react";
import Link from "next/link";
import styles from "./UnifiedLeaderboard.module.css";
import {
  CATEGORY_PROTOCOL_BASELINES,
  getUseCaseLeaderboard,
  normalizeCategory,
  categoryForSlug,
  resolveLeaderboardModelHref,
  type BiologicalModelRankingRow,
  type StudyCitation,
  type BiologicalUseCaseCategory,
  type ProtocolBaselineAnchor,
} from "../../lib/use-case-leaderboard";
import type { OperationalTelemetry } from "../../lib/operational-telemetry";
import { generateLeaderboardItemListJsonLd } from "../../lib/catalogue-seo";
import { safeJsonLd } from "../../lib/catalogue-sharing";

export type {
  BiologicalModelRankingRow,
  StudyCitation,
  BiologicalUseCaseCategory,
  ProtocolBaselineAnchor,
  OperationalTelemetry,
};

export interface UnifiedLeaderboardProps {
  rows?: BiologicalModelRankingRow[];
  models?: BiologicalModelRankingRow[];
  initialCategory?: BiologicalUseCaseCategory | string;
  useCaseSlug?: string;
  expandedRowId?: string;
  showCategorySwitcher?: boolean;
  showParetoHighlight?: boolean;
  emitJsonLd?: boolean;
  className?: string;
  testId?: string;
}

export type SortColumn =
  | "rank"
  | "index"
  | "metric"
  | "vs_baseline"
  | "latency"
  | "vram"
  | "model"
  | "creator"
  | "license";

export type SortDirection = "asc" | "desc";

export const CATEGORY_TAB_CONFIG: Array<{
  key: BiologicalUseCaseCategory;
  slug: string;
  label: string;
}> = [
  { key: "structure_prediction", slug: "structure-prediction", label: "Structure Prediction" },
  { key: "variant_effect", slug: "variant-effect", label: "Variant Effect" },
  { key: "protein_design", slug: "protein-design", label: "Protein Design" },
  { key: "transcriptomics", slug: "transcriptomics", label: "Transcriptomics" },
  { key: "genomic_grammar", slug: "genomic-grammar", label: "Genomic Grammar" },
];

/**
 * Format a number to 1-3 decimal places cleanly.
 */
function formatNumber(num: number | null | undefined, decimals = 3): string {
  if (num === null || num === undefined || !Number.isFinite(num)) return "—";
  return Number(num).toFixed(decimals);
}

/**
 * Format margin over conventional baseline with explicit sign.
 */
function formatMargin(delta: number | null | undefined): string {
  if (delta === null || delta === undefined || !Number.isFinite(delta)) return "—";
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(1)}%`;
}

/**
 * Formats latency value in ms or s.
 */
function formatLatency(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "—";
  if (ms < 1) return `${ms.toFixed(1)} ms`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.round(ms)} ms`;
}

/**
 * Formats VRAM value in GB.
 */
function formatVram(gb: number | null | undefined): string {
  if (gb === null || gb === undefined || !Number.isFinite(gb)) return "—";
  return `${gb} GB`;
}

/**
 * Clean, single-view Unified Leaderboard component comparing biological foundation
 * models against protocol baselines and biological noise ceilings per use case.
 */
export function UnifiedLeaderboard({
  rows: inputRows,
  models: inputModels,
  initialCategory,
  useCaseSlug,
  expandedRowId,
  showCategorySwitcher = true,
  showParetoHighlight = false,
  emitJsonLd = true,
  className,
  testId = "unified-leaderboard",
}: UnifiedLeaderboardProps) {
  const componentId = useId();

  // Resolve initial active category from initialCategory or useCaseSlug
  const initialCat = useMemo<BiologicalUseCaseCategory>(() => {
    if (useCaseSlug) {
      return categoryForSlug(useCaseSlug);
    }
    if (initialCategory) {
      return normalizeCategory(initialCategory);
    }
    return "variant_effect";
  }, [initialCategory, useCaseSlug]);

  const [activeCategory, setActiveCategory] = useState<BiologicalUseCaseCategory>(initialCat);
  const [sortColumn, setSortColumn] = useState<SortColumn>("index");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const [openWeightsOnly, setOpenWeightsOnly] = useState<boolean>(false);
  const [maxVram, setMaxVram] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const [expandedRowIds, setExpandedRowIds] = useState<Set<string>>(() => {
    return expandedRowId ? new Set([expandedRowId]) : new Set();
  });

  // Effective rows from props (rows or models)
  const propRows = inputModels ?? inputRows;

  // Category protocol baselines config
  const categoryConfig = CATEGORY_PROTOCOL_BASELINES[activeCategory];
  const primaryMetricName = categoryConfig.metric;

  // Resolve rows: from props or queried directly
  const availableRows = useMemo(() => {
    if (propRows === undefined) {
      return getUseCaseLeaderboard(undefined, { category: activeCategory }).rows;
    }
    // Filter rows by category if multiple categories are present
    const matching = propRows.filter(
      (r) => normalizeCategory(r.category) === activeCategory
    );
    if (matching.length > 0) return matching;
    // If none matched active category, but rows were explicitly provided
    if (propRows.length > 0 && !propRows.some((r) => r.category && normalizeCategory(r.category) === activeCategory)) {
      return propRows;
    }
    return matching;
  }, [propRows, activeCategory]);

  // Handle row expansion
  const toggleRowExpanded = (modelId: string) => {
    setExpandedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(modelId)) {
        next.delete(modelId);
      } else {
        next.add(modelId);
      }
      return next;
    });
  };

  // Handle column sorting click
  const handleSortClick = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      // Sensible defaults for initial column click
      if (
        column === "rank" ||
        column === "latency" ||
        column === "vram" ||
        column === "model" ||
        column === "creator" ||
        column === "license"
      ) {
        setSortDirection("asc");
      } else {
        setSortDirection("desc");
      }
    }
  };

  // Handle column sorting keyboard navigation
  const handleSortKeyDown = (e: React.KeyboardEvent, column: SortColumn) => {
    if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      handleSortClick(column);
    }
  };

  // Filtering
  const filteredRows = useMemo(() => {
    let list = availableRows;

    if (openWeightsOnly) {
      list = list.filter((r) => r.telemetry?.open_weights === true || r.is_baseline);
    }

    if (maxVram !== "all") {
      const limit = parseInt(maxVram, 10);
      list = list.filter((r) => {
        if (r.is_baseline) return true;
        if (r.telemetry?.min_vram_gb === null || r.telemetry?.min_vram_gb === undefined) {
          return false;
        }
        return r.telemetry.min_vram_gb <= limit;
      });
    }

    if (searchQuery.trim().length > 0) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((r) => {
        return (
          r.model_name.toLowerCase().includes(q) ||
          r.creator.toLowerCase().includes(q) ||
          (r.telemetry?.license && r.telemetry.license.toLowerCase().includes(q))
        );
      });
    }

    return list;
  }, [availableRows, openWeightsOnly, maxVram, searchQuery]);

  // Sorting with safe null handling
  const sortedRows = useMemo(() => {
    const list = [...filteredRows];

    list.sort((a, b) => {
      let valA: unknown;
      let valB: unknown;
      let isNumeric = false;
      let nullsLast = false;

      switch (sortColumn) {
        case "rank":
          valA = a.use_case_index_score;
          valB = b.use_case_index_score;
          isNumeric = true;
          // Invert so rank asc means highest index score
          return sortDirection === "asc"
            ? (b.use_case_index_score ?? 0) - (a.use_case_index_score ?? 0)
            : (a.use_case_index_score ?? 0) - (b.use_case_index_score ?? 0);
        case "index":
          valA = a.use_case_index_score;
          valB = b.use_case_index_score;
          isNumeric = true;
          break;
        case "metric":
          valA = a.raw_metric_value;
          valB = b.raw_metric_value;
          isNumeric = true;
          break;
        case "vs_baseline":
          valA = a.margin_over_conventional;
          valB = b.margin_over_conventional;
          isNumeric = true;
          break;
        case "latency":
          valA = a.telemetry?.inference_latency_ms;
          valB = b.telemetry?.inference_latency_ms;
          isNumeric = true;
          nullsLast = true;
          break;
        case "vram":
          valA = a.telemetry?.min_vram_gb;
          valB = b.telemetry?.min_vram_gb;
          isNumeric = true;
          nullsLast = true;
          break;
        case "model":
          valA = a.model_name.toLowerCase();
          valB = b.model_name.toLowerCase();
          break;
        case "creator":
          valA = a.creator.toLowerCase();
          valB = b.creator.toLowerCase();
          break;
        case "license":
          valA = (a.telemetry?.license || "").toLowerCase();
          valB = (b.telemetry?.license || "").toLowerCase();
          break;
        default:
          valA = a.use_case_index_score;
          valB = b.use_case_index_score;
          isNumeric = true;
      }

      // Safe null handling: null telemetry placed at end in both asc and desc sorts
      if (nullsLast) {
        const aIsNull = valA === null || valA === undefined || !Number.isFinite(valA);
        const bIsNull = valB === null || valB === undefined || !Number.isFinite(valB);
        if (aIsNull && bIsNull) return 0;
        if (aIsNull) return 1;
        if (bIsNull) return -1;
      }

      if (isNumeric) {
        const numA = Number(valA ?? 0);
        const numB = Number(valB ?? 0);
        return sortDirection === "asc" ? numA - numB : numB - numA;
      } else {
        const strA = String(valA ?? "");
        const strB = String(valB ?? "");
        return sortDirection === "asc" ? strA.localeCompare(strB) : strB.localeCompare(strA);
      }
    });

    return list;
  }, [filteredRows, sortColumn, sortDirection]);

  // Filter state check
  const hasActiveFilters =
    openWeightsOnly || maxVram !== "all" || searchQuery.trim().length > 0;

  const handleClearFilters = () => {
    setOpenWeightsOnly(false);
    setMaxVram("all");
    setSearchQuery("");
  };

  // Top model ceiling signal check
  const topNonBaseline = sortedRows.find((r) => !r.is_baseline && r.creator !== "Baseline");

  const itemListJsonLd = useMemo(() => {
    return generateLeaderboardItemListJsonLd({
      name: `${categoryConfig.title} Leaderboard`,
      description: `Ranked biological foundation models evaluated on ${categoryConfig.metric} against protocol baselines.`,
      rows: sortedRows,
    });
  }, [categoryConfig, sortedRows]);

  const searchInputId = `${componentId}-search`;
  const vramSelectId = `${componentId}-vram`;
  const openWeightsId = `${componentId}-open-weights`;

  return (
    <div className={`${styles.container} ${className || ""}`} data-testid={testId}>
      {emitJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(itemListJsonLd) }}
        />
      )}
      {/* Category Switcher Tabs */}
      {showCategorySwitcher && (
        <nav
          className={styles.tabs}
          aria-label="Biological use-case rankings"
          role="tablist"
        >
          {CATEGORY_TAB_CONFIG.map((tab) => {
            const isActive = activeCategory === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                data-use-case={tab.slug}
                aria-selected={isActive}
                className={styles.tabButton}
                onClick={() => {
                  setActiveCategory(tab.key);
                  setExpandedRowIds(new Set());
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
      )}

      {/* Filter Controls Bar */}
      <div className={styles.filterBar} role="search" aria-label="Leaderboard Filters">
        <div className={styles.filterControls}>
          <input
            id={searchInputId}
            type="search"
            placeholder="Search models or creators..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={styles.searchInput}
            aria-label="Search models or creators"
          />

          <label className={styles.checkboxLabel} htmlFor={openWeightsId}>
            <input
              id={openWeightsId}
              type="checkbox"
              name="open_weights_only"
              checked={openWeightsOnly}
              onChange={(e) => setOpenWeightsOnly(e.target.checked)}
            />
            Open Weights Only
          </label>

          <label className={styles.checkboxLabel} htmlFor={vramSelectId}>
            <span>Max VRAM:</span>
            <select
              id={vramSelectId}
              value={maxVram}
              onChange={(e) => setMaxVram(e.target.value)}
              className={styles.filterSelect}
              aria-label="Filter by maximum VRAM requirement"
            >
              <option value="all">All VRAM</option>
              <option value="16">&lt; 16 GB</option>
              <option value="24">&lt; 24 GB</option>
              <option value="48">&lt; 48 GB</option>
              <option value="80">&lt; 80 GB</option>
            </select>
          </label>
        </div>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={handleClearFilters}
            className={styles.clearButton}
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Optional Pareto Frontier Highlight Banner */}
      {showParetoHighlight && (
        <div className={styles.ceilingBanner} role="region" aria-label="Pareto Frontier Highlights">
          <span className={styles.ceilingHighlight}>★ Pareto Frontier Screening:</span>{" "}
          {sortedRows
            .filter((r) => r.pareto_optimal)
            .map((r) => (
              <span key={r.model_id} style={{ marginRight: 12 }}>
                <strong>{r.model_name}</strong> (
                {formatLatency(r.telemetry?.inference_latency_ms)}
                {r.telemetry?.throughput_items_per_sec !== null &&
                r.telemetry?.throughput_items_per_sec !== undefined
                  ? `, ${r.telemetry.throughput_items_per_sec} items/sec`
                  : ""}
                )
              </span>
            ))}
        </div>
      )}

      {/* Main Single-View Leaderboard Table */}
      <div
        className={styles.tableWrap}
        tabIndex={0}
        role="region"
        aria-label={`${categoryConfig.title} Leaderboard`}
      >
        <table className={styles.table} aria-label={`${categoryConfig.title} Leaderboard`}>
          <thead>
            <tr>
              <th scope="col" className={`${styles.toggleCell} col-toggle w-8`} aria-label="Expand details"></th>
              <th
                scope="col"
                tabIndex={0}
                className={`${styles.sortHeader} col-rank w-12 align-center`}
                aria-sort={
                  sortColumn === "rank"
                    ? sortDirection === "asc"
                      ? "ascending"
                      : "descending"
                    : "none"
                }
                onClick={() => handleSortClick("rank")}
                onKeyDown={(e) => handleSortKeyDown(e, "rank")}
              >
                Rank
                {sortColumn === "rank" && (
                  <span className={styles.sortIndicator}>
                    {sortDirection === "asc" ? "▲" : "▼"}
                  </span>
                )}
              </th>
              <th
                scope="col"
                tabIndex={0}
                className={`${styles.sortHeader} col-model min-w-48 align-left`}
                aria-sort={
                  sortColumn === "model"
                    ? sortDirection === "asc"
                      ? "ascending"
                      : "descending"
                    : "none"
                }
                onClick={() => handleSortClick("model")}
                onKeyDown={(e) => handleSortKeyDown(e, "model")}
              >
                Model
                {sortColumn === "model" && (
                  <span className={styles.sortIndicator}>
                    {sortDirection === "asc" ? "▲" : "▼"}
                  </span>
                )}
              </th>
              <th
                scope="col"
                tabIndex={0}
                className={`${styles.sortHeader} col-creator min-w-28 align-left`}
                aria-sort={
                  sortColumn === "creator"
                    ? sortDirection === "asc"
                      ? "ascending"
                      : "descending"
                    : "none"
                }
                onClick={() => handleSortClick("creator")}
                onKeyDown={(e) => handleSortKeyDown(e, "creator")}
              >
                Creator
                {sortColumn === "creator" && (
                  <span className={styles.sortIndicator}>
                    {sortDirection === "asc" ? "▲" : "▼"}
                  </span>
                )}
              </th>
              <th
                scope="col"
                tabIndex={0}
                className={`${styles.sortHeader} col-index min-w-32 align-right`}
                aria-sort={
                  sortColumn === "index"
                    ? sortDirection === "asc"
                      ? "ascending"
                      : "descending"
                    : "none"
                }
                onClick={() => handleSortClick("index")}
                onKeyDown={(e) => handleSortKeyDown(e, "index")}
              >
                Capability Index
                {sortColumn === "index" && (
                  <span className={styles.sortIndicator}>
                    {sortDirection === "asc" ? "▲" : "▼"}
                  </span>
                )}
              </th>
              <th
                scope="col"
                tabIndex={0}
                className={`${styles.sortHeader} col-metric min-w-28 align-right`}
                aria-sort={
                  sortColumn === "metric"
                    ? sortDirection === "asc"
                      ? "ascending"
                      : "descending"
                    : "none"
                }
                onClick={() => handleSortClick("metric")}
                onKeyDown={(e) => handleSortKeyDown(e, "metric")}
              >
                {primaryMetricName}
                {sortColumn === "metric" && (
                  <span className={styles.sortIndicator}>
                    {sortDirection === "asc" ? "▲" : "▼"}
                  </span>
                )}
              </th>
              <th
                scope="col"
                tabIndex={0}
                className={`${styles.sortHeader} col-margin min-w-32 align-right`}
                aria-sort={
                  sortColumn === "vs_baseline"
                    ? sortDirection === "asc"
                      ? "ascending"
                      : "descending"
                    : "none"
                }
                onClick={() => handleSortClick("vs_baseline")}
                onKeyDown={(e) => handleSortKeyDown(e, "vs_baseline")}
              >
                Margin vs Pre-ML
                {sortColumn === "vs_baseline" && (
                  <span className={styles.sortIndicator}>
                    {sortDirection === "asc" ? "▲" : "▼"}
                  </span>
                )}
              </th>
              <th
                scope="col"
                tabIndex={0}
                className={`${styles.sortHeader} col-latency min-w-24 align-right`}
                aria-sort={
                  sortColumn === "latency"
                    ? sortDirection === "asc"
                      ? "ascending"
                      : "descending"
                    : "none"
                }
                onClick={() => handleSortClick("latency")}
                onKeyDown={(e) => handleSortKeyDown(e, "latency")}
              >
                Latency
                {sortColumn === "latency" && (
                  <span className={styles.sortIndicator}>
                    {sortDirection === "asc" ? "▲" : "▼"}
                  </span>
                )}
              </th>
              <th
                scope="col"
                tabIndex={0}
                className={`${styles.sortHeader} col-vram min-w-20 align-right`}
                aria-sort={
                  sortColumn === "vram"
                    ? sortDirection === "asc"
                      ? "ascending"
                      : "descending"
                    : "none"
                }
                onClick={() => handleSortClick("vram")}
                onKeyDown={(e) => handleSortKeyDown(e, "vram")}
              >
                VRAM
                {sortColumn === "vram" && (
                  <span className={styles.sortIndicator}>
                    {sortDirection === "asc" ? "▲" : "▼"}
                  </span>
                )}
              </th>
              <th
                scope="col"
                tabIndex={0}
                className={`${styles.sortHeader} col-license min-w-28 align-left`}
                aria-sort={
                  sortColumn === "license"
                    ? sortDirection === "asc"
                      ? "ascending"
                      : "descending"
                    : "none"
                }
                onClick={() => handleSortClick("license")}
                onKeyDown={(e) => handleSortKeyDown(e, "license")}
              >
                License
                {sortColumn === "license" && (
                  <span className={styles.sortIndicator}>
                    {sortDirection === "asc" ? "▲" : "▼"}
                  </span>
                )}
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 ? (
              <tr>
                <td colSpan={10}>
                  <div className={styles.emptyState}>
                    <div className={styles.emptyTitle}>No matching models found</div>
                    <p>No models match the selected filters or search terms.</p>
                    {hasActiveFilters && (
                      <button
                        type="button"
                        onClick={handleClearFilters}
                        className={styles.clearButton}
                      >
                        Reset Filters
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              sortedRows.map((row, index) => {
                const isExpanded = expandedRowIds.has(row.model_id);
                const isBaseline = row.is_baseline || row.creator === "Baseline";
                const isPareto = row.pareto_optimal;
                const margin = row.margin_over_conventional;
                const isPositiveMargin = margin > 0;
                const rankNumber = index + 1;

                const rowClassName = `${styles.tableRow} ${
                  isBaseline ? styles.baselineRow : ""
                } ${isExpanded ? styles.expandedRow : ""} ${isPareto ? "pareto-row" : ""}`;

                return (
                  <React.Fragment key={row.model_id}>
                    <tr
                      className={rowClassName}
                      onClick={() => toggleRowExpanded(row.model_id)}
                      data-model-id={row.model_id}
                    >
                      <td className={styles.toggleCell}>
                        <button
                          type="button"
                          className={styles.toggleButton}
                          aria-expanded={isExpanded}
                          aria-controls={`drawer-${row.model_id}`}
                          data-drawer-trigger="true"
                          aria-label={`Toggle details for ${row.model_name}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleRowExpanded(row.model_id);
                          }}
                        >
                          <span
                            className={styles.chevronIcon}
                            style={{
                              transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                            }}
                          >
                            ▶
                          </span>
                        </button>
                      </td>
                      <td className={styles.monoValue}>#{rankNumber}</td>
                      <td className={styles.modelCell}>
                        <div className={styles.modelNameWrap}>
                          <Link
                            href={resolveLeaderboardModelHref(row)}
                            prefetch={false}
                            className={styles.modelLink}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {row.model_name}
                          </Link>
                          {isPareto && (
                            <span
                              className={`${styles.paretoBadge} pareto-badge`}
                              title="Pareto Optimal: Maximum capability per unit latency"
                            >
                              ★ Pareto Frontier
                            </span>
                          )}
                          {isBaseline && (
                            <span className={styles.baselineBadge}>
                              [-] Baseline
                            </span>
                          )}
                        </div>
                      </td>
                      <td>{row.creator}</td>
                      <td>
                        <span className={styles.indexScore}>
                          {formatNumber(row.use_case_index_score, 1)}
                        </span>
                      </td>
                      <td>
                        <span className={styles.monoValue}>
                          {formatNumber(row.raw_metric_value)}
                        </span>
                      </td>
                      <td>
                        <span
                          className={
                            isPositiveMargin
                              ? styles.deltaPositive
                              : styles.deltaNegative
                          }
                        >
                          {formatMargin(margin)}
                        </span>
                      </td>
                      <td>
                        <span className={styles.monoValue}>
                          {formatLatency(row.telemetry?.inference_latency_ms)}
                        </span>
                      </td>
                      <td>
                        <span className={styles.monoValue}>
                          {formatVram(row.telemetry?.min_vram_gb)}
                        </span>
                      </td>
                      <td>
                        {row.telemetry?.open_weights ? (
                          <span className={styles.openWeightsBadge}>
                            {row.telemetry.license || "Open"}
                          </span>
                        ) : (
                          <span className={styles.closedWeightsBadge}>
                            {row.telemetry?.license || "Restricted"}
                          </span>
                        )}
                      </td>
                    </tr>

                    {/* Secondary Metrics Drawer Row */}
                    {isExpanded && (
                      <tr
                        id={`drawer-${row.model_id}`}
                        className={`${styles.drawerRow} drawer metric-details`}
                        data-drawer-for={row.model_id}
                      >
                        <td colSpan={10} className={styles.drawerCell}>
                          <div className={styles.drawerGrid}>
                            {/* Card 1: Hardware & Deployment */}
                            <div className={styles.drawerCard}>
                              <h4>Hardware & Telemetry</h4>
                              <dl className={styles.drawerDl}>
                                <dt>Latency:</dt>
                                <dd>{formatLatency(row.telemetry?.inference_latency_ms)}</dd>

                                <dt>Throughput:</dt>
                                <dd>
                                  {row.telemetry?.throughput_items_per_sec !== null &&
                                  row.telemetry?.throughput_items_per_sec !== undefined
                                    ? `${row.telemetry.throughput_items_per_sec.toFixed(1)} /s`
                                    : "Not measured"}
                                </dd>

                                <dt>Min VRAM:</dt>
                                <dd>{formatVram(row.telemetry?.min_vram_gb)}</dd>

                                <dt>Parameters:</dt>
                                <dd>
                                  {row.telemetry?.parameter_count_millions !== null &&
                                  row.telemetry?.parameter_count_millions !== undefined
                                    ? `${row.telemetry.parameter_count_millions}M`
                                    : "Not reported"}
                                </dd>

                                <dt>Est. Cost:</dt>
                                <dd>
                                  {row.telemetry?.estimated_cost_per_1k_evals_usd !== null &&
                                  row.telemetry?.estimated_cost_per_1k_evals_usd !== undefined
                                    ? `$${row.telemetry.estimated_cost_per_1k_evals_usd.toFixed(3)} / 1k`
                                    : "Not estimated"}
                                </dd>

                                <dt>Context Window:</dt>
                                <dd>
                                  {row.telemetry?.context_window_length !== null &&
                                  row.telemetry?.context_window_length !== undefined
                                    ? `${row.telemetry.context_window_length}`
                                    : "Not reported"}
                                </dd>

                                <dt>License:</dt>
                                <dd>{row.telemetry?.license || "Unspecified"}</dd>

                                <dt>Weights:</dt>
                                <dd>
                                  {row.telemetry?.open_weights
                                    ? "Open Weights"
                                    : "Closed / Proprietary"}
                                </dd>
                              </dl>
                            </div>

                            {/* Card 2: Protocol Baselines & Signal Capture */}
                            <div className={styles.drawerCard}>
                              <h4>Protocol Baselines & Signal</h4>
                              <dl className={styles.drawerDl}>
                                <dt>Conventional:</dt>
                                <dd>
                                  {row.baselines?.conventional_baseline?.name} (
                                  {row.baselines?.conventional_baseline?.value})
                                </dd>

                                <dt>Conv. Margin:</dt>
                                <dd
                                  className={
                                    isPositiveMargin
                                      ? styles.deltaPositive
                                      : styles.deltaNegative
                                  }
                                >
                                  {formatMargin(row.margin_over_conventional)}
                                </dd>

                                <dt>Null Control:</dt>
                                <dd>
                                  {row.baselines?.null_baseline?.name} (
                                  {row.baselines?.null_baseline?.value})
                                </dd>

                                <dt>Exp. Ceiling:</dt>
                                <dd>
                                  {row.baselines?.experimental_ceiling
                                    ? `${row.baselines.experimental_ceiling.name} (${row.baselines.experimental_ceiling.value})`
                                    : "Not standardized"}
                                </dd>

                                <dt className={styles.fullWidth}>
                                  % Biological Ceiling Captured:
                                </dt>
                                <dd className={`${styles.fullWidth} ${styles.deltaPositive}`}>
                                  {typeof row.fraction_of_biological_ceiling === "number" &&
                                  Number.isFinite(row.fraction_of_biological_ceiling)
                                    ? `${row.fraction_of_biological_ceiling.toFixed(1)}%`
                                    : "Undefined"}
                                </dd>
                              </dl>
                            </div>

                            {/* Card 3: Scientific Provenance & Verification */}
                            <div className={styles.drawerCard}>
                              <h4>Scientific Provenance</h4>
                              <dl className={styles.drawerDl}>
                                <dt>Source Record:</dt>
                                <dd>
                                  <Link
                                    href="/evidence/"
                                    prefetch={false}
                                    className={styles.provenanceLink}
                                  >
                                    {row.source_record_id}
                                  </Link>
                                </dd>

                                <dt>Verification:</dt>
                                <dd>
                                  <span
                                    className={`${styles.statusBadge} ${
                                      row.reviewed_status === "reproduced"
                                        ? styles.statusReproduced
                                        : row.reviewed_status === "community_verified"
                                        ? styles.statusCommunity
                                        : styles.statusChecked
                                    }`}
                                  >
                                    {row.reviewed_status}
                                  </span>
                                </dd>

                                <dt>Pareto Status:</dt>
                                <dd>
                                  {row.pareto_optimal ? (
                                    <span className={styles.paretoBadge}>
                                      ★ Pareto Frontier
                                    </span>
                                  ) : (
                                    "Dominated / Uncalibrated"
                                  )}
                                </dd>

                                <dt>Classification:</dt>
                                <dd>{isBaseline ? "Reference Baseline" : "Frontier Model"}</dd>

                                {row.study_citations && row.study_citations.length > 0 && (
                                  <>
                                    <dt className={styles.fullWidth}>Benchmark Studies:</dt>
                                    <dd className={styles.fullWidth}>
                                      {row.study_citations.map((c) => (
                                        <div key={c.study_id} style={{ marginBottom: 4 }}>
                                          <strong>{c.title}</strong> — {c.journal} {c.year} [{c.doi}]
                                        </div>
                                      ))}
                                    </dd>
                                  </>
                                )}
                              </dl>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Assay Noise Ceiling Banner */}
      <footer className={styles.ceilingBanner} aria-label="Assay Ceiling Summary">
        {categoryConfig.experimental_ceiling ? (
          <div>
            <span className={styles.ceilingHighlight}>
              Assay Noise Ceiling / Assay Replicate Noise Ceiling: {categoryConfig.metric} ={" "}
              {categoryConfig.experimental_ceiling.value}
            </span>{" "}
            ({categoryConfig.experimental_ceiling.assay_replicate_noise}).{" "}
            {topNonBaseline &&
              typeof topNonBaseline.fraction_of_biological_ceiling === "number" &&
              Number.isFinite(topNonBaseline.fraction_of_biological_ceiling) && (
              <span>
                Top model (<strong>{topNonBaseline.model_name}</strong>) captures{" "}
                <strong>
                  {topNonBaseline.fraction_of_biological_ceiling.toFixed(1)}%
                </strong>{" "}
                of reproducible physical assay variance.
              </span>
            )}
          </div>
        ) : (
          <div>
            <span className={styles.ceilingHighlight}>
              Protocol Baseline: Conventional baseline{" "}
              {categoryConfig.conventional_baseline.name} (
              {categoryConfig.conventional_baseline.value})
            </span>
            . Experimental noise floor not yet standardized for this biological assay.
          </div>
        )}
      </footer>
    </div>
  );
}

export default UnifiedLeaderboard;
