# Contributions service

A TypeScript/tRPC Firebase function for private contributions: submissions, curator review and notification email. Firebase Authentication handles contributor email-link sign-in, and Firestore holds only private collections. It is self-contained: the website imports nothing from it and it imports nothing from the website.

The public catalogue is not served here. The website's Next server answers `/api/trpc/catalogue.*` from the prepared release file its image embeds (`lib/catalogue-api.ts`), and the Cloudflare Worker routes every other `/api` path to this function.

No cloud project, billing account, database or email service is provisioned by these files. Firebase Functions deployment requires a billing-enabled project and is deliberately a separate decision.

## Local setup

Requirements: Node 22 or 24, Java 21+, npm. From this directory:

```sh
npm ci
npm run build
npm run test:emulator
```

The last command starts temporary Auth and Firestore emulators, runs all integration and contribution tests, and stops them. `npm test` alone runs validation tests and explicitly skips integration cases if emulator hosts are unset. Tests use a `demo-` project, so missing emulated services cannot fall back to production.

For interactive development, run these in separate terminals:

```sh
npx firebase emulators:start --project demo-rewire-omics --only auth,firestore
```

```sh
GCLOUD_PROJECT=demo-rewire-omics \
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 \
npm run dev
```

The service accepts both `http://localhost:8787/trpc` and `http://localhost:8787/api/trpc`. The website uses same-origin `/api/trpc`; use the repository's combined preview script to proxy requests to this local service. Set the site's Firebase configuration to the same project, its Auth emulator URL to `http://127.0.0.1:9099`, and its contribution-service URL to `http://localhost:8787/trpc`. `PUBLIC_WEB_URL` and `ALLOWED_ORIGINS` default to localhost; configure them explicitly for other local ports. Firebase emulator email links appear in its console and OOB-code endpoint; they are never actual deliveries.

The frontend calls Firebase `sendSignInLinkToEmail` / `signInWithEmailLink`, then sends an ID token using `Authorization: Bearer ...`. Server verification checks revocation and `email_verified`. Tokens remain Firebase-managed rather than stored by this service.

## Contribution and curator interface

- `submission.create({ contribution, idempotencyKey })`: verified user only; contribution follows `src/contribution.ts` (see `docs/omics/record-contract.md`) except email comes from the verified identity. Returns `{id,status}`. Use a fresh UUID for each distinct contribution and retain it across network retries.
- `submission.list({cursor?,limit?})`: that user's contributions, newest first, in cursor pages of up to 200.
- `submission.get({id})`: owned contribution, revisions and review notes. Other users receive “not found”.
- `submission.update({id,patch})`: append a revision while submitted or changes are requested. Type/email/ownership cannot be patched. Accepted, rejected, published and in-review records are locked.
- `curator.list({status?,cursor?,limit?})`, `curator.transition(...)`, `curator.proposal({id})`: require a Firebase `curator: true` custom claim. There is no public claim-granting endpoint.

Firestore rules deny all direct client access. Deploy `firestore.indexes.json` alongside the rules: contributor and curator queues select their newest/oldest records before applying the 200-record limit. Pagination beyond that initial limit remains future work. Only this service's Admin SDK accesses private collections. Curator notes are contributor-visible; do not place secrets or unrelated private information in them. Internal duplicate flags stay visible only to curators. The service never fetches contributor-provided URLs, follows redirects or accepts uploads.

Creation is idempotent and limited to 20 contributions per user per hour; updates are limited to 100 per hour. Limits are enforced transactionally. Access control and review transitions also execute within transactions. The API accepts at most 64 KB per request, including pre-parsed Firebase requests. Contribution details are limited to 24 KB of UTF-8 JSON and ten nesting levels; directly nested arrays are rejected because Firestore cannot store them. Cloud deployments additionally need Firebase Auth abuse controls and appropriate request/instance quotas; verified-email limits do not prevent attackers creating multiple accounts.

## Curation and release guard

Grant curator claims only through trusted Firebase administration. When removing curator access, also revoke refresh tokens so the server rejects already-issued privileged ID tokens immediately. Set `OMICS_ID_TOKEN` in the curator's process environment; never put it in command arguments or tracked files. Then:

```sh
npm run curator -- list submitted
npm run curator -- transition SUBMISSION_ID in_review 'Checking the source table.'
npm run curator -- transition SUBMISSION_ID changes_requested 'Please supply the evaluation split.'
npm run curator -- transition SUBMISSION_ID accepted 'Checked the source and extracted the contribution.'
npm run curator -- proposal SUBMISSION_ID
```

