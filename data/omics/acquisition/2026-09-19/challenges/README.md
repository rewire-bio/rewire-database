# Official challenge evidence acquisition, 19 September 2026

These are **candidates**, not automatically published catalogue results. Source transcription was checked by a second parser for every measurement. Exact method identities and protocol interpretation need separate scientific review; no participant code has been converted into a model family and no experiments were rerun.

## Reproduce offline

```sh
python3 scripts/omics/acquisition/challenges.py
```

The script reads pinned source bytes in `artifacts/`, rejects changed hashes, and regenerates `candidates.jsonl`, `ledger.jsonl` and `verification.json`. `--fetch` acquires missing artifacts only; it never silently replaces an existing snapshot. The 87 MB CAFA archive remains in `/tmp/rewire-audit-challenges/`; selected source members, the complete archive checksum and archive member locators are retained here. Compressed artifacts use deterministic gzip (`mtime=0`).

## Complete bounded comparisons

| Challenge | Boundaries | Metric rows | Unresolved context |
|---|---|---:|---|
| CASP16 | All 90 first submitted models for domain T1201-D1; GDT_TS, LDDT and TMscore | 270 | Group IDs are official participant identifiers; model families and other domains are not inferred. This is not a CASP-wide ranking. |
| CAPRI round 61 | All 100 predictor model-1 submissions across the four assessed interfaces; DockQ, fnat, L-RMS and i-RMS | 400 | Predictor/scorer tracks remain separate. Participant names are not software versions. First submission is not best-of-five. |
| CAMI II | All 16 marine pooled short-read gold-standard-assembly genome-binning rows, including the gold standard; 16 named accuracy/coverage metrics | 256 | Circular elements excluded. The gold standard is a reference, not predictive method performance. Source fields named Percentage are printed as fractions and retained as such. Other source columns retained verbatim in `conditions.raw_row`. |
| CAFA3 | All 146 submission IDs in each of three ontology sheets: `all_type1_mode1_all_fmax`; F1-max, source coverage and bootstrap companion values | 438 | Type1 means no-knowledge, established by archive README. Numeric mode1 to full/partial mapping is not explicit there and remains unresolved. Anonymous submission identity is retained. |

The acquisition ledger records every source and selection inventory. Sources and candidate rows preserve precise line/column locators and original strings, including trailing zeros. Bootstrap companion columns are preserved separately; no confidence interval is invented. CAPRI classification, exclusions and every selected source row are retained alongside metrics. Conditions differ between targets, ontologies, sample types and source protocols; do not pool them into a universal leaderboard.

CAFA3 archive README states CC-0 while its Figshare metadata states CC BY 4.0; both statements are retained. Other exports do not include a licence declaration; no licence claim is inferred. The CASP and CAPRI snapshots can change upstream, which is why hashes and retrieval date are part of each record.

Latest inspected official CAPRI page includes round 61, rounds 57/58 and pending rounds 59/60. CAFA3 is a historical primary-source batch, not the latest CAFA round. CAMI II is a historical pinned batch, not an assertion that CAMI III has no results.
