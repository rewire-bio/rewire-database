# DNA/RNA model evaluation coverage audit — 2026-09-23

Read-only audit of 86 candidate family/configuration/pipeline records in catalogue release `2026-09-23-6c5e8b6b153f` (22,074 records; JSON SHA-256 `4c7b43739c508b654a4f906ebb89e45d309060375821137a11a43597989f6572`). Outputs are proposals and exact primary-source extractions. Parent owns integration and release validation. No tracked files, submissions or scores were changed by this worker.

## Identity and existing-result coverage

`candidate-inventory.json` records each candidate's direct evaluation/result counts and existing/proposed links. `proposed-edges.json` contains 64 sourced edges over 59 subjects. `confirmed-family-aliases.json` adds four narrowly justified family aliases: DNABERT2, RNAFM, SpliceAI and Pangolin catalogue/discovery duplicates. Configuration checkpoints remain separate.

- DNABERT2, Evo2, Nucleotide Transformer, RNAFM, ChromBPNet, SpliceAI and Pangolin have existing evaluated configurations. Proposed family edges expose these without copying scores. Composite methods use `uses` (normalize to `uses_model`), not family inheritance.
- Catalogue NTv2 is the 50M configuration: only exact 50M evaluated variants attach there; 500M configurations attach to the broader NT family. The catalogue Evo2 7B variant receives only explicit 7B/7B-base configurations, not 1B.
- Existing pinned MFASS SpliceAI and Pangolin runner configurations were inspected for identity and linked to their families.
- ProkBERT already has six evaluated configurations/pipelines: three explicit mini/mini-c/mini-long family configurations plus three LAMBDA composite pipelines. This is a linkage gap, not a missing-score gap.
- VCC `RNAFM-GEARS` remains unlinked: a submission name alone does not establish its underlying component identity. Original DNABERT and DNABERT-S are not inferred to be DNABERT2. AlphaGenome's “ChromBPNet-matched subset” is not a ChromBPNet model.

## New complete, bounded source comparisons

| Extraction | Source cells | Eligible numeric cells | Scope |
|---|---:|---:|---|
| mRNABench Tables 5 and 6 | 500 | 400 | 50 methods × 10 tasks; 100 localization cells quarantined |
| SegmentNT Supplementary Tables 2 and 3 | 588 | 588 | 21 methods × 14 elements × 2 metrics |
| RhoFold Figure 2h source sheet `fig2hi` | 120 | 112 | 10 methods × 6 natural CASP15 targets × 2 metrics; 8 N/A preserved |
| Enformer Figure 1b-left narrative | 2 | 2 | Complete two-model mean across-experiment gene-expression Pearson comparison |
| Total | 1,210 | 1,102 | Separate comparisons; no pooling across papers, datasets or metrics |

### mRNABench

`mrnabench-tables-5-6-results.json` is authoritative, including per-cell eligibility. `mrnabench-protocol.json`, `mrnabench-model-associations.json`, `mrnabench-existing-table2-lineage.json`, and `mrnabench-selected-family-candidates.json` retain context.

Primary XML https://www.ebi.ac.uk/europepmc/webservices/rest/PMC12265608/fullTextXML, DOI `10.1101/2025.07.05.662870`, version dated 2025-07-08, SHA-256 `79f6264ee883535203c63a313547e7c57baa85585f76b42f8d899eb17fb7e600`. XML T2 is printed Table 5; T3 is Table 6. All 500 source cells and printed 95% confidence half-widths retained.

Frozen averaged transcript embeddings feed RidgeCV or logistic-regression probes; multilabel tasks use micro-averaged metrics. Default homology grouping and task exceptions are documented. The source says ten splits but explicitly lists nine seeds: do not repair the discrepancy silently. Localization SR/LR means short-read/long-read, not short-range/long-range. Table 5 labels localization Pearson R while Table 2 labels AUPRC(%): all 100 appendix localization cells are quarantined, not relabelled. Appendix AUPRC fractions and headline percent values must remain separate.

Existing Table 2 results select the best overall family variant; the 212 lineage entries belong to the same experiment set as the appendix. NT/Evo2 family-to-configuration matches from score vectors are inference, not explicit source checkpoint identities. New configurations are not independent replications of the family-level headline results.

### SegmentNT

