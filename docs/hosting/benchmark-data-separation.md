# Independent benchmark data

The canonical data and release pipeline live in [rewire-benchmark-data](https://github.com/rewire-bio/rewire-benchmark-data). The website never regenerates the catalogue: it consumes the pinned release and the prepared SQLite file the data repository publishes for it.

## Local development

```sh
npm ci
npm run data:fetch
npm run build
```

`benchmark-data.lock.json` pins the repository, exact Git revision, prepared manifest SHA-256, scientific release ID and the prepared SQLite file (release tag, file name and SHA-256). `data:fetch` checks out that revision in ignored `workbench/benchmark-data`. `data:prepare` authenticates the pin and every output, restores generated frontend inputs and downloads the prepared file into `serving/`. It never invokes the data generator. `npm run build` builds the image directory with the current release embedded; downloads are redirects to the pinned GitHub files.

### Where the release files come from

The data repository keeps each release's `website/manifest.json` and receipt in Git, and publishes the gzip files the manifest lists as assets of the release's `serving/<release-id>` GitHub release, beside the prepared SQLite file. Each asset is named after its manifest destination with `/` replaced by `.` and `.gz` appended (`public/omics/releases/<id>/records.jsonl` becomes `public.omics.releases.<id>.records.jsonl.gz`). Adoption checks the release's asset list: if every current file has its asset, the lock gets `serving.website_assets: true`. If none has, the release predates the change and its files are read from Git at the pinned revision, as before; adoption checks that they are there. A partial set of assets, or a release with neither assets nor files in Git (a publish that failed), is refused.

With `website_assets`, `scripts/select-current-data.mjs` (CI) and `data:fetch` (local) download the assets to their manifest source paths, and each file's expanded SHA-256 and size must match the manifest whose digest the lock pins; `data:prepare` then checks them again as usual. Downloads redirect to the release asset instead of `raw.githubusercontent.com`, and the adoption's use-case check reads `use-cases.json` from the asset, verified the same way. Without the flag nothing changes: CI sparse-checks-out the files at the pinned revision, downloads redirect to the raw files there and the use-case check reads the file from Git. Either way the use-case artifact must match its entry in the pinned manifest; if the manifest lists one and it cannot be read or does not match, adoption fails instead of skipping the check.

`data/`, `public/omics/`, literature downloads and `lib/generated-benchmark-catalog.ts` are generated dependencies. Make scientific edits in the data repository. The website retains rendering, the public catalogue API, the contribution service and deployment configuration. `shared/omics/` is a copy of the data repository's shared code as of the pinned release (`npm run shared:sync`).

## CI and release adoption

CI reads the lock and checks out the public data repository using the standard checkout action. No cross-repository personal token or deploy key is required. CI verifies all hydrated files and the prepared file before tests or rendering. The data fingerprint is the lock file; frontend and dependency edits do not change catalogue identity.

A data update changes the lock and syncs `shared/omics/` to the producer revision that published the release. `.github/workflows/adopt-data-release.yml` does this automatically when the data repository dispatches a newly published release (see the README). Because the image embeds the release, every data update builds and deploys a new image; rolling back the image rolls back the data. Backend fingerprints, concurrency checks and rollback are retained.

Initial extraction source: `e13852aa4d190fb52fad29f38b0d6a5257aadb3b`. Scientific release: `2026-09-29-06401fd5b220`. Original source file hashes are retained in the data repository's `docs/data-extraction.json`. No scientific IDs, values or source evidence were changed by the split.

Open evidence PRs #74 and #75 predate this boundary. Merged PR #80 was carried into the data repository from `bc6b40772298f518ec1827311cc0e89f71c3c37e`, including its 17-use-case audit and release `2026-09-30-e37e3ab1284d` (28,133 public records). Preserve them and port their reviewed data edits to the new owner; do not merge their raw-data paths back into this website.

## Public data access

The data repository is public. Local `data:fetch` uses HTTPS without a personal token or SSH key. CI uses the standard checkout action and never persists its credentials. The repository visibility does not weaken the revision, manifest or per-file checksum checks.

The website repository remains private. The migration pull request stays draft until the website checks pass; changing the data repository visibility does not deploy the website or activate submissions.
