# Build and publication throughput

Production builds run in the cancelable `checks` job. Only the separate `publish` job holds
`database-publication`, with cancellation disabled. A new build can start while an earlier
publication is running. Pull-request lanes retain their independent five-minute budgets.

The build verifies the pinned data, renders and checks the full required route set, runs the
existing integration checks, then packages checked UI bytes, current catalogue/manifest and
the source-bound deployment plan. The one-day Actions artifact deliberately excludes
`out/omics` historical downloads, service environments, dependencies and credentials.
Each transported regular file has a byte count and SHA-256 digest; the publisher checks the
complete inventory, commit and release receipt before restoration.

UI-only publication needs no historical checkout. Full publication rehydrates the pinned
producer exports and checks current catalogue/manifest against the checked build. Historical
exports are hardlinked into `out/omics`; they are never rerendered or transferred through the
Actions UI artifact. A full publisher still spends setup/hydration time under its job lock:
GitHub job concurrency includes setup, not just the mutation steps. Timings make that cost
visible. This approach avoids a second tens-of-gigabytes export artifact.

Before setup and again immediately before production writes, publication fetches `main` and
compares it to the checked commit. Superseded builds report a skip without production writes.
An intervening UI publication can refresh the live base only when catalogue release,
manifest and all data/backend/Hosting fingerprints still match the checked build. The final
guard saves that verified base without changing checked UI bytes. Data/backend drift or a
stale full publication blocks and requires a rebuild. Backend state checks, catalogue pointer
rollback, Hosting rollback and Cloudflare rollback remain in force. Manual cancellation of an
active publisher is still unsafe. Another main workflow that writes these targets must use
the same noncancelable publication group.

## Timings

`DEPLOYMENT_METRICS_FILE` enables JSONL receipts. `deployment-metrics.mjs run STAGE -- COMMAND`
records success/failure and elapsed time while preserving the command's exit status. Scripts
also record nested Hosting, catalogue and Cloudflare stages with byte/file counts. No command
arguments, tokens, environments or exception messages are written to timing receipts.
Telemetry write failures do not change a deployment result or trigger rollback.

Both jobs print an Actions summary and retain their receipts for seven days. Nested timings
overlap and must not be added together. `handoff_wait` measures artifact preparation to the
publisher's receipt check; it includes transfer, scheduling and publication-queue waiting, not
just time in the queue. Actions job timestamps are needed to isolate pure concurrency wait.

Collect three UI-only releases (cold and warm caches) and one full release before selecting a
latency budget or caching more work. Check rendering, compression/hash, retained-file
enumeration, upload and activation independently. This change does not claim a measured live
speedup: activation costs and full static rendering remain, and no production experiment is
run by local tests. Server rendering or immutable file/hash caching should follow those
measurements, with explicit SEO, alias, 404 and asset/layout compatibility checks.

## Local verification

```bash
npm run data:prepare -- --current-only
npm test
npm run lint
npm run typecheck
npm run build:web
npm run check:export:web
```

`tests/publication-artifact.test.ts` exercises corruption, foreign commits, unsafe paths,
symlinks, matching full hydration, preserved historical downloads and stale live/source
guards. Existing transaction and Hosting fixtures exercise failure and rollback. Validate the
workflow with `actionlint .github/workflows/firebase.yml` as well.
