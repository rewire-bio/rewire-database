# AgroNT evaluation collection gap

The existing Agro Nucleotide Transformer family profile had no imported evaluations. This batch adds all 24 scores in the authors’ complete Figure 3e/3f tables: 12 AgroNT results and 12 task-specific CNN baselines.

Release: `2026-09-23-6c5e8b6b153f`, 22,074 public records. The 100 additions include four AgroNT configurations, four CNN configurations, 12 protocols and 12 dataset subsets. Verified family claims make the 12 AgroNT rows visible on the existing model URL. Protocol claims link all 24 rows and 12 comparison panels to Plant Genomic Benchmark. Existing records and all prior releases remain unchanged.

## Scientific scope

Comparisons remain separate by promoter/terminator task, maize/tobacco assay system and sequence species or randomized GC class. Values, ties and the condition where CNN scores higher are preserved. Exact fine-tuned checkpoints, uncertainty and scored denominators remain unknown. No new benchmark execution, pooled score, generic Nucleotide Transformer association or reproduction claim is introduced.

Figure 4b is excluded pending review of repeated rice-strain scores. Other AgroNT tasks still require separate collection; this is not full suite coverage.

## Validation

- Independent automated review re-fetched both pinned TSVs and checked all 24 cells and 100 generated records. See the adjacent cell checklists and review.
- 570 tests across 61 files passed, including five new tests for source transcription, family roll-up, comparison boundaries, CNN adaptation and preservation of prior records.
- Type checking and lint passed.
- Current-only release generation passed. All 407 generated export hashes were verified before deterministic gzip archival.
- Native browser checks on model and benchmark pages passed at 1440px and 390px, with correct result links, no page overflow and no runtime exceptions. Local screenshots and browser receipts are in ignored `workbench/agront-browser/`.
- Full production build and public deployment are pending. GitHub Actions currently rejects jobs before runner startup because of the account billing/spending restriction. Local disk cannot accommodate expanding all historical release exports for the full build; this limitation is not a passed build check.

## Review URLs

- http://localhost:3016/database/model/discovery-model-agro-nucleotide-transformer/
- http://localhost:3016/database/benchmark/agront-2024-plant-genomic-benchmark/

The branch is stacked on the display-cleanup PR49. Publication must wait for the required production build and checks. Rolling back publication selects the previous immutable release; do not delete or rewrite historical records.
