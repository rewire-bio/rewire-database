"use client";

import React, { useId, useMemo, useState } from "react";
import Link from "next/link";
import styles from "./UnifiedLeaderboard.module.css";
import {
  REVIEW_STATUS_LABELS,
  protocolLabel,
  type BiologicalModelRankingRow,
  type LeaderboardResult,
  type RankingProtocol,
} from "../../lib/use-case-leaderboard";
import { NOT_RECORDED, licenceLabel, licenceText, shortFact, type OperationalTelemetry } from "../../lib/operational-telemetry";
import { originDescription, originLabel } from "../../lib/result-origin";
import { generateLeaderboardItemListJsonLd } from "../../lib/catalogue-seo";
import { safeJsonLd } from "../../lib/catalogue-sharing";

export type { BiologicalModelRankingRow, LeaderboardResult, OperationalTelemetry, RankingProtocol };

export interface UnifiedLeaderboardProps {
  /** One leaderboard per tab, built from the release (lib/release-leaderboard.ts). */
  boards: LeaderboardResult[];
  /** The use case shown first; defaults to the first board. */
  initialSlug?: string;
  expandedRowId?: string;
  showCategorySwitcher?: boolean;
  showParetoHighlight?: boolean;
  emitJsonLd?: boolean;
  className?: string;
  testId?: string;
}

export type SortColumn = "rank" | "metric" | "vs_baseline" | "latency" | "vram" | "model" | "source" | "license";
export type SortDirection = "asc" | "desc";

export { originLabel };

function formatMargin(delta: number | null | undefined): string {
  if (delta === null || delta === undefined || !Number.isFinite(delta)) return NOT_RECORDED;
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(1)}%`;
}

function formatLatency(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return NOT_RECORDED;
  if (ms < 1) return `${ms.toFixed(1)} ms`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.round(ms)} ms`;
}

function formatVram(gb: number | null | undefined): string {
  if (gb === null || gb === undefined || !Number.isFinite(gb)) return NOT_RECORDED;
  return `${gb} GB`;
}

const recorded = (text: string | null | undefined) => text || NOT_RECORDED;

function SortHeader({ column, label, sortColumn, sortDirection, onSort, className }: {
  column: SortColumn; label: React.ReactNode; sortColumn: SortColumn; sortDirection: SortDirection;
  onSort: (column: SortColumn) => void; className: string;
}) {
  const active = sortColumn === column;
  return (
    <th
      scope="col"
      tabIndex={0}
      className={`${styles.sortHeader} ${className}`}
      aria-sort={active ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
      onClick={() => onSort(column)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
          e.preventDefault();
          onSort(column);
        }
      }}
    >
      {label}
      {active && <span className={styles.sortIndicator}>{sortDirection === "asc" ? "▲" : "▼"}</span>}
    </th>
  );
}

/**
 * Per-use-case leaderboard: models ranked on one protocol of the use case, with each value's
 * source, review status, independence, coverage and open findings.
 */
