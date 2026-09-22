# Review of ten submitted local evaluations

Review date: 22 September 2026. This review checks existing public execution artifacts and retained SDK acknowledgements. It performs no model inference, changes no curator state and publishes no scientific record. Review method: automated checks plus agent source review; no human scientific review is claimed.

## Disposition

All ten exact bundles match their pinned public artifacts and their retained private submission acknowledgements. The previously recorded owner and curator reconciliation contains the same ten unique identities. This pass did not make a fresh authenticated live request. The public report deliberately contains no private submission IDs, email addresses, credentials or idempotency keys.

The original five evaluations are ready for publication review in PR24 after its engineering checks pass. The five newer evaluations have consistent source evidence but need their own reviewed catalogue records and release ingestion. They are not included by this branch. None is currently a public catalogue result.

| Evaluation | Selected coverage | Result retained | Disposition |
|---|---:|---|---|
| [Amino-acid composition + fixed ridge (Rewire control)](https://raw.githubusercontent.com/rewire-bio/rewire-benchmarks/ca73fa47136d182f2d4ddb083d084712198fc0e2/research/local-runs-2026-09-20/flip2-composition/report.json) | 184/184 | spearman 0.41818225155801514 | PR24: ready for publication review |
| [Training mean (Rewire control)](https://raw.githubusercontent.com/rewire-bio/rewire-benchmarks/ca73fa47136d182f2d4ddb083d084712198fc0e2/research/local-runs-2026-09-20/flip2-train-mean/report.json) | 184/184 | spearman None | PR24: ready for publication review |
| [Sequence composition + RidgeCV (Rewire control)](https://raw.githubusercontent.com/rewire-bio/rewire-benchmarks/ca73fa47136d182f2d4ddb083d084712198fc0e2/research/local-runs-2026-09-20/mrnabench-composition/report.json) | 15003/15003 | spearman 0.49477537290902324, mse 1.914439715839851 | PR24: ready for publication review |
| [Training mean (Rewire control)](https://raw.githubusercontent.com/rewire-bio/rewire-benchmarks/ca73fa47136d182f2d4ddb083d084712198fc0e2/research/local-runs-2026-09-20/mrnabench-train-mean/report.json) | 15003/15003 | spearman None, mse 2.3655294722554605 | PR24: ready for publication review |
| [ESM-2 esm2_t6_8M_UR50D masked marginals](https://raw.githubusercontent.com/rewire-bio/rewire-benchmarks/ca73fa47136d182f2d4ddb083d084712198fc0e2/research/local-runs-2026-09-20/proteingym-esm2/report.json) | 2972/2972 | Spearman -0.209 | PR24: ready for publication review |
| [Protein composition + fixed ridge probe](https://raw.githubusercontent.com/rewire-bio/rewire-benchmarks/6d95ece86ef9851db916f49e81a581e306657377/research/baseline-programme-2026-09-21/rhomax/protein-composition-probe-v1.report.json) | 184/184 | spearman 0.41798958279508075 | Needs reviewed catalogue ingestion |
| [ESM-2 35M frozen residue-mean embeddings + fixed ridge (Rewire)](https://raw.githubusercontent.com/rewire-bio/rewire-benchmarks/6d95ece86ef9851db916f49e81a581e306657377/research/baseline-programme-2026-09-21/rhomax-35m/esm2.report.json) | 184/184 | spearman -0.2217595033467806 | Needs reviewed catalogue ingestion |
| [ESM-2 8M frozen residue-mean embeddings + fixed ridge (Rewire)](https://raw.githubusercontent.com/rewire-bio/rewire-benchmarks/6d95ece86ef9851db916f49e81a581e306657377/research/baseline-programme-2026-09-21/rhomax/esm2.report.json) | 184/184 | spearman -0.1463506755340845 | Needs reviewed catalogue ingestion |
| [Training class prior / majority](https://raw.githubusercontent.com/rewire-bio/rewire-benchmarks/60dc51f972ca736f1b7f10e85a1db8cfa837bab9/research/mfass-null-2026-09-21/evidence/training-prior.report.json) | 8324/8324 | auroc 0.5, average_precision_sklearn 0.037842383469485825 | Needs reviewed catalogue ingestion |
| [Seeded random ranking control](https://raw.githubusercontent.com/rewire-bio/rewire-benchmarks/bf3266e4cae93d9a5f9c51137fba2530f2503eb4/research/proteingym-null-2026-09-21/evidence/seeded-random.report.json) | 2972/2972 | Spearman 0.008 | Needs reviewed catalogue ingestion |

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
npx vitest run tests/omics-local-evaluations.test.ts tests/omics-submitted-run-review.test.ts
```

## Remaining work

1. Finish independent code/scientific review and CI on the integrated PR24 branch; then decide separately whether to publish its five evaluations.
2. Add reviewed, exact configuration/protocol mappings for the remaining five and prepare their immutable release, retaining their existing evidence identities.
3. After each accepted release is actually deployed, verify live tables and links, then associate the matching private review items with the released IDs. Never mark them published based only on a merged runner PR.
4. Keep issue #32 open until all ten have an explicit final reviewed/published/blocked disposition. No new computation is needed for these steps.
