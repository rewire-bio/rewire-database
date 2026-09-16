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

Next.js exports to `out/`. The Firebase Hosting emulator serves the static site locally without publication.

## Deployment

The database website targets Firebase Hosting. Its API, Firebase Auth and Firestore belong to the same Firebase project and this repository; the unpublished review branch contains that service. DNS remains on Google Cloud DNS. The blog has its own Cloudflare deployment.

Checks run on private pull requests without publishing previews. Production deployment is disabled until `FIREBASE_DEPLOY_ENABLED=true`, an explicit `FIREBASE_PROJECT_ID`, and repository-specific Google Workload Identity Federation are configured. No long-lived service account keys or Cloudflare tokens are required for this repository. Deployment never applies Terraform or enables billing.

See [Firebase deployment and rollback](docs/hosting/firebase.md). No backend or submission activation is included in this production-baseline migration.

The blog owns permanent redirects from `/benchmarks/…` to equivalent paths here. Downloads retain `/benchmark-literature/papers.json` and `/benchmark-literature/results.csv`; the overview retains `#mfass-v1`.

See [extraction notes](docs/extraction.md) and [source checksums](docs/extraction-manifest.json). No contributor data, credentials, Terraform resources or benchmark execution is included.
