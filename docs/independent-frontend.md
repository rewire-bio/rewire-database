# Independent frontend: Cloud Run SSR behind Cloudflare

The README describes the architecture. This page covers operation: configuration, bootstrap, publication order, rollback and known limits.

## Runtime contract

- The image (`build/web`, built by `npm run build`) holds the Next standalone server, static assets and the entrypoint. It holds no release data, no lock file and no prerendered HTML. `scripts/build-web.mjs` builds against an empty data directory and fails on symlinks, on release files, on prerendered data pages or on missing runtime modules.
- Each Cloud Run revision sets `REWIRE_DATA_PIN` (JSON in the shape of `benchmark-data.lock.json`) and `REWIRE_DEPLOYMENT_RECEIPT`. The image sets `REWIRE_FRONTEND_VERSION` (its commit).
- `scripts/server-entry.mjs` refuses to start if the pin is missing or malformed. It also refuses if the pinned manifest digest, any downloaded file's size or SHA-256, the release manifest, the receipt (image, pin, manifest bytes) or the compiled taxonomy does not match. Otherwise it hydrates, sets `REWIRE_DATA_ROOT` and `REWIRE_DATA_RELEASE`, and imports `server.js` unchanged.
- `middleware.ts` adds `X-Rewire-Frontend`, `X-Rewire-Data-Release` and, for anonymous public GETs, `X-Rewire-Edge-Cache: public`. `app/deployment.json`, `app/release-manifest.json`, `app/omics/[...path]` and `app/benchmark-literature/[...path]` are route handlers.
- Result and evaluation pages call `catalogue.page` with the pinned `release_id`. `null` (no such record, an excluded record or another kind) is a 404. Any other outcome is a 500 that is never cached: a non-200 response, a timeout, an unpublished release, missing page materialization, a renderable record without its page, or a page from another release or route.

## Prepared pages

`services/omics/src/record-pages.ts` builds one bounded page per canonical or alias result/evaluation route with the release's query engine. Each page holds the record, direct and reverse links, sources, the first results page (25, or the record's own row for results), the first evidence page (10), use-case backlinks, verified family associations, identity subject, research readiness and investigations, and the records that reproduction and search metadata resolve by ID. `tests/record-page-parity.test.ts` checks that the search metadata built from each page equals the metadata built from the whole release, for all 21,678 routes.

`services/omics/src/record-page-store.ts` stores each page gzip-compressed in `catalogueReleases/{release}/recordPagesV1/{kind}:{id}`, with its SHA-256. A page above 900 KB compressed or 8 MB uncompressed fails the import; pages are never truncated. The current release's largest page is 355 KB uncompressed. Import writes in batches of at most 200 documents (6 MB). It then reads back the stored hashes (a projection, not the payloads), and only then writes the manifest `record_pages_v1`. Activation verifies count and digest, and builds the pages itself if a direct activation finds none. A serving read costs one release-metadata read per warm instance plus one document read per page. The extra record read happens only when a page is missing.

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
3. Backfill pages for the current published release: `node --import tsx services/omics/src/import-cli.ts --pages public/omics/catalogue.json public/omics/manifest.json`. Publication also does this automatically before any traffic shift.
4. Deploy the Worker once with `npx wrangler deploy --var FRONTEND_ORIGIN:<run.app URL>` and verify it on its workers.dev URL. Publication requires an existing Worker version to roll back to.
5. The first CI publication after this change finds a schema-2 receipt, which it treats as invalid, so it runs the full path (image, pages, Worker).

## Publication order

1. Check the artifact, the plan and the live base, and capture the live API release.
2. If the lock changed, import the release (records, audits, use cases, prepared pages).
3. Make the pages ready for the pinned release. A new release, or one without pages (backfilled first), is verified against every stored document's hash. The unchanged published release gets bounded checks: its manifest binds the same records digest and page contract, and representative result and evaluation pages are read through the public API.
4. If the lock changed, activate the API pointer with a compare-and-set against the captured release.
5. Verify the API.
6. Cloud Run: build and push the image when the frontend fingerprint changed, which includes the hash of the compiled taxonomy. Otherwise reuse the image digest of the revision serving traffic, read from that revision's own description. Deploy a candidate with `--no-traffic` and a tag. Verify it through its tag URL, then move 100% of traffic to it.
7. If its code changed, deploy the Worker. Then run public acceptance through Cloudflare: smoke pages including SSR result/evaluation, exact GitHub download bytes, live catalogue checks.

On failure in step 7, traffic returns to the previous revision and the Worker restores its previous version. Any failure after step 4 restores the data pointer only if it still names this publication's release. A failure before traffic moves leaves production unchanged.

## Limits

- **Cold start.** A new instance downloads and verifies about 114 MB from GitHub before serving (2.8 s and 302 MB peak RSS measured locally, not on Cloud Run). The first curated page on an instance parses the 89 MB catalogue. Edge caching and scale-to-zero trade that latency for cost. If cold starts prove too slow, `--min-instances 1` removes them at the cost of an always-on instance.
- **GitHub availability.** A cold start depends on `raw.githubusercontent.com`. Warm instances and cached pages do not.
- **Compiled taxonomy.** `lib/generated-benchmark-catalog.ts` and the type of `data/benchmark-runs/mfass-v2.json` are compiled in. The run data itself is read at runtime. A data release that changes the taxonomy file fails at startup and needs an image build.
- **Firestore storage.** Each release adds about 90 MB of compressed page documents. Old releases keep theirs, because releases and their serving data are immutable. Delete pages only for releases that no revision or rollback can pin, and only as a reviewed operation.
- **Functions capacity.** Uncached result/evaluation renders call `catalogue.page` on the existing Functions service (max 2 instances, concurrency 4). Raise those bounds if crawls cause throttling.
