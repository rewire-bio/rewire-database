# Firebase deployment

Hosting direction updated on 16 September 2026: keep the benchmark website, API, Auth and Firestore in one Firebase project, owned by `rewire-bio/rewire-database`. Keep DNS on Google Cloud DNS. The blog remains a separate Cloudflare project; benchmark runners remain separate from publication.

## Publication boundary

Main contains the published static benchmark baseline. The newer catalogue and contribution API remain on the unpublished review branch. This hosting change does not approve those features or enable submissions. Historical records, downloads and release hashes must stay unchanged.

Use Firebase Hosting for the Next.js static export, not Firebase App Hosting. The API uses Firebase Functions in europe-west2 and Firestore, with Firebase Auth for private contribution access. When reviewed, Hosting forwards `/api/trpc/**` to the `contributions` function in the same project. Hosting forwards the original path, so the handler must parse that prefix explicitly. The browser uses `/api/trpc`; no separate API hostname is required.

## Local checks

Use Node 22 or newer. Run `npm ci`, `npm test`, `npm run lint`, `npm run build`, `npm run typecheck`, and `npm run check:export`.

Run `npx firebase emulators:exec --project demo-rewire-omics --only hosting 'npm run check:http'` to verify real HTTP status, preserved downloads, icons, MFASS and unknown-page handling. The demo project makes this a local check, without production resources. `npm run preview` leaves the Hosting emulator running on port 5055. There is no SPA fallback: unknown routes return 404.

## Production configuration

Select one Firebase project explicitly; `rewire-it` is the existing GCP project, but Firebase enablement has not been performed. Do not infer a project from the current gcloud default. Use `--project PROJECT_ID` for every production command. All database components must use that same project.

Use repository-scoped Google Workload Identity Federation for GitHub Actions, with a deployment identity restricted to this project and the required Firebase resources. Configure repository variables `FIREBASE_PROJECT_ID`, `GCP_WORKLOAD_IDENTITY_PROVIDER` and `GCP_DEPLOY_SERVICE_ACCOUNT`. Keep `FIREBASE_DEPLOY_ENABLED` unset or false until project access, domain readiness and release approval are verified. PRs run checks without public preview deployments. No credentials belong in Git.

Main currently deploys only Hosting. Enabling Functions requires billing and is a separate activation step under the existing no-new-paid-infrastructure constraint. Do not enable billing, activate production submissions, deploy unpublished review features or grant broad project administration automatically.

Add `benchmarks.rewire.it` to Firebase Hosting, then apply the exact verification and address records supplied by Firebase in the existing Google DNS zone. Preserve all unrelated mail and verification values. There is no nameserver change and no Gandi login requirement. Verify HTTPS, downloads, canonical links and true 404 responses before activating blog redirects.

After the API is approved, deploy reviewed Hosting, Functions and Firestore rules/indexes together. Keep contributor records private; Firestore browser access stays denied. Email, authorised domains, release import and end-to-end verification are prerequisites for the explicit submission feature flag. Do not use an automatic SPA rewrite or publish private source/configuration as static content.

## Rollback and cleanup

Record the Firebase Hosting release and function revision for each deployment. Restore a prior Hosting release using Firebase's release history; redeploy the corresponding reviewed function revision where necessary. Preserve Firestore data and immutable releases when rolling back application code.

Keep the existing GCP blog origin until a verified blog cutover and its seven-day observation period have completed. GCP now also owns the permanent database service: never treat the whole project as obsolete or destroy its DNS, Auth, Firestore, Functions or shared resources. The unused Cloudflare database upload is not the production target and its CI deployment remains disabled.

References checked 16 September 2026: [Hosting configuration](https://firebase.google.com/docs/hosting/full-config), [custom domains with external DNS](https://firebase.google.com/docs/hosting/custom-domain).

## Review-branch integration checks

The root configuration now links the Hosting API rewrite to the Functions codebase. `npm run deploy:stack -- --project PROJECT_ID` is the coordinated deployment command after this branch and backend activation are approved. Ordinary hosting deployment remains separate until then; no `pinTag` can implicitly deploy Functions.

The deployed API returns 503 unless `OMICS_CONTRIBUTIONS_ENABLED=true` is explicitly configured for the Function. The browser additionally requires `NEXT_PUBLIC_OMICS_CONTRIBUTIONS_ENABLED=true` and Firebase configuration; neither flag is enabled by this change. With the local Functions build ready, `npx firebase emulators:exec --project demo-rewire-omics --only hosting,functions,auth,firestore 'node scripts/check-api-hosting.mjs'` verifies real same-origin forwarding with submissions disabled. Existing service emulator tests verify authorised and unauthorised API behaviour when enabled.

The existing API serves private contributions and curator operations. The public benchmark catalogue remains a versioned static release; this change does not introduce a public query API. Transactional email still needs a configured delivery worker and live testing before activation.

On this review branch, CI deploys the reviewed stack together only when both `FIREBASE_DEPLOY_ENABLED=true` and `FIREBASE_BACKEND_DEPLOY_ENABLED=true` are configured. The extra gate preserves the existing requirement to approve backend hosting and billing separately. Both gates remain off.
