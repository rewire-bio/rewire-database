# Benchmark coverage ownership

The data repository computes `public/omics/coverage/<release_id>.json` during its release build and includes it in the checksum-verified website artifact. The website consumes the prepared audit selected by `benchmark-data.lock.json` and checks that its release matches the catalogue. It does not generate the audit.

The coverage page reports collection gaps, not an absence of published experiments. Metric rows are not independent experiments; figures retain source-scoped comparisons. Both query implementations reject conflicting inherited figure IDs and accept identical duplicates.

Tests are partitioned by responsibility: `rewire-benchmark-data/tests/benchmark-coverage.test.ts` retains the coverage calculation regression from PR #74 (complete counts, inheritance, sources, empty/excluded/historical pages) and the figure-conflict regression. Website comparison tests retain figure-conflict and rendering coverage. `tests/benchmark-coverage-page.test.tsx` checks prepared-audit rendering, release mismatch rejection, empty-state wording and distinct evaluation/metric/figure counts.