Ready integration input: `segmentnt-coverage-spec.json`. Exact cells: `segmentnt-tables-2-3-results.json`; extracted lines: `segmentnt-tables-2-3-raw.json`; methods: `segmentnt-protocol.json`. Deterministic artifacts: `segmentnt-supplement.pdf.gz`, `segmentnt-primary.xml.gz`; raw hashes in `segmentnt-artifact-manifest.json`.

Primary DOI `10.1038/s41592-025-02881-2`; supplementary PDF SHA-256 `c4ad23a62ab161a464fe789e5dd167cf2bfe9f43a91a9c3fb1261b99a5594b0f`. Tables 2/3 are physical PDF pages 4/5 (printed pages 3/4); both complete pages were visually inspected. Exact signed zeros and reported standard deviations preserved. SD describes ten test-set samplings, not confidence intervals or ten training seeds. Test chromosomes 20/21; validation 22; homologous test genes excluded but homologous distal regulatory elements not removed. Best checkpoint by validation mean MCC across 14 elements.

Seven named pretrained SegmentNT variants link to SegmentNT and use the broad NT family. Random-init ablations do not inherit pretrained scores. BPNet/SpliceAI architecture rows were newly trained from random initialization; they do not represent original pretrained checkpoints. SegmentEnformer and SegmentBorzoi remain distinct configurations. Builder plus record-schema validation produced 1,268 base records / 588 results.

### RhoFold+

Ready input: `rhofold/coverage-spec.json`; `rhofold/source-cells.json`, `rhofold/REPORT.md`, `rhofold/artifact-manifest.json` and reproducible extraction script provide all receipts. Complete source range `fig2hi!A1:M11` has 143 raw cells and 120 method/target/metric entries. XLSX SHA-256 `9d87837d6e72c8dafd265b9427c1cddd0223b3073eea26bcb4c6a90085a1bb04`; original DOI `10.1038/s41592-024-02487-0`.

Retrospective evaluation on six natural CASP15 targets; highest-performing of five candidate predictions. RMSD lower is better; cumulative GDT-TS/TM-score Z higher is better. No intervals or exact atom-selection/checkpoint version invented. RhoFold+ alone links to `catalog-model-rhofold`; preliminary Alchemy_RNA (RhoFold) and Alchemy_RNA2 remain separate. Source compilation and independent-paper comparator origins are preserved. Parent should use neutral result descriptions rather than blanket “author-reported” prose for those comparator origins. Focused builder/schema validation passed, 265 base records / 112 results.

### Basenji2

Ready input: `basenji-enformer-coverage-spec.json`; exact paragraphs and cells in `basenji-enformer-source-cells.json`; `enformer-primary.xml.gz`, `basenji-artifact-manifest.json`. DOI `10.1038/s41592-021-01252-x`, XML PMC8490152 SHA-256 `354632b465ccce978c56e049a314134cb74ad78a5301c8c8bf3127aa06d6c3b0`.

Par7 explicitly reports mean correlation 0.81 for Basenji2 and 0.85 for Enformer. Figure 1b-left caption and Methods Par32–36 define mean across CAGE experiments of Pearson correlation across held-out human protein-coding genes, using log(1+x) expression. Par35 explicitly uses pretrained Basenji2 for this main comparison. This is distinct from the Spearman ExPecto comparison later in Par7. Figure 1b's shared bootstrap SD 0.004 statement is retained as context, not converted into a model-specific confidence interval. Experimental replicate accuracy 0.94 is not a third model score.

The source identifies Basenji1/Basenji2 versions and the existing catalogue record is an explicit configurable family. Basenji2 therefore links as a family configuration, without claiming it is the original Basenji1 checkpoint. Enformer remains its own configuration. Builder/schema validation passed, 10 base records / 2 results.

Earlier bounded Basenji searches are retained for audit: cross-species 2020 XML, official repository tree, personal-expression 2023 XML and pinned repository tree/notebook. Raw prediction CSVs and plot outputs were not converted into new scores. The 2018 supplementary PDF publisher request returned 403. None of these limitations affect the exact accepted 2021 two-model comparison.

## Validation limits

This work verifies primary-source identities and printed numerical cells, not model correctness, independent reproducibility or exhaustive benchmark-suite coverage. Source retrieval manifests retain timestamps and hashes. Some newly retrieved publisher XML snapshots differ from older catalogue hashes; those must be new pinned snapshots, never asserted to match old bytes. No missing values, N/A cells or conflicts were turned into zero. No source-string family matching or graph digitization was used.

All owned artifacts are released for parent review/adoption. No browser, model-training or server process was started during this task.
