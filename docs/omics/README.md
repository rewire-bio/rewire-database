> Historical. Data inputs and generator commands now belong to [rewire-benchmark-data](https://github.com/rewire-bio/rewire-benchmark-data). Releases are no longer imported into Firestore or exported as static pages: the website serves each release from a prepared SQLite file built into its image. See the repository README and [independent-frontend.md](../independent-frontend.md) for the current architecture. The sections below record the earlier design.

# Omics evidence database

## Stack and scope

The implemented stack follows the user's revised choice: the existing Next.js/TypeScript site, tRPC/Zod for release-pinned catalogue reads and private contribution procedures, and managed Firestore with Firebase email-link authentication. There is no PostgreSQL, Python web service, public REST API or new hosting resource. Scientific collection helpers can be scripts; the application and release pipeline use TypeScript.

The scope is specialist omics and molecular models, including DNA/RNA language models, proteins, interactions, cells, microbes, metabolic measurements and relevant mechanistic systems. Clinical assistants, general medical QA and standalone medical imaging are excluded. Imaging must have an in-scope molecular/omics endpoint. The current 100-paper scope audit excludes kidney pathology segmentation and two general-purpose prompted annotation studies; it retains biological representation pipelines and protein-localisation imaging. Each decision is recorded in `data/omics/scope-audit.jsonl`.

The catalogue is a **dated initial collection**, not an exhaustive census, a universal leaderboard, or independent reproduction of external experiments. See `data/omics/research.md` and the search ledger for nine research lanes, sources and gaps. A dataset is the underlying measurements; a benchmark specifies how a capability is evaluated using a particular dataset, split, allowed inputs and metrics.

## Build and review

```sh
npm ci
npm run omics:release
npm run test:omics
npm run build
```

`data/omics/migrated.jsonl` and `discovery.jsonl` are reviewed public-data inputs. Original CSV rows and IDs are preserved verbatim in migration records. Fresh source-table receipts are in `legacy-review.jsonl`; separately inspected grouped headers and PDF tables have `legacy-manual-*.jsonl` review overrides tied to artifact hashes. The numerical review checks transcription, not every accompanying scientific claim. Reviewers are recorded as automated or AI-assisted, never implicitly human.

`npm run omics:check-sources` fetches primary Europe PMC XML into ignored workbench storage and records exact row/header matches. It deliberately leaves ambiguous tables for review. A new source hash invalidates previous overrides, requiring renewed inspection. Some publishers prevent automated retrieval; such rows remain in the review queue rather than inheriting a verified badge. Never fix a score silently: retain the historical record and add a corrected/superseding record with evidence.

The release command validates IDs, references, privacy boundaries and result provenance, removes excluded/quarantined claims from the public snapshot, and creates deterministic content-addressed releases under `public/omics/releases/`. Its manifest records checksums and coverage. Static initial pages and the Firestore service use the same query engine over the reviewed release. Browser search, filters, result pagination and comparisons read the same-origin tRPC API, pinned to that release. JSONL/CSV downloads preserve the release bytes. Profile and association enrichment is validated separately from numerical review. Unknown model versions stay unknown; source-specific method entries are not silently merged into exact checkpoints.

The database has one home at `/`. The former `/database/` entry and domain pages redirect into this view. `/literature/` selects published evaluations in the same result collection. Included historical paper URLs redirect to source records; excluded papers retain noindex citations without score tables. Original CSV/JSON downloads remain available under an archive disclosure for citation compatibility. The MFASS v1 supersession and existing v2 run remain intact; no model computation is performed here.

## Browse locally

```sh
npm run dev -- --port 3000
```

This command shows the initial pages; interactive catalogue reads need the full emulator stack. Use the [profile preview instructions](stage-1-profile-delivery.md) for Hosting → Functions → Firestore on port5055. Visit `/` and `/contribute/`. The latter offers a downloadable draft when the service is unconfigured; it never claims to have sent anything. With Firebase emulators configured it supports verification, submission, private status, revisions and sign-out. Source/data/protocol pages link to one another. A comparison is blocked if any necessary protocol information is missing, mismatched or superseded.

Contribution pages disable site analytics and set no-referrer/noindex metadata. Public attribution is opt-in and excludes email. No newsletter, marketing consent or public profile is created.

## Service and publication

See `services/omics/README.md` for the TypeScript service, Auth/Firestore emulators, curator commands and mail outbox. Install/build/test it separately:

```sh
npm --prefix services/omics ci
npm --prefix services/omics run build
npm --prefix services/omics run test:emulator
```

Firebase email links are exchanged by the browser SDK; the service accepts verified Firebase ID tokens. Direct Firestore client reads/writes are denied. The Admin service mediates owner access and curator transitions. Import a validated release into Firestore and explicitly activate it before assigning a contribution's published record IDs. Ready imports without publication are not public. Publication of a submission does not auto-deploy the website.

Restore/rollback: check out the desired reviewed input revision, rebuild its deterministic release, verify its manifest and publish the static site through the normal reviewed deployment. Reimport the release into Firestore if needed and activate its release ID through the authenticated curator/import CLI. Restore the matching static export; in-flight clients continue to pin their original published release. Do not restore or overwrite private submissions as part of public-data rollback. Configure managed private backups before activation; retain versioned public releases separately.

## Maintenance

- Weekly: run `npm run omics:check-updates` for pinned GitHub source changes; screen publication feeds, model cards, corrections/retractions and contributor submissions using the search ledger. The command writes a review report only.
- Monthly: review selected changes and complete source tables, update metadata gaps, create a release, run checks and publish through a focused PR. No automatic score replacement or unchecked release.
- Expand discovery until each search lane's logged candidate inventory is screened; measure coverage by included/reviewed/blocked/excluded sources rather than an arbitrary model-count target.

These commands are prepared but no recurring automation, paid service or production email delivery is enabled.

## Publication and profile evidence

The API-backed catalogue is deployed from `main` to Firebase at `benchmarks.rewire.it`. Production contribution submission and email remain disabled. The earlier extraction branches preserve the migration history. For local emulator use, explicitly set `NEXT_PUBLIC_OMICS_CONTRIBUTIONS_ENABLED=true` alongside the documented Firebase emulator configuration. The original release bytes remain unchanged; do not run migration scripts to alter historical URLs merely for presentation.

Profile inputs contain claim-level citations, summary evidence and explicit field statuses. `evidence-sources.jsonl` pins additional artifacts; `metadata-corrections.jsonl` records reviewed descriptive corrections without changing scientific result values. `evidence-concerns.jsonl` adds visible source warnings and blocks affected comparisons. Review receipts under `data/omics/reviews/` bind the profile text to inspected source hashes. See [the completeness review](https://github.com/rewire-bio/rewire-benchmark-data/blob/main/docs/reviews/2026-09-16-catalogue-evidence.md) for coverage and unresolved fields.

`unreported` means the specific field was not established in the inspected sources, not that no source anywhere reports it. `unavailable` records an access limitation; `unextracted` is unfinished review; `inapplicable` means the field does not fit that entity. These distinctions never turn a source-checked result into an independently reproduced one. Hosted services have their own entity type and terms.

Published release receipts and compressed bundles preserve previous downloads byte for byte in clean builds. Run migration only for an explicitly reviewed migration change; ordinary profile updates must not regenerate historical inputs.
