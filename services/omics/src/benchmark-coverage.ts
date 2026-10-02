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
