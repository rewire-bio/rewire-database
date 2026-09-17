# Catalogue entities and benchmark instructions

The September 2026 normalization introduces schema 1.1 without changing scientific IDs, result values or previous releases. The database, API, filters and canonical pages use the same entity types.

## Entity boundaries

| Entity | Meaning |
| --- | --- |
| Model | A biological model or verified model family. |
| Method | An algorithm or scientific procedure, including conventional statistical and mechanistic approaches. |
| Configuration | A particular checkpoint, settings or adaptation evaluated in a study. Ambiguous paper names do not establish family identity. |
| Pipeline | A composed workflow, such as an encoder plus a separate classifier or postprocessing. |
| Service | A hosted interface; its availability does not establish equivalence to the underlying model release. |
| Benchmark | A top-level suite or challenge. |
| Task | A biological question or capability, independent of one evaluation implementation. |
| Protocol | A concrete assessment procedure, including data, split, inputs, adaptation and scoring conditions. |
| Evaluator | Software or a procedure that scores predictions. |
| Dataset | Biological observations, assays or reference collections. |
| Dataset subset | An explicitly identified evaluation cohort or subset. Input conditions alone do not establish a subset. |
| Baseline | A task-specific reference or control, linked to its implementing method where verified. |
| Evaluation | The exact tested subject, assessment and data used for a result. |
| Result | One reported measurement, with provenance and review status. |
| Source | A versioned paper, repository or evidence artifact. |
| Evidence claim | An individual assertion and its supporting evidence. |

Baseline categories such as null controls and experimental references remain roles. Organisms, assays, architectures, licences and units remain properties; the migration does not invent new scientific records for metadata labels. Dataset assay information remains attached to the data because this collection does not yet establish separate assay identities.

## Migration and compatibility

`data/omics/reviewed/entity-separation/classification.json` records the source-backed decision for every existing public model, benchmark, dataset and baseline. The independent review lists coverage, ambiguities and resolved findings. The pinned baseline is `2026-09-17-5054ddf2a281`.

The release builder applies this reviewed input after the previous enrichments. It preserves all evaluation and result records exactly. LipidBlast is a spectral reference library: its baseline link changes from a model role to a dataset role, with the previous link recorded. One independently verified ESM-2 explanation is corrected to distinguish LoRA fine-tuning from the paper's separate T5 analyses; scores are unchanged.

Historical releases and download checksums are immutable. Schema 1.0 remains readable and cannot contain new entity kinds. Schema 1.1 includes every kind in counts and supports exact-kind API filtering. Legacy evaluation links named `model`, `benchmark` and `dataset` remain role links, so their historical evidence need not be rewritten. Typed relation names are also supported, with target-kind validation and exactly one subject, assessment and dataset role per evaluation.

For compatibility, result responses retain aggregate `models`, `benchmarks` and `datasets` role arrays. Additional `methods`, `configurations`, `pipelines`, `services`, `tasks`, `protocols`, `evaluators` and `dataset_subsets` arrays expose actual entity types. Every returned record includes its canonical `kind`. Consumers should use the record kind when displaying identity.

Previous record URLs remain aliases that render the same content with the new canonical URL. Sitemaps and new links use canonical paths. Query strings and fragments remain available on aliases. No unverified association rolls results into a family or suite. `uses_model` links describe composition and never count pipeline results as evaluations of the underlying model alone.

## Source-backed run instructions

Seven records have copyable shell instructions: BEND, TAPE, scIB, ProteinGym, BEELINE, MassSpecGym and MFASS v2. The top-level benchmark inventory also has an official-documentation audit, including explicit missing-recipe limitations.

Run guides include prerequisites, checked-out code revisions, precise documentation locations, expected outputs and limitations. Source records retain retrieval dates and artifact hashes. Each command has individual-claim rows in the downloadable evidence table. Challenge websites without repository revisions are labelled dated mutable snapshots.

These instructions were inspected against official sources, and shell/Python examples were syntax checked. They were **not executed**. They do not establish independent reproduction of published scores. Package installs and external inputs that are not fully pinned are disclosed. ProteinGym's recipe recomputes published prediction scores; the optional MFASS DNABERT-2 pilot only measures resources.

No benchmark compute, new infrastructure or public submission activation is part of this release.

## Checks

Migration tests compare every historical evaluation/result record and all result-to-entity paths with the pinned baseline, preserve the 223 distinct curated comparison panels, and verify old route aliases. Boundary tests cover schema versions, typed relationships and inactive protocols/data. UI tests cover entity labels, reviewed relationships, run-guide fallback and citations. Production export checks verify canonical pages, aliases, original literature URLs, MFASS history and archived downloads. Browser checks exercise filters, mobile layout and clipboard controls through the local Firebase stack.
