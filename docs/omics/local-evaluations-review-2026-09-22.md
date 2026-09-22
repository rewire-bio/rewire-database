# Review of ten submitted local evaluations

Review date: 22 September 2026. This review checks existing public execution artifacts and retained SDK acknowledgements. It performs no model inference, changes no curator state and publishes no scientific record. Review method: automated checks plus agent source review; no human scientific review is claimed.

## Disposition

All ten exact bundles match their pinned public artifacts and their retained private submission acknowledgements. Fresh read-only Firestore and Firebase Auth reconciliation at 21:19:57 UTC found ten unique submissions, all still submitted, no publication links, and a verified owner with curator permission. Exact source URLs and bundles matched the retained SDK queue. Operator authentication succeeded; this was not a new browser sign-in or SDK submission. The public report deliberately contains no private submission IDs, email addresses, credentials or idempotency keys.

All ten evaluations are now ingested for publication review in PR24. New immutable release `2026-09-22-f58a0f1d267f` adds 93 records, including ten evaluations and 29 metric rows, to the previous live release. The original five proposed evaluations and both earlier release archives remain unchanged. None was marked published by this review.

| Evaluation | Selected coverage | Result retained | Disposition |
|---|---:|---|---|
| [Amino-acid composition + fixed ridge (Rewire control)](https://raw.githubusercontent.com/rewire-bio/rewire-benchmarks/ca73fa47136d182f2d4ddb083d084712198fc0e2/research/local-runs-2026-09-20/flip2-composition/report.json) | 184/184 | spearman 0.41818225155801514 | PR24: ready for publication review |
| [Training mean (Rewire control)](https://raw.githubusercontent.com/rewire-bio/rewire-benchmarks/ca73fa47136d182f2d4ddb083d084712198fc0e2/research/local-runs-2026-09-20/flip2-train-mean/report.json) | 184/184 | spearman undefined | PR24: ready for publication review |
| [Sequence composition + RidgeCV (Rewire control)](https://raw.githubusercontent.com/rewire-bio/rewire-benchmarks/ca73fa47136d182f2d4ddb083d084712198fc0e2/research/local-runs-2026-09-20/mrnabench-composition/report.json) | 15003/15003 | spearman 0.49477537290902324, mse 1.914439715839851 | PR24: ready for publication review |
| [Training mean (Rewire control)](https://raw.githubusercontent.com/rewire-bio/rewire-benchmarks/ca73fa47136d182f2d4ddb083d084712198fc0e2/research/local-runs-2026-09-20/mrnabench-train-mean/report.json) | 15003/15003 | spearman undefined, mse 2.3655294722554605 | PR24: ready for publication review |
| [ESM-2 esm2_t6_8M_UR50D masked marginals](https://raw.githubusercontent.com/rewire-bio/rewire-benchmarks/ca73fa47136d182f2d4ddb083d084712198fc0e2/research/local-runs-2026-09-20/proteingym-esm2/report.json) | 2972/2972 | Spearman -0.209 | PR24: ready for publication review |
| [Protein composition + fixed ridge probe](https://raw.githubusercontent.com/rewire-bio/rewire-benchmarks/6d95ece86ef9851db916f49e81a581e306657377/research/baseline-programme-2026-09-21/rhomax/protein-composition-probe-v1.report.json) | 184/184 | spearman 0.41798958279508075 | PR24: ready for publication review |
| [ESM-2 35M frozen residue-mean embeddings + fixed ridge (Rewire)](https://raw.githubusercontent.com/rewire-bio/rewire-benchmarks/6d95ece86ef9851db916f49e81a581e306657377/research/baseline-programme-2026-09-21/rhomax-35m/esm2.report.json) | 184/184 | spearman -0.2217595033467806 | PR24: ready for publication review |
| [ESM-2 8M frozen residue-mean embeddings + fixed ridge (Rewire)](https://raw.githubusercontent.com/rewire-bio/rewire-benchmarks/6d95ece86ef9851db916f49e81a581e306657377/research/baseline-programme-2026-09-21/rhomax/esm2.report.json) | 184/184 | spearman -0.1463506755340845 | PR24: ready for publication review |
| [Training class prior / majority](https://raw.githubusercontent.com/rewire-bio/rewire-benchmarks/60dc51f972ca736f1b7f10e85a1db8cfa837bab9/research/mfass-null-2026-09-21/evidence/training-prior.report.json) | 8324/8324 | auroc 0.5, average_precision_sklearn 0.037842383469485825 | PR24: ready for publication review |
| [Seeded random ranking control](https://raw.githubusercontent.com/rewire-bio/rewire-benchmarks/bf3266e4cae93d9a5f9c51137fba2530f2503eb4/research/proteingym-null-2026-09-21/evidence/seeded-random.report.json) | 2972/2972 | Spearman 0.008 | PR24: ready for publication review |

Full metrics, source URLs, SHA-256 hashes, exact dataset/protocol identity, review status and limitations are recorded in [the public review table](../../data/omics/reviews/local-evaluations-2026-09-22.json). This table is a review inventory, not a catalogue release.

## Scientific scope and duplicate handling

- FLIP2 results share the complete 184-row Rhomax test split. Frozen ESM-2 8M and 35M are two checkpoints in one model family, each with the fixed train-only ridge head. Their negative correlations remain in the record.
- The original 40-feature composition control and the newer 22-feature control are different configurations; near-equal scores do not make them duplicate experiments. Repeated training-mean and repeated 22-feature verification runs are excluded from the ten.
- mRNABench evaluations cover the complete 15,003-row designed-target test split. The train-only RidgeCV procedure differs from upstream default validation evaluation. Undefined constant-control correlations stay null.
- Both ProteinGym evaluations cover one complete 2,972-variant AMFR assay. Their SDK status remains subset/partial, not a complete 217-assay track. The original observed-input-hash limitation remains explicit. One random draw does not estimate a chance-performance interval.
- MFASS uses the corrected assay-oriented v2 inputs and canonical 8,324-row held-out split. The training-prior control has AUROC 0.5; its AP equals test prevalence. Four positives in the first 100 come from one fixed, label-independent tie break, not ranking ability.
- No new confidence intervals, seed variability or cross-model significance claims were calculated. Pretraining overlap remains unreported for the ESM configurations. Source checking does not establish paper-score reproduction.

## Engineering correction and preservation

The previous PR24 CI failure came from a test reading the generated `public/omics/catalogue.json`. The corrected test reads the tracked, compressed pre-batch release instead. It still validates all new result links through the API query implementation and now works before any local export is generated.

This branch integrates database main `69891d572281a27b38aadb15df014381cf20221b`, preserving the merged contribution, UX and analytics changes. The original PR24 records and release archives are unchanged. Historical execution receipts remain dated history; their former statements that intake was disabled do not describe the current service. Intake was enabled independently in PR25; notification email is still paused.

## Repeat the checks

Verify pinned public artifacts without running a model:

```sh
python3 scripts/omics/review-submitted-runs.py
```

For an offline check, supply a runner checkout containing the exact referenced Git objects:

```sh
python3 scripts/omics/review-submitted-runs.py --runner-repo /path/to/rewire-benchmarks
```

An operator may add `--private-queue /private/path/to/queue` to compare retained SDK acknowledgements. This only reads local receipts and prints aggregate counts; it does not authenticate, submit, change review status or establish current live state.

Run offline regression tests:

```sh
python3 -m unittest discover -s scripts/omics/tests -p "test_*.py"
npx vitest run tests/omics-local-evaluations.test.ts tests/omics-baseline-run-ingestion.test.ts tests/omics-submitted-run-review.test.ts
```

## Release generation and post-release reconciliation

The new five records are generated by `scripts/omics/import-baseline-runs.py --runner-repo /path/to/rewire-benchmarks`; `scripts/omics/audit/baseline-runs.ts` creates field-bound audit checks. Both use existing source artifacts without inference. Reports are pinned to runner revision `1663d1f04b2bbd6dfcff77fea78129d30b0de191` only after verifying byte equality with their original submission sources. The ESM family links apply only to the two frozen ESM configurations. The ProteinGym random control has its own protocol and model-neutral dataset subset, with a source-checked same-data relationship to the original ESM assay record; it does not inherit masked-marginal instructions.

`npm run omics:release -- --current-only` generates the candidate release without restoring every archived export. This is for local review under disk constraints, not a production export. Normal builds restore all historical downloads and check their original hashes.

After independent review and successful CI, publication still requires the following ordered steps:

1. Deploy the approved release. Check the live website and API both serve release `2026-09-22-f58a0f1d267f`, and every `publication_record_ids` entry in the public review table resolves with the expected metric and source. Confirm the Firestore release is ready and has a publication timestamp.
2. Re-read the ten private submissions using the retained SDK acknowledgements. Join each queue entry to the public review table using the exact pinned report URL, verify the complete submitted bundle and unchanged ownership, and require the expected review state. Keep this mapping in private operator storage; do not copy submission IDs into Git or console output.
3. Obtain an explicit curator publication decision. With a current verified curator token, use the existing authenticated `curator.transition` API for each private item: `submitted` → `in_review` → `accepted` → `published`. For the last transition, pass the approved release ID and that evaluation's exact public evaluation/result IDs from `publication_record_ids`. Never create a new contribution or write curator state directly through Firestore.
4. Persist each transition acknowledgement privately. Before retrying, read current state: skip only an already completed transition whose release and record IDs match; stop on changed source, ownership, bundle or unexpected state. A request timeout does not prove failure.
5. Read each final owner and curator tracking response and verify all ten publication links. Keep issue #32 open until those checks pass. Publishing queues contribution notices, but email remains paused; do not claim delivery.

This review made zero curator writes. Its `not_published` statuses are a dated pre-publication record and must not be interpreted as a live tracking endpoint. No new model computation is needed for the remaining publication steps.
