# Coverage audit for all 17 use cases

Reviewed 30 September 2026. Status: local database review candidate; not deployed.

All 17 use cases were checked against the existing 26,126 scientific records and current primary sources. The additive intake contains 2,008 records: 56 baseline, 12 benchmark, 207 claim, 209 configuration, 29 dataset, 26 dataset_subset, 342 evaluation, 25 method, 46 model, 1 pipeline, 71 protocol, 959 result, 25 source. Existing records and numerical values are preserved.

Evidence is classified by the endpoint it measures. An active mapping can be a proxy; it does not mean the full decision is validated. All cases retain documented gaps. Source checking and independent automated cross-review are not human scientific review or experimental replication.

| Issue | Use case | Mapped protocols | Evaluations | Result rows | Remaining gap |
|---|---|---:|---:|---:|---|
| [#334](https://github.com/rewire-bio/rewire.it/issues/334) | Assess models for genetic perturbation experiments | 2 | 8 | 8 | A benchmark exists for expression responses, but prospective experiment-selection hit rates and transfer to a new cell system remain uncovered by this mapped comparison. |
| [#335](https://github.com/rewire-bio/rewire.it/issues/335) | Shortlist molecular identities from tandem mass spectra | 7 | 39 | 69 | v1 source record labels 2605.19752v1 but uses an unversioned URL that now serves v2; old source bytes/values must remain immutable. v1-specific URL returned HTTP406 during this audit. |
| [#336](https://github.com/rewire-bio/rewire.it/issues/336) | Compare methods for plant promoter experiments | 8 | 16 | 16 | Reporter-host and sequence-species conditions cannot be pooled. Jores pooled-species Fig8 and AgroNT species-specific Fig3e protocols remain separate. |
| [#337](https://github.com/rewire-bio/rewire.it/issues/337) | Assess methods for protein stability experiments | 3 | 99 | 107 | The official comparison contains 820 single and 2,152 double substitutions. It does not complete the planned matched singles-only local study. |
| [#338](https://github.com/rewire-bio/rewire.it/issues/338) | Assess rhodopsin wavelength prediction across sequence backgrounds | 6 | 20 | 70 | Original RhoMax splits group 75 WT backgrounds (65 train/10 test per split) and are not the single FLIP2 by_wild_type partition. Do not pool their scores. |
| [#339](https://github.com/rewire-bio/rewire.it/issues/339) | Prioritise variants for splicing experiments | 2 | 6 | 22 | The four matched conditions exclude the same 27 of 8,324 held-out variants; missing scores are not negative predictions. |
| [#340](https://github.com/rewire-bio/rewire.it/issues/340) | Set baselines for UTR translation experiments | 5 | 32 | 36 | FramePool/Sample random and truncated-human libraries differ from the locally evaluated mRNABench designed-MRL split. Learned results exist for the use case, but no new result fills that exact local protocol gap. |
| [#341](https://github.com/rewire-bio/rewire.it/issues/341) | Rank rare-disease variants for review | 7 | 13 | 68 | Known callable diagnosis recovery is available, but no controlled addition of a molecular-effect model at identical review effort was established. |
| [#342](https://github.com/rewire-bio/rewire.it/issues/342) | Reanalyse unresolved rare-disease cases | 1 | 1 | 14 | Equal updated calls, phenotypes and knowledge with matched review effort are not established in the extracted peer-reviewed programme. |
| [#343](https://github.com/rewire-bio/rewire.it/issues/343) | Interpret BRCA1/BRCA2 germline variants | 5 | 5 | 39 | Independent complete clinical classifications, serious-error adjudication and equal-evidence reviewer-time comparison were not found in selected evidence. |
| [#344](https://github.com/rewire-bio/rewire.it/issues/344) | Assess somatic small-variant oncogenicity | 4 | 5 | 27 | OncoVI direct SOP/ClinVar classification exists; prospective reviewer-effort, calibration and independent model-versus-expert evaluation remain missing. |
| [#345](https://github.com/rewire-bio/rewire.it/issues/345) | Review EGFR lung-cancer actionability evidence | 1 | 3 | 162 | No independently adjudicated advanced EGFR-mutant NSCLC evidence-retrieval benchmark with prior therapy, treatment line, date, jurisdiction and contradictions was established by this bounded search. |
| [#346](https://github.com/rewire-bio/rewire.it/issues/346) | Select therapeutic targets for validation | 2 | 21 | 21 | 61 nominations / Results 57 selected targets / README 59 targets / 50 post-QC perturbations need reconciliation; no success fraction calculated. |
| [#347](https://github.com/rewire-bio/rewire.it/issues/347) | Select regulatory variants and genes for functional follow-up | 1 | 6 | 10 | No allele-specific endogenous-edit benchmark or equal-budget prospective shortlist benefit established. |
| [#348](https://github.com/rewire-bio/rewire.it/issues/348) | Select perturbations for a defined cellular response | 2 | 21 | 21 | 61 nominations / Results 57 selected targets / README 59 targets / 50 post-QC perturbations need reconciliation; no success fraction calculated. |
| [#349](https://github.com/rewire-bio/rewire.it/issues/349) | Transfer cell-type annotations to a new dataset | 1 | 9 | 9 | Checkpoint and split hashes unextracted; no deployment calibration claim. |
| [#350](https://github.com/rewire-bio/rewire.it/issues/350) | Choose structural hypotheses to guide experiments | 5 | 9 | 64 | No intervals in Table 3; no prospective experimental utility or matched conventional mutation/construct baseline. |

## Evidence and review

The complete per-case verdicts, source URLs, search queries, remaining gaps and suggested mappings are in the three coverage.json files under `data/omics/use-case-coverage-20260930/`. Every imported numerical row has an exact source locator. Complete bounded tables include weaker methods and conventional controls.

Records are append-only. Input hashes and independent review notes gate release ingestion; the release builder rejects edited or duplicated records. The use-case review preserves the 17 earlier mappings and adds separately scoped mappings. Historical archive bytes are unchanged.

Sources and extraction limits are documented separately for [clinical](../../data/omics/use-case-coverage-20260930/clinical/research.md), [research](../../data/omics/use-case-coverage-20260930/research/research.md) and [experimental](../../data/omics/use-case-coverage-20260930/experimental/research.md) use cases. No inaccessible supplement is represented as checked. No proposed baseline is represented as a measured run.

Important limits include different data and tuning budgets, source denominator contradictions, source-version drift, clinical label dependence, indirect assays and missing prospective experimental utility. A gap means not established by this bounded search, not proof that no benchmark exists anywhere.

## Validation

Candidate release `2026-09-30-e37e3ab1284d` contains 28,133 public records. The intake retains 2,008 records; one contradictory result is quarantined, leaving 2,007 public additions. All 26,126 prior scientific records are unchanged.

All 967 tests (91 files), lint, type checking, the current-release production web build and export checks passed. A clean restore verified all 415 new release files and the content-addressed source copies; 316 current source-input hashes matched. Historical tracked archives are unchanged; full historical archive restoration was not rerun. See [validation receipt](use-case-coverage-2026-09-30-validation.json).
