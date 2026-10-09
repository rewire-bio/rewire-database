# Independent frontend: Cloud Run SSR behind Cloudflare

The README describes the architecture. This page covers operation: configuration, bootstrap, publication order, rollback and known limits.

## Runtime contract

- The image (`build/web`, built by `npm run build`) holds the Next standalone server, static assets, the entrypoint and the pinned release under `data/`: the prepared SQLite file, the lock, the producer manifest and the few small files pages render. `scripts/build-web.mjs` builds Next against an empty data directory and fails on symlinks, on release files outside `data/` or not in its list, on a prepared file whose SHA-256 differs from the lock, on prerendered data pages or on missing runtime modules.
- Each Cloud Run revision sets `REWIRE_DEPLOYMENT_RECEIPT`. The image sets `REWIRE_FRONTEND_VERSION` (its commit). There is no runtime data pin and nothing is downloaded at startup.
- `scripts/server-entry.mjs` refuses to start if the embedded lock is malformed or lacks its serving pin, or if the producer manifest digest, the prepared file's `meta` release and contract version, the release manifest or the receipt do not match. Otherwise it sets `REWIRE_DATA_PIN`, `REWIRE_DATA_ROOT` and `REWIRE_DATA_RELEASE` and imports `server.js` unchanged.
- `middleware.ts` adds `X-Rewire-Frontend`, `X-Rewire-Data-Release` and, for anonymous public GETs, `X-Rewire-Edge-Cache: public`. `app/deployment.json`, `app/release-manifest.json`, `app/omics/[...path]`, `app/benchmark-literature/[...path]` and `app/api/trpc/[trpc]` are route handlers.
- Every page and API procedure reads the prepared file through one cached read-only handle (`lib/prepared.ts`). Result and evaluation pages are built in-process by `services/omics/src/record-pages.ts` from that reader.

## Public catalogue API

`lib/catalogue-api.ts` serves the `catalogue.*` tRPC procedures (the same inputs and answers the Firebase function used to serve) over the prepared reader. A request whose `release_id` is not the embedded release gets a 404 naming the current release. The Worker sends `/api/trpc/catalogue.*` here, without cookies or `Authorization`, and every other `/api` path to the Firebase function, which now serves only submissions and curation. When a curator marks a submission published, the function checks the records through `catalogue.get` on the public site (`services/omics/src/published-catalogue.ts`).

## Configuration

Repository variables (no new infrastructure is created by this code):

| Variable | Purpose |
| --- | --- |
| `CLOUD_RUN_IMAGE_REPOSITORY` | Existing Artifact Registry path, `europe-west2-docker.pkg.dev/rewire-it/<repo>/rewire-database-web` |
| `CLOUD_RUN_SERVICE_ACCOUNT` | Frontend runtime identity in `rewire-it`, with no project roles (the frontend only calls public endpoints) |
| `CLOUD_RUN_MAX_INSTANCES` | Upper bound, default 3, at most 10 |
| `CLOUDFLARE_PUBLIC_ORIGIN`, `CLOUDFLARE_DEPLOY_ENABLED`, `FIREBASE_BACKEND_DEPLOY_ENABLED` | As before |

Secrets: `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`, as before. The deploy service account also needs permission to push to the repository, deploy the service and act as the runtime account. `CLOUDFLARE_ASSET_LIMIT` is no longer used: the Worker uploads no assets.

The Worker sets `"cache": { "enabled": false }` in `wrangler.jsonc`. Cloudflare's outer Worker cache would answer before the Worker runs, so it could serve another release's HTML, or a cached download redirect without `no-store`. The Worker's own cache (`cloudflare/page-cache.mjs`) is the only cache for public pages. Wrangler uploads this setting only when it is present, which is why it is explicit.

The Worker fetches the origin with `cache: "no-store"` (`UPSTREAM_FETCH` in `cloudflare/worker.mjs`), so upstream CDN caches never answer its subrequests.

The zone also needs a Cache Rule (dashboard, provisioned once per zone) matching only the database hostname, `(http.host eq "benchmarks.rewirebio.io")`, with cache eligibility "Bypass cache" and Browser TTL "Respect origin". Without it, the zone's standard CDN cache and its default 4-hour Browser TTL apply to the custom domain; the Browser TTL has overwritten `no-store` on download responses before. With the rule, public pages are cached only in the Worker's `caches.default`, keyed by frontend and release, and metadata, API, private and download responses stay `no-store`. If the hostname changes, update the match; do not widen it to other hostnames on the zone.

Service shape (`scripts/deploy-cloud-run.mjs`): `rewire-database-web`, `europe-west2`, 1 vCPU, 2 GiB, concurrency 20, timeout 60 s, `--cpu-throttling` (request-based billing), `--cpu-boost`, min 0 instances, unauthenticated ingress. The Worker reaches the `run.app` URL directly; there is no Google load balancer.

## One-time bootstrap (operator, outside CI)

These steps change cloud resources, so they are not automated here:

1. Create the Artifact Registry repository and the runtime service account.
2. Build and push an image, then create the service once with the same flags as `deployArguments` minus `--no-traffic`. Route 100% of traffic to that revision. Publication refuses to run until exactly one revision serves all traffic.
3. Deploy the Worker once with `npx wrangler deploy --var FRONTEND_ORIGIN:<run.app URL>` and verify it on its workers.dev URL. Publication requires an existing Worker version to roll back to.
4. The first CI publication after this change finds a schema-3 receipt, which it treats as invalid, so it runs the full path (image, backend, Worker).

## Publication order

1. Check the artifact, the plan and the live base.
2. Deploy the backend if its fingerprint changed.
3. Cloud Run: build and push the image when the frontend fingerprint changed; it includes the lock and the compiled taxonomy, so every data release builds an image. Otherwise reuse the image digest of the revision serving traffic, read from that revision's own description. Deploy a candidate with `--no-traffic` and a tag. Verify it through its tag URL (receipt, headers, sample pages, `catalogue.release`, download redirect), then move 100% of traffic to it.
4. If its code changed, deploy the Worker. Then run public acceptance through Cloudflare: smoke pages, exact GitHub download bytes, live catalogue checks.

On failure in step 4, traffic returns to the previous revision and the Worker restores its previous version. The data release moves with the image, so this also rolls back the data. A failure before traffic moves leaves production unchanged.

## Limits

- **Image size.** The prepared file is about 370 MB, so the image is about 400 MB. Cloud Run streams image layers on start; measure cold starts on Cloud Run rather than relying on local timings.
- **One release per revision.** The API answers only the embedded release. A browser tab opened on the previous release gets a 404 from the API after a data publication and asks the reader to reload.
- **Compiled taxonomy.** `lib/generated-benchmark-catalog.ts` and the type of `data/benchmark-runs/mfass-v2.json` are compiled in, which is harmless now that every data release builds an image.
