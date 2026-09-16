# Omics catalogue interchange v1

Reviewed JSONL records are the publication source. The release builder writes `public/omics/catalogue.json` and versioned JSONL/CSV exports. This is a public-data contract; email addresses, submission tokens, and private correspondence must never be exported.

Each record is an object:

- `id`: stable lowercase slug, unique across kinds.
- `kind`: `model`, `benchmark`, `dataset`, `baseline`, `evaluation`, `result`, `source`, or `claim`.
- `name`: display name.
- `description`: plain text.
- `status`: `discovered`, `needs_review`, `source_checked`, `reproduced`, `disputed`, `superseded`, or `excluded`. Source-checked is not reproduced.
- `facets`: object mapping facet names (e.g. `areas`, `tasks`, `modalities`, `organisms`, `method_types`) to arrays of strings. No closed domain enum.
- `source_ids`: IDs of source records supporting this entity.
- `links`: array of `{ "relation": "model|benchmark|dataset|evaluation|baseline|family|variant_of|alias_of|uses_model|part_of|evaluates_task|parent|supersedes|original_evaluation|subject|source|applicable_to", "target_id": "..." }`. References resolve within a release.
- `attributes`: kind-specific JSON object. Explicit unknown metadata uses null and `missing_metadata` reasons, never invented values.

A `source` has attributes `url`, `version`, `retrieved_at`, optional `doi`, `publication_status`, `artifact_sha256`, `locator` and `licence`.
A `model` has `entity_level` (`family`, `checkpoint`, `method`), `version`, `reported_name`, `missing_metadata`, and optional architecture/training/input/output/licence/access metadata. Do not collapse unidentified versions into a concrete checkpoint.
A `benchmark` has `entity_level` (`suite`, `protocol`, `task`, `challenge`, `evaluator`), `version`, `task`, `scope_note`, `missing_metadata`.
A `dataset` has `version`, `split`, `missing_metadata`, optional assay/context/accession metadata.
A `baseline` has `baseline_type`, `applicability` (`proposed` or `source_supported`), `requirements`, `missing_metadata`.
An `evaluation` has `origin` (`author_reported`, `independent_paper`, `paper_compilation`, `rewire_run`), `protocol`, `version`, `comparison` object, `missing_metadata`, links to model/benchmark/dataset, and optional `original_evaluation` link. Comparison fields: `protocol_id`, `dataset_version`, `split`, `population`, `inputs`, `adaptation`, `metric_implementation`, `aggregation`, `budget`; unknown fields are null and block automatic comparison.
A `result` links to exactly one evaluation. Attributes: `printed_value` (string), `numeric_value` (string decimal or null), `metric`, `metric_direction` (`higher`, `lower`, `unknown`), `unit`, `uncertainty` (string or null), `source_locator`, `review` (object with `method`, `reviewer`, `reviewed_at`, `notes`), `missing_metadata`, optional `legacy_id`. Retain original paper IDs and result IDs for migration. Reviewed results need a precise locator and source.
A `claim` links to a `subject` and has `field`, `value`, `source_locator`, `review` and supporting source IDs. A checked score does not mark all metadata as checked.

Snapshot JSON: `{ "schema_version": "1.0", "release_id": "...", "released_at": "UTC ISO date", "records": [...], "coverage": {...} }`. Manifest: schema/release/time, record counts, input digests, file hashes and changelog. All records sorted by ID; release building is deterministic given the records and explicit timestamp. Excluded records remain in the archive but are absent from public catalogue pages.

## Application service (revised architecture)

The application uses TypeScript, tRPC, Zod, Firestore and Firebase email-link Authentication. Public catalogue procedures serve published releases from Firestore; private procedures handle submissions, revisions and the transactional email outbox. There is no public REST platform, Prisma or relational database. Reviewed Git records remain authoritative; a database mirror does not replace immutable publication history.

The catalogue interface is `catalogue.release`, `catalogue.list`, `catalogue.get`, `catalogue.results` and `catalogue.compare` under `/api/trpc`. Reads require no sign-in. Requests use a release ID, except when explicitly resolving the active release; result responses carry provenance and review status. Pagination is bounded and tied to the release and filters. See `services/omics/README.md` for procedure inputs and response behaviour.

Static, indexable pages are generated through the same query engine against the selected Git release. Browser interactions call the service with that release pinned; downloads remain static CSV/JSONL exports. Imports remain private staging until complete and verified, and explicit activation atomically selects a published release. A partial import never becomes public. Re-activating a previous published release rolls back the active pointer without changing private contribution history.

Firebase Auth verifies email before submission; the browser supplies its ID token as Bearer authentication. tRPC procedures: `submission.create` (type/title/summary/source_urls/target_id/optional attribution/details/idempotency key; email comes from verified token), `submission.list`, `submission.get({id})`, `submission.update({id,patch})`. Curator procedures and CLI require a curator claim or operator credentials. Submitted results require model, benchmark, protocol, metric, value and source_locator. Publication is gated on a validated released record ID.

Contribution operations are disabled unless the server explicitly enables `OMICS_CONTRIBUTIONS_ENABLED=true`; the frontend independently requires `NEXT_PUBLIC_OMICS_CONTRIBUTIONS_ENABLED=true` and Firebase client configuration. The website uses same-origin `/api/trpc` by default. Disabling contributions must not disable catalogue browsing. Local tests use Firebase emulators; production backend and live email activation remain gated on deployment review. No marketing subscriptions or public contributor directory are introduced.

## Biological extensions

`attributes.extensions` supports validated `genomics`, `protein`, `cellular`, `molecular_measurement`, `microbial` and `mechanistic` blocks. The contract is in `scripts/omics/extensions.ts`. Coordinates carry their assembly, convention, strand and window orientation; variant offsets are zero-based within the window. Protein identity thresholds are fractions, with MSA/template provenance separate. Cellular doses and times require units. Molecular measurements carry identifier namespace, platform, preprocessing and units; microbial references carry taxonomy/database versions. Mechanistic evaluations carry solver, constraints and conditions. Missing blocks are unextracted, not evidence that these factors are inapplicable; null records an explicitly unknown field. Extend the schema through a reviewed change when a new modality requires more fields.

## Explanatory profiles and supported associations

Model and benchmark explanations are validated enrichment inputs merged into `attributes.profile`. They contain a summary, evidence-cited sections and facts, strengths, limitations, optional diagram steps, coverage, gaps and an explicit automated review note. Coverage `reviewed` describes the explanatory claims only; `limited` records a specific evidence limitation. Neither changes scientific result review status or establishes independent reproduction.

`variant_of`, `family` and `alias_of` describe supported model relationships. `part_of` links benchmark components to suites; `evaluates_task` connects a concrete resource to a task. These edges participate in result navigation only when backed by source-checked association claims. `uses_model` identifies a separately evaluated pipeline's dependency and does not assign its result to the base model. Retain exact configuration identity and legacy detail URLs.
