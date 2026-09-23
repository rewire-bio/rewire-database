# Readable results and priority profile evidence

Date: 2026-09-23. Release: `2026-09-23-cda1ab0e8294`.

This batch makes reported results easier to read and reviews selected metadata for DNABERT-2, ESM-2, RNA-FM, scGPT, Boltz, ProteinGym and MFASS. It is a bounded automated source review, not human scientific review or independent reproduction.

## Results interface

Exact printed scores stay on one line, including long decimals, negative values and scientific notation. The chart and table contain their own overflow and support keyboard scrolling. The page itself does not overflow at the tested 320, 390 and 1440px widths. Chart and table retain the same numeric high-to-low ordering requested by the user; metric direction remains visible.

Metric, protocol, dataset, source and evidence origin remain prominent. Repeated generic guidance, methodological context and plot interpretation sit in an expandable section. Source-specific caveats remain visible. Missing-value commentary appears only when a value is actually missing; missing values are never plotted as zero.

## Evidence review

- 18 existing profiles receive 69 selected fact decisions and 21 additional pinned source records.
- All 11,291 existing result rows are unchanged. Every existing record is unchanged outside those 18 descriptive profiles.
- 48 reviewed decisions have source-checked status; 21 retain a bounded unknown. These are decisions, not 48 newly filled gaps.
- Exact reference checkpoints are distinguished from the configurations used in individual evaluations. Registry-provided weight hashes are not described as local weight verification.
- Source data releases, workflow defaults and training cutoffs are distinct. The scGPT corpus replacement remains an author-presumed substitute, not established identity.
- ProteinGym bootstrap uncertainty describes differences from a reference model, not absolute per-model intervals. Its 217-assay reference inventory does not imply every model was scored on the full suite.
- MFASS split, paired coverage, assay orientation and grouped uncertainty are pinned to the corrected revision. Legacy manifest labels and superseded v1 history remain intact.

See the [fact decision table](../../../data/omics/reviewed/profile-evidence-2026-09-23/audit.csv), [independent review](../../../data/omics/reviewed/profile-evidence-2026-09-23/independent-review.md), [integration review](../../../data/omics/reviewed/profile-evidence-2026-09-23/integration-review.md) and [hashed review manifest](../../../data/omics/reviewed/profile-evidence-2026-09-23/review.json). Each decision retains source IDs, original URLs and evidence locations; original retrieved bytes are compressed alongside the manifest.

## Catalogue-wide gap inventory

The before/after directories contain all profile facts and the release's declared record gaps as compressed CSV, with JSON counts. This is an automated inventory of existing states, not a source-verification pass over every record. An absent result field without an existing declaration is marked unextracted; it is not taken as evidence that a paper omitted it.

The release contains 690 profiles and 4,840 profile facts: 3,846 source-checked, 47 unextracted, 701 unreported and 246 inapplicable. The record-gap inventory contains 80,240 field entries, not 80,240 distinct models, experiments or errors. Repeated missingness across linked records remains visible; these counts must not be advertised as independent scientific failures.

Outstanding work in issue #31 includes named human scientific review, unresolved exact checkpoints/weight terms, per-result coverage and uncertainty extraction, and the wider metadata programme. The two new protocol fact proposals without an existing profile are not silently published in this batch. No new run, training, reproduction claim or public contribution was created.

## Integrity and rollback

[Integrity verification](integrity-verification.json) compares every record against release `2026-09-23-2b89723c6dd9` and checks every new source's decompressed SHA-256. [Archive verification](archive-verification.json) checks every new release export before and after deterministic compression. Earlier release archives are unchanged.

Rollback restores the prior Git revision/Hosting release and activates catalogue `2026-09-23-2b89723c6dd9`. Previous Hosting version: `c826d7f70972ce04`. Catalogue publication does not change contribution activation or publish private submissions.

## Validation

The UI's local browser receipt covers 263 checks at 320, 390 and 1440px, with zero errors. It uses real BEELINE, ATOM3D and Virtual Cell Challenge rows and separately labelled layout-only negative/scientific/N/A stress cases. The receipt records the baseline catalogue used before the metadata release. All 613 unit/rendering tests, lint and type checking pass locally. The release generator validates the full API snapshot. Production build, integration and post-deployment results are recorded in the pull request and deployment workflow.
