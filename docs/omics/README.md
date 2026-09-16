# Omics evidence database

## Stack and scope

The implemented stack follows the user's revised choice: the existing Next.js/TypeScript site, tRPC/Zod for private contribution procedures, and managed Firestore with Firebase email-link authentication. There is no PostgreSQL, Python web service, public REST API or new hosting resource. Scientific collection helpers can be scripts; the application and release pipeline use TypeScript.

The scope is specialist omics and molecular models, including DNA/RNA language models, proteins, interactions, cells, microbes, metabolic measurements and relevant mechanistic systems. Clinical assistants, general medical QA and standalone medical imaging are excluded. Imaging must have an in-scope molecular/omics endpoint. The current 100-paper scope audit excludes kidney pathology segmentation and two general-purpose prompted annotation studies; it retains biological representation pipelines and protein-localisation imaging. Each decision is recorded in `data/omics/scope-audit.jsonl`.

The catalogue is a **dated initial collection**, not an exhaustive census, a universal leaderboard, or independent reproduction of external experiments. See `data/omics/research.md` and the search ledger for nine research lanes, sources and gaps. A dataset is the underlying measurements; a benchmark specifies how a capability is evaluated using a particular dataset, split, allowed inputs and metrics.

## Build and review

```sh
npm ci
npm run omics:migrate
npm run omics:release
npm run test:omics
npm run build
```

`data/omics/migrated.jsonl` and `discovery.jsonl` are reviewed public-data inputs. Original CSV rows and IDs are preserved verbatim in migration records. Fresh source-table receipts are in `legacy-review.jsonl`; separately inspected grouped headers and PDF tables have `legacy-manual-*.jsonl` review overrides tied to artifact hashes. The numerical review checks transcription, not every accompanying scientific claim. Reviewers are recorded as automated or AI-assisted, never implicitly human.

`npm run omics:check-sources` fetches primary Europe PMC XML into ignored workbench storage and records exact row/header matches. It deliberately leaves ambiguous tables for review. A new source hash invalidates previous overrides, requiring renewed inspection. Some publishers prevent automated retrieval; such rows remain in the review queue rather than inheriting a verified badge. Never fix a score silently: retain the historical record and add a corrected/superseding record with evidence.

The release command validates IDs, references, privacy boundaries and result provenance, removes excluded/quarantined claims from the public snapshot, and creates deterministic content-addressed releases under `public/omics/releases/`. Its manifest records checksums and coverage. Static pages read the same snapshot as downloadable JSONL/CSV. Unknown model versions stay unknown; source-specific method entries are not silently merged into exact checkpoints.

The database has one home at `/`. The former `/database/` entry and domain pages redirect into this view. `/literature/` selects published evaluations in the same result collection. Included historical paper URLs redirect to source records; excluded papers retain noindex citations without score tables. Original CSV/JSON downloads remain available under an archive disclosure for citation compatibility. The MFASS v1 supersession and existing v2 run remain intact; no model computation is performed here.

## Browse locally

```sh
npm run dev -- --port 3000
```

Visit `/` and `/contribute/`. The latter offers a downloadable draft when the service is unconfigured; it never claims to have sent anything. With Firebase emulators configured it supports verification, submission, private status, revisions and sign-out. Source/data/protocol pages link to one another. A comparison is blocked if any necessary protocol information is missing, mismatched or superseded.

Contribution pages disable site analytics and set no-referrer/noindex metadata. Public attribution is opt-in and excludes email. No newsletter, marketing consent or public profile is created.

## Service and publication

See `services/omics/README.md` for the TypeScript service, Auth/Firestore emulators, curator commands and mail outbox. Install/build/test it separately:

```sh
npm --prefix services/omics ci
npm --prefix services/omics run build
npm --prefix services/omics run test:emulator
```

Firebase email links are exchanged by the browser SDK; the service accepts verified Firebase ID tokens. Direct Firestore client reads/writes are denied. The Admin service mediates owner access and curator transitions. Import a validated static release into the private Firestore mirror before assigning a contribution's published record IDs. Publication of a submission does not auto-deploy the website.

Restore/rollback: check out the desired reviewed input revision, rebuild its deterministic release, verify its manifest and publish the static site through the normal reviewed deployment. Reimport the release into Firestore if needed. Do not restore or overwrite private submissions as part of public-data rollback. Configure managed private backups before activation; retain versioned public releases separately.

## Maintenance

- Weekly: run `npm run omics:check-updates` for pinned GitHub source changes; screen publication feeds, model cards, corrections/retractions and contributor submissions using the search ledger. The command writes a review report only.
- Monthly: review selected changes and complete source tables, update metadata gaps, create a release, run checks and publish through a focused PR. No automatic score replacement or unchecked release.
- Expand discovery until each search lane's logged candidate inventory is screened; measure coverage by included/reviewed/blocked/excluded sources rather than an arbitrary model-count target.

These commands are prepared but no recurring automation, paid service or production email delivery is enabled.

## Extracted review branch

This work is preserved on `codex/omics-evidence-database`, separate from the currently published baseline on main. Root routes now use the database hostname. No live service, email or public submission is enabled. For local emulator use, explicitly set `NEXT_PUBLIC_OMICS_CONTRIBUTIONS_ENABLED=true` alongside the documented Firebase emulator configuration. The original release bytes remain unchanged; do not run migration scripts to alter historical URLs merely for presentation.
