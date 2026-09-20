# Sequence benchmark runner 0.4 integration

This reviewed recipe batch connects three existing benchmark pages to the
expanded local runner. It adds instructions and source evidence, not scientific
result rows. Existing recipes remain available, including upstream DART and
mRNABench instructions for tasks beyond the runner's coverage.

| Benchmark page | Maintained protocol | Bounded support |
|---|---|---|
| `discovery-benchmark-flip2` | `flip2-fitness-v1` | Seven datasets, 16 archived Zenodo v3 splits; each evaluated separately |
| `discovery-benchmark-dart-eval` | `dart-eval-task1-zero-shot-v1` | Task 1 regulatory elements against existing paired shuffled controls; scalar zero-shot scores only |
| `discovery-benchmark-mrnabench` | `mrnabench-sample-mrl-v1` | Four Sample MRL datasets, six target columns; sequence-only inputs |

Each page receives two recipes: rescore supplied predictions and generate
predictions with a local adapter or lightweight control. Rescoring includes
Python, command-line, Podman, Apptainer and Slurm examples. Container examples require
preparation and image acquisition first, then mount data read-only and keep
outputs separate. The runner's HPC guide supplies site-specific Slurm resource
selection. No private code, weights, sequences or predictions are uploaded.

## Evidence and execution claims

Every new recipe cites the pinned runner guide, implementation and source
manifest. The database stores file hashes and locators for all source records.
Automated validation receipts are separate evidence records:

- FLIP2: native CPU smoke examples on all 16 source-verified splits, with eight
  rows per split partition; metric expressions extracted from the actual pinned
  evaluator agreed within `1e-12`.
- DART: statistical reference checks on synthetic score differences, including
  historical SciPy handling of ties and zeros. Official biological inputs remain
  inaccessible without authentication; no full official execution is claimed.
- mRNABench: all four source files and six target splits checked; small probes
  compared with actual pinned upstream classes. Agreement tolerance `1e-9`.

All three Python control snippets were also executed verbatim on local small inputs
on 20 September 2026; each produced a smoke/partial report. The recipe review
records snippet hashes and coverage. This does not validate the checkout, image
construction or cluster-specific commands.

Rendered snippets remain labelled `source_reviewed_not_executed`. A related receipt
does not certify a command that was not executed. Small source-data probes do
not reproduce a published model evaluation.

## Scientific limits

FLIP2's archived assignments conflict with manuscript counts for Amylase and
NucB. IRED's split counts also disagree with its printed total. Preserve the
archive and explain these discrepancies; never silently invert or repair a
split. PDZ3 inputs retain the protein:peptide delimiter and missing partner.

DART input authenticity and complete pair denominators have not been verified.
User-provided local hashes establish integrity only. Its toy demo is synthetic
and cannot be used as biological evidence. Zero-shot scoring, probing and
fine-tuning remain distinct procedures.

mRNABench uses complete processed sequences, preserving reporter context. It
does not supply the additional tracks used by some published configurations.
Missing target values are excluded before the pinned split, with original and
eligible denominators retained. Dataset reuse conditions remain unknown where
the publisher reports them as unknown.

No new scores, benchmark associations, scientific schema or public API are
introduced by this recipe batch. Historical releases and existing result values
remain unchanged. SDK contribution contracts are validated separately and
production submissions remain disabled.

## Publication sequence

Runner revision: `fcccbbcdbe3d5cd64a1a312d536615273320f7b4`. Source file hashes and recipe input hashes have been refreshed from this revision. The portable contribution contract and fixtures are copied into the API repository; builds do not require a runner checkout.

Run recipe/schema tests and the full release validation before generating the
new immutable database release. The reviewed release must pass the normal
website build, API checks and static-export validation before deployment.

## Validation record

- Runner PR #7 merged after all four environment checks passed, including native, Podman and Apptainer parity.
- Python: 392 tests passed. API: 248 tests passed with local Auth and Firestore emulators, including the shared contribution fixtures.
- Website: 420 tests passed; lint passed. Production export verification follows the build.
- Release `2026-09-20-b2596bdf5206` adds 15 source records and recipes to exactly three existing benchmark records. No result, evaluation or dataset record changed; all 402 audit artifact hashes match the previous release.
- Production contributions remain disabled. Numerical validation and container parity are implementation checks, not publication of new model results.
