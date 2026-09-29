# Database worktree recovery, 29 September 2026

The committed branches in the main database clone and the September migration clone were already incorporated into main by ordinary or squash merges. Squash trees were compared against the corresponding GitHub merge commits; ahead counts alone were not used as evidence of missing work.

## Recovered implementation

The uncommitted research investigations feature was based on an older local-results branch. It is reconciled with the current main use-case release, scientific profiles, search metadata, result-loading fixes and navigation. Research evidence is separate from question-led use cases: readiness describes exact reproducibility/execution capabilities; use cases explain scientific questions and the evidence needed to answer them.

The recovery adds four previously prepared manifest cases, frozen per-release readiness, strict report validation, private staging, release-pinned API queries, dataset/evaluation readiness panels and an investigations section. The report collection is empty. Worker output cannot become public findings without human review. Existing scientific records and immutable historical release files are unchanged. The generated `records.jsonl` and `records.csv` SHA-256 hashes exactly match published release `2026-09-28-ab0005784661`.

## Candidate evidence retained separately

The migration review worktree contains older extraction drafts. Original JSONL files and review notes are preserved under `data/omics/pending-review/recovered-20260929`, with byte hashes and provenance. HEST 2026 README results and ProteinGym v1.3 summary results appear to cover source versions missing from main. Other batches overlap later extractions under different IDs. None is approved or added to production inputs by this recovery. The recovery README records the required source and identity review.

## Validation

- Website: 872 tests in 85 files passed; lint and typecheck passed.
- Service: TypeScript build passed; 306 tests passed against local Auth/Firestore emulators, with no skips.
- Production build passed: all 26,926 routes generated. Export validation passed for 26,126 record pages, generated metadata/local links, 100 historical paper pages, MFASS history, research sidecars and all release checksums.

Original worktrees and ignored research artifacts remain intact. This commit prepares local main; deployment is a separate action.
