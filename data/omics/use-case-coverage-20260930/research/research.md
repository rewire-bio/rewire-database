# Use-case coverage research: issues 346–350

Baseline: 2026-09-28-c7b5ac6d34f2; 26,126 records. All existing IDs were checked before new intake. Primary sources and exact locators are listed in sources.md and claims.csv. Review is automated source curation, not human review or reproduction.

## #346 use-case-therapeutic-target-validation

Partial coverage: dependency/evidence scoring and prospective state-objective target nomination; therapeutic validation gap remains.

- 61 nominations / Results 57 selected targets / README 59 targets / 50 post-QC perturbations need reconciliation; no success fraction calculated.
- Automated source review only; independent human scientific review remains outstanding.
- Custom ranking AUC is not ROC AUC, prospective hit rate or efficacy.
- No matched-budget conventional/random prospective comparison; no antitumor efficacy, rescue or selectivity result in this endpoint.
- Original model implementations/checkpoints are not pinned in the intake; no uncertainty printed.
- Preprint v1; original and reimplemented ranking scores kept separate. Screen2 ranking population is enriched by original nomination methods.

## #347 use-case-regulatory-variant-gene-follow-up

Partial coverage: allele-effect catalogue evidence plus endogenous CRISPRi linking; allele editing, held-out-locus independence and experimental utility gaps remain.

- Automated source review only; independent human scientific review remains outstanding.
- No allele-specific endogenous-edit benchmark or equal-budget prospective shortlist benefit established.
- Training/test independence unresolved: paper explicitly says benchmarking pipeline does not perform cross-validation.

## #348 use-case-phenotype-perturbation-selection

Direct narrow desired-state selection coverage identified; broader response goals and matched-budget controls remain unproven.

- 61 nominations / Results 57 selected targets / README 59 targets / 50 post-QC perturbations need reconciliation; no success fraction calculated.
- Automated source review only; independent human scientific review remains outstanding.
- Custom ranking AUC is not ROC AUC, prospective hit rate or efficacy.
- No matched-budget conventional/random prospective comparison; no antitumor efficacy, rescue or selectivity result in this endpoint.
- Original model implementations/checkpoints are not pinned in the intake; no uncertainty printed.
- Preprint v1; original and reimplemented ranking scores kept separate. Screen2 ranking population is enriched by original nomination methods.

## #349 use-case-cell-type-annotation-transfer

Partial coverage: donor-held-out annotation baselines and models; independent-study and coverage-aware unknown-type validation remain gaps.

- Automated source review only; independent human scientific review remains outstanding.
- Checkpoint and split hashes unextracted; no deployment calibration claim.
- Reference labels are author annotations, not independent ground truth.
- Unknown-type rejection ROC appears in Supplementary Figure 4 but numerical curve labels are not extracted here.

## #350 use-case-structural-hypotheses-experiments

Non-antibody protein–protein structural proxy covered; experimental-choice benefit remains unmeasured. Eight other task classes are catalogued but excluded from this issue mapping.

- Automated source review only; independent human scientific review remains outstanding.
- No intervals in Table 3; no prospective experimental utility or matched conventional mutation/construct baseline.
- Scored target populations differ; Table 1 assessable counts are retained as coverage context, not verified metric denominators. Some Table 3 rates do not reconcile with integer counts after rounding. No complete-cohort estimate is inferred.


## Extraction scope

scTab: complete Supplementary Table 1a (9 methods) and 1b (5 methods), complete Table 2 (10 resource measurements), and Table 6 default-parameter cells. Tuned Table 6 cells repeat Table 1a and are not counted as new evidence; Table 6 reports four runs whereas Table 1a XGBoost reports five, so run counts are not silently merged. Table 1b heading and SD column conflict, so uncertainty remains unresolved.

MPRabc: all eight Table 3 metric cells, plus ABC and megamap AUPRC printed in the comparison paragraph. No held-out test or causal-variant claim is added; paper explicitly states evaluation does not perform cross-validation.

FoldBench: all 175 metric cells in Supplementary Table 3, all 45 assessable counts from Table 1, and five exact implementation commits from Table 2. Nine task classes remain separate. The paper records 334 protein monomers while current README says 330; this intake follows the published table snapshot. Model-specific assessable counts differ. Table 1 orders Protenix before HelixFold 3 whereas Table 3 reverses them; counts are reordered by named model. Some printed success rates do not reconcile with Table 1 integer counts under ordinary rounding, so exact metric denominators remain null rather than inferred. Current README leaderboard not mixed into historical paper scores.

CPPC: two named state-objective hits are transcribed as a campaign count, not converted into a hit fraction or per-model comparison. Supplementary Table S2 retrieval eventually succeeded: all 53 numeric cells from comparison columns C, D and J over rows 2–24 are extracted, keeping original four-knockout L1, original prospective ranking, and post-hoc reimplemented best-model scores in three protocols. Stored XLSX decimal values are preserved exactly. Missing NA cells are not zeros. Personal contributor/contact columns are excluded. Supplementary Table S3 contains gene rankings, not numeric method performance; not converted into invented scores. The README has 59 screen-2 genes versus 61 nominations in abstract, 57 selected targets in Results and 50 post-QC perturbations in Methods.

Project Score: conventional target-priority protocol and dependency dataset; no invented comparative accuracy result.

ClusPro BM5 conventional docking: appended complete Table 1, 112 result records (110 numeric and 2 explicit N/A). Only enzyme/others top-10/top-30 protocols map to #350. Structural inputs, category-specific modes, BM4 parameter benchmarking and different target populations preclude direct comparison to FoldBench. Exact software revision and component-structure hashes remain unextracted. No experimental-choice utility is inferred. Table 1 Total/easy/top-10 prints 87 although subgroup totals are 77 and printed 51.68% corresponds to 77/149; literal 87 is quarantined as needs_review and is outside all mappings. Results overview says 1,000 retained structures while STAR Methods gives three sets of 500 for Others; both statements are preserved.

Final research intake: 734 records, 377 results; one numeric source-anomaly record needs review. All original 550 records are byte-preserved before the appended 184-record docking delta.
