# Benchmark computational evaluation review — 2026-09-16

This is a primary-source metadata review, not a numerical reproduction. It covers datasets, input permissions, adaptation, split logic, readouts, comparator scope, overlap controls and uncertainty. No result values or historical result records were changed.

## Inventory and ownership

- 170 public benchmark profile rows are retained in the draft pack.
- 147 unrestricted records received task-specific computational source review and field extraction.
- 23 rows are inventory-only handoffs to root: 20 `catalog-task-*` editorial guides and the three limited source records `reported-task-00e594df6a182d`, `reported-task-53506fe386e4a1`, and `reported-task-9f9ab0090f6522`. Root overrides take precedence over these retained drafts.
- Three excluded records are audit-only, with no public profile: `reported-task-5204df217165df`, `reported-task-65aa2d2bc61446`, `reported-task-ba5246b03a1183`.
- Audit inventory: 173 rows. New source records: 20.

## Completed work and remaining evidence

The 147 owned profiles contain 1281 source-checked facts, 44 explicitly inapplicable fields, 48 source-scoped unreported fields and 244 genuinely pending fields. Every owned profile has a cited conceptual diagram; 72 have an explicit methodological strength. Every summary and fact has source evidence and an explicit fact status. All profiles conservatively retain limited coverage while their per-record gaps remain open; no fully reproduced or completely specified executable protocol is claimed.

Pending fields by heading: Leakage controls: 71, Uncertainty: 62, Organisms: 52, Splits: 21, Baselines: 20, Metrics: 16, Adaptation: 2. These are not silently reclassified as absent. Each open field identifies the task/source boundary; selected suite entries additionally name the next task configuration, archive, supplement or edition needed. Some resource-level dimensions are inapplicable because evaluators accept a user-selected dataset rather than fixing predictor training. A family/suite name is never treated as a unique executable protocol or checkpoint.

Unreported uncertainty is narrowly scoped to checked text-accessible evaluation passages and a recorded artifact-wide search. It does not assert absence from image-only tables or uninspected supplements. The audit records the query and scope. Where variability was found, profiles distinguish fold/seed variation, bootstrap intervals, binomial intervals, paired tests and dispersion of observations; these are not treated as interchangeable uncertainty estimates.

## Provenance and substantive findings

Existing cached paper/XML or pinned README identities are reused where their hashes match. The refreshed CAFA and structure-informed HTML snapshots have separate source records. Websites lacking a release label are pinned as retrieved SHA-256 snapshots rather than given invented release versions. The MFASS README was verified byte-identical to commit `bee9133b83f3aedaf2bbb9013f1875515845607e`. Eleven additional GlycanML configuration/dataset-loader and MassSpecGym evaluator files were fetched at their existing pinned repository commits; their actual bytes, URLs, versions and retrieval dates are recorded. Local `/tmp` paths for these inspected code artifacts are working-session locations; immutable URLs and hashes are the durable provenance.

- ProteinGym aggregation belongs under Metrics, not leakage controls. Protein-level and functional-category aggregation, heterogeneous input modalities and zero-shot/supervised regimes are separated.
- GlycanML child tasks have distinct classification and regression metrics. The protein–glycan interaction configuration is regression (MAE/RMSE/Spearman), while taxonomy/glycosylation-type and immunogenicity use their own metrics. CSV-prescribed splits are distinguished from proof of independent split construction.
- MassSpecGym de novo molecular match/structural similarity, candidate-retrieval hit rates and spectrum-similarity measures are separate. Optional formula inputs and configured transforms/cutoffs affect comparability.
- MFASS v1 remains superseded. Its correction is not rewritten as a v2 result, and exon/gene grouping and group-resampling uncertainty are described separately from input-context/adaptation differences.
- Metagenomic-pathogens §4.3 and Table 3 do describe a MetaHIT/iHMP sequencing experiment. Its genomic sample/split manifest and reference-label construction remain insufficiently specified. §4.2 five-fold validation belongs to other datasets and is not imported into this record. Printed scores remain unchanged.
- DNALongBench enhancer-target evaluation is not assigned the nearby eQTL or chromatin-task split. BiRNA long-sequence species classification is not assigned structure-task deduplication. scRegNet target separation within each TF does not imply unseen-TF or globally disjoint-gene testing.
- Temporal cutoffs, exact complex exclusion, species holdouts, donor grouping, family holdouts and random sample partitions are described as different controls. None alone establishes absence from every comparator’s pretraining data.

## Verification

The 170 profile rows pass the repository profile schema and source-reference validation when existing catalogue/evidence sources and this pack’s sources are loaded. All reviewed artifact records have a URL, version, retrieval timestamp and SHA-256; every cached-text hash was recomputed against the inspected file. Public IDs are unique and the three excluded IDs have no authored public profile. No source input, shared code, numerical record, release artifact or commit was modified by this worker.

Files: `workbench/evidence-completion/benchmarks/profiles.jsonl`, `sources.jsonl`, and `audit.jsonl`. The audit is the per-record account of actual reviewed sources, locators, field checks, scoped negative searches, remaining gaps and root-owned handoffs.
