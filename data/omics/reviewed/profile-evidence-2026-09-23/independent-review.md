# Independent profile and protocol evidence review

Date: 2026-09-23. Automated independent source review; not human scientific review and not model execution. No tracked edits.

## Root DNA, ESM and RNA patches

**Pass after the two requested corrections.**

1. DNABERT-2 long-input evidence is in Section5.4, Results on GUE+, not Section5.5. The source explicitly evaluates 5,000–10,000-base inputs after fine-tuning. Parent corrected the locator and text; the evidence does not establish frozen zero-shot extrapolation.
2. The ESM extraction and RNA-FM loader source `artifact_url` values initially pointed to GitHub HTML while hashes represented raw Python bytes. Parent changed these to the pinned raw.githubusercontent URLs; public GitHub URLs can remain as `url`.

Verified directly:

- DNABERT-2 PDF title page carries `arXiv:2306.15006v2 [q-bio.GN] 18 Mar 2024`. Its unversioned retrieval therefore produced the claimed v2 artifact. The PDF hash matches the source record.
- DNABERT-2 700bp pretraining statement is in Section5.4. Section4.1 and Table11 support the human/135-species corpus statement without a deposition-date guarantee. Section5.2 Further Pre-Training and Table3 explain the diamond variant's additional GUE-training-set MLM fitting.
- DNABERT-2 registry revision and `pytorch_model.bin` LFS SHA-256 match the saved registry JSON exactly. These are publisher-reported metadata, not locally computed weight hashes.
- ESM2 registry revision and `model.safetensors` LFS SHA-256 match saved registry JSON. Its 650M name identifies one released configuration, not every family result.
- ESM extraction defaults to1022 residues and passes the configurable value into the batch converter. It is a workflow default, not a universal validated sequence ceiling.
- Official ESM README lists UR50/D2021_04 for every ESM2 row. A corpus release date is not automatically a latest-deposited-sequence date or a leakage guarantee.
- RNA-FM PDF title page is arXiv2204.00300v5. Methods p22 calls the deduplicated23.7M corpus RNAcentral100; it is not a numbered dated database release.
- RNA-FM loader lines155–162 call an author-server download without a published revision/digest. The code revision does not pin downloaded checkpoint bytes.
- RNA-FM README's final licence section explicitly covers source code. Its Related RNA Language Models table also gives generic MIT in the RNA-FM row alongside a weights link. Recommended qualification: acknowledge that generic label while leaving exact checkpoint-distribution terms unverified; do not imply the table is absent. Parent accepted this wording and reports official HF access failed.
- Every new root source's local artifact hash matched. Existing ESM README, RNA README and RNA paper hashes match their existing catalogue IDs.

The loader review found no mutation of scientific record IDs, result values or non-profile attributes. It limits new records to unique source IDs, binds patches to previous-profile hashes, validates profile source references and checks manifest file hashes. This is integrity checking, not proof of scientific correctness; that remains the source review's role.

## ProteinGym and MFASS protocol patches

**Pass.** Every retrieval receipt matched its saved bytes.

ProteinGym:

- Independently summed all217 DMS reference rows:2,465,767 total assay-variant records using DMS_total_number_mutants. This is reference coverage, not complete-model coverage.
- Primary paper XML S22/S45 supports random/contiguous/modulo split descriptions. S45 explicitly lists F7YBW8_MESOW and SPG1_STRSG as four-mutated-position exceptions; the patch does not invent their exact alternate fold count.
- Zero-shot source code groups by UniProt and selection category, centers against the highest aggregate metric model, bootstraps10,000 times within categories, equally combines categories and reports sample SD of bootstrap differences. The supervised scorer defaults to ProteinNPT and similarly centers differences. These are not absolute per-model confidence intervals or training-seed variation.
- Current public catalogue has234 results attached to ProteinGym-related sources and none has non-null result.attributes.uncertainty. No existing absolute-SE metadata mislabelling was found to repair. No values should be changed based on this protocol review.
- Local AMFR report explicitly has subset scope, partial_track,1/217 complete assays,2972/2972 selected-assay variants and empty suite metrics. Its data-verification field says local bytes hashed, not independently source verified; independently_reproduced=false.

MFASS:

- README source values:32669 raw rows,27733 eligible variants,1050 positives,2185 eligible exons versus2198 before filtering. Assay-oriented pairs are170 bases and differ at rel_position−1;7770 reverse-complement cases explain v1's window defect.
- Canonical split manifest and TSV match:19409 train/735 positives/1127 groups;8324 test/315 positives/463 groups; seed20260914,200 draws, requested test fraction0.3. TSV SHA-256 matches.
- Comparison JSON denominators match all patch values:SpliceAI8194 scored/common,454 groups; Pangolin8301,461 groups; DNABERT2 8324,463 groups; baseline8324.
- All three comparison artifacts report2000 paired group draws and0 skipped single-class draws. Code computes the observed candidate-minus-baseline point estimate and2.5/97.5 percentile intervals; capacity varies proportionally to resampled sample size. No absolute method CI is implied.
- DNABERT2's frozen embeddings, reference-plus-delta feature construction and balanced L2 headC=0.1 are explicitly documented. Specialist genomic-context inputs are correctly distinguished from assay-sequence inputs.
- The split-v2 manifest retains `benchmark=mfass-v1`; the patch correctly preserves and explains that legacy label while retaining the canonical split hash and corrected baseline identity. It does not equate split-v1 and split-v2.

No additional scientific blockers found in the reviewed protocol patches.
