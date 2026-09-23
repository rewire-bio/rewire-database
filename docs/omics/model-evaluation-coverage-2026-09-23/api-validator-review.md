# API validator follow-up

Passed independent read-only review. The root extractor schema did not enforce the live service's benchmark entity level or evaluation-origin enum. The new release-time `validateSnapshot(output.snapshot)` gate runs before the new archive and public-pointer writes, preventing that gap from reaching another release.

Seven new parent records needed classification:

- Suites: MIST CANOPUS fingerprint/retrieval assessment, Gene-MTEB, SegmentNT human annotation, MSAlign retrieval, scFoundation annotation across Zheng68K and Segerstolpe.
- Protocols: Enformer CAGE across-genes evaluation and GEARS Norman2019 CPA-control comparison. The latter has two metrics for one evaluation setup. Both keep `legacy_kinds: ["benchmark"]`, preserving earlier routes.

Explicit `unreported` is an honest evaluation origin when the comparator executor is unresolved. Accepting it does not label the result author-reported, independently evaluated, reproduced or complete. Missing and invented origin strings still fail validation.

The applied diff changes only these classifications and service validation behavior; source cells/numerical claims are untouched. The metadata review binds all seven classifications to existing primary source IDs and locators. Spec/record receipts were resealed.

Independent rerun: both model-coverage suites passed, **11 tests total**, including full 26,045-record live-service validation, sealed extraction, original result preservation, model/pipeline distinctions, routes and invalid origins. An earlier in-memory full-snapshot probe also revealed no additional validation errors after these same classifications. No blockers or additional hidden validator failure found.

No tracked files were edited by this reviewer. Earlier `FINAL.json` predates this metadata-only fix; its stored hashes should not be presented as hashes of these updated files.
