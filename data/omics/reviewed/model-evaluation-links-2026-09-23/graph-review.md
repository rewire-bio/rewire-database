# Independent graph / implementation review

Reviewed current worktree read-only on 2026-09-23. No blocking alias/result-rollup defect found in the implemented change. Final release acceptance remains pending the parent’s active integration: the release loader wiring and sealed root review receipts were not yet present at this checkpoint, and the generated records file lagged the latest specs.

## Verified behavior

- `services/omics/src/catalogue-query.ts:341`: result sharing follows only evidenced alias edges of matching model-subject kinds. The alias component unions result IDs, deduplicates them and sorts them. Family/variant/uses_model edges are absent from the reverse union. Exact tested entity metadata and result filters remain attached to the original evaluation.
- An expanded independent fixture passes canonical direct rows, alias-side child rows, upper-family rollup, sibling variants with their own different scores, pipeline results, and tested-entity filtering. See `alias-boundary.ts`. No sibling or pipeline result smearing observed.
- New checked-in alias tests pass: 3/3. Existing evaluation-group, evidence-release and query-budget tests pass: 18/18.
- Current direct build/apply projection: 25,967 unique records, no duplicate IDs, no dangling source/link targets, and 1,598 new numerical rows. All seven verified alias pairs return equal totals. See `projection.json`. This is a projection, not a sealed release result.
- New table specs contain no pipeline/service→family links. GlycanGT, embedding heads and other downstream evaluations remain separated through uses_model.
- `scripts/omics/model-evaluation-links.ts:25`: endpoint validation, model-only aliases, pipeline/service family prohibition, existing-source validation, duplicate claim/edge protection, alias-cycle rejection and additive source IDs are present. Existing input records are copied when patched; original numerical attributes are preserved.
- `scripts/omics/model-coverage-tables.ts:47`: origin/adaptation/overlap metadata are explicit. New evaluations always set suite_complete=false and published_score_reproduction=false. Metric grouping uses method plus dataset, not a score aggregate. Source-level printed values, units and uncertainty remain individual result attributes.
- `scripts/omics/model-coverage-tables.ts:73`: generated records must match their receipt and regenerate byte-for-byte; listed inputs and decompressed original source artifacts are hash checked. Existing record ID collisions are rejected. The mRNABench overlap annotations use copied record attributes and do not change source numbers.
- No historical `public/omics/releases/` or `data/omics/releases/` files were modified at review time. New modules only write when explicitly called by separate generation; importing their input manifests performs read-only directory enumeration.

## Minor UI issue

`app/database/[kind]/[id]/page.tsx:320` calls every evaluated uses_model subject a “pipeline”. Existing/new subjects include `configuration` records (ESM embedding methods, scGPT heads, STATE configurations) and the MSAlign `model` record. The underlying separation is correct, but the label and new section title overstate the entity kind. Suggested wording: “evaluated downstream configurations” and “Related configurations, pipelines and services”. Parent notified.

Moving this section directly below results improves discoverability. The results remain explicitly distinct from those of the underlying model.

## Pending final integration checks

At this checkpoint neither `scripts/omics/release.ts` nor `scripts/omics/inputs.ts` called the new gated loaders. Root `review.json` receipts were absent. The generated table JSONL still contained 1,493 results whereas the latest source specs built 1,598; this reflects active integration and is not accepted as a release artifact.

Before acceptance, verify the final sealed gate passes and is used by only the current release path; confirm both dynamic input lists enter the new manifest. Recheck original release byte comparisons using the existing immutable-release checks. Recommended negative tests: altered table specs/JSONL/source bytes fail; missing or mismatched identity receipts fail; non-model/pipeline family edges fail. No tracked files were changed by this review.
