# Firebase deployment

Hosting direction updated on 16 September 2026: keep the benchmark website, API, Auth and Firestore in one Firebase project, owned by `rewire-bio/rewire-database`. Keep DNS on Google Cloud DNS. The blog remains a separate Cloudflare project; benchmark runners remain separate from publication.

## Publication boundary

Main contains the published static benchmark baseline. The newer catalogue and contribution API remain on the unpublished review branch. This hosting change does not approve those features or enable submissions. Historical records, downloads and release hashes must stay unchanged.

Use Firebase Hosting for the Next.js static export, not Firebase App Hosting. The API uses Firebase Functions in europe-west2 and Firestore, with Firebase Auth for private contribution access. When reviewed, Hosting forwards `/api/trpc/**` to the `contributions` function in the same project. Hosting forwards the original path, so the handler must parse that prefix explicitly. The browser uses `/api/trpc`; no separate API hostname is required.

## Local checks

Use Node 22 or newer. Run `npm ci`, `npm test`, `npm run lint`, `npm run build`, `npm run typecheck`, and `npm run check:export`.

Run `npx firebase emulators:exec --project demo-rewire-omics --only hosting 'npm run check:http'` to verify real HTTP status, preserved downloads, icons, MFASS and unknown-page handling. The demo project makes this a local check, without production resources. `npm run preview` leaves the Hosting emulator running on port 5055. There is no SPA fallback: unknown routes return 404.

## Production configuration

Firebase is enabled on the existing GCP project `rewire-it` (project number `380052249319`). Hosting site `rewire-it` serves the published baseline at https://rewire-it.web.app. `firebase.json` names this site explicitly. The same project also contains the blog-owned `rewire-blog-redirect` site; database deployments must never target that site. Do not infer a project from the current gcloud default. Use `--project rewire-it` for every production command. Future database components must use this same project.

GitHub Actions uses repository-scoped Workload Identity Federation, with no user-managed service-account key. The repository variables are configured as follows:

| Variable | Value |
| --- | --- |
| `FIREBASE_PROJECT_ID` | `rewire-it` |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | `projects/380052249319/locations/global/workloadIdentityPools/rewire-database-ci/providers/github` |
| `GCP_DEPLOY_SERVICE_ACCOUNT` | `rewire-database-hosting@rewire-it.iam.gserviceaccount.com` |
| `FIREBASE_DEPLOY_ENABLED` | `true` |
| `FIREBASE_BACKEND_DEPLOY_ENABLED` | `false` |
| `CLOUDFLARE_DEPLOY_ENABLED` | `false` |

The dedicated service account has `roles/firebasehosting.admin` and `roles/serviceusage.serviceUsageConsumer` in `rewire-it`. The dedicated provider accepts GitHub's issuer only when repository ID is `1373095654`, owner ID is `330016617`, ref is `refs/heads/main`, workflow is `rewire-bio/rewire-database/.github/workflows/firebase.yml@refs/heads/main`, and the event is `push` or `workflow_dispatch`. Its repository-ID principal set has `roles/iam.workloadIdentityUser` on the service account. These are Hosting deployment permissions, not backend deployment permissions. PRs run checks without public previews or deployment access. No credentials belong in Git.

The first [keyless CI deployment](https://github.com/rewire-bio/rewire-database/actions/runs/35113056085) succeeded. Main contains only the published baseline; enabling Hosting does not publish the review branch.

Main currently deploys only Hosting. Enabling Functions requires billing and is a separate activation step under the existing no-new-paid-infrastructure constraint. Do not enable billing, activate production submissions, deploy unpublished review features or grant broad project administration automatically.

`benchmarks.rewire.it` is staged as a Firebase custom domain. Its CNAME points to `rewire-it.web.app` and the Firebase-supplied ACME TXT record is staged in Google Cloud DNS. TLS issuance is still pending as of this rollout record: do not treat the custom hostname as live until HTTPS succeeds. Preserve all unrelated mail and verification values. There is no nameserver change and no Gandi login requirement. Verify HTTPS, downloads, canonical links and true 404 responses before activating blog redirects.

After the API is approved, deploy reviewed Hosting, Functions and Firestore rules/indexes together. Keep contributor records private; Firestore browser access stays denied. Email, authorised domains, release import and end-to-end verification are prerequisites for the explicit submission feature flag. Do not use an automatic SPA rewrite or publish private source/configuration as static content.

## Rollback and cleanup

Initial Hosting rollout on 16 September 2026:

| Record | Value |
| --- | --- |
| Initial fallback version | `90cf2cc20527e03f` |
| Verified CI-deployed version | `370ef25c988680d0` |
| Release ID | `1789571252583000` |
| Release time (UTC) | `2026-09-16T15:07:32.583Z` |
| Site | `rewire-it` |
| Backend | Not deployed |

These identify the initial rollout, not necessarily the latest release after later main-branch changes. Record the Firebase Hosting release and function revision for each deployment. Restore a prior Hosting release using Firebase's release history; redeploy the corresponding reviewed function revision where necessary. Preserve Firestore data and immutable releases when rolling back application code.

Keep the existing GCP blog origin until a verified blog cutover and its seven-day observation period have completed. GCP now also owns the permanent database service: never treat the whole project as obsolete or destroy its DNS, Auth, Firestore, Functions or shared resources. The unused Cloudflare database upload is not the production target and its CI deployment remains disabled.

References checked 16 September 2026: [Hosting configuration](https://firebase.google.com/docs/hosting/full-config), [custom domains with external DNS](https://firebase.google.com/docs/hosting/custom-domain).
