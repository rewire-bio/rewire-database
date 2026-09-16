# Reported-task final field review — range 8–f

Reviewed 2026-09-16. Scope: the 41 `reported-task-*` entries beginning with hexadecimal 8–f that had unfinished facts in `benchmarks/profiles.jsonl`. Root-owned `reported-task-9f9ab0090f6522` is excluded. This pack contains full-profile overrides for those 41 entries only.

## Completion and remaining gaps

- 41/41 assigned records reviewed; 0 assigned records remain pending.
- 60 previously `unextracted` facts inspected: 17 now contain checked evidence, 42 record omissions scoped to the inspected publication sections, and 1 is inapplicable to a reference-classifier evaluation.
- 13 additional fact edits replace obsolete extraction wording or supply details found during this pass; 73 field reviews are recorded in the audit.
- Across the resulting 451 facts: 387 `source_checked`, 63 `unreported`, 1 `inapplicable`, 0 `unextracted`, 0 `unavailable`.
- Three new pinned supplement sources: mRNABERT, BiRNA-BERT and PST. Their PDF hashes, archive member names, archive hashes and retrieval timestamps are recorded in `sources.jsonl`.

Remaining `unreported` fields are publication-reporting gaps, not a claim that the information is absent from every possible upstream dataset. Per-structure taxonomy inventories are not reconstructed from unrelated organism examples; per-task pretraining overlap is not inferred from a model’s training corpus name.

| Field | Remaining scoped reporting gaps |
|---|---:|
| Adaptation | 2 |
| Leakage controls | 15 |
| Organisms | 21 |
| Splits | 4 |
| Uncertainty | 21 |

## Material findings

- ESM2-OFS explicitly removes sequences above 50% identity to ProteinGym reference sequences from approximation-model training. This does not certify independence of the pretrained ESM-2 encoder.
- NMDN training removes test PDB entries and reports benchmark-overlap removal from the weak-binder collection. LIT-PCBA is an external target-wise screening test, separate from the PDBbind temporal docking test.
- SPIN Table 2 supplies 80/10/10 training/validation/testing proportions. ICCTax Figure 2 supplies within-phylum ID sampling and genus-disjoint OOD partitions. These details were absent from earlier paragraph-focused extraction.
- The scATAC transfer protocol explicitly includes target cells during graph adaptation, while its classification loss is on labelled source cells. The profile now states that access regime.
- The mRNABERT supplement separates PERSIST-seq traits from human/mouse TE-atlas experiments but does not supply an atlas split, overlap exclusion or uncertainty method. The BiRNA-BERT supplement does not add species-classification adaptation or uncertainty details.
- The MetaHIT/iHMP experiment is present in §4.3 and Table 3. Its genomic fitting and uncertainty procedures are not supplied by the unrelated five-fold setup in §4.2; no claim is made that sequencing evaluation is absent.

## Review and validation

The audit lists the actual inspected paper artifacts, hashes, individual field locators and remaining reporting gaps. Relevant XML lists and figure captions were checked in addition to paragraph caches. Cited conceptual diagrams were retained and stale extraction wording was removed where new field evidence superseded it. Scientific summaries stay at computational-evaluation level.

All 41 profiles pass the shared profile schema and source-reference validation. All 41 retain sourced conceptual diagrams and summary evidence. Original scientific result records and numerical values were not modified; this pack only contains profile/source/audit metadata. No shared pack, release, application code or other agent output was edited.
