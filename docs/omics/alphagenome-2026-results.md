# AlphaGenome published evaluations

The family profile previously contained explanatory content but no numerical evaluations. This batch adds the absolute scores from **all 77 comparison rows** in Supplementary Tables 3 and 4 of Avsec et al., *Advancing regulatory variant effect prediction with AlphaGenome* (Nature, 2026), DOI [10.1038/s41586-025-10014-0](https://doi.org/10.1038/s41586-025-10014-0).

The 154 score-cell occurrences become 136 distinct results after merging repeated observations with identical configuration, protocol, metric and stored value. Every occurrence retains its original cell locator. Of these results, 130 are published and six remain quarantined. This includes the weaker comparisons and rows omitted from Figure 1. Random-reference levels and relative-improvement formulas are preserved as source context, not additional model experiments.

The AlphaGenome family page receives 52 metric rows across 44 evaluations. Four supervised systems have their own pages and `uses_model` relationships: splicing features with an Explainable Boosting Classifier, CAGI5 features with LASSO, eQTL scores with a random forest, and ENCODE-rE2G extended with an AlphaGenome input × gradient feature. Their results do not enter the base-family table. Track-specific heads, folds, ensembles and distilled configurations remain distinct. A paper configuration is a `method` with explicit `configuration_type`; no downloaded checkpoint identity is inferred.

## Evidence and review

- `data/omics/reviews/alphagenome-2026/tables.json` preserves the complete source rows, OOXML numeric literals, number formats, formulas and cell locations.
- `protocol-map.json` contains 50 source-backed procedure guides and conceptual diagrams. CAGI5's two pairwise subsets produce separate protocol pages, so 51 protocol pages are added.
- `retrieval.json` and `methods-source.json` pin the publisher workbook, supplementary PDF and official notebook to retrieved hashes. The original paper XML is an existing pinned source.
- `data/omics/reviews/2026-09-17-alphagenome-results.json` maps all 154 occurrences to result IDs and publication decisions.
- `data/omics/reviews/2026-09-17-alphagenome-independent-review.json` records the separate automated transcription review. Publication refuses a changed batch without a matching successful review.

The workbook SHA-256 is `833cb78b6ae6fe39415cfff296ac00c48d800326139f13eb307531a1cc133154`. The supplementary Methods PDF SHA-256 is `86b2e6a07543e3c201e2e157a3e9c6eb5235ff13eb8a5224f6fcb6fe1808d4c0`.

Fixed-format `printed_value` follows Excel's recorded format. General-format cells use an explicitly labelled canonical stored-number transcription because visible precision depends on column width. `numeric_value` and `raw_xml_value` preserve the exact stored decimal. These are author-reported experiments with source-checked transcriptions, not independent experimental reproductions or human-reviewed findings.

## Withheld comparisons and limitations

| Comparison | Reason |
|---|---|
| Table 3 row 21, polyadenylation ratio | Workbook stores approximately 0.868 versus 0.767; the article reports 0.894 versus 0.790. This is not a rounding difference. Both model results are withheld. |
| Table 4 row 15, eQTL effect size | Workbook AlphaGenome value is approximately 0.492; the pinned official notebook reports 0.500588. Configuration/version equivalence is unresolved, so the pair is withheld. |
| Table 4 row 16, eQTL sign | Workbook AlphaGenome value is approximately 0.803; the notebook reports 0.810077. The same equivalence question remains unresolved, so the pair is withheld. |

Summary-table cells do not establish scored-example counts, uncertainty intervals or exact checkpoint hashes. Methods counts are retained with their stated scope, rather than substituted as final denominators. The author's MFASS protocol is separate from rewire MFASS v2. JSD is lower-is-better; distance/divergence implementation details that were not resolved remain explicit. Unknown manifests, input equivalence and inference budgets prevent automatic compatibility claims.

## Rebuilding and validation

Run `python3 scripts/omics/import-alphagenome.py` from the repository root to regenerate the additive JSONL batch and cell-mapping receipt from the checked inputs. This performs no retrieval, scoring or training. A changed batch requires a fresh independent transcription review before `npm run omics:release` will accept it.

Regression tests cover every original score cell, quarantine, duplicate handling, API schema compatibility, family/pipeline separation, all direct and reverse result links, metric direction, unknown denominators and preservation of earlier results. The release uses the existing Firebase/tRPC contract. Old inputs and immutable release bundles remain unchanged.
