# Recovered benchmark audit candidates

Recovered 29 September 2026 from the uncommitted `codex/benchmark-page-audit` migration worktree. These are archived candidate evidence, **not approved production records**. Their original location was named `reviewed`; this recovery does not endorse that status. File bytes, IDs and original review notes are preserved with SHA-256 receipts in `provenance.json`.

## Disposition

- ProteinGym v1.3: 97 overall Spearman result rows appear absent from current main, which contains the earlier paper table. Keep the version, assay set and aggregation scope distinct.
- HEST: 260 cells from 26 methods and 10 columns of a pinned 2026 README revision appear absent from current main, which contains a 2024 paper extraction. Do not combine these into a single protocol or replace historical values.
- BEND, GUE, Genomic Benchmarks and PerturBench: the numeric value multisets agree with later extractions already on main. Different IDs do not establish distinct evidence. BEND also includes seven null entries. These batches need cell-level reconciliation before any promotion to avoid duplicate results.
- Association and overlay files are preserved for provenance and later review. They are not applied to the production catalogue.

The original clone and a separate disk-recovery backup remain intact. Superseded UI edits remain there; current main already provides inherited charts, result filtering and coverage functionality.

## Publication boundary

`release.ts` and `inputs.ts` read explicit approved input paths. They do not discover files in this pending-review directory, and this directory is outside `public/`. None of these records or overlays is included in releases, static pages or API imports by this recovery.

Before promotion, independently verify source artifacts and hashes, map exact table cells and protocols, reconcile existing record identities, review overlays against current records, and create a new immutable release with tests. Never rewrite prior releases or automatically mark these records reviewed.
