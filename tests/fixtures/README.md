# Website regression fixtures

These fixtures test historical rendering and browsing contracts without importing the producer or its archives. Normal website tests consume the pinned prepared `public/omics/catalogue.json`.

- `profile-hierarchy.json`: selected unchanged records from release `2026-09-17-d277315f7d76`, including the original 59 model profiles, tested configuration records, association claims, and transitive cited records. Keeps exact diagram, result, and profile hierarchy assertions. This is a projected test snapshot; its inherited coverage totals describe the original complete release.
- `legacy-browse.json`: original public migrated/discovery result records plus their linked evaluation/model records. Preserves the original exact 155 literature results, 12 Rewire results, and provenance/search assertions.
- `unresolved-source-identity.json`: seven synthetic records from the original source-identity guard fixture, transformed once with the original producer. Tests unresolved identity rendering; generator guards remain in producer tests.

- `legacy-coverage-ids.json`: the original 30 benchmark IDs from release `2026-09-20-b2596bdf5206` and 765 comparison-panel IDs from `2026-09-22-f58a0f1d267f`. Retains the exact historical navigation/comparison assertions while the transport test additionally round-trips every panel in the current prepared catalogue.
- `source-label-identities.json`: the original synthetic ATOM3D/HEST reviewed-source fixture, prepared once by the producer. Preserves exact identity-search expectations in a fixed graph while production releases can add further configurations matching the same names.

Fixtures were extracted from the pre-split code and data at `e13852a`. They are test inputs, never production data or downloadable releases. No fixture regeneration runs during website tests.

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `legacy-browse.json` | 913894 | `3c8fbbbddcec2475badb52fbc9316a7a9bf37936589e1956fe0e787027db625b` |
| `legacy-coverage-ids.json` | 34120 | `62c395f9ac563edb1acee791a09bb67763d3b1f1c19adb1d55459299889d3612` |
| `profile-hierarchy.json` | 2779862 | `54ce2b95ecfb593261cf01ab198113e621c0dafca21f1a74e7a8d6b51b7c8048` |
| `source-label-identities.json` | 552543 | `c1fd93cef96702493f6c6134a2e6c1242069f75a439a8accf161569e488b149e` |
| `unresolved-source-identity.json` | 5464 | `d14ac55665796b1459e28bdc3d76ee519686cfa3e3caa9f1d0ac740ee56f8848` |
