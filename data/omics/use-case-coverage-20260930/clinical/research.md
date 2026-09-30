# Clinical use-case evidence audit

Baseline: immutable 2026-09-28-c7b5ac6d34f2, 26,126 records. Name/ID searches for Exomiser, Talos, reanalysis, BRCA, oncogenicity, CIViC and EGFR returned no matching records. Broader clinical/disease/cancer full-record inspection found unrelated cell-model and ProteinGym records, not direct clinical workflow comparisons.

Extraction scope: complete Talos Table 1 performance rows (all six cohorts/modes and both settings), all four Exomiser rank endpoints printed in Results, selected programme-level reanalysis outcomes; complete ENIGMA Table 2, pilot-resolution outcomes and primary-body generic-threshold comparator percentages/bounds; OncoVI major Results performance, historical-MTB versus expert comparator and all subgroup percentages printed there; complete CIViC Fig1c performance table and every precision/recall/F1 cell in supplementary Tables1–3, including weak baselines. Dataset/sample counts are also retained as metadata. No values were estimated from plot coordinates.

Each source is primary and versioned. DOI final versions supersede discovery preprints; those preprints are not duplicate replications. Scores are author-reported. No executable replication or patient-level data import occurred. Human review remains missing.

Source contradictions are preserved: Talos text and extended figure disagree about the Exomiser cohort denominator, table ratios are called medians in narrative, and some reanalysis subtype denominators differ. BRCA functional labels cannot be relabelled independent clinical truth. OncoVI abstract/body disagree about accuracy and concordance. CIViC main and supplementary MCP oncogenic F1 differ, main text temperature differs from supplementary API description, and label-count wording is inconsistent. No reconciliation or cross-panel inference is invented.

The source-supported baseline entities describe observed conventional comparators/reference workflows. The explicitly proposed equal-input manual reanalysis and EGFR manual lookup baselines have no measurements.

## Issue #341

scoped_candidate_recovery_and_workload_evidence

- Known callable diagnosis recovery is available, but no controlled addition of a molecular-effect model at identical review effort was established.
- Family, site and temporal independence, calling failures and unresolved outcomes need explicit prospective evaluation.
- Talos/Exomiser comparison has source denominator discrepancies (194 body versus 190 extended figure); rank limits are not equal effort.

## Issue #342

programme_yield_available_equal_input_method_gap

- Equal updated calls, phenotypes and knowledge with matched review effort are not established in the extracted peer-reviewed programme.
- A 2026 medRxiv automated-versus-manual comparison was discovered (10.64898/2026.05.16.26352295); full text retrieval failed with HTTP403 and indexed percentages conflict between text and caption. No measurements imported from that preprint.
- False alerts, review time, retracted diagnoses and source denominator inconsistencies need adjudication.

## Issue #343

functional_calibration_and_manual_pilot_proxy

- Independent complete clinical classifications, serious-error adjudication and equal-evidence reviewer-time comparison were not found in selected evidence.
- BayesDel labels derive from functional assays; threshold calibration is not held-out pathogenicity validation.
- Study v1.0 manual pilot revises specifications on the same variants; current specification version must be pinned for any new run.
- Generic BayesDel thresholds from Pejaver are a relevant alternative described in Table S4; supplement download returned challenge HTML, so the four primary-body percentages/bounds are entered while unverified Table S4 cells remain missing.

## Issue #344

direct_classification_with_reference_independence_gaps

- OncoVI direct SOP/ClinVar classification exists; prospective reviewer-effort, calibration and independent model-versus-expert evaluation remain missing.
- MTB old labels measure protein-function impact, not oncogenicity; selected reassessment shares experts/resources and is disagreement-enriched.
- Abstract/body accuracy conflicts remain flagged. Supplemental Table S6 download returned challenge HTML; only body-printed strata are extracted.

## Issue #345

pan_cancer_retrieval_proxy_egfr_specific_gap

- No independently adjudicated advanced EGFR-mutant NSCLC evidence-retrieval benchmark with prior therapy, treatment line, date, jurisdiction and contradictions was established by this bounded search.
- CIViC study reports pan-cancer aggregate and predictive direction metrics; no published EGFR-only score was found.
- OncoTraj (arXiv:2606.11144) predicts longitudinal resistance and is outside the requested evidence-retrieval endpoint.
- Manual versioned lookup plus primary-source review still needs measured equal effort.

