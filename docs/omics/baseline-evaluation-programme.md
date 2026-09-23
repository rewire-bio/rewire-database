# Baseline and model evaluation coverage

The baseline programme starts with an exact-record audit. Its outputs are planning and navigation aids, not a claim that all benchmarks have working adapters or measured baselines.

## Current and historical inventories (23 September 2026)

| Source | Protocols | Suites | Model records | Models, configurations, pipelines, methods and services | Measured baseline roles | Selection outstanding | Historical roles |
|---|---:|---:|---:|---:|---:|---:|---:|
| Previous live release `2026-09-20-b2596bdf5206` | 180 | 30 | 59 | 2,442 | 1 | 357 | 2 |
| Archived PR24 proposal `2026-09-20-370b30415b09` | 183 | 30 | 59 | 2,447 | 5 | 359 | 2 |

| Current published release `2026-09-22-f58a0f1d267f` | 184 | 30 | 59 | 2,452 | 7 | 359 | 2 |

Each protocol has two rows: null and conventional. The two historical rows belong to superseded MFASS v1 and are not new execution targets. There are 77 protocols without explicit suite membership. Sharing a task or a name is not sufficient evidence to assign membership.

The current published release includes all ten reviewed local evaluations. MFASS v2 now has both its corrected conventional baseline and training-prior null control. The selected FLIP2 Rhomax and mRNABench designed MRL protocols have null and conventional references; FLIP2 links both the 40-feature and 22-feature composition configurations. ProteinGym's seed-0 random control is linked only to its exact AMFR random-control protocol, not the separate ESM masked-marginal protocol. One assay is not full ProteinGym coverage, and one random seed is not a chance-performance interval.

The seven measured roles link eight distinct baseline evaluations. The model matrix includes 14 exact identities with published Rewire results (four earlier identities and ten newly published identities). ESM frozen-embedding probes remain evaluated models, not conventional null controls. Author-reported evaluations and execution recipes are displayed separately from published Rewire measurements. Private and unpublished evaluations are deliberately absent.

The two earlier audit directories are retained byte-for-byte as historical snapshots. Their original prospective label describes their state on 20 September, not the status of the evaluations now published. The current audit is version 2, with recipe IDs and published evaluation IDs grouped by evidence origin. It does not alter the scientific release or its records.

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
5. Export and submit future evaluations through `rewirebench.submit()` using the separate authenticated coordinator. The ten previously submitted evaluations are already published; do not resubmit or count them as new evidence. Publication remains reviewed.
6. Record new accepted evaluations in a new scientific release, then regenerate coverage against that release.

No new benchmark execution, source verification or SDK upload is claimed by this implementation. Remaining gaps are protocol-specific. A recipe or a proposed control does not fill a measured-evidence gap.

## Validation

Focused tests cover two-role completeness, historical records, exact-evidence gates, external-origin rejection, quarantined results, explicit membership and cycles, no name deduplication, no pipeline result transfer, zero-shot suggestions, determinism, source/export hashes, safe CSV and rendered result links. The pinned main inventory is asserted in tests.

The current-main integration retains the new section navigation and comparison UI. Baseline coverage sits inside the How to run section; native details/summary controls and descriptive links remain keyboard accessible. Tests verify current-release mappings, source-origin separation, empty states, unchanged record bytes, and release-pinned downloads. Existing comparison tests cover filters and chart/table parity. Browser visual checks on this integration have not been performed because the desktop is locked. Earlier desktop/mobile checks apply only to the earlier PR head. Full build and static-export validation run in CI before publication.

Local verification on the integrated head: all 525 tests (53 files), lint and TypeScript checks pass. This includes 20 baseline audit/rendering tests and the current comparison, navigation and execution UX tests. The current sidecar is regenerated deterministically from the published compressed catalogue. No scientific record or historical release/archive file changed.
