# Baseline and model evaluation coverage

The baseline programme starts with an exact-record audit. Its outputs are planning and navigation aids, not a claim that all benchmarks have working adapters or measured baselines.

## Frozen inventories

| Source | Protocols | Suites | Model records | Models, configurations, pipelines, methods and services | Measured baseline roles | Selection outstanding | Historical roles |
|---|---:|---:|---:|---:|---:|---:|---:|
| Main release `2026-09-20-b2596bdf5206` | 180 | 30 | 59 | 2,442 | 1 | 357 | 2 |
| PR24 prospective release `2026-09-20-370b30415b09` | 183 | 30 | 59 | 2,447 | 5 | 359 | 2 |

Each protocol has two rows: null and conventional. The two historical rows belong to superseded MFASS v1 and are not new execution targets. There are 77 protocols without explicit suite membership. Sharing a task or a name is not sufficient evidence to assign membership.

The main release contains the measured corrected MFASS conventional baseline. Its four existing Rewire evaluated configurations are included in the model matrix. The prospective PR24 inventory additionally includes four sequence controls on the selected FLIP2 Rhomax and mRNABench designed MRL protocols, and an ESM-2 evaluation on one ProteinGym assay. Neither the selected protocols nor the five evaluations establish full suite coverage. Prospective data remain separate; this change does not publish PR24.

## Files and scientific boundaries

`data/omics/baseline-coverage/<release>/` contains:

- `coverage.json`: complete protocol-role inventory, explicit suite membership and exact model identities.
- `protocol-baselines.csv`: status, candidate-selection rule, blockers, dataset and evaluation links, result IDs and evidence locators.
- `model-evaluation-matrix.csv`: every model/method/configuration/pipeline/service record, declared version, linked evaluations, explicit proposed tests, source IDs, access facts and outstanding compatibility/identity checks.
- `suite-coverage.csv`: coverage of explicit member protocols; suites without members require an inventory pass.
- `sources.csv` and `sources.json`: resolvable source IDs, original URLs, versions, retrieval dates, hashes and review status.
- `manifest.json`: source catalogue checksum, publication status, generator checksums and output checksums.

Candidates produced by selection rules are labelled **not reviewed**. The rules only guide the next source review. A source attached to a protocol is contextual evidence, not evidence that the suggested baseline is valid. Exact measured mappings require accepted Rewire-origin evaluation records, direct protocol membership and accepted result records. No numerical values are copied or transformed by this audit.

Model records are not deduplicated by name. Source-checked association claims identify family, variant, alias and pipeline relations; those relations do not transfer evaluation results or establish checkpoint equivalence. Access statements retain their original review status. Resources, checkpoint verification and private submission state require separate checks. A literature evaluation is not a Rewire run, and a Rewire run is not proof it was uploaded through the package.

## Generate and verify

Normal `npm run omics:release` generates the current public sidecar after producing the catalogue. The static UI derives its status from that same catalogue. `npm run check:export` checks every generated audit file against the source catalogue and generator.

For an existing catalogue without reconstructing all historical exports:

```sh
npm run omics:baseline-coverage -- \
  --source public/omics/catalogue.json \
  --output public/omics/baseline-coverage \
  --publication-status published_release \
  --sha256 EXPECTED_CATALOGUE_SHA256
```

A pinned `.json.gz` catalogue is also accepted. For prospective branch data, use `--publication-status prospective_review` and an output directory under `data/omics/`; never point prospective output at the public directory. The generator refuses mismatched source checksums and refuses to overwrite a different audit at the same output path. A changed audit must use a new version/output location. Previous scientific releases and hashes remain untouched.

The audit is deterministic: release dates come from the snapshot, ordering is stable, and no wall-clock timestamps, private paths or contributor data enter exports. CSV text is escaped against spreadsheet formula interpretation.

## Next execution batches

1. Verify protocol definitions, required datasets/splits, input information and current upstream evaluator revisions before approving baseline candidates.
2. Implement null and conventional roles in the benchmark runner. Verify applicability separately for zero-shot, historical and information-rich protocols.
3. Select complete matched tasks across model families, with checkpoint/access and resource checks. Keep expensive or unavailable models explicitly queued.
4. Run native and Nextflow validation, then complete affordable evaluations with manifests and coverage.
5. Export and submit through `rewirebench.submit()` using the separate authenticated coordinator. Keep stable identities for the five PR24 evaluations. Publication remains reviewed.
6. Record new accepted evaluations in a new scientific release, then regenerate coverage against that release.

No new benchmark execution, source verification or SDK upload is claimed by this implementation. Null controls for MFASS and ProteinGym remain outstanding even though their runner supports scoring.

## Validation

Focused tests cover two-role completeness, historical records, exact-evidence gates, external-origin rejection, quarantined results, explicit membership and cycles, no name deduplication, no pipeline result transfer, zero-shot suggestions, determinism, source/export hashes, safe CSV and rendered result links. The pinned main inventory is asserted in tests.

The 17 focused audit tests and 17 existing recipe/entity UI tests pass. Local lint and TypeScript checks pass. A local Next.js preview served the MFASS protocol and FLIP2 suite pages with the baseline section; all four linked audit downloads returned HTTP 200. The baseline section and its navigation were visually checked at desktop size and a 390-pixel mobile viewport. Full static export requires restoring more than the available local disk budget; it must run in CI before publication. Do not report a production build or deployment as verified until that completes.
