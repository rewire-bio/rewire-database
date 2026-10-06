# Pull request CI budget

Pull requests run three independent jobs with a five-minute hard deadline each:

- `pr-tests`: authenticate/hydrate current reviewed data, all website unit tests, lint and type checking.
- `pr-smoke`: authenticate/hydrate the same data, build and validate a deterministic route sample.
- `pr-api`: compile the service and run its tests against tracked fixtures; no data download or emulator startup.

The website sample is defined by `lib/smoke-selection.ts`. It preserves the complete current catalogue as a query input, but emits only selected routes. Smoke artifacts are not publication artifacts. Main and manual workflows retain full export and integration/deployment validation.

Current-only checkout begins with `/website/manifest.json` in Git non-cone sparse mode. `scripts/select-current-data.mjs` verifies its SHA-256 against the reviewed lock, then selects exact source paths with the same predicate used by hydration. This includes current payloads and every immutable release receipt, without downloading expanded historical payloads. For release `2026-10-06-fea06f63ac0e`, this is 481 compressed payloads totalling 160,177,493 bytes, plus the manifest. Hydration still verifies revision, hashes and receipt consistency. Cached checkouts cannot bypass those checks.

Installed root/API dependency caches use separate platform, Node major and lockfile keys, with npm's package cache as an installation fallback. The sparse data cache is independently versioned (`current-v2`) and includes the producer revision and lockfile hash. Next's compilation cache has a dedicated smoke/default-environment namespace: PR builds do not load production public environment values. The exact requested key and restored key are printed so a fallback restore is distinguishable from an exact hit. `.next/cache` accelerates compilation; it does not itself reuse exported record HTML.

Every job reports elapsed time. Five minutes is a target requiring a measured successful GitHub run, not a claim established by setting `timeout-minutes`. Compare cold and warm runs of the same commit and record actual matched cache keys; a canceled or timed-out job is never successful validation. PR jobs intentionally omit historical disk reclamation, live deployment planning, emulators, packaging, uploads and deployment. Those remain on main/manual workflows.
