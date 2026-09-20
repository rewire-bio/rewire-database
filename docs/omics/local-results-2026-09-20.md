# Five local benchmark evaluations

This additive batch submits five new Rewire evaluations for catalogue review. It does not activate public submissions or deploy the catalogue.

The public evidence is pinned to [rewire-benchmarks revision ca73fa47136d182f2d4ddb083d084712198fc0e2](https://github.com/rewire-bio/rewire-benchmarks/tree/ca73fa47136d182f2d4ddb083d084712198fc0e2/research/local-runs-2026-09-20). The runner evidence is submitted separately in [PR #8](https://github.com/rewire-bio/rewire-benchmarks/pull/8).

| Selected evaluation | Configurations | Scored records per configuration | Scope |
|---|---|---:|---|
| FLIP2 Rhomax `by_wild_type` | Composition + fixed ridge; training mean | 184 | Complete archived test split; wavelength target in nm |
| mRNABench Sample designed | Composition + RidgeCV; training mean | 15,003 | Complete canonical target test split |
| ProteinGym v1.3 AMFR | ESM-2 8M masked marginals | 2,972 | Complete selected assay; no train/test split; partial track |

The batch adds 48 records: five configurations, three protocols, three dataset subsets, five evaluations, 15 metric rows, 13 sources and four association claims. It preserves every existing record. The ProteinGym negative correlation is retained. Undefined constant-control correlations remain unavailable, not zero. No seed variability or confidence intervals were estimated.

Two charts compare only matched local controls: FLIP2 NDCG and mRNABench MSE. The other metrics remain in the results tables. Source-backed protocol membership makes the new results reachable from their benchmark suites. The exact ESM-2 configuration is separately linked to the existing ESM-2 family.

## Evidence and verification

`data/omics/reviewed/local-runs-2026-09-20/` contains the reviewed JSONL, copied sanitized reports and execution audits, and a hash-bound review receipt. The source records identify exact public artifact hashes and immutable Git URLs. The evidence also records the five SDK submission dry runs: network access was blocked and no API submission occurred. The same five bundles pass the TypeScript submission validator.

All 15 result rows are `source_checked` with evaluation origin `rewire_run`. This records source transcription and local execution, not reproduction of a previous model score or human review. Dataset download hashes are not upgraded to independently published checksums. ProteinGym's original `subset`/`partial` report status is preserved alongside completion of its selected assay.

The append-only audit table adds 48 checks. Numerical checks are bound to precise fields and source fingerprints. Other checks establish record structure and provenance, not blanket verification of upstream training-data claims.

Private inputs, weights, predictions and machine paths are excluded. The execution artifacts retain local file hashes; public reproduction requires obtaining permitted inputs and rerunning the pinned scripts. Recipe snippets use illustrative paths and are labelled source-reviewed rather than claiming verbatim execution.

## Regeneration

Run the importer against an inspected checkout of the pinned evidence and the successful SDK dry-run receipt:

```sh
python3 scripts/omics/import-local-runs.py PATH_TO_EVIDENCE \
  ca73fa47136d182f2d4ddb083d084712198fc0e2 \
  --reviewed-at 2026-09-20T20:54:03Z \
  --submission-receipt PATH_TO_DRY_RUN_RECEIPT
npx tsx scripts/omics/audit/local-runs.ts
npm run build
```

The importer rejects failed execution checks. Release ingestion rejects overwritten IDs, modified reviewed files, mismatched coverage, changed numerical or printed values, unsupported reproduction flags and unpinned source versions. Existing historical releases are not regenerated from these new inputs.

## Validation

The proposed release is `2026-09-20-370b30415b09`: 21,929 public records, with all 21,881 earlier records unchanged. Its 407 archived artifacts pass their recorded checksums. All 13 immutable public evidence URLs were fetched and their hashes verified.

- Website: 426 tests passed; lint, type checking and production build passed.
- API: 219 tests passed; 29 emulator-dependent tests were skipped. All five actual sanitized submission bundles also passed the TypeScript validator. No live API submission occurred.
- Export: 21,929 record pages, local links, 100 historical paper pages, MFASS history and historical downloads passed validation. Contributions remain disabled.
- Browser: 31 page/viewport checks passed across all 15 result pages and the five configuration/three protocol pages on desktop and mobile. No JavaScript exceptions or horizontal overflow; metric text, methods/source links, clipboard contents and keyboard focus checked. Both control charts rendered two marks. This was a local static-export check, not live API or deployed-site validation.

The catalogue PR is the submission. Merge and deployment are separate publication steps.
