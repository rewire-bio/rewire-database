# rewire-database

Benchmark website at https://benchmarks.rewire.it. This repository owns the frontend, reviewed records and deployment. Runners live in [rewire-benchmarks](https://github.com/rewire-bio/rewire-benchmarks); articles live in [rewire.it](https://github.com/rewire-bio/rewire.it).

Main extracts the published baseline from rewire.it revision `5f7b8ce477cc7afabc36e02bd002222c931623e7`. Unpublished database and contribution features stay on a separate review branch.

## Development and checks

Node.js 22 or newer. No other checkout is needed.

```sh
npm ci
npm run dev
npm test
npm run lint
npm run build
npm run typecheck
npm run check:export
npm run preview
```

Next.js exports to `out/`. Wrangler preview serves the static site locally without publication.

## Deployment

Checks run on pull requests without public previews. Main deployments require repository variable `CLOUDFLARE_DEPLOY_ENABLED=true` and secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Configure them only when DNS and organisation migration are ready. Wrangler binds only `benchmarks.rewire.it`; workers.dev and preview URLs are disabled. No GCP workflow is included.

Record the deployed version before each release. Roll back with `npx wrangler rollback <version-id>`. Keep GCP available for the migration's seven-day rollback period.

The blog owns permanent redirects from `/benchmarks/…` to equivalent paths here. Downloads retain `/benchmark-literature/papers.json` and `/benchmark-literature/results.csv`; the overview retains `#mfass-v1`.

See [extraction notes](docs/extraction.md) and [source checksums](docs/extraction-manifest.json). No contributor data, credentials, Terraform resources or benchmark execution is included.
