# Independent MIMIC and MSAlign source review

Status: no blocking findings in the reviewed 192 cells or their 488 generated records. Read-only review on 2026-09-23; no tracked edits.

## Numerical verification

- MIMIC Table S11 (HTML A4.T11): independently parsed all 12 methods × 7 task cells from pinned primary HTML. All 84 exact printed strings match specs and records.
- MSAlign Table 3: independently ran `pdftotext -layout`, parsed all 4 dataset/splits × 3 recall metrics × 9 methods, and visually inspected the complete PDF table on page 7. All 108 exact strings match, including `09.5` and `20.00`.
- Every result's printed/numeric value, metric, direction, unit, source ID/hash, uncertainty null and evaluation origin matched its specification. No uncertainty values are supplied by either table, and none were invented.
- MIMIC decompressed tracked source SHA-256: `6408e6fae37567837ca53bd8a1ebef6cf7d3787bbf00dae7556e1b62822ffff0`.
- MSAlign decompressed tracked source SHA-256: `7395a55141ee7916741b7d9e6d4f42a1d3a03217a36ce6824ac3ff48afd4f26f`.

## Scientific scope and identities

MIMIC Appendix D.3 explicitly says comparator performance was taken from prior work and not recomputed. Generated origins correctly distinguish 7 author-reported MIMIC cells from 77 paper-compilation comparator cells. Its register-token plus mean-pooled RNA features, supervised probe, validation-selected conditioning case and averaged predictions across modality subsets are retained. This is a pipeline using MIMIC, not a bare checkpoint evaluation. The additional codon/amino-acid inputs prevent a matched nucleotide-only claim. Existing broad DNABERT2/Evo2/NT family links use `uses_model`; no narrow checkpoint inference is added. The RNA-localization AUPR label remains source-specific and is not merged into the conflicting original mRNABench appendix.

MSAlign Section 5.1, 5.2 and Appendix A distinguish actual trained/evaluated baselines from prior published scores. The existing origin labels describe these as external-paper evaluations, not Rewire reproductions. All 24 protocol/panel scopes preserve the four dataset/splits, formula availability and three recall cutoffs. Formula split is separate from formula availability. Table values are explicitly percentages.

Candidate-pool caveat to retain: 256 mass-matched candidates are the default; MSAlign+Filter reduces this to approximately 100 by true-formula matching. MIST/FLARE also receive formula information, but this does not establish that their candidate pool is reduced identically. The current protocol names the filter-specific reduction correctly. Do not describe the formula-supplied panel as matched candidate pools. Current caveats make this nonblocking.

## Generated-record check and receipts

`buildCoverageTables()` was invoked read-only. All 488 records with the two reviewed prefixes are byte-equivalent as JSON to their generated counterparts. A whole-file comparison during concurrent integration also saw 351 newly added GlycanGT records not yet present in the stored file; this is outside the assigned scope and does not invalidate the matched reviewed records. Parent must regenerate the complete file and receipt after integration finishes.

- `cell-review.json`: all 192 source/spec comparisons.
- `record-review.json`: all 192 record-level checks, source hashes and reviewed input hashes.
- `review.py`: independent standard-library parser.
- `msalign-independent.txt`: fresh PDF extraction.
- `msalign-table3.png`: inspected source table rendering.

No source scores were recomputed; no graph digitization, model execution, private access or publication occurred.
