# Cloudflare website deployment

The public database hostname is `benchmarks.rewirebio.io`; article links point to `rewirebio.io`. Firebase project `rewire-it` continues to own Auth, Functions, Firestore, the complete static origin and immutable downloads. This is a web delivery migration, not a scientific-data migration.

## Routing and limits

`rewire-database-web` serves the core UI and its static assets directly from Cloudflare. The Worker streams these routes from `https://rewire-it.web.app`, preserving paths, queries, status codes, range responses and bytes:

- `/omics/**`: current and historical release exports, including files exceeding Cloudflare's 25 MiB asset limit.
- `/database/result/**` and `/database/evaluation/**`: bulk detail pages and their Next data files. The production export had 60,534 files; excluding downloads alone does not fit the Free tier.
- `/api/**` and `/__/auth/**`: Firebase API and authentication handlers.

Everything else uses the static asset binding, including genuine 404 responses. The preparation script hard-links the generated subset, leaves `out/` intact, rejects symlinks, and refuses more than 20,000 files or individual files larger than 25 MiB. It never silently drops arbitrary files to fit a limit. Inspect `.cloudflare/inventory.json` after every build.

Direct static asset requests are unlimited and free. Worker invocations, including the proxy routes, share the account's **100,000 requests/day** Free allowance; exceeding it can interrupt those routes. Do not silently enable a paid plan. Workers Paid permits 100,000 static files and can remove the bulk-detail fallback later, but still cannot host oversized release files directly. Firebase origin traffic and storage remain in use. Sources: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [asset billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/).

## First deployment

1. Run the normal tests, lint, build, typecheck, export and Firebase integration checks. Then run `npm run prepare:cloudflare`. Build with the same production Firebase/analytics variables used by CI; preserve the existing enabled contribution settings.
2. Publish the reviewed Firebase API/catalogue/site through the existing workflow first. Its post-publication probe uses `rewire-it.web.app`, so verification does not depend on an unfinished DNS cutover. Historical releases and the existing origin stay available.
3. Add `benchmarks.rewirebio.io` to Firebase Auth's authorized domains. Function CORS and service configuration allow both old and new domains; analytics iframe policy recognizes the new parent origin. Existing email addresses remain unchanged.
4. Bootstrap the new Worker using `npx wrangler deploy` with the operator's existing OAuth login. The config deliberately has no custom routes, so this only creates the workers.dev deployment until a verified hostname is attached. Do not activate the obsolete `rewire-database` Worker.
5. Against its workers.dev URL, run `node scripts/check-hosting-http.mjs URL` and `OMICS_CONTRIBUTIONS_ENABLED=true node scripts/check-live-catalogue.mjs URL --website`. Verify representative proxied result/evaluation pages and a ranged immutable download as well.
6. Attach `benchmarks.rewirebio.io` as a custom domain to `rewire-database-web` in Cloudflare after DNS delegation/certificates are ready. Verify again. Keep old-domain links working with a path/query-preserving redirect configured separately, after the new site is verified. Keep the Firebase origin available.

## Deployment on push

The existing workflow stages assets on every checked build. Set the database repository's `CLOUDFLARE_API_TOKEN` secret to a durable token scoped to this account's Workers Scripts edit permission (and account read if required by Wrangler). Existing `CLOUDFLARE_ACCOUNT_ID` is reused. Set `CLOUDFLARE_PUBLIC_ORIGIN=https://benchmarks.rewirebio.io` and enable `CLOUDFLARE_DEPLOY_ENABLED=true` only after bootstrap and domain verification.

GitHub secrets cannot be read back or copied out of the blog repository. Supply the scoped token directly to the database repository or use an organization secret explicitly shared with this repository. Never put a short-lived Wrangler OAuth token into CI, logs, commits or documentation.

On main, Firebase publishes its API and complete origin first with its existing rollback transaction. Cloudflare then captures the previous Worker deployment, publishes the corresponding core UI, and checks HTTP behavior and the live catalogue. A failed Cloudflare publish/probe restores the prior Worker deployment; Firebase retains the newly reviewed, backward-compatible release and all historical release IDs. Cloudflare CI refuses to run without an existing rollback target. Backend contract changes must remain compatible with the preceding frontend; this is already required for Firebase rollback.

This repository does not create DNS records or alter registrar nameservers. Record DNS cutover and final hostname verification separately.
