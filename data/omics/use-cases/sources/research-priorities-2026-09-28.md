# Research priorities: workflow definitions and collection brief

Source ID: `use-case-source-research-priorities-2026-09-28`.

Authored for Rewire by Codex on **28 September 2026**. This document is Rewire's own workflow definition and sourced collection brief. It is **not an original professional guideline, an independent benchmark or evidence of a model's effectiveness**. The five pages describe research decisions and the comparisons needed to support them. Comparative evidence collection is planned; these definitions add no evaluation scores or applicability mappings.

All primary URLs below were inspected during the research round on **28 September 2026**. Publication or release dates are stated separately. The review is automated source review by Codex; human domain review remains unassigned. Resources and methods named here are collection leads or proposed comparators. Their inclusion does not establish that they answer the full user question.

## R1 — Therapeutic target validation

A disease biologist or translational discovery team must choose which genes to modulate before committing a validation campaign. Define one disease, a candidate gene set, inhibition or activation, the relevant cell system and a phenotype that would count as a useful effect. The desired output is a shortlist of target–disease–intervention hypotheses with conflicting evidence and validation tests.

[Open Targets 26.09](https://blog.opentargets.org/open-targets-platform-26-09-has-been-released/), released **25 September 2026**, provides current genetic and molecular evidence infrastructure. [DepMap](https://depmap.org/portal/) provides dependency data and target-discovery workflows; its portal displayed the **26Q1** release when retrieved. These are institutional workflow signals, not measurements of this page's demand. The [genetic-support analysis](https://www.nature.com/articles/s41586-024-07316-0), published **17 April 2024**, supplies an impact rationale; its observational clinical association does not validate an AI ranking.

Compare candidate rankings with genetics-only, expression-only and conventional dependency/evidence aggregation at the same testing budget. Direct evidence for the defined decision would measure reproducible, useful target effects, rescue and context/selectivity among all tested candidates. Association and dependency scores are intermediate evidence. Collect failed experiments, evidence cutoffs and normal-cell controls. Do not treat untested targets as negatives or infer a therapeutic window from cell-line dependency.

## R2 — Regulatory variant and effector-gene follow-up

A functional geneticist following up a disease-associated locus needs to select allele edits, regulatory-element perturbations and gene readouts. Inputs include fine-mapping, ancestry and linkage-disequilibrium context, genome build, relevant cells and available sequence/chromatin/expression evidence. The output should distinguish competing variant–element–gene explanations and specify which experiment tests each link.

The [ENCODE expanded regulatory registry](https://www.nature.com/articles/s41586-025-09909-9), published **7 January 2026**, and [SCREEN](https://screen.wenglab.org/) establish a maintained workflow for exploring candidate regulatory elements. The [scE2G study](https://www.nature.com/articles/s41588-026-02695-8), published **3 August 2026**, supplies enhancer–gene linking evaluations. These resources justify evidence collection around regulatory follow-up; they do not establish that any particular prediction explains a disease association.

Use separate comparisons for allele effects, element–gene links and follow-up selection. Collect held-out CRISPRi linking experiments, allele-specific reporter assays and endogenous editing. Distance and activity/contact methods are appropriate comparators only where they produce the required output; sequence models likewise need compatible allele-effect endpoints.

Direct evidence must match the declared assay and link. A reporter effect can be direct evidence for reporter prediction while remaining a proxy for endogenous regulation. Whole-element perturbation differs from a single-base edit, and a gene link does not establish disease causality. Hold out loci and studies, audit related variants and pretraining overlap, and preserve cell context and failed assays.

## R3 — Phenotype-driven perturbation selection

A screen designer has limited experimental capacity and wants perturbations that produce a defined cellular response. Specify the phenotype, cell system, candidate genetic interventions and test budget before selecting a model. Keep unseen genes, combinations and new cell contexts as separate transfer questions. Chemical interventions require their own protocol.

[Arc's Virtual Cell Challenge report](https://arcinstitute.org/news/virtual-cell-challenge-2025-wrap-up), dated **6 December 2025**, documents substantial challenge participation and acknowledges that models did not consistently outperform naive baselines across its metrics. Participation demonstrates research activity, not routine laboratory adoption. [Systema](https://www.nature.com/articles/s41587-025-02777-8), published **25 August 2025**, motivates evaluating perturbation-specific signal beyond shared variation.

The intended comparison asks whether a method selects more confirmed phenotype hits at the same testing budget. Include random selection, mean/no-change response controls, simple statistical models and nearest measured perturbations. Use a common phenotype definition and candidate universe; specify how tied rankings are sampled. Preserve guide efficacy, replicates, controls and biological units when defining holdouts.

Confirmed phenotype hits address the selection decision directly. Expression similarity is intermediate evidence unless it is itself the prespecified experimental objective. Shared controls, batch effects or evaluation genes chosen using held-out responses can distort comparisons. Choosing experiments to maximise information gain is a different decision and needs its own hypothesis and endpoint. This page therefore extends beyond the existing bounded GEARS expression comparison without inheriting its mappings.

## R4 — Cell-type annotation transfer

A single-cell analyst must choose a reference and annotation workflow, decide which labels to accept and identify cells needing expert review. Inputs include query counts, tissue/disease and assay metadata, a reference release and the intended label hierarchy. The desired output includes confidence and an explicit unassigned group alongside labels.

The current [Azimuth portal](https://azimuth.hubmapconsortium.org/), retrieved **28 September 2026**, introduces Pan-Human Azimuth and states that individual tissue-specific web applications are no longer supported. [CELLxGENE](https://cellxgene.cziscience.com/) provides reference data and annotation infrastructure. These establish a practical workflow; resource scale alone does not measure active users. The [scTab study](https://www.nature.com/articles/s41467-024-51059-5), published **4 August 2024**, supplies donor-holdout annotation evidence and discusses label hierarchy, duplicated cells and platform transfer.

Collect conventional marker/reference/statistical workflows and relevant model configurations with independent study and platform evaluations. Compare per-class and hierarchy-aware errors, rare and absent-reference populations, confidence calibration, resource use and accuracy as uncertain cells are left unassigned. Match reference information and coverage before interpreting differences.

Agreement with independently supported cell labels directly addresses annotation. Atlas author labels remain imperfect references; embedding separation or batch mixing cannot substitute for correct identity. Audit shared cells, donors and labels in references and pretraining. Annotation, integration and discovering new disease states are separate evaluations, and annotation accuracy is not diagnostic validation.

## R5 — Structural hypotheses for experiments

A structural biologist needs to choose interfaces, mutations or constructs worth testing. Define the experimental choice, available sequences/partners/templates, assembly and relevant conditions before selecting a structural metric. Begin with one bounded complex class; monomers, protein complexes, antibody complexes and ligand complexes require distinct protocols.

The [AlphaFold owner resource](https://deepmind.google/science/alphafold/), retrieved **28 September 2026**, reports broad research use by millions. This is owner-reported usage, not verified use or success of any particular complex-prediction workflow. [FoldBench](https://www.nature.com/articles/s41467-025-67127-3), published **4 December 2025**, supplies task- and similarity-specific structural assessments to investigate alongside blind structural challenges.

Compare appropriate template modelling and docking configurations, then seek independent interface-mutation or construct outcomes for the user's experimental choice. Record structure-deposition dates, training/template overlap, confidence, missing predictions and alternative conformations. Experimental-utility comparisons also need a conventional selection strategy and equal testing budgets.

Contact or pose accuracy directly evaluates a structural prediction task but remains intermediate evidence for a claim that experimental choices improve. High confidence does not establish interaction existence, binding affinity or function. Experimental success needs measured outcomes and a complete failure denominator. This question concerns structural hypotheses for experiments; it neither duplicates the existing AMFR stability-assay page nor adopts that page's evidence.
