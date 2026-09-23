# Model evaluation coverage, 23 September 2026

Release: `2026-09-23-2b89723c6dd9`. The earlier `2026-09-23-ce6577e737b6` archive is preserved; this follow-up adds explicit suite/protocol metadata and retains unknown evaluation provenance. Audited all **59 existing model records**, including historical aliases and checkpoint-specific records, using the same reviewed relationship graph as the website and API.

| Coverage | Before | After |
|---|---:|---:|
| Linked model/configuration results | 8 | 52 |
| Evaluated downstream pipelines only | 3 | 6 |
| No exact results; broader family identified | 0 | 1 |
| No linked evaluation or identified alternative | 48 | 0 |

The remaining exact-checkpoint gap is `catalog-model-proteinmpnn` (v_48_020). The original repository has vanilla, soluble and CA-only weights with overlapping filenames. Available papers do not establish the precise checkpoint identity. Its page links to the broader ProteinMPNN family’s 18 metric rows and explains the limit; those scores are not assigned to this checkpoint.

Pipeline-only pages are METAGENE-1, MIMIC, mRNA-FM, scFoundation, GlycanGT and STATE. Evaluated pipelines are visible immediately beside results, with direct links and counts. Their fitting, extra inputs and protocol context remain distinct from the underlying model. These are literature evaluations; this work runs no new models.

## Added evidence

150 reviewed identity relationships connect existing configurations, verified aliases and downstream pipelines. A separate table extraction adds **1,620 numerical rows** from 13 complete or explicitly bounded source comparisons, including weak baselines and negative findings. All rows retain precise evidence locations and primary artifact hashes.

| Source comparison | Numerical rows |
|---|---:|
| dreams-mist-retrieval | 45 |
| mrnabench-variants-2025 | 400 |
| metagene-gene-mteb | 80 |
| genie3-2026-table3 | 65 |
| esmfold2-2026-runs-n-poses | 11 |
| segmentnt-supplement-2025 | 588 |
| rhofold-2024-casp15-natural | 112 |
| mimic-2026-mrnabench | 84 |
| msalign-2026-table3 | 108 |
| glycangt-2026-table-s4 | 103 |
| enformer-cage-2021 | 2 |
| gears-2023-supp-table6 | 8 |
| scfoundation-2024-supp-table4 | 14 |

The figures count reported metric rows, not independent experiments. Source checking means automated transcription/source review, not human review or independent scientific reproduction. Every primary table is retained as a compressed original artifact with review receipts in `data/omics/reviewed/model-coverage-tables-2026-09-23/`.

## Evidence boundaries

- mRNABench: retain 100 localization cells in the raw evidence but exclude them from published numerical records because the appendix and main table conflict on metric identity. Keep variant tables and existing family-summary rows in one experiment set; they are not independent repetitions. Preserve confidence-interval half-widths and unresolved split/seed descriptions.
- MIMIC: 77 comparison rows explicitly quote prior work; only seven are author-reported MIMIC evaluations. The origin fields preserve this distinction.
- DreaMS: comparator execution origin is unreported where the paper does not establish it. Missing cells stay missing.
- RhoFold: eight unavailable cells do not become zeros. Quoted CASP15 results remain separate from retrospective RhoFold/AlphaFold3 evaluations.
- ESMFold2: extract only exact printed bars. The 2,573 scored items are ligands; do not label them as protein systems or invent eligible counts.
- MSAlign: preserve dataset/split and formula availability. Formula-aware methods may use different candidate pools; MSAlign+Filter reduces its pool, which is not established for every comparator.
- GlycanGT and frozen embedding probes remain evaluated pipelines with their own trained heads. Size-specific ESM-2/NT records do not inherit other checkpoint sizes.
- Source-checked relationships and scores do not upgrade unrelated model metadata or incomplete protocol details.

## Audit files and verification

- [Model-page audit](model-pages.csv): all 59 model IDs, coverage, results, source IDs and related pipelines/families.
- [All predictive entity audit](all-model-entities.csv): also records configurations, methods, pipelines and services; these have separate scope and may retain explicit gaps.
- [Summary and catalogue checksum](summary.json).
- [Independent integration review](independent-integration-review.md): graph validity, historical preservation and 18 negative review-gate tests.
- [Initial source-table review](initial-tables-review.md) and [MIMIC/MSAlign review](mimic-msalign-review.md).
- [Immutable archive verification](archive-verification.json): all 407 release exports checked against their SHA-256 manifest before deterministic compression.

The existing result IDs, printed/numeric values, uncertainty, units and evidence links are unchanged. Existing mRNABench results gain only an explicit experiment-overlap annotation. Previous compressed release archives remain untouched. Alias navigation shares evidence only where same-entity identity is reviewed; variants and sibling checkpoints cannot inherit one another’s results.

## Reproduction and publication

```sh
npx tsx scripts/omics/release.ts --current-only
npx tsx scripts/omics/audit-model-evaluations.ts public/omics/catalogue.json workbench/model-coverage-audit
npm test
npm run lint
npm run typecheck
```

The current-only generator validates the new release against both the extraction schema and the live API contract. Full historical export/build remains a CI acceptance step. The local preview runs at `http://localhost:3016/`. Publication requires the correction PR checks; no checks are bypassed.

## Validation receipt

- Full local suite: 594 tests passed. Lint, TypeScript checks and API compilation passed.
- Full 26,045-record API snapshot validation passed. Missing or invented origins remain rejected; explicit `unreported` preserves uncertainty.
- Seven new comparison parents now have explicit suite/protocol classifications. Enformer CAGE and GEARS CPA controls are protocols, with their previous benchmark routes retained. [Independent follow-up review](api-validator-review.md).
- Desktop 1,440 px and mobile 390 px browser checks passed for six representative model/benchmark routes, with no runtime errors or horizontal overflow.
- All 407 new export hashes are checked before deterministic archival; the independent sealed-loader review passed all 18 rejection cases.
- The preceding CI attempt completed the production build and export checks, then caught the API mismatch. The corrected release requires a fresh passing CI run before merge. Disk-safe historical export handling from #50 is retained.

Original review receipts retain the revisions they checked. Metadata corrections do not change result values, source artifacts, model identity links or coverage counts. The earlier archive remains available for inspection.
