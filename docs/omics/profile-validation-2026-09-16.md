# Stage 1 validation receipt

Local review release: `2026-09-16-d74d282221a9` (1,227 public records). This receipt records software validation and automated source review, not independent model reproduction or human editorial approval.

- 226 model records and 170 benchmark/task records have validated profile coverage: 86 reviewed explanations, 310 explicitly limited by source extraction gaps.
- All 167 published result records are deeply equal to the historical release. Every result is reachable from its exact model and benchmark; BarcodeBERT's 78.5% accuracy retains its original printed value, configuration, dataset and Table 1 locator.
- 35 source-backed associations distinguish variants, aliases, suites and downstream pipelines. `uses_model` never rolls pipeline results into base-model performance.
- 54 frontend/data/rendering tests and 32 service tests passed. The service tests ran against Firebase Auth/Firestore emulators.
- Actual Firebase Hosting→Functions→Firestore checks passed for the full release: import/activation, release pinning, pagination, provenance, reciprocal links, public caching, private-field rejection and disabled private/mixed requests.
- Lint, TypeScript, production build and static-export checks passed. All 1,227 record-page links and 100 historical paper paths were checked. MFASS history, compatibility downloads and old release checksums remain intact.
- The original release is reconstructed on clean builds from preserved inputs and its tracked immutable manifest receipt. A mismatch aborts the build. Current pointers and release timestamps advance separately.
- Headless Chromium exercised search with URL filters, API result filtering, keyboard diagram disclosure and explicit API-failure states. Desktop 1440 px and mobile 390 px checks found no document overflow for BarcodeBERT model/result and Batch integration. No browser runtime errors occurred in the interaction checks. Mobile diagram text was enlarged after screenshot inspection.

Preview uses only the `demo-rewire-omics` emulator project at `http://127.0.0.1:5055`. Contributions stay disabled. No production deployment, new model computation, hosting resource or live email was activated.

Review remains necessary for the 310 documented content gaps. Source-checked numerical transcription does not verify unextracted architecture, licensing, training data or protocol details. See the model and benchmark research receipts for per-record evidence and limitations.