export function UnifiedLeaderboard({
  boards,
  initialSlug,
  expandedRowId,
  showCategorySwitcher = true,
  showParetoHighlight = false,
  emitJsonLd = true,
  className,
  testId = "unified-leaderboard",
}: UnifiedLeaderboardProps) {
  const componentId = useId();
  const [activeSlug, setActiveSlug] = useState<string | undefined>(
    () => boards.find((b) => b.use_case_slug === initialSlug)?.use_case_slug ?? boards[0]?.use_case_slug,
  );
  const board = boards.find((b) => b.use_case_slug === activeSlug) ?? boards[0];
  const protocol = board?.protocol ?? null;
  const availableRows = useMemo(() => board?.rows ?? [], [board]);

  const [sortColumn, setSortColumn] = useState<SortColumn>("rank");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [openWeightsOnly, setOpenWeightsOnly] = useState(false);
  const [maxVram, setMaxVram] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedRowIds, setExpandedRowIds] = useState<Set<string>>(() => (expandedRowId ? new Set([expandedRowId]) : new Set()));

  // Columns and filters appear only when some row carries the data they act on.
  const hasLatency = availableRows.some((r) => r.telemetry.inference_latency_ms !== null);
  const hasVram = availableRows.some((r) => r.telemetry.min_vram_gb !== null);
  const hasOpenWeights = availableRows.some((r) => r.telemetry.open_weights !== null);
  const hasMargin = !!board?.baseline;
  const hasPareto = availableRows.some((r) => r.pareto_optimal);
  const columnCount = 8 + Number(hasMargin) + Number(hasLatency) + Number(hasVram);

  const toggleRowExpanded = (id: string) =>
    setExpandedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleSortClick = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortColumn(column);
    setSortDirection(column === "vs_baseline" ? "desc" : "asc");
  };

  const filteredRows = useMemo(() => {
    let list = availableRows;
    if (openWeightsOnly) list = list.filter((r) => r.telemetry.open_weights === true || r.is_baseline);
    if (maxVram !== "all") {
      const limit = parseInt(maxVram, 10);
      list = list.filter((r) => r.is_baseline || (r.telemetry.min_vram_gb !== null && r.telemetry.min_vram_gb <= limit));
    }
    const q = searchQuery.trim().toLowerCase();
    if (q)
      list = list.filter((r) =>
        r.model_name.toLowerCase().includes(q) ||
        (r.model_detail ?? "").toLowerCase().includes(q) ||
        (r.source?.name ?? "").toLowerCase().includes(q) ||
        (licenceText(r.telemetry) ?? "").toLowerCase().includes(q));
    return list;
  }, [availableRows, openWeightsOnly, maxVram, searchQuery]);

  const sortedRows = useMemo(() => {
    const list = [...filteredRows];
    // "Best first" for the metric column follows the protocol's direction.
    const metricSign = protocol?.direction === "lower" ? 1 : -1;
    const numeric = (a: number | null, b: number | null, sign: number) => {
      if (a === null && b === null) return 0;
      if (a === null) return 1;
      if (b === null) return -1;
      return sign * (a - b);
    };
    const flip = sortDirection === "asc" ? 1 : -1;
    list.sort((a, b) => {
      switch (sortColumn) {
        case "rank": return flip * ((a.rank ?? Infinity) - (b.rank ?? Infinity)) || a.model_name.localeCompare(b.model_name);
        case "metric": return numeric(a.raw_metric_value, b.raw_metric_value, flip * metricSign);
        case "vs_baseline": return numeric(a.margin_over_conventional, b.margin_over_conventional, -flip);
        case "latency": return numeric(a.telemetry.inference_latency_ms, b.telemetry.inference_latency_ms, flip);
        case "vram": return numeric(a.telemetry.min_vram_gb, b.telemetry.min_vram_gb, flip);
        case "model": return flip * a.model_name.localeCompare(b.model_name);
        case "source": return flip * (a.source?.name ?? "").localeCompare(b.source?.name ?? "");
        case "license": return flip * (licenceText(a.telemetry) ?? "").localeCompare(licenceText(b.telemetry) ?? "");
      }
    });
    return list;
  }, [filteredRows, sortColumn, sortDirection, protocol]);

  const hasActiveFilters = openWeightsOnly || maxVram !== "all" || searchQuery.trim().length > 0;
  const handleClearFilters = () => {
    setOpenWeightsOnly(false);
    setMaxVram("all");
    setSearchQuery("");
  };

  const title = board?.use_case_title ?? "Use-case";
  const itemListJsonLd = useMemo(
    () =>
      generateLeaderboardItemListJsonLd({
        name: `${title} leaderboard`,
        description: protocol
          ? `Models ranked by ${protocol.metric_label} on ${protocolLabel(protocol)}. Each value links to its result record.`
          : `No ranking for ${title} in this release.`,
        rows: availableRows,
      }),
    [title, protocol, availableRows],
  );

  const searchInputId = `${componentId}-search`;
  const vramSelectId = `${componentId}-vram`;
  const openWeightsId = `${componentId}-open-weights`;
  const metricHeader = protocol ? `${protocol.metric_label} ${protocol.direction === "lower" ? "(lower is better)" : "(higher is better)"}` : "Value";

  return (
    <div className={`${styles.container} ${className || ""}`} data-testid={testId}>
      {emitJsonLd && board && board.rows.length > 0 && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(itemListJsonLd) }} />
      )}
      {showCategorySwitcher && boards.length > 1 && (
        <nav className={styles.tabs} aria-label="Use-case rankings" role="tablist">
          {boards.map((b) => (
            <button
              key={b.use_case_slug}
              type="button"
              role="tab"
              data-use-case={b.use_case_slug}
              aria-selected={b.use_case_slug === board?.use_case_slug}
              className={styles.tabButton}
              onClick={() => {
                setActiveSlug(b.use_case_slug);
                setExpandedRowIds(new Set());
              }}
            >
              {b.use_case_title}
            </button>
          ))}
        </nav>
      )}

      {protocol && (
        <p className={styles.protocolNote} data-testid="leaderboard-protocol">
          Ranked on <strong>{protocolLabel(protocol)}</strong> ({protocol.metric_label}, {protocol.direction} is better).
          {protocol.relevance === "proxy" && (
            <> <span className={styles.proxyBadge}>Proxy protocol</span> Reviewers judged this protocol a proxy for the use case, not a direct test of it.</>
          )}{" "}
          Only results on this protocol are ranked; other tools are listed below the table.
        </p>
      )}

      {availableRows.length > 0 && (
        <div className={styles.filterBar} role="search" aria-label="Leaderboard Filters">
          <div className={styles.filterControls}>
            <input
              id={searchInputId}
              type="search"
              placeholder="Search models or sources..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={styles.searchInput}
              aria-label="Search models or sources"
            />
            {hasOpenWeights && (
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
            )}
            {hasVram && (
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
            )}
          </div>
          {hasActiveFilters && (
            <button type="button" onClick={handleClearFilters} className={styles.clearButton}>
              Clear Filters
            </button>
          )}
        </div>
      )}

      {showParetoHighlight && hasPareto && (
        <div className={styles.ceilingBanner} role="region" aria-label="Pareto Frontier Highlights">
          <span className={styles.ceilingHighlight}>★ Pareto frontier (value against recorded latency):</span>{" "}
          {sortedRows.filter((r) => r.pareto_optimal).map((r) => (
            <span key={r.model_id} style={{ marginRight: 12 }}>
              <strong>{r.model_name}</strong> ({formatLatency(r.telemetry.inference_latency_ms)})
            </span>
          ))}
        </div>
      )}

      <div className={styles.tableWrap} tabIndex={0} role="region" aria-label={`${title} Leaderboard`}>
        <table className={styles.table} aria-label={`${title} Leaderboard`}>
          <thead>
            <tr>
              <th scope="col" className={`${styles.toggleCell} col-toggle w-8`} aria-label="Expand details"></th>
              <SortHeader column="rank" label="Rank" className="col-rank w-12 align-center" {...{ sortColumn, sortDirection }} onSort={handleSortClick} />
              <SortHeader column="model" label="Model" className="col-model min-w-48 align-left" {...{ sortColumn, sortDirection }} onSort={handleSortClick} />
              <SortHeader column="metric" label={metricHeader} className="col-metric min-w-28 align-right" {...{ sortColumn, sortDirection }} onSort={handleSortClick} />
              {hasMargin && (
                <SortHeader column="vs_baseline" label={`vs ${board!.baseline!.name}`} className="col-margin min-w-32 align-right" {...{ sortColumn, sortDirection }} onSort={handleSortClick} />
              )}
              <th scope="col" className="col-evidence min-w-32 align-left">Evidence</th>
              <th scope="col" className="col-coverage min-w-20 align-right">Coverage</th>
              <SortHeader column="source" label="Reported by" className="col-source min-w-28 align-left" {...{ sortColumn, sortDirection }} onSort={handleSortClick} />
              {hasLatency && <SortHeader column="latency" label="Latency" className="col-latency min-w-24 align-right" {...{ sortColumn, sortDirection }} onSort={handleSortClick} />}
              {hasVram && <SortHeader column="vram" label="VRAM" className="col-vram min-w-20 align-right" {...{ sortColumn, sortDirection }} onSort={handleSortClick} />}
              <SortHeader column="license" label="License" className="col-license min-w-28 align-left" {...{ sortColumn, sortDirection }} onSort={handleSortClick} />
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 ? (
              <tr>
                <td colSpan={columnCount}>
                  <div className={styles.emptyState}>
                    {availableRows.length === 0 ? (
                      <>
                        <div className={styles.emptyTitle}>No ranking for this use case yet</div>
                        <p>{board?.empty_reason ?? "No comparison in this release can be ranked."}</p>
                      </>
                    ) : (
                      <>
                        <div className={styles.emptyTitle}>No matching models found</div>
                        <p>No models match the selected filters or search terms.</p>
                        {hasActiveFilters && (
                          <button type="button" onClick={handleClearFilters} className={styles.clearButton}>
                            Reset Filters
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              sortedRows.map((row) => {
                const isExpanded = expandedRowIds.has(row.model_id);
                const margin = row.margin_over_conventional;
                const rowClassName = `${styles.tableRow} ${row.is_baseline ? styles.baselineRow : ""} ${isExpanded ? styles.expandedRow : ""} ${row.pareto_optimal ? "pareto-row" : ""}`;
                return (
                  <React.Fragment key={row.model_id}>
                    <tr className={rowClassName} onClick={() => toggleRowExpanded(row.model_id)} data-model-id={row.model_id}>
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
                          <span className={styles.chevronIcon} style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
                        </button>
                      </td>
                      <td className={styles.monoValue}>{row.rank === null ? "" : `#${row.rank}`}</td>
                      <td className={styles.modelCell}>
                        <div className={styles.modelNameWrap}>
                          <Link href={row.model_href} prefetch={false} className={styles.modelLink} onClick={(e) => e.stopPropagation()}>
                            {row.model_name}
                          </Link>
                          {row.model_detail && <span className={styles.closedWeightsBadge}>{row.model_detail}</span>}
                          {row.pareto_optimal && (
                            <span className={`${styles.paretoBadge} pareto-badge`} title="Pareto optimal: best value for its recorded latency">★ Pareto Frontier</span>
                          )}
                          {row.is_baseline && <span className={styles.baselineBadge}>[-] Baseline</span>}
                          {row.open_findings.length > 0 && (
                            <Link
                              href={row.open_findings[0].href}
                              prefetch={false}
                              className={styles.findingBadge}
                              title={row.open_findings.map((f) => f.label).join("; ")}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {row.open_findings.length === 1 ? "Open discrepancy" : `${row.open_findings.length} open discrepancies`}
                            </Link>
                          )}
                        </div>
                      </td>
                      <td>
                        <Link
                          href={`/database/result/${encodeURIComponent(row.source_record_id)}/`}
                          prefetch={false}
                          className={styles.monoValue}
                          title={`Result record ${row.source_record_id}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {row.display_value}
                        </Link>
                      </td>
                      {hasMargin && (
                        <td>
                          {row.is_baseline ? "" : (
                            <span className={margin !== null && margin > 0 ? styles.deltaPositive : styles.deltaNegative}>{formatMargin(margin)}</span>
                          )}
                        </td>
                      )}
                      <td>
                        <span
                          className={`${styles.statusBadge} ${row.reviewed_status === "reproduced" ? styles.statusReproduced : row.reviewed_status === "source_checked" ? styles.statusChecked : styles.statusCommunity}`}
                          data-status={row.reviewed_status}
                        >
                          {row.receipt ? (
                            <Link
                              href={row.receipt.href}
                              prefetch={false}
                              title={`Run receipt: ${row.receipt.name}`}
                              aria-label={`${REVIEW_STATUS_LABELS[row.reviewed_status]}. Run receipt: ${row.receipt.name}`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {REVIEW_STATUS_LABELS[row.reviewed_status]}
                            </Link>
                          ) : REVIEW_STATUS_LABELS[row.reviewed_status]}
                        </span>{" "}
                        <span
                          className={row.independent ? styles.openWeightsBadge : styles.closedWeightsBadge}
                          data-origin={row.origin ?? "none"}
                          title={originDescription(row.origin)}
                        >
                          {originLabel(row.origin)}
                        </span>
                      </td>
                      <td className={styles.monoValue} title="Comparisons in this use case that score the tool">
                        {`${row.coverage.evaluated}/${row.coverage.relevant}`}
                      </td>
                      <td>
                        {row.source ? (
                          <Link href={row.source.href} prefetch={false} title={row.source.name} onClick={(e) => e.stopPropagation()}>
                            {shortFact(row.source.name, 48)}
                          </Link>
                        ) : NOT_RECORDED}
                      </td>
                      {hasLatency && <td><span className={styles.monoValue}>{formatLatency(row.telemetry.inference_latency_ms)}</span></td>}
                      {hasVram && <td><span className={styles.monoValue}>{formatVram(row.telemetry.min_vram_gb)}</span></td>}
                      <td>
                        <span className={row.telemetry.open_weights ? styles.openWeightsBadge : styles.closedWeightsBadge} data-licence-scope={row.telemetry.license_scope ?? "none"} title={licenceText(row.telemetry) ?? undefined}>
                          {shortFact(licenceText(row.telemetry), 28)}
                        </span>
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr id={`drawer-${row.model_id}`} className={`${styles.drawerRow} drawer metric-details`} data-drawer-for={row.model_id}>
                        <td colSpan={columnCount} className={styles.drawerCell}>
                          <div className={styles.drawerGrid}>
                            <div className={styles.drawerCard}>
                              <h4>Hardware & Telemetry</h4>
                              <dl className={styles.drawerDl}>
                                <dt>Latency:</dt>
                                <dd>{formatLatency(row.telemetry.inference_latency_ms)}</dd>
                                <dt>Throughput:</dt>
                                <dd>{row.telemetry.throughput_items_per_sec !== null ? `${row.telemetry.throughput_items_per_sec.toFixed(1)} /s` : NOT_RECORDED}</dd>
                                <dt>Min VRAM:</dt>
                                <dd>{formatVram(row.telemetry.min_vram_gb)}</dd>
                                <dt>Parameters:</dt>
                                <dd>{recorded(row.telemetry.parameters)}</dd>
                                <dt>Est. Cost:</dt>
                                <dd>{row.telemetry.estimated_cost_per_1k_evals_usd !== null ? `$${row.telemetry.estimated_cost_per_1k_evals_usd.toFixed(3)} / 1k` : NOT_RECORDED}</dd>
                                <dt>Context Window:</dt>
                                <dd>{recorded(row.telemetry.context_window)}</dd>
                                <dt>{licenceLabel(row.telemetry)}:</dt>
                                <dd>{recorded(row.telemetry.license)}</dd>
                                <dt>Access:</dt>
                                <dd>{recorded(row.telemetry.access)}</dd>
                              </dl>
                            </div>

                            <div className={styles.drawerCard}>
                              <h4>Protocol & Baseline</h4>
                              <dl className={styles.drawerDl}>
                                <dt>Protocol:</dt>
                                <dd>{protocol ? protocolLabel(protocol) : NOT_RECORDED}</dd>
                                <dt>Metric:</dt>
                                <dd>{protocol ? `${protocol.metric_label}, ${protocol.direction} is better` : NOT_RECORDED}</dd>
                                {protocol?.endpoint && (
                                  <>
                                    <dt>Endpoint:</dt>
                                    <dd>{protocol.endpoint}</dd>
                                  </>
                                )}
                                <dt>Baseline:</dt>
                                <dd>{board?.baseline ? `${board.baseline.name} (${board.baseline.display_value})` : "None scored on this protocol"}</dd>
                                {board?.baseline && !row.is_baseline && (
                                  <>
                                    <dt>Margin:</dt>
                                    <dd className={margin !== null && margin > 0 ? styles.deltaPositive : styles.deltaNegative}>{formatMargin(margin)}</dd>
                                  </>
                                )}
                                <dt>Coverage:</dt>
                                <dd>{`${row.coverage.evaluated} of ${row.coverage.relevant} comparisons in this use case`}</dd>
                              </dl>
                            </div>

                            <div className={styles.drawerCard}>
                              <h4>Scientific Provenance</h4>
                              <dl className={styles.drawerDl}>
                                <dt>Result record:</dt>
                                <dd>
                                  <Link href={`/database/result/${encodeURIComponent(row.source_record_id)}/`} prefetch={false} className={styles.provenanceLink}>
                                    {row.source_record_id}
                                  </Link>
                                </dd>
                                <dt>Source:</dt>
                                <dd>
                                  {row.source ? (
                                    <Link href={row.source.href} prefetch={false} className={styles.provenanceLink}>
                                      {row.source.name}
                                    </Link>
                                  ) : NOT_RECORDED}
                                  {row.source?.doi && <> [{row.source.doi}]</>}
                                </dd>
                                <dt>Review:</dt>
                                <dd>{REVIEW_STATUS_LABELS[row.reviewed_status]}</dd>
                                {row.receipt && (
                                  <>
                                    <dt>Run receipt:</dt>
                                    <dd>
                                      <Link href={row.receipt.href} prefetch={false} className={styles.provenanceLink}>
                                        {row.receipt.name}
                                      </Link>
                                    </dd>
                                  </>
                                )}
                                <dt>Who ran it:</dt>
                                <dd data-origin-detail={row.origin ?? "none"}>{originLabel(row.origin)}. {originDescription(row.origin)}</dd>
                                <dt>Discrepancies:</dt>
                                <dd>
                                  {row.open_findings.length
                                    ? row.open_findings.map((f, i) => (
                                      <span key={f.id}>{i ? "; " : ""}<Link href={f.href} prefetch={false}>{f.label}</Link></span>
                                    ))
                                    : "No open finding"}
                                </dd>
                                <dt>Classification:</dt>
                                <dd>{row.is_baseline ? "Reference Baseline" : "Model or method"}</dd>
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

      {board && board.unranked.length > 0 && (
        <details className={styles.unrankedList} data-testid="leaderboard-unranked">
          <summary>
            {board.unranked.length} {board.unranked.length === 1 ? "tool is" : "tools are"} evaluated elsewhere in this use case but not on this protocol, so not ranked
          </summary>
          <ul>
            {board.unranked.map((m) => (
              <li key={m.model_id}>
                <Link href={m.model_href} prefetch={false}>{m.model_name}</Link>{" "}
                <span className={styles.monoValue}>{`(${m.coverage.evaluated} of ${m.coverage.relevant} comparisons)`}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <footer className={styles.ceilingBanner} aria-label="Baseline Summary">
        {board?.baseline ? (
          <div>
            <span className={styles.ceilingHighlight}>
              Baseline on this protocol: {board.baseline.name} ({board.baseline.display_value})
            </span>
            . Margins are percent differences from this value, positive when better.
          </div>
        ) : (
          <div>
            <span className={styles.ceilingHighlight}>No baseline scored on this protocol.</span> Margins are shown only where the
            same study scores the use case&apos;s baseline method.
          </div>
        )}
        {board && <> <Link href={board.use_case_href} prefetch={false}>All comparisons for {board.use_case_title}</Link></>}
      </footer>
    </div>
  );
}

export default UnifiedLeaderboard;
