# Rewire benchmark website

The benchmark frontend and public query/contribution API. Scientific records, source evidence, ingestion and immutable release generation live in [rewire-benchmark-data](https://github.com/rewire-bio/rewire-benchmark-data). Benchmark execution lives in [rewire-benchmarks](https://github.com/rewire-bio/rewire-benchmarks); articles live in [rewire.it](https://github.com/rewire-bio/rewire.it).

## Architecture

```
                  browser
                     |
        Cloudflare Worker (benchmarks.rewirebio.io)
        - legacy redirects
        - edge cache: anonymous public GETs only
          (key = URL + frontend version + data release)
           |                      |                         |
   /api, /__/auth          pages, assets,            nothing else
           |               /omics/* downloads
           v                      v
  Firebase Functions      Cloud Run: Next.js server ------> GitHub raw
  (catalogue API,         (one image, code only;            (exact gzip export
   contributions)          REWIRE_DATA_PIN per revision)     at the pinned revision)
           |                      |  catalogue.page
           v                      |  (result and evaluation pages)
       Firestore  <---------------+
  (releases, prepared
   record pages, private
   submissions)
```

| Component | Owns | Released by |
| --- | --- | --- |
| `benchmark-data.lock.json` | The reviewed data pin: producer revision, manifest SHA-256, release ID | A pull request changing only the lock |
| Next.js server (`app/`, `lib/`, `components/`) | Rendering every page on request | A new image on Cloud Run |
| Container entrypoint (`scripts/server-entry.mjs`) | Fetching and verifying the pinned release files at startup | Part of the image |
| Firebase Functions (`services/omics`) | The public catalogue API, prepared page reads, contributions | `firebase deploy --only functions:omics,firestore` |
| Firestore | Immutable releases, one prepared document per result/evaluation page, private submissions | Data import and activation |
| Cloudflare Worker (`cloudflare/`) | Routing, legacy redirects, edge cache | `wrangler deploy`, only when Worker code changes |
| GitHub (`rewire-benchmark-data`) | Download bytes | The data repository |

### One pin per revision

The image contains code only. Each Cloud Run revision sets `REWIRE_DATA_PIN` (the lock file's JSON). At startup the entrypoint downloads the pinned `website/manifest.json` from GitHub at that exact revision and checks it against the pin's SHA-256. It then downloads the files pages read, checks each file's size and SHA-256 against the manifest, and starts the unmodified Next standalone server. That release then identifies every page, client API call (`release_id`), download redirect and cache entry served by the revision.

- **Result and evaluation pages** (21,678 of 28,677 records) read one prepared document from `catalogue.page`. The importer builds these documents with the API's own query engine. The page never loads the catalogue.
- **All other pages** (records of other kinds, indexes, use cases, audits, coverage) render on request from the verified local copy of the pinned catalogue. It is parsed once per warm instance, not per request.
- **Downloads** are site paths (`/omics/...`, `/benchmark-literature/...`). The server redirects each to the exact gzip `source` the pinned manifest lists, and returns 404 for anything it does not list.

Nothing is prerendered at build time. `scripts/build-web.mjs` builds against an empty data directory, so a build that tries to read release data fails.

### Cold start and steady state

These figures come from a fresh local hydration of the current release, not from Cloud Run: 45 files, about 114 MB decompressed, in 2.8 s, with a peak RSS of 302 MB (`workbench/ssr-migration/runtime-hydration.log`). The download includes the 89 MB catalogue. A cold instance therefore pays this before serving any page, including result and evaluation pages, which never parse the catalogue afterwards. The first curated page on an instance also parses the catalogue (about 0.8 s locally) and holds it in memory, which is why the service uses 2 GiB. Warm requests render from memory or from one Firestore document, and the edge cache serves repeats. Measure startup on Cloud Run before relying on these numbers.

### Edge cache

The Worker caches only anonymous `GET` requests for public paths, and only stores a response that:

- the origin explicitly opted in (`X-Rewire-Edge-Cache: public`, set by `middleware.ts`);
- has status 200, HTML or static-asset content (never `text/x-component`) and no `Set-Cookie`;
- varies only on Next navigation headers or `Accept-Encoding` (`Vary: *` or any other field bypasses);
- carries the same `X-Rewire-Frontend` and `X-Rewire-Data-Release` as its key.

These requests always bypass the cache: cookies, `Authorization`, RSC, prefetch, router-state, `Next-Url` and server-action headers, `?_rsc=`, non-GET methods, `/api`, `/__/auth`, `/contribute`, `/_analytics`, downloads and the publication receipts. The Worker learns the identity from origin responses (for up to 60 s), so a new image or data release starts a new key space without redeploying the Worker. Eviction only means a re-render. Failed cache reads or writes never fail a response. Browsers revalidate HTML on every request; `/_next/static` assets are immutable.

## Development

Requires Node.js 22 or newer (CI uses 24). The public data repository is fetched over HTTPS; no personal token or SSH key is required.

```sh
npm ci
npm run data:fetch
npm run dev            # next dev, with a local catalogue.page API built from the hydrated release
```

`npm run data:prepare -- --current-only` verifies and hydrates the pinned current release into `data/` and `public/omics/` (ignored). Use `BENCHMARK_DATA_SOURCE=/path/to/rewire-benchmark-data` to consume an existing checkout at the pinned revision.

```sh
npm test
npm run lint
npm run typecheck
npm --prefix services/omics run build && npm --prefix services/omics test
npm run omics:service:test    # with the Firebase emulators (Java 21)
npm run check:data            # release data integrity of the hydrated pin
npm run build                 # standalone server in build/web
npm run check:build           # runs build/web as Cloud Run does, over HTTP
npm start                     # local production preview on http://127.0.0.1:3000
```

`npm run check:build` validates the release data directly (records, use cases and sources, research sidecars, evidence exports, archive checksums, baseline audits, page route inventory). It then starts the built server through its entrypoint with the local `catalogue.page` API, which injects failures. It checks identity and cache headers, RSC isolation, absent pages (404) against backend failures and pin mismatches (500), download redirects, receipts, private routes, the exact sitemap, and the search metadata of one page per record kind and alias route plus the index and utility pages. `npm run check:build:full` renders every record page as an optional audit.

## Releases

Each kind of change has its own path. The publication workflow (`.github/workflows/firebase.yml`) selects the path from fingerprints of the change, and publication stays serialized.

| Change | What runs | Image build |
| --- | --- | --- |
| Frontend code | Build image, deploy candidate revision with the current pin | Yes |
| Data (lock only, same compiled taxonomy) | Import release and prepared pages, verify pages, activate the API pointer, deploy a revision of the **serving revision's image digest** with the new pin | No |
| Data that changes the compiled taxonomy | As above, but with a new image | Yes |
| Backend-only service modules (API router, Firestore stores, Functions, auth, mail, CLIs; `BACKEND_ONLY_SOURCES` in `scripts/deployment-plan.mjs`) | `firebase deploy --only functions:omics,firestore` | No |
| Shared service modules (query engine, page builder, schemas, use cases) | Backend deploy and a new image | Yes |
| Worker | `wrangler deploy --var FRONTEND_ORIGIN:<run.app URL>` | No |

Frontend-only changes never deploy the backend. A test keeps `BACKEND_ONLY_SOURCES` free of any module the website imports.

Every frontend or data publication deploys a candidate revision with `--no-traffic`. The candidate is verified through its own tag URL (receipt, image and release headers, result, evaluation, model and benchmark pages, exact download redirect) before it receives traffic. The workflow then verifies the public site through Cloudflare. A failure after the traffic shift moves traffic back to the previous revision, and the Worker restores its own previous version. The data transaction restores only the pointer it changed, and only if nobody else changed it since.

Before any traffic reaches a revision, publication makes the prepared pages ready. A newly imported release, or one without pages, is checked against every stored document: a current release imported before prepared pages existed is first backfilled from its own verified bytes (`import-cli --pages`). For the unchanged published release, the usual frontend-only case, an earlier publication has already verified every document. Publication then only checks that the release manifest still binds the same records and page contract, and reads representative result and evaluation pages through the public API. The candidate revision renders pages through the API again before it gets traffic.

The image compiles one producer file, the candidate-model taxonomy in `lib/generated-benchmark-catalog.ts`. It is ignored by Git, so the planner adds its hash to the frontend fingerprint. A lock change that also changes the taxonomy therefore builds a new image automatically. The entrypoint independently refuses to start an image whose compiled taxonomy differs from the pinned release. A data-only release reuses the image of the revision serving traffic, read from that revision rather than from the service template, which after a rollback can name a failed candidate. All release data is read at runtime.

```sh
npm run deploy    # scripts/deploy-independent-frontend.mjs: run only by the publication workflow
```

The Cloud Run service is `rewire-database-web` in `europe-west2`. It uses request-based billing (`--cpu-throttling`), min 0 and max `CLOUD_RUN_MAX_INSTANCES` (default 3, at most 10) instances, unauthenticated ingress for the Worker, and no Google load balancer. See [docs/independent-frontend.md](docs/independent-frontend.md) for the one-time bootstrap and required configuration.

Make data edits in the data repository and adopt a reviewed release with a pull request updating the lock. The contribution service lives in `services/omics`, with its own dependencies and emulator tests. Keep private contributor data out of every public artifact.
