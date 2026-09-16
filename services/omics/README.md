# Omics catalogue and contributions service

A TypeScript/tRPC service for published catalogue queries and private contributions. Reviewed Git releases remain the publication history. Firestore serves published releases to the website; static profile HTML is generated from the same pure query contract against a pinned release. CSV and JSONL remain downloadable exports. Firebase Authentication handles contributor email-link sign-in. This is the website's application API, not a separate public REST platform.

No cloud project, billing account, database or email service is provisioned by these files. Firebase Functions deployment requires a billing-enabled project and is deliberately a separate decision.

## Local setup

Requirements: Node 22 or 24, Java 21+, npm. From this directory:

```sh
npm ci
npm run build
npm run test:emulator
```

The last command starts temporary Auth and Firestore emulators, runs all integration and validation tests, and stops them. `npm test` alone runs validation tests and explicitly skips integration cases if emulator hosts are unset. Tests use a `demo-` project, so missing emulated services cannot fall back to production.

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

## Catalogue queries

Catalogue reads need no sign-in. The public procedures are:

- `catalogue.release({release_id?})`: release metadata, coverage and browse facets; omitting the ID resolves the active published release.
- `catalogue.list({release_id,kind?,q?,area?,status?,origin?,cursor?,limit?})`: stable, ID-ordered browsing. Limits are 1–100, default 25; cursors are tied to the release and filters.
- `catalogue.get({release_id,id})`: record, direct/reverse relationships and source records, including profile citations. Missing records return null.
- `catalogue.results({release_id,id,metric?,origin?,configuration_id?,cursor?,limit?})`: exact evaluated configurations, linked models/benchmarks/datasets, provenance, review status, evaluation counts and filter facets.
- `catalogue.compare({release_id,ids})`: compatibility reasons for 2–20 result IDs. Missing conditions, copied evidence, different protocols, datasets or metrics prevent automatic comparison.

The website pins every request to its generated release. The pure query contract lives in `src/catalogue-query.ts`; both the Firestore adapter and the build-time snapshot adapter use it. Family and task aggregation requires explicit source-checked association claims. Pipelines using a model remain separate, and aliases retain their historical detail URLs.

Imports prepare compact serving chunks and record-integrity hashes. A warm service instance coalesces concurrent loads and caches at most three immutable releases, building reverse and evaluation indexes once per snapshot. A cold request reads release metadata and its compact chunks rather than one Firestore document per displayed row. The active pointer is resolved afresh; published historical releases remain addressable after rollback. Successful public GET batches have short public cache headers; private, mixed and error responses are `no-store`. There is no persistent third-party search service.

## Contribution and curator interface

- `submission.create({ contribution, idempotencyKey })`: verified user only; contribution follows `docs/omics/record-contract.md` except email comes from the verified identity. Returns `{id,status}`. Use a fresh UUID for each distinct contribution and retain it across network retries.
- `submission.list()`: that user's contributions, newest first, currently capped at 200.
- `submission.get({id})`: owned contribution, revisions and review notes. Other users receive “not found”.
- `submission.update({id,patch})`: append a revision while submitted or changes are requested. Type/email/ownership cannot be patched. Accepted, rejected, published and in-review records are locked.
- `curator.list({status?})`, `curator.transition(...)`, `curator.proposal({id})`: require a Firebase `curator: true` custom claim. There is no public claim-granting endpoint.

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

Import a reviewed release, then explicitly activate it for public queries:

```sh
npm run import-release -- ../../public/omics/catalogue.json ../../public/omics/manifest.json
npm run import-release -- --activate RELEASE_ID
npm run curator -- transition SUBMISSION_ID published 'Included in the reviewed release.' RELEASE_ID RECORD_ID
```

The importer validates the schema, cross-record references and source/evaluation types, then verifies the manifest's `catalogue_sha256` or `files["catalogue.json"]` hash. Same-ID releases are immutable; identical reimports are safe. Partial imports remain in `staging`; the same import can resume after its 15-minute lease expires. A release becomes `ready` only after every record and serving chunk is written. Import completion alone does not publish it. Activation validates records and chunk integrity, then atomically records publication and switches `cataloguePublication/active`. Use the same `--activate PREVIOUS_RELEASE_ID` command to roll back; previously published pinned releases remain available. Private submissions are unaffected. Marking a contribution published requires an accepted contribution and active record IDs of the submitted kind in an explicitly published release. Submitted results must be source checked or reproduced; corrections must include their target record. Acceptance alone never marks a contribution published. The curator must import the released dataset and confirm its public availability before marking contributions published; the service does not probe the live website.

Only server operators run release imports using Admin credentials. Source-reviewed JSONL in Git remains authoritative; Firestore mirrors are disposable and rebuildable. Preserve private submissions separately when restoring or changing the active public release. Do not roll back private contribution state when rolling back static catalogue files.

## Contribution email outbox

Verification emails are handled by Firebase Auth. Submission receipts and review decisions are queued transactionally in private Firestore documents. No mail is sent unless an operator explicitly configures and runs the worker:

```sh
SMTP_HOST=127.0.0.1 SMTP_PORT=1025 npm run mail:drain
```

Use a local SMTP sink such as Mailpit for development. `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE`, `MAIL_FROM` and `PUBLIC_WEB_URL` configure delivery. Production requires TLS; credentials must be platform secrets, not public Firebase config. The worker claims messages transactionally, retries with exponential delay, uses stable message IDs and clears delivered recipient/body fields. Delivery is at least once: a crash after SMTP acceptance but before acknowledgement can deliver a duplicate with the same message ID. There is no marketing list or newsletter integration.

Before public activation, select the hosting and email provider, test real Firebase email-link delivery and expired/revoked-link behaviour, configure authorised domains, CORS and quotas, set Firestore TTL on `privateRateLimits.expiresAt`, arrange private backups/retention, and schedule the outbox worker. A configurable frontend alone is not evidence that these services are live.

## Deployment packaging

`src/functions.ts` retains the existing Firebase HTTPS function named `contributions` in `europe-west2`, capped at two instances. That function serves both catalogue and contribution procedures under `/api/trpc` (and `/trpc` for direct callers); Firebase Hosting forwards `/api/**` to it. `firebase.json` packages compiled `dist` files; run `npm run build` before any deployment. Deploy only after the separate hosting/billing decision. Do not deploy emulator environment variables. The service rejects emulator trust when `NODE_ENV=production`.

References: [Firebase email-link authentication](https://firebase.google.com/docs/auth/web/email-link-auth), [Admin token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens), [Firestore emulator](https://firebase.google.com/docs/emulator-suite/connect_firestore), [tRPC server adapters](https://trpc.io/docs/server/adapters).

## New hostname and activation gate

This review branch uses `https://benchmarks.rewire.it/contribute/` for production email callbacks. Before separately authorised activation, add `benchmarks.rewire.it` to Firebase Authentication authorised domains, set `PUBLIC_WEB_URL=https://benchmarks.rewire.it`, and set `ALLOWED_ORIGINS=https://benchmarks.rewire.it` on the standalone server. The Firebase Functions CORS allowlist already uses that origin. These are configuration instructions, not changes to any live Firebase project.

Catalogue GET procedures work independently of contribution activation. The deployed handler blocks submission/curator requests unless `OMICS_CONTRIBUTIONS_ENABLED=true`, and mixed public/private batches cannot bypass that gate. The frontend additionally requires `NEXT_PUBLIC_OMICS_CONTRIBUTIONS_ENABLED=true`; it defaults off even when Firebase keys are present. Set it only in local emulator testing for this migration. No analytics components are mounted anywhere in this extracted application.
