# Reported-task metadata completion, partition A

Reviewed 16 September 2026 using automated source review, not human review or new benchmark execution.

This override pack covers all 32 assigned `reported-task-*` profiles whose first suffix character is 0–7 and which had outstanding facts. The two separately owned IDs `reported-task-00e594df6a182d` and `reported-task-53506fe386e4a1` are excluded. No result record, source value or numerical evaluation row was edited.

Files are in `workbench/evidence-completion/reported-tasks-final-a/`:

- `profiles.jsonl`: 32 full profile overrides, including 63 corrected or completed facts.
- `sources.jsonl`: 26 newly inspected, hashed primary-source artifacts; supplementary archive members are named explicitly.
- `audit.jsonl`: original and corrected facts, source checks and remaining source limitations for each assigned ID.
- `model-corrections.jsonl`: two separately requested exact-configuration parameter corrections from Cell2Sentence Table 5.
- `fetch-receipts.json`, `extra-receipts.json`, `geo-receipts.json`, `clathrin-receipts.json`: retrieval outcomes and local artifact hashes, including unused exploratory retrievals.
- `notes.py` and `build.py`: hand-authored findings and deterministic pack construction.
- `validation.json`: profile-schema and source-reference validation for all 34 override rows.

The resulting 32 task profiles contain 321 source-checked fact fields and 31 source-scoped unreported fields. There are no fields marked unextracted or unavailable. These are field counts, not a claim that every underlying dataset record has been recatalogued. Several facts explicitly contain partial information where the source supplies a known context but not a complete census or estimator.

## Material completions and interpretation

DeepInterAware’s supplement establishes distinct antigen, antibody and joint holdouts, its homology filter, and five independently seeded splits. ENBED’s supplement supplies enhancer training/test counts; its mutation-generation homology controls do not transfer to enhancer classification. Hi-Enhancer’s supplement distinguishes the signal detector from the sequence boundary stage and reports an unusual CD-HIT threshold; the pack does not endorse that threshold as a reproducible leakage guarantee.

PlantCAD2 conservation is separated into Andropogoneae, Poaceae and Solanaceae contexts, with the explicitly stated Solanaceae pretraining exclusion scoped to PlantCAD2. Its spreadsheet gives point AUROCs, not uncertainty intervals. The original mRNA-LM supplement confirms that the half-life task inherits the Saluki ten-fold split; random folds apply to its other tasks. MRL-MPRA uses random splits for the standard task and a distinct compositional holdout, not the homology scheme used elsewhere in mRNABench.

CAMMiQ’s strain queries originate in its indexed reference collection. Lemur/Magnet evaluates known-composition samples with explicit reference availability. Neither is relabelled an unseen-species test. scXDR’s nine distinct GEO accessions were retrieved and all identify Homo sapiens; the twelve dataset entries include repeated patient/drug subsets. RNAret’s human interaction-data provenance was followed to the original miTAR paper.

Missing uncertainty is recorded precisely. In particular, printed ± values are not silently converted into a confidence interval, model confidence outputs are not benchmark uncertainty, and another paper’s repeated-run estimates are not assigned to the present evaluation. Organism omissions remain explicit for pooled RNA/structural collections without a taxonomic census. The clathrin repository’s three CSVs and README were checked; they do not supply organism columns, and one file uses synthetic identifiers.

Cell2Sentence Table 5 identifies 46,107,089 parameters for the evaluated Geneformer checkpoint and 774,030,080 for its C2S GPT-2 Large checkpoint. The separate corrections apply only to the two existing paper-specific model IDs. They do not change family metadata or infer checkpoint hashes.

## Validation and limits

All 32 task and two model profile overrides pass the shared profile schema and source-reference validation. All 26 new source artifacts were SHA-256 checked against their retrieval receipts during construction. Original primary-paper artifacts were read from the existing immutable cache. Excluded IDs are absent. Numerical result rows and shared implementation files were not modified.

Unreported fields are bounded to the inspected source: examples include the organism distribution of selected structure sets, the estimator behind a printed ± term, or an absent independent-reference exclusion. They do not claim that the information can never be recovered from additional records or author correspondence. No model training, inference, publication, commit or push was performed by this worker.
