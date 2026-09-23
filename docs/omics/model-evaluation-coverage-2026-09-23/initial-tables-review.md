# Independent review of model coverage tables

Reviewed 2026-09-23. Scope: DreaMS, mRNABench variants and METAGENE Gene-MTEB; excludes subsequently added protein batches.

The independent parser in `review.py` reads compressed primary XML/HTML directly. It verifies every printed cell and numerical string, result source locator, source hash, metric unit/direction and the 400 mRNABench confidence intervals. `independent-review.json` pins the inspected input hashes. All checks pass: 45 DreaMS, 400 mRNABench and 80 METAGENE numeric cells. DreaMS's three unavailable cells are not numerical results. The 100 mRNA localization cells and 25 METAGENE aggregates are excluded as intended.

## Semantics

- DreaMS fingerprint is a fine-tuned model configuration. Probe pipelines in the other batches appropriately use `uses_model`, not family identity. Target IDs exist in the catalogue.
- DreaMS comparator execution origin remains unreported. The article's acknowledgment of help reproducing a benchmark does not prove which table rows were rerun. Six evaluation setup groups avoid presenting eight metrics as eight runs per method.
- DreaMS retrieval accuracy is printed as percent, cosine similarity dimensionless. Input differences and extra PubChem training information remain explicit.
- mRNABench 95% intervals are reported half-widths, not SD. Captions describe means over ten random splits; Appendix C lists nine seed values. Do not invent the tenth seed.
- All eight reused mRNABench dataset records exist with the same primary source and task identity. These are source-specific dataset subsets, not verified universal dataset releases.
- mRNABench Table 2 family selections and Tables 5/6 variants are overlapping evidence from one experiment programme. The existing free-text overlap caveat is correct; counts must not claim independent runs. A common evidence-set identifier would help, without inventing exact selected-variant mappings.
- mRNABench Appendix C specifies micro-averaging for multilabel metrics. Add this to the recipe/protocol context. The caption's random splits versus Methods homology splitting should be explicitly retained as a source ambiguity rather than silently resolved.
- METAGENE Table 3's eight classification tasks use accuracy and eight clustering tasks V-measure. All 80 component scores are retained; five aggregate rows are excluded from evaluation counts. Frozen mean-pool representations plus logistic regression or minibatch k-means are pipelines. The original evaluator/data revision is unreported; current code does not establish the historical revision.

No numerical blockers found. The release input manifest should include METAGENE and later protein source/receipt artifacts, not only the two original XMLs. This review is automated source checking, not model execution or independent scientific reproduction.
