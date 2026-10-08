# Independent frontend and GitHub downloads

Cloudflare serves all rendered pages and their JavaScript assets, including result and
evaluation details. Pages are generated only from the current reviewed data pin. Old
download releases do not create additional rendered page versions.

The Worker forwards `/api/` directly to the existing Firebase Functions service. Firebase
Functions, Firestore and Auth remain responsible for live catalogue queries, filtering,
evidence, use cases, audits and private submissions. Auth helpers use the fixed Firebase
auth domain independently of website Hosting. The frontend does not fall back to Firebase
Hosting for pages, chunks or scientific downloads.

Download links target publicly accessible gzip files in rewire-bio/rewire-benchmark-data at
the full commit in benchmark-data.lock.json. The verified producer manifest determines
each exact source path; appending `.gz` to an arbitrary public path is not sufficient.
Old `/omics/` and literature download URLs redirect to those same pinned GitHub files.
Missing files return 404. Existing scientific checksums describe decompressed bytes;
download acceptance gunzips before comparing them. No release assets or scientific records
are rewritten by this migration.

`npm run data:prepare` verifies the producer manifest and regenerates the ignored download
inventory before rendering or Worker bundling. A stale inventory fails rather than linking
another revision. Publication carries a small deployment.json receipt with frontend
commit, data repository/revision, release ID and manifest digest. release-manifest.json
contains the checked current scientific metadata. Neither file contains submissions or
credentials.

## Publication

Build and publisher always hydrate current artifacts only. Historical archive expansion,
runner SDK stripping and Firebase Hosting publication are removed from the automatic path.
The publisher restores checked frontend bytes, verifies source freshness and the live base,
and captures the current public API release without Google credentials.

- A frontend-only release uploads Cloudflare assets and verifies them without Google auth
  or Firestore writes.
- Backend code/config changes deploy Functions and private Firestore rules/indexes with
  the existing operational state receipt. Frontend deployment scripts and root frontend
  dependencies alone do not count as backend runtime changes.
- A new data pin imports the current immutable Firestore catalogue, then activates it with
  a transaction that checks the previous pointer. The API is verified before Cloudflare
  publication. Failure restores only this transaction's data pointer; Cloudflare restores
  its prior Worker version. An unrelated pointer is never overwritten during rollback.

The first schema-2 deployment establishes the independent release receipt and rechecks
backend state. Publication remains serialized and noncancelable. The legacy Hosting
configuration and probes are retained for local integration and recovery; the migration
does not delete the live Hosting site, old files, Auth infrastructure or Firestore releases.
Retire that website only after independent production routing and rollback have been
verified separately.

## Capacity and rollout

The complete current export contains about 59,000 static files including Next payloads.
Cloudflare Workers Free allows 20,000 assets; Workers Paid allows 100,000. Confirm the
account's existing entitlement before setting the repository variable
`CLOUDFLARE_ASSET_LIMIT=100000`. Defaults fail before publication; this code never changes
subscriptions or billing. Keep existing Cloudflare deployment credentials/origin and
Firebase backend deployment configuration. FIREBASE_DEPLOY_ENABLED no longer gates or
publishes website Hosting.

Local verification can use the larger asset budget without changing any cloud account:

```bash
npm run data:prepare -- --current-only
npm test
npm run lint
npm run typecheck
npm run build:web
npm run check:export:web
node scripts/deployment-plan.mjs
node scripts/deployment-plan.mjs --receipt
CLOUDFLARE_ASSET_LIMIT=100000 npm run prepare:cloudflare
node scripts/check-cloudflare-local.mjs
```

Run the service tests and build as well. The real activation guard has dedicated Firestore
transaction fixtures. Keep deploy timing receipts to measure the removed Hosting/archive
cost against the remaining static rendering, frontend uploads and API acceptance checks.
