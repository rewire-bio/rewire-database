# Firebase deployment

The benchmark website and its catalogue API use Firebase project `rewire-it`. DNS stays on Google Cloud DNS. The blog and benchmark runners remain separate repositories. Publication of the reviewed catalogue and API was authorised on 16 September 2026; contribution submissions remain disabled.

## Application and credentials

Firebase Hosting site **`rewire-it`** serves the Next.js static export at `https://benchmarks.rewire.it`. The explicit site prevents database deployment from touching the separate `rewire-blog-redirect` site. Hosting forwards `/api/**` to the existing function name `contributions` in `europe-west2`. That function serves public catalogue queries and guarded private contribution procedures under `/api/trpc`.

The Function uses `rewire-catalogue-runtime@rewire-it.iam.gserviceaccount.com`. Give this runtime identity read-only Firestore access for catalogue serving; it does not need Firebase Auth administration, SMTP credentials or publication write permissions while contributions are disabled. Public HTTP invocation is deliberate: procedure-level guards deny private traffic. Firestore rules deny direct browser access to every collection.

Runtime options are explicit: zero minimum instances, at most two instances, 256 MiB memory and a 30-second request timeout. Public release snapshots are cached per warm instance and successful public queries carry short CDN cache headers. These limits reduce idle cost and constrain scaling; they are not a billing cap.

GitHub Actions uses repository-scoped Workload Identity Federation, restricted to this repository, main branch and deployment workflow. Keep runtime and deployment identities separate. The deployment/import identity needs Hosting deployment, Functions deployment and invocation-policy configuration, permission to act as the runtime service account, Firestore rules/index deployment, and Firestore writes for release import/activation. Provision these roles and required APIs separately; never use static service-account keys or broad project Owner/Editor grants. All deployment commands explicitly use `--project rewire-it`; the import process explicitly uses `GCLOUD_PROJECT=rewire-it` and production ADC from the WIF action.

Configure repository variables `FIREBASE_PROJECT_ID=rewire-it`, `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_DEPLOY_SERVICE_ACCOUNT`, `FIREBASE_DEPLOY_ENABLED=true` and `FIREBASE_BACKEND_DEPLOY_ENABLED=true` only after backend infrastructure is ready. Both deployment flags are required. Pull requests run checks without publishing previews. Main deployments are not cancelled mid-publication by newer runs.

## Ordered publication

The main workflow runs checks, then performs these steps:

1. Deploy Functions and private Firestore rules/indexes. Existing website files remain in place.
2. Import the checked `public/omics/catalogue.json` using its manifest checksum. Only complete, validated imports become ready.
3. Activate that release atomically. Existing published releases remain queryable by ID, so the previous website continues working.
4. Run `scripts/check-live-catalogue.mjs` against the direct Function URL. It checks the active release, record count, BarcodeBERT result/model relationships and disabled submissions. This probe does not write data.
5. Deploy Hosting site `rewire-it` only after API verification succeeds.
6. Repeat the read-only probe through `https://benchmarks.rewire.it`.

Use the same order for an operator-led deployment. The convenience `deploy:stack` command alone does not import or activate catalogue data and is insufficient for a release. Import and activation commands, run from the repository root with production ADC configured, are:

```sh
GCLOUD_PROJECT=rewire-it NODE_ENV=production npm --prefix services/omics run import-release -- ../../public/omics/catalogue.json ../../public/omics/manifest.json
GCLOUD_PROJECT=rewire-it NODE_ENV=production npm --prefix services/omics run import-release -- --activate RELEASE_ID
node scripts/check-live-catalogue.mjs https://europe-west2-rewire-it.cloudfunctions.net/contributions
```

Keep `OMICS_CONTRIBUTIONS_ENABLED` and `NEXT_PUBLIC_OMICS_CONTRIBUTIONS_ENABLED` unset or false. Public catalogue reads are independent of these flags; submissions, curator endpoints and mixed public/private batches return 503 while the backend flag is off. Auth email configuration, SMTP delivery and private contribution access are outside this deployment. No analytics is mounted on contribution pages.

## Local and live checks