The proposal command is available only for accepted contributions. It produces a review proposal, not a catalogue record or automatic publication. Contributor identity fields are included only with explicit public-credit consent; email, UID and internal duplicate IDs are always omitted. Review user-entered prose for incidental personal data before moving it into the public Git release. Create public records and claims through the existing release workflow.

Mark an accepted contribution published once its records are in the live release:

```sh
npm run curator -- transition SUBMISSION_ID published 'Included in the reviewed release.' RELEASE_ID RECORD_ID
```

Publication requires an accepted contribution whose record IDs are active, of the submitted kind, in the release the public website serves now. The service checks this through the public `catalogue.get` procedure (`src/published-catalogue.ts`; `OMICS_CATALOGUE_ORIGIN` overrides the origin for tests). Submitted results must be source checked or reproduced; corrections must include their target record. Acceptance alone never marks a contribution published. Releases are built and published from rewire-benchmark-data; nothing is imported into Firestore.

Submission and curator lists return `{items,next_cursor}`. Pages default to 50 records and permit at most 200; the opaque cursor is bound to the owner or curator status filter. Ordering uses creation time plus document ID so equal timestamps cannot skip records. The contribution screen loads additional pages on request; `curator list [status]` drains every page before printing its JSON array.

## Contribution email outbox

Verification emails are handled by Firebase Auth. Submission receipts and review decisions are queued transactionally in private Firestore documents. No mail is sent unless an operator explicitly configures and runs the worker:

```sh
SMTP_HOST=127.0.0.1 SMTP_PORT=1025 npm run mail:drain
```

Use a local SMTP sink such as Mailpit for development. `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE`, `MAIL_FROM` and `PUBLIC_WEB_URL` configure delivery. Production requires TLS; credentials must be platform secrets, not public Firebase config. The worker claims messages transactionally, retries with exponential delay, uses stable message IDs and clears delivered recipient/body fields. Delivery is at least once: a crash after SMTP acceptance but before acknowledgement can deliver a duplicate with the same message ID. There is no marketing list or newsletter integration.

Before public activation, select the hosting and email provider, test real Firebase email-link delivery and expired/revoked-link behaviour, configure authorised domains, CORS and quotas, set Firestore TTL on `privateRateLimits.expiresAt`, arrange private backups/retention, and schedule the outbox worker. A configurable frontend alone is not evidence that these services are live.

## Deployment packaging

`src/functions.ts` retains the existing Firebase HTTPS function named `contributions` in `europe-west2`, capped at two instances. It serves the submission and curator procedures under `/api/trpc` (and `/trpc` for direct callers). `firebase.json` packages compiled `dist` files; run `npm run build` before any deployment. Deploy only after the separate hosting/billing decision. Do not deploy emulator environment variables. The service rejects emulator trust when `NODE_ENV=production`.

References: [Firebase email-link authentication](https://firebase.google.com/docs/auth/web/email-link-auth), [Admin token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens), [Firestore emulator](https://firebase.google.com/docs/emulator-suite/connect_firestore), [tRPC server adapters](https://trpc.io/docs/server/adapters).

## New hostname and activation gate

This review branch uses `https://benchmarks.rewire.it/contribute/` for production email callbacks. Before separately authorised activation, add `benchmarks.rewire.it` to Firebase Authentication authorised domains, set `PUBLIC_WEB_URL=https://benchmarks.rewire.it`, and set `ALLOWED_ORIGINS=https://benchmarks.rewire.it` on the standalone server. The Firebase Functions CORS allowlist already uses that origin. These are configuration instructions, not changes to any live Firebase project.

The deployed handler blocks submission/curator requests unless `OMICS_CONTRIBUTIONS_ENABLED=true`. The frontend additionally requires `NEXT_PUBLIC_OMICS_CONTRIBUTIONS_ENABLED=true`; it defaults off even when Firebase keys are present. Set it only in local emulator testing for this migration. No analytics components are mounted anywhere in this extracted application.

## Runner SDK contract

`src/sdk-sequence-reference.ts` and `test/sequence-fixtures/` are generated from rewire-benchmarks by `node scripts/omics/sync-runner-contract.mjs /path/to/rewire-benchmarks` (run from the website root). Builds never need a runner checkout.
