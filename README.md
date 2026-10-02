# Rewire benchmark website

The benchmark frontend and public query/contribution API. Scientific records, source evidence, ingestion and immutable release generation live in [rewire-benchmark-data](https://github.com/rewire-bio/rewire-benchmark-data). Benchmark execution lives in [rewire-benchmarks](https://github.com/rewire-bio/rewire-benchmarks); articles live in [rewire.it](https://github.com/rewire-bio/rewire.it).

## Development

Requires Node.js 22 or newer. The public data repository is fetched over HTTPS; no personal token or SSH key is required.

```sh
npm ci
npm run data:fetch
npm run dev
```

`benchmark-data.lock.json` pins prepared data by Git revision, manifest SHA-256 and release ID. Builds verify and unpack that artifact; they never regenerate scientific records. `data/`, `public/omics/`, literature downloads and the generated candidate catalogue are ignored dependencies.

```sh
npm run data:prepare -- --current-only
npm test
npm run lint
npm run build:web
npm run typecheck
npm run check:export:web
```

Use `npm run build` and `npm run check:export` when a full export including historical downloads is required. Use `BENCHMARK_DATA_SOURCE=/path/to/rewire-benchmark-data` to consume an existing checkout at the pinned revision.

## Data and deployment

Make data edits in the data repository. Adopt a reviewed release with a pull request updating the lock. See [independent data setup](docs/hosting/benchmark-data-separation.md) and [incremental deployment](docs/hosting/incremental-deployment.md).

Next.js exports to `out/`. The existing Cloudflare frontend and Firebase API/download publication workflows retain their independent deployment gates, live-release checks, archive preservation and rollback. Repository separation does not activate submission intake or change domains.

The contribution service lives in `services/omics`, with its own dependencies and emulator tests. Keep private contributor data out of every public artifact. Historical extraction receipts remain under `docs/`; the new data repository retains the complete source-data extraction receipt.
