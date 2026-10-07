# Website updates and data releases

The Firebase workflow builds and validates the website once per revision. Its
public `deployment.json` receipt records the exact source fingerprints, commit,
release ID and manifest digest from the last published Hosting version. It
contains no credentials or private records.

## Selecting work

`scripts/deployment-plan.mjs` hashes tracked input names and bytes. `benchmark-data.lock.json` alone determines the data fingerprint. Data inputs and
generation belong to the separate data repository; frontend code and dependencies
do not invalidate the catalogue. Hosting configuration has a separate fingerprint. Missing,
unavailable or invalid receipts select the full path; a manual `force_full` run
also restores all prepared archives and redeploys the backend.

When the data and Hosting fingerprints match, `npm run build:web` prepares only
the current release. All current artifacts arrive prebuilt and checksum-verified from the pinned
data repository, without running its generator or expanding historical downloads. The static build keeps
local historical files intact but omits them from `out/`. Export verification
still checks every generated page and current artifact; only exact historical
paths declared by archive receipts may be absent locally.

Next's compiler cache is restored in CI and explicitly saved before its disk
cleanup. The cache is separated by OS, Node version, dependency lock and public
build environment. It is a compiler optimization, not a source of scientific
records. Expanded historical archives and generated catalogue files are not
stored in this cache.

## Publication and rollback

For a website update, the publisher verifies the live Hosting receipt, exact
manifest bytes and active API release. It clones **only** the prior `/omics/`
files server-side into a draft Firebase Hosting version, explicitly registers
every retained path/hash mapping against Firebase's existing stored bytes, then
uploads the checked website files. Registering retained files must require zero
uploads; otherwise publication stops. This handles incomplete filtered-clone
inventories without rebuilding historical archives. Paginated path/hash
comparisons prove that every previous `/omics/` file is retained and no stale UI
file survives. Firebase's two managed initialization files are accepted only at
their exact paths with the hashes captured from the source version. The prior Hosting
configuration is inherited only because its fingerprint matched.

The publisher checks the live base again immediately before release. Draft
failures do not trigger live rollback. A failed or ambiguous release request,
or a failed live check, restores the captured Hosting version. UI updates never
activate or roll back an unchanged catalogue pointer. CI serializes production
runs; operators must not perform concurrent manual publications during this
transaction.

Changed data or Hosting configuration takes the full build/publication path,
with complete archive checks. Full publication refuses to omit already
published historical downloads. Archive a newly published release in
`data/omics/releases/` in the data repository before a later full release would supersede it. Do not
bypass this guard or remove historical URLs to recover a failed deployment.

Backend skips use an independent private Firestore document,
`deploymentState/backend`, under the existing deny-all client rules and existing
deployment identity. The workflow marks it `deploying` before changing Functions
or rules and marks it `ready` only when the entire backend command succeeds.
Missing, mismatched or incomplete markers require deployment. Hosting rollback
does not roll this marker back, so a failed website deploy cannot hide a newer
or partially deployed backend. Publication asserts a matching ready marker.

The initial run has no receipts and deliberately follows the full path. Use
`force_full` for recovery if inputs, receipts or backend state are uncertain;
required checks and rollback are retained. An unexpected live base change
requires a new checked build, not an edited plan file.

Cloudflare publishes the checked frontend after Firebase, followed by HTTP and
Chromium smoke tests. Production CI fails early if automatic Cloudflare
publication is disabled or its account/token secrets are missing, rather than
reporting success after publishing only the Firebase origin.

Verified website-only runs restore the current-release-only cache used by PR
checks. On a cache miss, the authenticated pinned manifest selects the exact
current compressed payloads; historical archives are fetched only for full runs.
Workflow edits alone do not invalidate the backend fingerprint.

When the live receipt and fingerprints confirm unchanged data, Hosting
configuration and backend, publication uses bounded core acceptance inside the
existing rollback transaction. It verifies the active release/count, representative
queries, chart/result/evidence links, BRCA details/backlinks, contribution gates,
exact manifest bytes, use-case artifact hash and representative published pages.
Cloudflare uses the same acceptance selection. Data/backend changes and forced
full runs retain exhaustive audit and use-case/result/configuration/source checks.
This reduces repeated catalogue walks without weakening immutable release or
rollback checks.

## Remaining cost

All record pages are still exported with their complete content and metadata.
Reproduction panels reuse the existing catalogue index and metadata avoids
unnecessary relationship queries, but compilation caching does not eliminate
static rendering. Moving record pages to on-demand rendering requires a Next
server/runtime migration, cache and cold-start validation, and a separate rollout.

API references: [Firebase Hosting deployment](https://firebase.google.com/docs/hosting/api-deploy),
[version cloning](https://firebase.google.com/docs/reference/hosting/rest/v1beta1/sites.versions/clone),
[Next compiler caching](https://nextjs.org/docs/14/pages/building-your-application/deploying/ci-build-caching).
