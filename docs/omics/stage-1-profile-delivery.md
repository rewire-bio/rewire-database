# Stage 1: API-backed model and benchmark profiles

Prepared 16 September 2026 for local review. This document describes the review-branch implementation, not a production deployment receipt.

## Delivered scope

The enrichment covers all **226 model records and 170 benchmark/task records** in the agreed inventory. There are **86 source-reviewed explanatory profiles and 310 limited profiles with documented evidence gaps**: 46 reviewed / 180 limited model profiles and 40 reviewed / 130 limited benchmark profiles. These counts do not mean that 396 architectures and protocols have been fully researched.

The pilot explanations include BarcodeBERT, DNABERT-2, SpliceAI, Pangolin, ESM-2, ESMFold, scGPT, RNA-FM, mRNA-FM, Boltz, MFASS, ProteinGym, scIB and batch integration. Supporting files record primary sources, retrieval hashes, evidence locations and unresolved details. See [model research](https://github.com/rewire-bio/rewire-benchmark-data/blob/main/docs/reviews/2026-09-16-model-profiles.md) and [benchmark research](https://github.com/rewire-bio/rewire-benchmark-data/blob/main/docs/reviews/2026-09-16-benchmark-profiles.md).

Model pages explain the supported architecture or algorithm and link to exact evaluated configurations. Benchmark pages distinguish tasks, suites, protocols and evaluators, describe procedures and expose the associated results. Result pages link directly to their model, benchmark, dataset and source. Diagrams include text alternatives; proposed designs and incomplete paper outlines are labelled as such.

Source-supported associations permit navigation through families and suite membership without merging scientific identities. Pipelines using a base model remain separate evaluated entities. Existing scores, historical IDs and archived releases are preserved. No new benchmarks were executed and no composite ranking was introduced.

## API and publication behaviour

The website's TypeScript/tRPC service provides release metadata, catalogue search, record details, relationship navigation, results and compatibility checks. Public catalogue reads do not require authentication and remain available when contributions are disabled. Private submissions and curator actions retain their authentication and ownership checks.

The runtime path is **Firebase Hosting → same-origin `/api/trpc` → Firebase Function → published Firestore release**. Browser search, filters and result tables use release-pinned API requests. Loading, empty and failure states must remain visible; a failed API response must not silently substitute another release.

For static, indexable HTML, the build uses the **same catalogue query engine** against the reviewed release snapshot in Git. It does not query a live Firebase project or require cloud credentials. This build adapter is deliberate: the browser's interactive data path still uses the API, while a clean website build remains reproducible. CSV and JSONL are static release exports.

Reviewed records and enrichment produce a new immutable release. An operator imports it, verifies integrity and explicitly activates it. Partial imports remain private; activation changes the active pointer atomically. Previously published releases remain available for pinned requests and rollback. Public catalogue rollback must not restore or overwrite private contribution state.

## Local review

Use Node 22 or 24 and Java 21 or newer. These commands come from the service's [local setup and import instructions](../../services/omics/README.md) and the root combined-emulator configuration. Run them from the repository root. Install dependencies only if needed:

```sh
npm ci
npm --prefix services/omics ci
npm run build
npm run preview:stack
```

The final command keeps Firebase Hosting, Functions, Auth and Firestore emulators running. Hosting listens at `http://127.0.0.1:5055`; the hosting rewrite provides the same-origin API. In a second terminal, import and activate the release **in the demo project**:

```sh
export GCLOUD_PROJECT=demo-rewire-omics
export FIRESTORE_EMULATOR_HOST=127.0.0.1:8085
export FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099

npm --prefix services/omics run import-release -- \
  ../../public/omics/catalogue.json ../../public/omics/manifest.json

PROFILE_RELEASE_ID="$(node -p 'require("./public/omics/catalogue.json").release_id')"
npm --prefix services/omics run import-release -- --activate "$PROFILE_RELEASE_ID"
```

Keep those environment variables confined to this terminal; do not deploy them. The `demo-` project prevents missing emulator services from falling back to production. Leave contribution activation unset. Importing a public catalogue does not enable submissions or send email.

Review these paths on port 5055:

- `/` for API-backed search and filters.
- `/database/model/reported-model-05103f72325fe5/` for BarcodeBERT and its linked result.
- `/database/result/b2-barcodebert-2026/` for the exact configuration and genus-level 1-NN evaluation.
- `/database/benchmark/catalog-task-cell-batch-integration/` for conceptual scope and distinct scIB/Open Problems resources.
- `/database/benchmark/rewire-mfass-v2/` for corrected protocol context and historical links.

Rebuilding after changing enrichment can create a different release ID. Import and activate that same new release before reviewing the rebuilt pages. A static-only Hosting preview does not provide a working Firestore-backed API.

## Acceptance and remaining gates

The content inventory and source-reference validation are complete for this batch. The 310 limited profiles intentionally preserve unresolved methods or architecture details; finishing that research remains a visible backlog, not an implied success from a reviewed numerical cell.

Acceptance checks for this implementation include:

- Stable pagination, filtering, exact model identity and reciprocal result navigation.
- Release pinning, partial-import rejection, activation, rollback and private-data separation.
- No automatic comparison when protocols, datasets, splits, metrics, inputs or provenance are incompatible or unknown.
- Source locators, coverage labels and preserved historical result values and checksums.
- Mobile and keyboard behaviour, diagram alternatives, failed API requests and empty states.
- Website tests, lint, TypeScript, service emulator tests, production build and export/link checks.

Run the relevant checks using the repository commands:

```sh
npm test
npm run lint
npm run typecheck
npm --prefix services/omics run build
npm --prefix services/omics run test:emulator
npm run build
npm run check:export
```

Stop the interactive emulators before running the service emulator test command to avoid port conflicts. Test pass counts and final browser observations must be recorded in the PR or a dated validation receipt after the final release is generated; this document alone does not certify that every acceptance check passed.

All source review in this batch is explicitly automated. It does not imply human editorial review, independent experimental reproduction, clinical validation, a complete training-data audit or universal model superiority. Existing numerical review states are unchanged.

Production publication remains gated on migration completion and review of this database work. This stage does not provision paid infrastructure, deploy the backend, activate submissions or configure live email delivery. Retain the currently published baseline until the reviewed application and its matching release are ready for a coordinated rollout.
