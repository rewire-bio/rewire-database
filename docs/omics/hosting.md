# Hosting decision: Firestore and a small TypeScript service

Pricing checked 16 September 2026 against [Firebase pricing](https://firebase.google.com/pricing) and [Firestore quotas](https://firebase.google.com/docs/firestore/quotas).

Host the benchmark website, application API, Firebase Auth and Firestore in one Firebase project. Firebase Hosting serves static profile HTML and forwards `/api/**` to the `contributions` Function in europe-west2. That existing function now serves both public catalogue queries and private contribution operations. Keep Google Cloud DNS; the blog remains a separate Cloudflare deployment. Browser search, filtering and result-table requests use release-pinned tRPC queries backed by published Firestore releases. Builds use the same query engine against the reviewed Git snapshot without live credentials. CSV/JSONL downloads remain static.

Firestore Standard currently includes 1 GiB storage, 50,000 document reads/day, 20,000 writes/day and 20,000 deletes/day in its no-cost allowance. Import costs include record documents, integrity metadata and compact serving chunks. A cold service instance reads release metadata and serving chunks, builds relationship indexes and caches immutable releases; warm requests avoid per-row document reads. Catalogue traffic therefore does incur database usage, and its cost depends on cold starts, cache lifetime and request volume. Retained releases, backups, egress and abuse can add cost; this is not a zero-cost guarantee.

Firebase Functions requires Blaze (billing enabled), even when usage fits its no-cost allowance. The implementation uses one HTTP function in europe-west2 with minInstances 0 and maxInstances 2. An instance limit is not a monetary cap. Build artifacts, networking and a production contribution-email provider have separate charges/quotas. Firebase authentication email quotas also need checking for the selected project before launch.

Recommended activation sequence:

1. Complete migration and review; verify the selected project, region, quotas and owner-approved billing limits. A site build must not provision infrastructure.
2. Configure the catalogue function and private Firestore access, import a checked release and explicitly activate it. Verify the same-origin API and release-pinned browser interactions before deploying the matching static website.
3. Keep contribution operations disabled. Public catalogue queries do not require Firebase sign-in or contribution activation; browser Firestore access remains denied.
4. Separately prepare contribution email-link authentication, authorised domains, CORS, private backups/retention, rate-limit TTL and transactional email. Test actual delivery and ownership flows before enabling submissions.
5. Retain the previously published release for atomic pointer rollback; preserve private contribution state during public catalogue rollback.

The application uses the useful parts of a T3-style stack (Next.js, TypeScript, tRPC and schema validation) without scaffolding a second website, adding Prisma/Postgres, or adding another hosting provider for this application. Bigtable is not selected: this is a small evidence/curation application, not a large distributed wide-column workload.

## Unified repository configuration

The root `firebase.json` owns Hosting, Functions, Firestore rules/indexes and local emulators. The service-local config remains only for isolated service tests. Install dependencies at both root and `services/omics`; use `npm run preview:stack` for the local application. `npm run deploy:stack -- --project PROJECT_ID` deploys the reviewed components together only after production review and backend activation are approved. Do not deploy this unpublished branch during the migration. See [Firebase deployment](../hosting/firebase.md).
