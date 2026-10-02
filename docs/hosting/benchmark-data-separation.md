# Independent benchmark data

The canonical data and release pipeline live in [rewire-benchmark-data](https://github.com/rewire-bio/rewire-benchmark-data). This extends [PR #78](https://github.com/rewire-bio/rewire-database/pull/78): frontend updates reuse a prepared catalogue rather than regenerating it in the website build.

## Local development

```sh
npm ci
npm run data:fetch
npm run build:web
```

`benchmark-data.lock.json` pins the repository, exact Git revision, prepared manifest SHA-256 and scientific release ID. `data:fetch` checks out that revision in ignored `workbench/benchmark-data`. `data:prepare` authenticates the pin and every output, then restores generated frontend inputs. It never invokes the data generator. Use `npm run build` to include all historical downloads for a full deployment; `build:web` includes the current release and relies on existing server-side archive preservation.

`data/`, `public/omics/`, literature downloads and `lib/generated-benchmark-catalog.ts` are generated dependencies. Make scientific edits in the data repository. The website retains rendering, public query contracts, Firebase API/contribution services, and deployment configuration.

## CI and release adoption

CI reads the lock and checks out the public data repository using the standard checkout action. No cross-repository personal token or deploy key is required. CI verifies all hydrated files before tests or rendering. The data fingerprint is the lock file; frontend and dependency edits do not change catalogue identity.

A data update is a reviewed pull request changing the lock. Full deployment still checks every historic release and refuses to discard published archives. A matching UI-only update still checks the current live receipt and manifest and uses Firebase version cloning. Backend fingerprints, concurrency checks and rollback are retained.

Initial extraction source: `e13852aa4d190fb52fad29f38b0d6a5257aadb3b`. Scientific release: `2026-09-29-06401fd5b220`. Original source file hashes are retained in the data repository's `docs/data-extraction.json`. No scientific IDs, values or source evidence were changed by the split.

Open evidence PRs #74 and #75 predate this boundary. Merged PR #80 was carried into the data repository from `bc6b40772298f518ec1827311cc0e89f71c3c37e`, including its 17-use-case audit and release `2026-09-30-e37e3ab1284d` (28,133 public records). Preserve them and port their reviewed data edits to the new owner; do not merge their raw-data paths back into this website.

## Public data access

The data repository is public. Local `data:fetch` uses HTTPS without a personal token or SSH key. CI uses the standard checkout action and never persists its credentials. The repository visibility does not weaken the revision, manifest or per-file checksum checks.

The website repository remains private. The migration pull request stays draft until the website checks pass; changing the data repository visibility does not deploy the website or activate submissions.
