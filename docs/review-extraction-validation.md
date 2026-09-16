# Unpublished database extraction validation

Validated locally on 16 September 2026. This branch must not be deployed as part of the hosting migration.

- Independent frontend `npm ci`, 41 tests, lint, TypeScript and production build passed. The static export contains 1,312 pages. The same nonfatal Newsreader font-adjustment warning occurs in the baseline build.
- `npm run check:export` verified 1,192 record pages, all 100 historical paper routes, MFASS history, legacy downloads and release checksums. `/contribute/` remains disabled, no-referrer and analytics-free.
- Independent service `npm ci`, TypeScript build and all 20 Auth/Firestore emulator tests passed with Node 24 and Java 21; no tests skipped. Tests cover the new `/contribute/` callback and queued contribution links, private ownership, revisions, single-use sign-in links, expiration, retry handling and publication guards. No live emails were sent.
- Regenerating the migration inputs and release preserves every original data file and generated release byte, including release `2026-09-16-b5213be10a49`.
- Wrangler local HTTP checks returned 200 for the overview, model/result records, contribution route and archived MFASS v1. Unknown paths and blog-only paths returned genuine 404 responses.

Production submissions require a separate hosting/email decision, authorised Firebase domains, configured service origins and the explicit `NEXT_PUBLIC_OMICS_CONTRIBUTIONS_ENABLED=true` flag. All remain disabled during migration. The new website itself mounts no analytics.

The deferred profile plan is saved under `docs/plans/model-benchmark-profiles.md`. No profile rewrite, new scientific run, numerical claim changes or release-schema changes were introduced.
