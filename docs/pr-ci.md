# Pull request CI

Pull requests run three independent jobs:

- `pr-tests`: prepare the pinned release (website files and the prepared SQLite file), then all website unit tests, lint and type checking.
- `pr-build`: prepare the same data, build the production image directory and run `npm run check:build`, which starts it through the container entrypoint and renders a representative sample of every page kind.
- `pr-api`: build the submission function and run its tests; no data download or emulator startup.

Current-only checkout begins with `/website/manifest.json` in Git non-cone sparse mode. `scripts/select-current-data.mjs` verifies its SHA-256 against the reviewed lock, then selects exact source paths with the same predicate used by hydration. Hydration still verifies revision, hashes and receipt consistency, and cached checkouts cannot bypass those checks.

PR jobs omit emulators, live deployment planning, packaging and deployment. Those run on main and manual workflows.
