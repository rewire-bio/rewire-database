# Extraction integrity review, 19 September 2026

All 17 comparison-table batches were re-extracted from locally available primary
artifacts whose SHA-256 digests match the pinned sources. The machine-readable
review is `data/omics/reviews/2026-09-19-extraction-recheck.json`. This was an AI
source-transcription review, without human sign-off or execution of the scientific
benchmarks. No existing numerical value or scientific record ID was changed.

## Corrections

ProteinBench had silently lost 16 measurements because their cells included a
percent sign. Table 6 reports these AAR and PHR values; both columns now have
percentage units and comparison panels. Values remain on the printed percentage
scale, without dividing by 100.

| Method | AAR (%) | PHR (%) |
| --- | ---: | ---: |
| RAbD (natural) | 100.00 | 45.78 |
| HERN | 33.17 | 39.83 |
| MEAN | 33.47 | 40.74 |
| dyMEAN | 40.95 | 42.04 |
| dyMEAN-FixFR | 40.05 ± 1.06 | 43.75 ± 2.24 |
| DiffAb | 35.04 ± 8.36 | 40.68 ± 10.65 |
| AbDPO | 31.29 ± 7.29 | 69.69 ± 8.49 |
| AbDPO++ | 36.25 ± 7.95 | 44.51 ± 9.55 |

The Table 6 caption defines the spreads for marked methods as standard deviations
between antibodies generated against the same antigen. Table 7's three break-rate
metrics explicitly use `(%)` in their headings; their 28 existing mean/median
results now also use percentage units. ProteinBench increases from 540 to 556
results. The `N/A` cell for EigenFold peptide-bond breaks remains absent rather
than being split at its slash. Source: [ProteinBench v1, Tables 6–7](https://arxiv.org/html/2409.06744v1).

TDC's pinned v1 Table 4 reports plus-or-minus spreads, but its table caption and
inspected text do not define their statistical meaning. The 66 results retain
their numerical values and spreads; the uncertainty type is now
`reported_plus_minus_type_unresolved`. The protocol no longer claims standard
deviations or repeated runs. This does not assert that the spreads are *not*
standard deviations; it records the limit of the available source evidence.
Source: [TDC v1, Table 4](https://arxiv.org/pdf/2102.09548v1).

DART-Eval's 91 Pearson/Spearman results now use `correlation` rather than
`fraction`. Values and higher-is-better directions are unchanged.
Source: [DART-Eval v1, Tables 5–6](https://arxiv.org/html/2412.05430v1).

The other 14 batches, including BEACON, reproduced their committed records
byte-for-byte. BEACON was regenerated with its original review date for this
comparison. Its source explicitly reports mean and sample standard deviation;
its uncertainty labels were retained. ProteinGym's bootstrapped standard errors
appear in supplementary tables outside the current extraction; they were not
mislabelled in the current results, which contain no uncertainty values.

## Extraction checks

All eight PDF extractors now use `extract/pdf.ts`, including the legacy BEACON
entry point. The helper verifies the PDF hash before conversion, passes those
exact bytes to `pdftotext` over standard input, and records the converter version,
arguments, input digest and output digest in the extraction receipt. The new
single-path invocation is:

```bash
npx tsx scripts/omics/extract/tdc.ts /path/to/pinned.pdf
```

The earlier `<text> <pdf>` invocation remains valid only if the supplied text is
byte-identical to freshly generated text. Mismatches fail before records are
written. Run extractors from a separate workspace containing
`data/omics/reviewed/` and `data/omics/reviews/` when comparing proposed outputs;
these commands otherwise replace the current input batch and receipt.

The verified HEST PDF produces Poppler recovery diagnostics. These are retained
in its receipt. Its old cached text differs from the regenerated full document,
so the legacy invocation is correctly rejected; direct PDF extraction still
reproduces all 100 committed HEST results exactly. No claim is made about tables
outside the extractor's scope.

Unknown numeric cells and malformed uncertainty now stop extraction. Only
explicit missing markers produce a null cell. Percent signs require an explicit
percentage unit, and spreads no longer default to standard deviation. HEST,
PerturBench and ProteinBench explicitly select standard deviation based on their
source captions.

ProteinBench checks every table's block count, row count, column count and metric
header count, rejects short rows and populated unlabelled columns, and requires
556 numeric measurements. Mean/median cells require both positions unless the
source explicitly marks the entire cell missing.

## Validation

The extraction test suite covers modified legacy text, incorrect PDF hashes,
failed converters, transformation receipts, truncated tables, malformed cells,
percentage units and source-defined uncertainty. The 17-batch recheck preserves
source hashes and previous/new batch digests. Historical release artifacts are
not rewritten by these corrections; publication must create a new release.
