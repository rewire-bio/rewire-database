# Entity separation classification audit

Reviewed 2026-09-17. Scope: all 905 current model, benchmark, dataset and baseline records in release `2026-09-17-5054ddf2a281`.

Baseline catalogue SHA-256: `8051d1892a15e88f695419f9406e427e8deb09fd0bfa24021bf586ae79eebf33`.

The mapping preserves every stable ID and all scientific values. It proposes kind changes only; it does not create family membership, checkpoint equality, parent datasets, assay identities or additional results. Every row carries its existing source evidence and precise locator where available.

| Proposed kind | Records |
|---|---:|
| baseline | 27 |
| benchmark | 30 |
| configuration | 301 |
| dataset | 138 |
| dataset_subset | 51 |
| evaluator | 4 |
| method | 15 |
| model | 59 |
| pipeline | 50 |
| protocol | 95 |
| service | 1 |
| task | 134 |

## Classification decisions

- Named learned predictors and representation families remain models. Procedural software and algorithms are methods; the existing `entity_level=method` field was not blindly translated into 370 methods.
- Paper-scoped method identities are configurations, even when the precise checkpoint was not reported. Source-established composed workflows are pipelines. Components of a single neural architecture alone do not make it an analysis pipeline.
- AlphaFold Server is a service; the separately recorded AlphaFold 3 remains a model. ColabFold, CAMISIM, HUMAnN and LipidFinder are workflows. Kraken2, MetaPhlAn, Vina, RNAfold, COBRApy, FIMO, sequence-search software and general network-inference algorithms are methods.
- LipidBlast is a reference spectral library and therefore a dataset. Its searching procedure remains a separate baseline role. Existing links targeting LipidBlast must accept the dataset kind; no algorithm is invented from the library name.
- Suites and challenges remain benchmarks, while tasks, protocols and evaluators become distinct first-class kinds. The 134 existing task identities are preserved. Generic legacy profile wording that calls a paper-specific task a computational protocol is documented as ambiguity rather than used to invent fixed protocol identity.
- All 51 explicit AlphaGenome evaluated populations become dataset subsets. Their comparator-specific inclusion rules remain distinct. Other cohorts retain dataset because a name containing test, subset or stability assays does not establish a verified parent/manifests relationship.
- MassSpecGym formula/main strings can describe candidate/input information, not a biological population subset. They stay metadata.
- All 27 baseline records remain baseline roles. Their seven baseline-type values describe the comparison role, not seven new kinds. Existing verified links identify the underlying model, method, pipeline or reference library.
- No independent assay-procedure entity is established by the current dataset assay labels. Assays, organisms, architecture classes, source origins, review status, metrics and uncertainty remain metadata.

## Evidence and limitations

This is a classification audit of already reviewed primary-source evidence, not a new experimental validation or blanket upgrade of scientific metadata. The model/benchmark profiles were inspected for identity, architecture/procedure and version scope. Dataset records were checked against their source-located comparison context and linked profile dataset/split descriptions. Baselines were checked against their linked source-backed methods and proposed-applicability status.

One unchanged dataset, LIPID MAPS Standards Spectra, lacks a precise claim locator beyond its existing official overview source. A fresh browser retrieval on 2026-09-17 timed out. Its existing reference-library identity remains dataset; no new assay or source claim is asserted. The two TAPE dataset identities are supported by the reviewed original-paper dataset/split passages.

Configuration records retain an explicit caveat: an evaluated table label does not establish an immutable checkpoint or equivalence to a same-named record. This is intentional scientific uncertainty, not an incomplete kind mapping. Potential older cohort/subset identities are flagged instead of assigning unverifiable parents.

## Validation

- Exactly 905 unique IDs are mapped: 427 models, 263 benchmarks, 188 datasets and 27 baselines.
- All referenced source IDs resolve to existing source records.
- The baseline catalogue hash is recorded to detect any concurrent release change.
- Only the ignored classification JSON and this audit were written; no catalogue, source, numeric result, relationship or historical release was modified.

## Independent review resolution

Twelve configuration-to-pipeline corrections were accepted after rereading the primary methods: TCINet plus HTRS, PC-mer plus logistic regression, scaLR, scLLMDA, and eight LAMBDA Table 5 dagger-labelled genome-scanning/filtering compositions. These are complete evaluated workflows, without new family links or checkpoint assumptions. The viral-classification ESM2 record remains a configuration because its source uses LoRA fine-tuning; the separate profile prose error is being corrected by the integration owner. Final configuration count: 301; pipeline count: 50. All other counts and IDs are unchanged.
