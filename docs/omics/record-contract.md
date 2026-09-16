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
- `links`: array of `{ "relation": "model|benchmark|dataset|evaluation|baseline|family|parent|supersedes|original_evaluation|subject|source|applicable_to", "target_id": "..." }`. References resolve within a release.
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

The latest user instruction replaces PostgreSQL/FastAPI/public REST with TypeScript, tRPC, Zod, Firestore and Firebase email-link Authentication. Catalogue browsing and downloads use static release files, avoiding database reads per page view. Firestore stores a verified catalogue release mirror, private submissions, revisions and transactional email outbox. No Prisma, relational database, public REST API or paid provisioning is required.

Firebase Auth verifies email before submission; the browser supplies its ID token as Bearer authentication. tRPC procedures: `submission.create` (type/title/summary/source_urls/target_id/optional attribution/details/idempotency key; email comes from verified token), `submission.list`, `submission.get({id})`, `submission.update({id,patch})`. Curator procedures and CLI require a curator claim or operator credentials. Submitted results require model, benchmark, protocol, metric, value and source_locator. Publication is gated on a validated released record ID.

Contributions are disabled unless Firebase client configuration and NEXT_PUBLIC_OMICS_API_URL are set. The Firebase Auth emulator is used in local tests; production Functions/email deployment is deferred pending hosting approval. No marketing subscriptions or public accounts/profile directory.

## Biological extensions

`attributes.extensions` supports validated `genomics`, `protein`, `cellular`, `molecular_measurement`, `microbial` and `mechanistic` blocks. The contract is in `scripts/omics/extensions.ts`. Coordinates carry their assembly, convention, strand and window orientation; variant offsets are zero-based within the window. Protein identity thresholds are fractions, with MSA/template provenance separate. Cellular doses and times require units. Molecular measurements carry identifier namespace, platform, preprocessing and units; microbial references carry taxonomy/database versions. Mechanistic evaluations carry solver, constraints and conditions. Missing blocks are unextracted, not evidence that these factors are inapplicable; null records an explicitly unknown field. Extend the schema through a reviewed change when a new modality requires more fields.
