# Cells and networks acquisition, 19 September 2026

This is a staging batch, not a reviewed catalogue release. No models were run.

| Benchmark | Bounded extraction | Cells | Numerical values |
|---|---|---:|---:|
| BEELINE | Complete publisher source matrices for Figures 2, 4 and 5 | 600 | 588 |
| scIB | Complete human-pancreas block in official RNA metric export: all 69 configurations, all 14 metrics | 966 | 821 |
| Virtual Cell Challenge 2026 | Entire official validation leaderboard, overall-score column | 1,048 | 1,048 |
| PEtab | All 10 author-repository AMICI cost/gradient timing CSVs, all 20 problems and three timing columns | 600 | 600 |

Thirty-three exact source artifacts are retained as deterministic gzip files. `source-manifest.json` contains uncompressed SHA-256 hashes, original URLs and pinned versions. The gzip wrapper is storage only; the hash applies to the original source bytes. `acquisition-ledger.jsonl` includes failed retrievals as well as successful sources. Original full scIB RNA and ATAC exports are retained even though only the bounded pancreas comparison is extracted in this batch.

## Verification

Run from the repository root:

```bash
python3 scripts/omics/acquisition/cells-networks-extract.py
python3 scripts/omics/acquisition/cells-networks-check.py
```

Extraction uses Python's CSV reader. A separate checker resolves each locator using independent delimiter parsing and validates printed/numerical values, method and dataset associations, exact file identities, table completeness and missing values. It rejects a deliberately altered numeric transcription. Every candidate has a linked row in `transcription-checks.jsonl`; the receipt identifies the review as automated.

The check establishes transcription only. Candidate records remain `candidate-unreviewed`; it does not establish a model-family identity, prove scientific interpretation, clear source licences, constitute human review, or reproduce an experiment.

## Scientific boundaries

- **BEELINE:** Figures 2 and 4 are synthetic/curated simulation summaries. Figure 5 retains the exact reference network and gene-selection conditions. AUPRC ratios and early-precision ratios are not raw AUPRC or raw precision. Across-dataset stability in Figure 2 is a median top-k-edge-set Jaccard index, not Spearman correlation. Missing activating-edge values in Figure 4 remain missing. Source data for Figure 6 are archived but deliberately not imported as additional independent evidence because that figure summarises earlier analyses.
- **scIB:** Preprocessing, feature set and output representation remain separate. Metrics are raw exported values; no overall score or min-max transformation is invented. Higher-is-better direction of these exported scores is established by the pinned official consuming code in `scib-metric-directions.json`; it is not inferred from primitive metric names. Dataset metadata describes 16,382 cells, 9 batches and 14 labels; this is not asserted to be the scored denominator of every metric. Remaining dataset blocks and the ATAC export need separate reviewed extraction batches.
- **VCC:** Scores are a frozen provisional validation snapshot, not final test scores. All 1,048 entries identify `vcc2026-val-1` and carry the exact anchor version. Preserve submission IDs and team/model labels; do not turn a team into a verified model family. Only the overall column is extracted; six component metrics remain in the exact archived JSON. The site’s public JavaScript and server-rendered page corroborate its public API and 300-perturbation validation panel. Final results are not yet claimed. Member names in the public source JSON are not copied into candidate or audit tables.
- **PEtab:** The author repository explicitly describes code predating the formal PEtab.jl package. These are author-reported timing artifacts with incomplete timing units/scope, hardware and version metadata. They must not be charted as a comparison with the 2025 paper or treated as reproduction. The 2024 PLOS sensitivity paper and its Zenodo source archive were also checked: the paper's numerical table describes problems, while the archive contains code and figures, not raw performance arrays. Problem sizes were not misrepresented as benchmark scores, and no graph pixels were estimated.

These boundaries are recorded in `gaps.jsonl`. A later reviewer can clear specific limitations through linked checks without replacing this acquisition history.
