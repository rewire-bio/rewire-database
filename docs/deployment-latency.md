# Build and publication throughput

Production builds run in the cancelable `checks` job. Only the separate `publish` job holds `database-publication`, with cancellation disabled. A new build can start while an earlier publication is running.

The build prepares the pinned release (website files and the prepared SQLite file), runs the tests, the production build and `npm run check:build`, then packages the checked image directory (`build/web`, including its embedded `data/`) and the source-bound deployment plan. The one-day Actions artifact excludes service environments, dependencies and credentials. Each transported file has a byte count and SHA-256 digest; the publisher checks the complete inventory, commit and release receipt before restoring it.

Before setup and again immediately before production writes, publication fetches `main` and compares it to the checked commit. Superseded builds report a skip without production writes. An intervening publication can refresh the live base only when the release and all data, backend and Worker fingerprints still match the checked build. Cloud Run traffic rollback and Cloudflare Worker rollback remain in force. Manual cancellation of an active publisher is unsafe. Another workflow that writes these targets must use the same noncancelable publication group.

## Timings

`DEPLOYMENT_METRICS_FILE` enables JSONL receipts. `deployment-metrics.mjs run STAGE -- COMMAND` records success or failure and elapsed time while preserving the command's exit status. Scripts also record nested Cloud Run and Cloudflare stages, including `cloudflare.worker_propagation`, the wait for a new Worker version to reach the edge. No command arguments, tokens, environments or exception messages are written to timing receipts. Telemetry write failures do not change a deployment result or trigger rollback.

Both jobs print an Actions summary and retain their receipts for seven days. Nested timings overlap and must not be added together. `handoff_wait` measures artifact preparation to the publisher's receipt check; it includes transfer, scheduling and queue waiting.

Run 37936007385 (9 October 2026, full publication with a new image, backend and Worker) took 16 minutes: about 6 for `checks` and 9 for `publish`. The Worker reached the edge in about 11 seconds.

## Local verification

```bash
npm run data:prepare -- --current-only
npm test
npm run lint
npm run typecheck
npm run build
npm run check:build
```

`tests/publication-artifact.test.ts` exercises corruption, foreign commits, unsafe paths, symlinks and stale live or source guards. Validate the workflow with `actionlint .github/workflows/firebase.yml` as well.