Use Node 22 or 24 and Java 21+. Run `npm ci`, `npm test`, `npm run lint`, `npm run build`, `npm run typecheck`, and `npm run check:export`. Service checks run with `npm --prefix services/omics run test:emulator`.

After building the API, run:

```sh
npx firebase emulators:exec --project demo-rewire-omics --only hosting,functions,auth,firestore 'node scripts/check-api-hosting.mjs'
```

This local-only check seeds and activates the generated release in a demo Firestore emulator, then tests actual Hosting rewrites, pagination, release pinning, cache headers, linked results and private-data gates. It refuses production projects and nonlocal seed destinations. `check-live-catalogue.mjs` instead performs only read-only queries and can safely verify the deployed service.

Hosting keeps real 404 responses for unknown pages; there is no SPA fallback. Check historical MFASS routes, preserved downloads and hashes, canonical metadata and mobile browser behaviour as part of website acceptance. Keep API cache control in the Function handler rather than a blanket Hosting `no-store` rule, which would override public catalogue caching.

## Rollback and cleanup

Record the source commit, Function revision, Hosting release and catalogue release ID for each deployment. To roll back data, activate the prior published release with the same CLI command. To roll back the website, restore the previous Hosting release; its release-pinned queries continue working. Restore a compatible reviewed Function revision when needed. Do not delete historical catalogue releases or roll back private contribution records.

The workflow runs `node scripts/deploy-catalogue.mjs` after deploying the Function and rules. Before publication it captures the exact active catalogue ID and live Hosting version, refusing to continue without both rollback targets. It imports and activates the reviewed catalogue, verifies the API, deploys Hosting, then verifies both the hosted manifest and API. Transient transport errors and HTTP 429/500/502/503/504 responses get at most three attempts with one- and two-second delays; the intentional disabled-submissions 503 is accepted immediately. Contract mismatches fail immediately.

On failure after an activation attempt, the helper restores the previous catalogue pointer. Once Hosting deployment has been attempted, it also restores the captured Hosting version using `firebase hosting:clone SITE@VERSION SITE:live`, including when the deploy command fails after partially succeeding. Both rollback operations are attempted independently; a rollback failure is reported for operator intervention. Function code and Firestore rules are not rolled back automatically and must remain compatible with historical releases. Initial publication without a previous release needs a separate operator-led procedure. Preserve workflow logs containing rollback targets and immutable Git releases.

Keep the previous GCP blog origin until the separately verified blog cutover has completed its seven-day observation period. The GCP project now permanently owns the database: do not destroy Google DNS, Firestore, Functions, Auth, email records, backups or Terraform state while retiring obsolete blog resources.

References checked 16 September 2026: [Firebase runtime configuration](https://firebase.google.com/docs/functions/manage-functions), [HTTP Functions](https://firebase.google.com/docs/functions/http-events), [Hosting configuration](https://firebase.google.com/docs/hosting/full-config), [custom domains with external DNS](https://firebase.google.com/docs/hosting/custom-domain).

## Infrastructure bootstrap and initial baseline

The first production baseline used Hosting version `d1fa1c852d315578` (CI run `35113876867`). This remains the pre-catalogue rollback reference; the earlier initial fallback version was `90cf2cc20527e03f`.

The dedicated CI account is `rewire-database-hosting@rewire-it.iam.gserviceaccount.com`; the WIF provider is `projects/380052249319/locations/global/workloadIdentityPools/rewire-database-ci/providers/github`, restricted to repository ID `1373095654`, owner ID `330016617`, main and the Firebase workflow. Firebase CLI also checks act-as permission on the existing App Engine service account, even though this function uses the explicit read-only runtime identity.

Firestore Native Standard is in `europe-west2`, with deletion protection. Enable Firestore, Functions, Cloud Run, Cloud Build, Artifact Registry, Firebase Rules, Eventarc and Pub/Sub APIs before running CI. Firebase requires the last two during HTTP Gen2 provisioning. Create their service identities during infrastructure bootstrap.

The `europe-west2/gcf-artifacts` repository has a cleanup policy deleting build images older than 14 days while retaining the latest three versions. Configure this before first noninteractive deployment, or Firebase CLI may stop after deploying the function because no cleanup policy exists. These policies concern build images only; reviewed data releases are retained.
