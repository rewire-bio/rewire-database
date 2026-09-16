# Initial release validation

Checked locally on 16 September 2026. No publication or paid resources were provisioned.

Release `2026-09-16-b5213be10a49` contains 1,192 public records. These are linked entities, not 1,192 distinct models. Model and benchmark entries include paper-specific identities, families, tasks and suites. Alias reconciliation and checkpoint-level metadata remain explicit collection work.

## Data and website

- All 100 historical papers received recorded scope decisions. Three papers and their six result rows are excluded from the new catalogue; original compatibility files remain unchanged.
- All 149 legacy result IDs and original CSV fields are preserved. The 143 in-scope rows have fresh numerical source-check receipts. Source-printed formatting can differ from the historical CSV; both are retained.
- Twelve additional results cover the complete six-method fluorescence and stability tables in the pinned TAPE README. `python3 scripts/omics-research-verify.py` verified every value and the artifact hash.
- Twelve existing MFASS v2 metric rows were imported as existing rewire results. No model training, inference or new reproduction was performed.
- `npm test`: 94 tests passed, including 22 omics tests. Tests cover lossless migration, typed references, privacy rejection, quarantine, release determinism, biological extensions and conservative comparison eligibility.
- `npm run lint`: passed. `npx tsc --noEmit`: passed.
- `npm run build`: passed; 1,611 static pages generated across the website. Repeated successfully with the service dependency directory removed, confirming that website builds do not require Firebase Admin or the service installation.
- `npm run omics:check-export`: verified all 1,192 catalogue record pages, their catalogue/download links, all 100 historical paper URLs, the MFASS v1 report anchor, MFASS v2 page, corrected article and release checksums.

The new contribution page is noindex and no-referrer, and excludes analytics. Navigation into it reloads the document so scripts loaded on a public page do not persist into the private workflow. Production exports show that submissions are not open and offer a downloadable draft.

## Browser and service

Browser checks exercised search, source/detail navigation, correction prefilling and the disabled-service draft state. With local Auth/Firestore emulators and the TypeScript service configured, checks exercised email-link verification, draft restoration, private submission creation, saved revision history and sign-out. No live verification or contribution emails were sent.

The service passed 20 tests against the real Firebase Auth/Firestore emulators, including concurrent retries, expired tokens, private ownership, outbox leases and publication guards. Its TypeScript build passed. Setup is documented in `services/omics/README.md`. Production deployment, live email delivery, provider quotas, private backups/retention and a scheduled mail worker remain activation requirements. Passing local tests does not imply these services are running publicly.

## Limits

The discovery ledger covers all nine lanes in an initial pass, not an exhaustive publication or model census. Numerical source checks verify transcription and recorded context, not the validity of the original experiments or every metadata claim. Missing protocol fields block automatic comparisons; a source-checked badge is never an independent-reproduction badge. Broader evidence collection proceeds through the dated batches in `data/omics/research.md`.

## Unified catalogue navigation (16 September 2026)

The `/benchmarks/` landing page now contains the database explorer. The former database, domain and literature landing pages are compatibility routes. Literature opens the published-evaluations filter; 97 in-scope paper URLs open their source records, and three excluded paper URLs retain citation-only archive pages. MFASS v1 tables remain in an explicit archived report, linked from the preserved `#mfass-v1` anchor.

The full website suite passed 101 tests; the final focused run passed all 29 omics tests after moving the navigation tests into `tests/`. Browser checks verified the main catalogue, the legacy literature redirect, and separate filters for 155 published and 12 Rewire result rows. The new navigation preserves query parameters and requested fragments. Existing release records and checksums are unchanged.

The preview also exposed a font-variable scope issue: Next font classes now sit on the document element so the root typography tokens resolve correctly. The refreshed browser view uses the intended fonts.
