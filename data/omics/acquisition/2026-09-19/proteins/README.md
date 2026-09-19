# FLIP2 and PLINDER acquisition, 19 September 2026

This batch contains 323 source cells (320 numerical values) across 17 complete tables. It is a candidate acquisition batch, not a published catalogue release or an independent reproduction.

- FLIP2: Tables A1–A16, 16 distinct held-out dataset/split protocols, all nine methods and both metrics: 288 cells. One Spearman value is `nan`; one printed spread is `nan`. Original FLIP datasets are excluded. Supervised means are over five seeds; the inspected paper does not define the printed spread, which remains unreported rather than assumed to be SD.
- PLINDER: the complete Table 1 in *Improving Stereochemical Limitations in Protein–Ligand Complex Structure Prediction*, DOI 10.1021/acsomega.5c07675. Seven configurations and five metrics give 35 cells, of which two protein RMSDs are explicitly inapplicable. These are performance results on the paper's Plinder-L95 subset, not PLINDER dataset statistics. They must not be labelled as the original PLINDER assessment or a held-out-only test.

`candidates.jsonl` retains printed values, source URLs, hashes, locators, conditions, unknowns, and publication eligibility. `verification.json` records an automated cross-format check and scientific caveats. `sources.jsonl` pins acquired bytes; `ledger.jsonl` records successful and unsuccessful source attempts. Full source artifacts are cached outside the repository. Reacquisition is fail-closed on changed source bytes.

Run `python3 scripts/omics/acquisition/proteins.py --cache /tmp/rewire-audit-proteins --offline` to repeat extraction and checks from the pinned artifacts. Omit `--offline` to download missing artifacts. HTML with dynamic metadata can change on retrieval; a changed checksum requires a new explicitly reviewed source version rather than overriding the hash.

## Review limitations and conflicts

The extraction uses PDF layout text and XML. A separate parser checks all FLIP2 cells using raw PDF text, and PLINDER cells against publisher HTML. This checks transcription through different representations, not independently performed experiments or human review. Catalogue publication still requires graph mapping, source review, and compatibility checks.

FLIP2 Table A17 conflicts with detailed Tables A7, A14, A15 and A16. Four affected Spearman rows are marked `quarantined_source_conflict`. A17 is retained as evidence, never ingested as a second result. Its winner summaries must not be used to infer a leaderboard. Remaining tables are retained in full, including negative values and missingness.

PLINDER Table 1 combines training-era and later structures. Vina receives a ground-truth-centred search box, unlike the co-folding methods; the metrics are descriptive comparisons under different input conditions. The dataset size is 6,600, but per-method scored denominators and exact checkpoint hashes are not established and remain null. Angle RMSD aggregation is not defined by Table 1's footnote and remains unreported. Do not convert absent counts into complete scoring claims.

The original PLINDER paper's Table A12 was identified but its PDF retrieval was blocked. Its evaluations remain a separate gap; this paper-specific table does not substitute for that original assessment. No model inference or training was performed.
