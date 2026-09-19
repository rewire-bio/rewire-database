/** Coverage uses the same sourced relationships and chart gates as the API. */
import fs from "node:fs";
import { createCatalogueQuery, type CatalogueRecord } from "../../services/omics/src/catalogue-query";
export type CoverageInput = CatalogueRecord;
export type BenchmarkCoverage = {
  id: string; name: string; status: string; evaluations: number; results: number; charts: number;
};
export function benchmarkCoverage(records: readonly CoverageInput[]): BenchmarkCoverage[] {
  const query = createCatalogueQuery({schema_version: "1.1", release_id: "coverage-audit",
    released_at: "2026-09-19T00:00:00Z", coverage: {}, records: [...records]});
  return records.filter(r => r.kind === "benchmark" && r.status !== "excluded")
    .map(r => {
      const results = query.results({id: r.id, limit: 1});
      return { id: r.id, name: r.name, status: r.status,
        evaluations: results.evaluation_count, results: results.total,
        charts: query.get({id: r.id, include_comparisons: false})!.comparison_options.length };
    }).sort((a,b) => b.results - a.results || a.id.localeCompare(b.id));
}
export function assertCoverageFloor(coverage: BenchmarkCoverage[], floor: {
  covered: number;
  benchmarks?: Record<string, {results: number; charts: number}>;
}) {
  if (coverage.filter(r => r.results > 0).length < floor.covered)
    throw new Error("Benchmark coverage regressed");
  for (const [id, minimum] of Object.entries(floor.benchmarks || {})) {
    const current = coverage.find(r => r.id === id);
    if (!current || current.results < minimum.results || current.charts < minimum.charts)
      throw new Error(`Benchmark evidence regressed: ${id}`);
  }
}
function main() {
  const published = JSON.parse(fs.readFileSync("public/omics/catalogue.json", "utf8"));
  const coverage = benchmarkCoverage(published.records);
  console.log(`Release ${published.release_id}`);
  for (const row of coverage) console.log(`${row.id}: ${row.evaluations} evaluations, ${row.results} metric rows, ${row.charts} charts`);
  console.log(`${coverage.filter(r => r.results > 0).length}/${coverage.length} benchmarks have linked results. Missing evidence is not a zero score.`);
  assertCoverageFloor(coverage, JSON.parse(fs.readFileSync("data/omics/benchmark-evidence-floor.json", "utf8")));
}
if (process.argv[1]?.endsWith("audit-benchmark-evidence.ts")) main();
