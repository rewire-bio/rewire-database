# Independent AgroNT ingestion review

2026-09-23. Read-only product/data review. Final generated-record review complete: APPROVED for the bounded 24-cell ingestion, subject to the parent’s normal integration tests. No publication action performed.

## Source cells: PASS (24/24)

Independently re-downloaded both immutable Figure 3e/3f source tables using their revision-pinned URLs. Downloaded bytes match local source bytes and SHA256 receipts. All 24 rows match the normalized receipt in exact printed and numeric strings, species/sequence class, assay label, method, source row text and 1-based source/data row locators. Both tables retain all 12 source rows, including all 12 task-specific CNN baseline scores. Machine checklist: `source-cell-checks.json`.

Notable comparisons preserved: terminator maize Z. mays AgroNT0.65 vs CNN0.67; terminator tobacco A.thaliana0.77 tie and Z.mays0.76 tie. Thus the evidence does not support an across-the-board win claim.

## Scientific boundaries: source review PASS

Read publisher XML Sec16, Sec21 and Fig3 directly. They support 170bp inputs, source-study train/test sets, maize-protoplast vs tobacco-leaf assay systems distinct from sequence species, and GC as randomized sequences of varying GC content. The primary methods support coefficient of determination R²; higher is better. Sec16 IA3 fine-tuning applies to AgroNT, not to the CNN baselines. Official identity docs identify the separate AgroNT/1B_agro_nt model, not generic Nucleotide Transformer. No provenance pins for the 2024 fitted checkpoints or uncertainty are supplied by these figure tables.

One caution sent to implementation owner: the normalized research receipt applies an IA3 adaptation string to every row, including CNN rows. Generated baseline configuration records must use task-specific CNN adaptation wording instead. Raw extracted score fields are unaffected.

## Generated records: PASS

Independently validated all 100 unique generated IDs: 24 results, 24 evaluations, 12 protocols, 12 dataset subsets, 8 configurations, 16 claims, 3 sources and 1 benchmark. Every internal link resolves; the only external endpoint is the existing, independently classified AgroNT model-family ID. No generic Nucleotide Transformer linkage exists.

For every generated result, matched its exact printed/numeric strings and source locator against the reviewed primary-source row, followed its evaluation/configuration/protocol/dataset associations, and verified the task, assay and sequence class. All twelve panels contain exactly two source rows: AgroNT and the appropriate task-specific CNN. No cross-task or assay pooling occurs. All results retain R²/higher direction and null uncertainty. Evaluation metadata explicitly marks non-reproduction and incomplete suite coverage. GC is named randomized GC sequences.

Four AgroNT configurations cover two tasks × two assay systems, with four sourced family claims. Four CNN configurations remain separate, task-specific, and have no AgroNT family edge. IA3 adaptation appears only on AgroNT evaluations; the earlier research-receipt caution has been corrected in tracked rows.json. Exact checkpoints, seeds and counts remain unknown rather than inferred. Dataset descriptions preserve the original-study split statement but do not claim extracted manifests.

The compressed publisher XML decompresses to the independently checked original snapshot hash. The module’s deterministic builder and review-receipt loader both return 100 records successfully. Machine generated-cell checklist: `generated-cell-checks.json`.

No blocking numerical, association, baseline-completeness or claim issue found. Parent integration validation should verify family roll-up yields 12 AgroNT results and each protocol comparison yields exactly 2 rows; it should not expect suite-wide pooled scores. Source review approves this narrow Figure 3e/3f batch only; excluded Figure 4 data and other tasks remain unreviewed for ingestion.
