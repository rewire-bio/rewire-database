# UI tests and coverage

Run `npm ci`, prepare the checksum-verified current data release with
`npm run data:prepare -- --current-only`, then run:

```sh
npm run test:ui:coverage
```

This runs the complete root Vitest suite and measures the UI source with V8.
The command fails below 90% statements, lines, functions, or branches. Pull
request and deployment checks run the same command. The HTML report is
`coverage/ui/index.html`; JSON summaries are in the same ignored directory.

## Measured scope

`vitest.ui.config.ts` includes all TypeScript and TSX under `components/`,
including hooks and chart helpers; the database explorer and its hook;
route-local database entity/detail views; the audit explorer; the contribution
form; the legacy redirect fallback; and the not-found view. Files without tests
remain in the denominator (`all: true`). No individual UI file or uncovered
branch is suppressed.

Server route entry points, layout/metadata construction, server data loading,
API services and release-generation scripts are outside this UI percentage.
They still run their existing tests in the same suite. CSS and static assets
are not executable TypeScript and are checked through browser/layout review
and the production build, rather than statement coverage.

## What the interaction tests check

Tests exercise navigation and focus restoration, browser history, filter and
pagination controls, stale requests, retry/error states, comparison charts,
source and review disclosures, clipboard success/failure, and private
contribution draft/authentication/submission flows. Network, Firebase and
clipboard boundaries are mocked; private submissions are never sent by tests.
Rendering assertions inspect links, labels, active state, evidence scope and
empty/missing-data behavior. Synthetic detail fixtures are explicitly test
records and do not alter released scientific data.

Coverage does not certify visual layout or live service behavior. Check desktop
and narrow-screen pages in a browser and run the deployment smoke checks after
publication as separate verification steps.

## Deployment smoke check

Run the read-only check against the deployed website:

```sh
npm run smoke:deployment -- https://benchmarks.rewirebio.io
```

It checks the home search markup, a real JavaScript bundle, the model,
benchmark, use-case and evidence indexes, the BRCA use-case sections and
source disclosures, the linked release manifest, release-pinned model search
and benchmark filters through the public API, and detail routes returned by
those API queries. Every request has a 30-second timeout and failures produce
a non-zero exit code. It sends no contributions or authentication data.
The Cloudflare publication workflow runs this after a successful deployment.

The HTTP check is followed by one read-only Chromium browser smoke test in
that same guarded post-deployment step. Install Chromium once and run it with:

```sh
npx playwright install --with-deps chromium
SMOKE_ORIGIN=https://benchmarks.rewirebio.io npm run smoke:browser
```

The browser test executes the deployed client JavaScript: it searches for
AlphaGenome, checks the public API returned model records, opens a model and
returns with its search context, applies the benchmark filter, checks record
identities and opens a real benchmark detail. It then opens the BRCA use case,
jumps to evidence, checks the active section, expands results and provenance,
and verifies the table stays within a 390px mobile viewport. Finally it uses
the mobile section selector and primary menu to reach the model index.
Uncaught JavaScript errors, same-origin console errors and failed requests
fail the test; intentional aborted requests during navigation are ignored.
There are no private sign-ins, contributions or writes.

The test has a two-minute limit, one Chromium worker and no retries. Failure
screenshots and traces go to the ignored `scratch/browser-smoke/` directory.
`SMOKE_ORIGIN` is required, so an operator must select the intended deployment.
The separate `smoke/` config and `.smoke.mjs` filename keep this suite out of
Vitest discovery and the UI coverage denominator.

For this change, test collection was verified without launching Playwright
locally; equivalent desktop and mobile journeys were reviewed through CUA.
The automated browser execution takes place in deployment CI.

For an operator deployment while automatic Cloudflare publication is disabled,
run the `Public deployment smoke` workflow after publishing the checked artifact:

```sh
gh workflow run deployment-smoke.yml -f origin=https://benchmarks.rewirebio.io
```

This runs the same HTTP and browser checks without rebuilding or publishing.
