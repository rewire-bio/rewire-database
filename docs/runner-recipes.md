# From a result to a local evaluation

This change connects exact evaluations to understandable protocols, access requirements and local execution instructions. The runner is maintained separately in `rewire-bio/rewire-benchmarks`; the database build consumes reviewed metadata only and never executes a model.

## Reviewed release

The additive input under `data/omics/reviewed/run-recipes/` is pinned to runner revision `f80cef7f818bec33e51b7f43ad499eb5078c8d87`. The source table records nine exact documentation/implementation files, full-file SHA-256 hashes, Git revisions and retrieval dates. The receipt hashes both the additional records and the overlays. The release builder rejects drift and restricts overlays to recipe metadata and its sources; it cannot use this input to replace scores, protocol links or old records.

The draft release is `2026-09-17-b9bc163c8ab1`, with 4,199 public records. All 1,434 existing result records remain identical to the preceding `2026-09-17-d277315f7d76` release. Existing evaluation fields remain identical apart from explicitly added recipe applicability and supporting source links. Previous release manifests and download bytes are retained.

| Coverage | Included |
| --- | --- |
| MFASS v2 | Score supplied predictions, corrected k-mer baseline, frozen DNABERT-2 example |
| ProteinGym | New explicit v1.3 zero-shot DMS substitution protocol, prediction scoring and ESM-2 8M example |
| Exact evaluation links | Four MFASS v2 evaluations link to their shared scoring procedure; specialist genomic inference is not relabelled as assay-sequence inference |
| Other top-level benchmarks | All 30 retain their reviewed official documentation; missing maintained recipes and unextracted access requirements remain visible |
| Broader results/evaluations | Direct model/configuration, dataset, protocol, split and scorer context, with an explicit gap where exact recipe applicability has not been reviewed |

No historical ProteinGym evaluation is automatically attached to the new v1.3 protocol. Similar names do not prove matching track, split, release, inference method or score aggregation.

## Public interfaces

Existing record envelopes, API procedures and historical fields remain unchanged. Optional `attributes.run_recipes` belongs to evaluation-design records. Each recipe has a protocol/version, scientific purpose, input/output requirements, access/licensing/software/hardware notes, cited runtime snippets and limitations. Runtime execution claims require a separately pinned receipt identifying platform and scope.

Optional `attributes.reproduction` belongs to an exact evaluation, names the recipe owner and recipe ID, and cites why its applicability is valid. The validator rejects links to an unrelated protocol or a recipe with a different purpose. These links do not change the evaluation's scientific review status. Their claims and code instructions also appear in the downloadable evidence table.

Pages offer a recipe selector, runtime selector, copy control, private-model template and concrete protocol links. MFASS's prior upstream instructions remain available in a disclosure, with their original source-review status. Existing `#run` anchors are retained. Task pages without concrete execution instructions explain that a task is a question, not an executable protocol.

The 16 new Python/shell snippets were syntax checked and reviewed against the pinned code. They are deliberately labelled source reviewed, not executed, because the complete displayed commands and user input directories have not all been exercised here. The runner repository separately records its actual native smoke tests and container-scoring validation. Neither a runnable example nor container parity establishes independent reproduction of published scores.

## Contributions

The existing verified-email queue accepts a sanitized runner bundle under `details.rewire_bundle`. It has an explicit allowlist, positive/reconciled coverage, protocol-defined numeric metrics, pinned ProteinGym assay identities/counts, bounded depth, pinned hash/revision provenance and mandatory unreviewed status. Smoke outputs, raw row predictions, arbitrary paths and credentials are rejected. The data-verification declaration does not upgrade a contribution's review status.

Production submission and email switches remain disabled. A configured local contribution session can copy a fresh Firebase ID token for the library. Tokens never enter the DOM, draft exports or catalogue. The library submits only when explicitly called; curator acceptance and reviewed release publication remain separate. See [the submission contract](runner-contributions.md).

## Validation

- 165 website/data tests cover exact recipe relationships, source pins, missing metadata, rendering, immutable historical values and API compatibility.
- 60 service tests pass using Auth and Firestore emulators, including ownership, retries, verified identity, review/publication boundaries and private-data exclusion.
- The optional `services/omics/test/python-sdk.integration.ts` harness exercises the actual Python SDK against local emulators: preview without submission, authenticated creation, deterministic retries, pending-review status, safe disabled-service errors and redacted invalid-token errors. Set `REWIRE_SDK_PYTHON` to an environment containing the reviewed library; normal builds do not depend on another checkout.
- Browser checks cover 18 desktop/mobile layouts across MFASS, ProteinGym, all four result origins, an evaluation and the disabled contribution page. Runtime/recipe selection, clipboard, keyboard disclosure, no horizontal overflow and no page errors pass.
- Run lint, type checking, independent service compilation, the production build and export checks before publication. Public deployment is a separate action.

Local preview: `http://localhost:3027/database/protocol/rewire-mfass-v2/` and `http://localhost:3027/database/protocol/rewire-proteingym-v1-3-dms-substitutions/`. The site is static-first; interactive catalogue API queries require the documented local Firebase stack or a separately activated matching release. Recipe selection and copy controls do not require a live API.
