# Final independent integration review

**Passed. No blocking implementation or graph issue found.** This supersedes the pending-integration notes in `REPORT.md`.

The sealed loaders were executed against the pinned 22,074-record catalogue from release `2026-09-23-6c5e8b6b153f`; its SHA-256 matches the immutable release manifest. The output contains **26,045 records**, including **1,620 new numerical results from 13 source-table batches**. Full `validateRecords` validation passes: no duplicate IDs, missing sources, dangling links, invalid entity roles or invalid curated comparison panels.

Both positive review gates pass. **18 negative tests** reject altered or empty/draft receipts, omitted reviewed input maps, changed specs/JSONL/links/sources, changed compressed artifact bytes, wrong decompressed artifact hashes even with an updated compressed-byte receipt, inconsistent regenerated records, missing experiment-lineage targets and duplicate ingestion. Tests intercepted reads within the review process; no tracked files were altered.

The dynamic input manifests match every current input file, including root receipts: **44 table inputs and 8 identity inputs**. Both arrays enter the current release manifest. The new loaders run only in the current release path in `release.ts`; `inputs.ts` and the historical reconstruction path remain unchanged.

Every existing result retains its printed/numeric values, unit, metric, uncertainty, source locator, review object, source IDs and evaluation links. Neither loader mutates its input array/records. Tracked historical manifests/archive paths are unchanged. The parent's full release run remains responsible for archive restoration/export verification; this review did not regenerate or write public exports.

All seven verified alias pairs expose identical result totals. The earlier 21 relevant test assertions and expanded independent alias fixture passed: canonical direct results, alias-side child results, upper-family rollup, sibling variants with distinct results, pipeline exclusion and tested-entity filtering. No unsupported reverse flow across family, variant or uses_model relationships was found.

All new evaluations explicitly retain `suite_complete=false` and `published_score_reproduction=false`. Metric grouping counts the same method/dataset setup together without averaging scores. Individual source units and uncertainty remain on each result. Existing result numbers are unchanged; mRNABench experiment overlap is additional provenance, not inferred checkpoint equivalence.

The UI wording now refers to evaluated configurations and “Related configurations, pipelines and services”; the earlier entity-kind wording issue is resolved.

`FINAL.json` records the exact reviewed input/code hashes, all negative-test outcomes, graph totals, alias counts and preservation checks. `sealed-gates.ts` is the read-only test harness. No tracked edits, publication or model execution were performed by this review.
