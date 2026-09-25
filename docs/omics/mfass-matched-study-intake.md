# MFASS matched-annotation v1 database intake

This release adds the four configurations from the completed, exploratory MFASS
matched-annotation study. It keeps the earlier MFASS results and releases intact.
The source study is pinned to rewire-benchmarks revision
`093fd1ae198c80ce34408d84d6543bca4fc538f2`.

All configurations use the same 8,297 scored variants from 8,324 held-out variants,
with 314 scored positives in 460 groups. The 27 blank predictions are not zeros:
23 are excluded for an hg19-to-hg38 assembly-orientation mismatch and four fall
outside the registered canonical transcript span. The latter are protocol scope
exclusions, not established faulty variants. These exclusions were identified in
label-free preflight; the later investigation explains them without changing the
scoring population or results.

[Upstream MFASS issue #1](https://github.com/KosuriLab/MFASS/issues/1) records the
assembly-conversion finding. Author confirmation is not established. The study
retains the exclusions while that issue is unresolved; corrected inputs would
require a new version and renewed verification.

The matched study uses one GENCODE 44 canonical transcript per gene, shared
annotation selection and reference FASTA, a 50-base distance, and separately
identified SpliceAI/Pangolin masking configurations. It must not be pooled with
historical MFASS specialist runs that used different annotations and coverage.

The original results received automated Claude review; exclusion investigation and
fresh coverage verification were computational Codex checks. None is an independent
human review or independent reproduction of a published model score. The new import
must preserve these distinctions and show exact source values and denominators.

Interpretation remains limited: test outcomes were inspected beforehand, nine
intervals are unadjusted, and matching annotation does not isolate architecture.
No top-100 precision difference is established; Pangolin's masked top-100 result
also depends on the registered tie order. Retaining exclusions does not establish
performance on the omitted variants or on the full benchmark population.

## Review and validation

The source study's [exclusion addendum](https://github.com/rewire-bio/rewire-benchmarks/blob/4be7a98e2553fa2378c29625b13eb3e8ac2e58fb/docs/mfass-matched-study-exclusions.md)
was merged in [benchmark PR #23](https://github.com/rewire-bio/rewire-benchmarks/pull/23).
A separate automated Codex reviewer checked the new importer and source snapshots,
including the raw/public manifest mapping recorded in the original provenance.
It found a missing task relationship; the final import adds a reviewed direct
MFASS task link while retaining the MFASS v2 protocol relationship.

The focused regression tests check exact values, fixed partial coverage, changed
source rejection, shared-population identity, separate comparison panels and
model/task visibility. The original complete-run importer still rejects partial
runs. This is an additive study-specific import, not a general relaxation of
submission review or coverage requirements.
