# Project evaluation, 19 September 2026

The project is a useful source-linked research catalogue, but it needs a reliability and scientific-integrity pass before substantial further expansion. Keep the existing TypeScript/Firebase architecture. The most urgent problems are in response construction, adapter inputs and extraction verification; changing database engines would not address them.

This assessment covers the database, representative live pages and the benchmark runner. It does not certify every published scientific claim or reproduce the underlying experiments. No application fixes, commits or deployments were made during this evaluation.

## Verified state

| Check | Outcome |
| --- | --- |
| Database revision | `1df5435ef686991d9861d9006f5c8f1c1da88e43` |
| Runner revision | `e9b92e0a36260794b682ad1d6c6ad318edc3a60a` |
| Live website and API release | Both `2026-09-17-26ec7db1590e` |
| Top-level benchmarks | 30; 20 have results and charts; 10 remain empty |
| Source-specific figures on those benchmark pages | 421, calculated with the production query engine |
| Published result records | 5,465, including historical and existing rewire records; these are not 5,465 independent experiments |
| Database tests | 287 passed |
| Runner tests | 138 passed; targeted reproductions still found defects below |
| Database lint and type checking | Passed |
| Fresh production build | Passed with an 8 GB Node heap; 14,222 generated pages reported by Next.js |
| Export validation | Passed; checked 13,449 record pages, historical routes, MFASS history and release checksums |
| Local export size | Approximately 6.2 GB across 28,557 files |

The latest GitHub deployment run was successful. Firebase emulator tests were not rerun during this evaluation. The existing deployed contribution gate remains disabled.

## Priority findings

### 1. Large benchmark API responses fail in production

**Priority: high. Confirmed live failure and locally identified cause.**

[`aggregate-comparisons.ts:74`](../../services/omics/src/aggregate-comparisons.ts) stores the complete comparison panel inside every aggregate row. Each panel itself contains all its rows, so JSON serialization repeats the same data many times. [`catalogue-query.ts:503`](../../services/omics/src/catalogue-query.ts) returns that expanded structure.

For the current NABench record, the detail response serializes locally to **378,696,731 bytes**, of which **365,316,908 bytes** are aggregate comparisons. A single release-pinned live `catalogue.get` request returned **HTTP 503 after 28.5 seconds**. This does not establish that its static page is unavailable.

