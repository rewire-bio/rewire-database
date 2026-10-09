/** Prepared by rewire-bio/rewire-benchmark-data and verified through the data lock. */
export interface BenchmarkCoverageAudit {
  release_id: string;
  released_at: string;
  scope: string;
  summary: Record<string, { pages: number; with_results: number; with_charts: number }>;
  pages: Array<{
    id: string; kind: string; name: string; status: string; url: string;
    evaluations: number; metric_rows: number; charts: number;
    charted_metric_rows: number; chart_protocol_ids: string[];
    state: string; source_ids: string[]; source_urls: string[];
    research_status: string; research_review_date: string | null; gaps: string[];
  }>;
}

import { createCatalogueQuery, type CatalogueSnapshot } from "./catalogue-query.js";
import { isBenchmarkSubject } from "./entity-kinds.js";
import type { BenchmarkResearchData } from "./benchmark-research.js";

/** Audit all assessment pages using exactly the same relationships as the API. */
export function benchmarkCoverage(snapshot: CatalogueSnapshot): BenchmarkCoverageAudit {
  const query = createCatalogueQuery(snapshot);
  const pages = snapshot.records.filter((record) => record.status !== "excluded" && isBenchmarkSubject(record.kind)).map((record) => {
    const results = query.results({ id: record.id, limit: 1 });
    const detail = query.get({ id: record.id })!;
    const research = record.attributes.benchmark_research as BenchmarkResearchData | undefined;
    const charts = detail.published_comparisons;
    const charted = new Set(charts.flatMap((panel) => panel.result_ids));
    return {
      id: record.id, kind: record.kind, name: record.name, status: record.status,
      url: `/database/${record.kind}/${record.id}/`,
      evaluations: results.evaluation_count, metric_rows: results.total,
      charts: charts.length, charted_metric_rows: charted.size,
      chart_protocol_ids: [...new Set(charts.map((panel) => panel.protocol_id))],
      state: record.status === "superseded" ? "historical" : charts.length ? "charts_available" : results.total ? "results_without_validated_comparison" : "results_not_yet_collected",
      source_ids: [...new Set(detail.sources.map((source) => source.id))],
      source_urls: detail.sources.flatMap((source) => typeof source.attributes.url === "string" ? [source.attributes.url] : []),
      research_status: research?.status || "No separate paper-extraction audit recorded",
      research_review_date: research?.review_date || null,
      gaps: research?.gaps || (results.total ? ["Only reviewed, source-scoped comparison groups are charted. Individual observations remain in the results table."] : ["No evaluations linked in this release; this is a catalogue gap, not a claim that no published experiments exist."]),
    };
  }).sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
  return {
    release_id: snapshot.release_id, released_at: snapshot.released_at,
    scope: "Every published benchmark, task, protocol and evaluator page; counts use reviewed membership links and exclude private submissions.",
    summary: Object.fromEntries(["benchmark", "task", "protocol", "evaluator"].map((kind) => {
      const group = pages.filter((page) => page.kind === kind);
      return [kind, { pages: group.length, with_results: group.filter((page) => page.metric_rows > 0).length, with_charts: group.filter((page) => page.charts > 0).length }];
    })),
    pages,
  };
}
