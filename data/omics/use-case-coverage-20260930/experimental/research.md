# Seven existing experimental use cases: coverage audit, 30 September 2026

Baseline: `2026-09-28-c7b5ac6d34f2` (26,126 records). This audit used the immutable catalogue plus current primary sources. No models were run. All new records describe source checking by an automated curator; human scientific review remains outstanding.

Prepared 833 records, including 272 measurements. Existing numerical records and release archives were not changed.

## #334 — Assess models for genetic perturbation experiments

Existing GEARS Norman2019 comparison already measures expression-response prediction with No Perturb, CPA, CPA+KG and GEARS. Eight source-checked evaluations span MSE and Pearson DE. PerturBench combination prediction is additional existing evidence with linear/latent-additive comparators. No duplicate measurements were added.

Added an explicit source-supported No Perturb baseline role linked to both existing GEARS protocols and their measured evaluations.

Remaining gaps:
- A benchmark exists for expression responses, but prospective experiment-selection hit rates and transfer to a new cell system remain uncovered by this mapped comparison.
- Table 6 scoring gene set, checkpoint revisions and exact split manifests remain unextracted; do not infer Top20 MSE or confidence intervals from the printed spreads.

Primary sources: [https://doi.org/10.1038/s41587-023-01905-6](https://doi.org/10.1038/s41587-023-01905-6), [https://arxiv.org/html/2408.10609v1](https://arxiv.org/html/2408.10609v1)

## #335 — Shortlist molecular identities from tandem mass spectra

Existing v1 MSAlign comparison covers six formula-free configurations on MassSpecGym formula/MCES splits. Fresh retrieval found the unversioned arXiv URL now returns v2, dated 25 September 2026, with changed comparator sets and uncertainty reporting.

Added v2 Table 3 in full: 81 results, nine configurations, three datasets/splits and separate formula-free/oracle protocols. Formula-free use-case mappings include DeepSet, JESTR, Emb-Cos, MSAlign and its late-score-fusion variant; formula-oracle rows remain separate. Added explicit DeepSet and existing FFN/DeepSets baseline roles.

Remaining gaps:
- v1 source record labels 2605.19752v1 but uses an unversioned URL that now serves v2; old source bytes/values must remain immutable. v1-specific URL returned HTTP406 during this audit.
- For MCES, the v2 Table3 generic caption says three random splits, but Section5.1 explicitly uses two validation/test-swapped variants; the discrepancy is preserved.
- Benchmark assumes the true structure is present among 256 neutral-mass-matched candidates. Unknown candidates, instrument-specific prospective performance and authenticated identification remain gaps.

Primary sources: [https://arxiv.org/pdf/2605.19752v2](https://arxiv.org/pdf/2605.19752v2), [https://github.com/pluskal-lab/MassSpecGym](https://github.com/pluskal-lab/MassSpecGym)

## #336 — Compare methods for plant promoter experiments

Existing AgroNT Figure3e evidence covers two learned methods in six reporter-host-by-sequence-species conditions. That comparison lacked an explicit simple conventional comparator.

Added Jores 2021 GC-and-motif linear regression versus its CNN for both reporter hosts: four Pearson-correlation-squared measurements in two original pooled-species protocols. The linear model uses GC plus six core-element and 72 TF motif scores. These are distinct from AgroNT species-specific comparisons.

Remaining gaps:
- Reporter-host and sequence-species conditions cannot be pooled. Jores pooled-species Fig8 and AgroNT species-specific Fig3e protocols remain separate.
- Prospective experimental promoter evolution is described by Jores; no benchmarked prospective model-to-model design hit-rate or stable-plant endpoint has been extracted.
- Uncertainty, exact test counts and split/checkpoint hashes remain unextracted for the newly added historical comparison.

Primary sources: [https://doi.org/10.1038/s41477-021-00932-y](https://doi.org/10.1038/s41477-021-00932-y), [https://huggingface.co/datasets/InstaDeepAI/plant-genomic-benchmark](https://huggingface.co/datasets/InstaDeepAI/plant-genomic-benchmark)

## #337 — Assess methods for protein stability experiments

Existing local AMFR ESM-2 and random-ranking runs cover the same 2,972-variant short construct in separate protocols. The official pinned ProteinGym CSV supplies a much broader pre-existing assay-level comparison.

Added all 97 measured model columns from the official AMFR Spearman row, including Site-Independent 0.358 and EVmutation 0.418, with snapshot-specific configurations, canonical model/method identities and source-backed family associations. Added explicit evolutionary and random-ranking baseline roles.

Remaining gaps:
- The official comparison contains 820 single and 2,152 double substitutions. It does not complete the planned matched singles-only local study.
- Number of Mutants=2,972 is the assay count; exact scored count per model, source score transformations and model checkpoint hashes remain unextracted.
- Method input modalities differ. These scores support short-construct folding-stability ranking, not a universal sequence-only winner, full-protein function or clinical pathogenicity.

Primary sources: [https://github.com/OATML-Markslab/ProteinGym/blob/144fe22b07dfaeec2b366f2346203a9838a55b4c/benchmarks/DMS_zero_shot/substitutions/Spearman/DMS_substitutions_Spearman_DMS_level.csv](https://github.com/OATML-Markslab/ProteinGym/blob/144fe22b07dfaeec2b366f2346203a9838a55b4c/benchmarks/DMS_zero_shot/substitutions/Spearman/DMS_substitutions_Spearman_DMS_level.csv), [https://doi.org/10.1038/s41586-023-06328-6](https://doi.org/10.1038/s41586-023-06328-6)

## #338 — Assess rhodopsin wavelength prediction across sequence backgrounds

Existing FLIP2 Rhomax by_wild_type mapping has five measured configurations: two composition probes, training mean and two ESM-2 sizes. Original RhoMax research supplies an additional direct wavelength-error comparison against Bayesian LASSO.

Added all 60 Table1 nm/eV median/mean-error cells, including the printed four-split summary, for RhoMax, RhoMax+retinal and BLASSO. Four WT-background holdout protocols and a separately labelled aggregate preserve their own split identity. Added canonical RhoMax and BLASSO identities plus explicit Bayesian LASSO, training-mean and composition baselines.

Remaining gaps:
- Original RhoMax splits group 75 WT backgrounds (65 train/10 test per split) and are not the single FLIP2 by_wild_type partition. Do not pool their scores.
- Reported standard deviations describe error dispersion; printed aggregate is a summary of four splits, not an independent experiment or pooled uncertainty interval.
- New-background prospective calibration, target-specific candidate hit rates, expression, activation and photostability remain unestablished.
- RhoMax Tables2–3 are feature/attention ablations; they were inspected but intentionally not added to this model-selection comparison.

Primary sources: [https://doi.org/10.1021/acs.jcim.4c00467](https://doi.org/10.1021/acs.jcim.4c00467)

## #339 — Prioritise variants for splicing experiments

Existing matched-annotation MFASS study already measures the top-100 follow-up decision across four SpliceAI/Pangolin configurations on the same 8,297 scored variants. Older corrected MFASS v2 additionally has a supervised gradient-boosted feature baseline, a training-prior control and DNABERT2, already recorded.

Added explicit baseline roles for matched-study SpliceAI comparators and the historical v2 supervised feature and constant-prior controls. Suggested a separate historical v2 mapping for the two exact baseline configurations; no new scores were invented or merged with matched annotation. DNABERT2 remains an existing pipeline evaluation outside the use-case mapping.

Remaining gaps:
- The four matched conditions exclude the same 27 of 8,324 held-out variants; missing scores are not negative predictions.
- Historical v2 marginal scores have different scored subsets/annotations and require their own paired comparisons. Constant-prior top-100 counts reflect tied-score order. DNABERT2 is a pipeline rather than an exact configuration and remains outside the active mapping.
- MFASS reporter exon inclusion does not validate patient RNA, diagnosis or prospective clinical follow-up. Human scientific review and external reproduction remain outstanding.

Primary sources: [https://www.rewire.it/blog/spliceai-and-pangolin-on-one-shared-annotation/](https://www.rewire.it/blog/spliceai-and-pangolin-on-one-shared-annotation/), [https://github.com/rewire-bio/rewire-benchmarks/blob/093fd1ae198c80ce34408d84d6543bca4fc538f2/benchmarks/mfass/results/matched-annotation-v1/report.json](https://github.com/rewire-bio/rewire-benchmarks/blob/093fd1ae198c80ce34408d84d6543bca4fc538f2/benchmarks/mfass/results/matched-annotation-v1/report.json)

## #340 — Set baselines for UTR translation experiments

Existing local mRNABench designed-MRL protocol has two measured controls and no matched learned-model result. The broader catalogue already contains 21 author-reported mRNABench MRL-MPRA comparisons, which use a different probing/aggregation protocol.

Added FramePool 2021 Supplementary Tables S1 and S4 completely: 30 Pearson correlations across four MPRA sequence cohorts, five Optimus/FramePool configurations and five conventional random-forest variants. Added named model/method families, source-backed associations and explicit random-forest, training-mean and composition baseline roles.

Remaining gaps:
- FramePool/Sample random and truncated-human libraries differ from the locally evaluated mRNABench designed-MRL split. Learned results exist for the use case, but no new result fills that exact local protocol gap.
- Sequence-length transfer is measured; Pearson correlation does not establish absolute calibration, design success, therapeutic translation or full-length endogenous prediction.
- Local protocol raw predictions/input reuse terms remain unresolved; supplementary tables do not establish permissions for those separate inputs.
- Per-configuration uncertainty and exact human cohort denominators remain unextracted.

Primary sources: [https://doi.org/10.1371/journal.pcbi.1008982](https://doi.org/10.1371/journal.pcbi.1008982), [https://www.ebi.ac.uk/europepmc/webservices/rest/PMC12265608/fullTextXML](https://www.ebi.ac.uk/europepmc/webservices/rest/PMC12265608/fullTextXML)

## Extraction and interpretation boundaries

RhoMax Table1 was parsed from Europe PMC XML; the Training section explicitly defines absolute error. Mean and median values retain their separate metric IDs, nm and eV retain their units, and the printed aggregate row is not treated as an additional trial. Tables2–3 ablations were not ingested.

Jores Fig8a,b uses Pearson correlation squared, as labelled by the figure, rather than silently treating this as scikit-learn R². Methods specifies 90/10 holdout, 35S enhancer in the dark, two assay hosts, and GC/motif linear regression. The prose and rendered figure were used to verify all four reported values.

FramePool XLSX S1 and S4 were parsed without recomputation; all 30 cells were retained. Figure S7 was rendered and checked against random-forest values and R labels. Human reporter results are not endogenous full-length validation.

ProteinGym assay-level Spearman row was extracted in full from a pinned commit. All 97 model columns are represented. Same-source labels identify configurations; missing checkpoints and per-model scored counts stay missing. Family associations name methods, without claiming identical fitted checkpoints.

MSAlign v2 Table3 was checked against the rendered PDF page. Its overbar distinguishes score fusion from plain MSAlign; formula-oracle rows are a different input condition and are excluded from the formula-free use-case mappings. The caption/methods disagreement over MCES repeats remains explicit.

Potential follow-ups found during search (not added as unverified measurements): SpliceConsensus 2026 independent MFASS benchmark; Smith et al. 2023 MPSA benchmarking; DeltaSplice MFASS top-k comparison; RaSP/Rosetta stability comparisons. Existing mapped endpoint coverage already exists for these cases; this audit does not claim an exhaustive literature census.