The deployed function is configured for 256 MiB in [`functions.ts`](../../services/omics/src/functions.ts). Increasing memory alone would not solve the response problem: the documented second-generation non-streaming HTTP response limit is 32 MB. [Google Cloud quota documentation](https://docs.cloud.google.com/functions/quotas), checked 19 September 2026.

**Fix:** refer to panels by ID, return compact row data, and paginate or load individual charts. Add response-size and largest-benchmark acceptance tests. Profile the whole-snapshot cache before changing memory allocation.

### 2. Genomic Benchmarks exposes labels to model adapters

**Priority: high. Reproduced without model computation.**

The runner's `packages/rewirebench/src/rewirebench/protocols/genomic_benchmarks.py:63` constructs IDs as `test/<class>/<filename>`. `sdk.py:121` passes the ID to the adapter unchanged.

An in-memory adapter that predicted from `'/positive/' in row['id']` obtained accuracy and F1 of **1.0**, marked complete, without reading the sequence. Removing the explicit target field therefore does not enforce the intended label boundary.

**Fix:** provide opaque IDs and keep class/path mappings inside evaluator-owned data. Add a test inspecting every adapter-visible field for target information. Existing published literature scores are not shown to be affected by this SDK defect.

### 3. Some PDF extraction receipts do not verify the input being parsed

**Priority: high. Confirmed verification gap; no current incorrect score established.**

For example, [`extract/tdc.ts:95–101`](../../scripts/omics/extract/tdc.ts) parses a text file but verifies the hash of a separately supplied PDF. ATOM3D, BEND, FLIP, GUE, HEST and ProteinGym use the same pattern. Modified or stale text can be paired with the correct PDF and produce a receipt citing that PDF.

The batch digest protects the generated JSONL against later edits. It does not prove that the parsed text came from the authenticated PDF.

**Fix:** extract text directly from the verified PDF within the pipeline, recording the tool/version and transformation. Alternatively, authenticate the derived text through a checked transformation receipt. Recheck affected batches after closing this gap.

### 4. Deployment can leave the active API release ahead of the website

**Priority: high for deployment reliability. Current live releases agree.**

[The workflow](../../.github/workflows/firebase.yml) activates the new catalogue before the live probe and Hosting deployment. It has no automatic restoration of the previous release pointer if a later step fails. [The probe](../../scripts/check-live-catalogue.mjs) makes a single submissions-disabled assertion; the handover documents a transient response interrupting deployment at that point.

**Fix:** capture the previous active release, retry bounded transient failures, and restore the pointer when publication fails. Keep old pinned releases readable. Test an interrupted deployment, not only the successful path.

## Data quality and interpretation

**Parsing failures can silently remove results.** [`tables.ts:193–199`](../../scripts/omics/extract/tables.ts) treats an unrecognised numeric cell like an explicit missing marker. `parseCell("0.87%")` returns no value; `parseCell("0.87 ± broken")` retains the mean and drops the uncertainty. Some extractors skip these cells. ProteinBench also accepts missing columns and lacks the dimension assertions described in the handover. Unknown syntax should stop publication; explicit missing markers should remain distinguishable. Require expected row, column and nonmissing-cell counts.

**Coverage checks do not use production reachability rules.** [`audit-benchmark-evidence.ts`](../../scripts/omics/audit-benchmark-evidence.ts) accepts bare membership edges, whereas the production query requires supporting claims. A minimal fixture passes the audit but returns no results through the real query. Current published benchmark counts do agree. Replace the separate traversal with production query semantics and check per-benchmark coverage and chart counts.

**Evaluation counts are inflated by metric-specific records.** The Genomic Benchmarks extractor creates separate task/evaluation identities for accuracy and F1 on the same dataset/configuration. It reports 36 evaluations for nine datasets, two framework configurations and two metrics. Those are 36 score records, not evidence of 36 separate experimental setups. Group metrics under one evaluation where the source establishes the same configuration, data and split. Do not merge distinct protocols simply to reduce counts. Preserve old IDs through versioned corrections.

**Pooled charts sort scientifically different evaluations.** The opt-in view groups only by metric, unit and direction, then sorts values across protocols and datasets. It visibly warns about these differences, which is useful, but ProteinGym can still place supervised, zero-shot and indel results in one Spearman ordering. Prefer separate panels or a faceted table; reserve ranked comparisons for compatible evaluations.

**Release metadata needs maintenance.** [`release.ts`](../../scripts/omics/release.ts) still hardcodes the earlier paper-review counts and changelog. The release date remains 17 September while extraction receipts include 18 September. Publish the next release with an accurate date, an explicit correction/addition log and derived coverage totals. Do not rewrite historical release files.

The ten unfilled benchmark pages are BEELINE, CAFA, CAMI, CAPRI, CASP, FLIP2, PEtab benchmark collection, PLINDER, scIB and Virtual Cell Challenge 2026. They need appropriate supplementary tables or assessment exports. A complete audit does not justify manufacturing charts from absent or incompatible measurements.

## Product and architecture

The provenance model, stable IDs, immutable exports, checked relationships, source locators and distinction between reported and reproduced results are worth preserving. The inspected backend also has explicit contribution gating, ownership checks, private-field rejection, transactional revisions and an email outbox. No authorization bypass was found in the inspected backend paths.

The frontend still makes results hard to find. On the live ProteinGym page at a 1,280 px viewport, the chart section starts about 6,161 px down, after extensive metadata and instructions. Put a concise explanation, protocol selector and results/chart first; make detailed methodology and execution instructions expandable.

Exporting a full document for every record increases build and deployment cost. The handover quotes a 40,000-file Hosting cap; that particular cap was not independently confirmed in this review, so the recommendation does not depend on it. The measured 6.2 GB export already warrants reducing duplication. Keep stable URLs, but consider lightweight detail pages backed by the existing API for result/evaluation rows, after fixing payload size. Retain static explanatory model and benchmark pages. Validate indexability, unknown-record 404s and historical links before changing routing.

Two additional runner defects need regression tests: constant TDC Spearman predictions yield NaN and cause report serialization to fail; arbitrary provenance keys ending `_sha256` or `_revision` can carry private path text into exports. Use an explicit unavailable reason for undefined metrics and an allowlist for exported provenance names. The reproduced export case was local, not an observed external disclosure.

Before enabling contributions, add pagination to the contributor and curator queues: they currently truncate at 200 entries. TDC/Genomic Benchmarks exports also need explicit submission-schema support; the SDK submission allowlist currently covers only the earlier protocols.

## Recommended next delivery

1. Fix API duplication and adapter label leakage, with reproductions as regression tests.
2. Verify exact extraction inputs, reject unknown numeric cells, and use production graph semantics in coverage checks.
3. Add deployment rollback and response-size/cold-start checks; correct release metadata.
4. Reduce page duplication while retaining URLs, and move scientific findings above long metadata sections.
5. Resume source-table collection for the remaining ten benchmarks in reviewed batches.

Acceptance should include a successful bounded NABench detail request, an adapter that cannot recover labels from IDs, rejection of mismatched PDF/text inputs, explicit handling of undefined metrics, and a simulated failed deployment that restores consistency. No new model runs or paid infrastructure are required to establish those properties.

The project merits continued development. Its strongest differentiator is traceable biological evaluation evidence. Reliability, accurate evaluation identities and trustworthy comparisons should be the next milestone.
