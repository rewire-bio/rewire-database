# Evidence tables

The release generator publishes `evidence.csv` and `evidence.jsonl` beside the existing records and catalogue exports. Their SHA-256 checksums are in the immutable release manifest. The table is generated from reviewed records; it is not a separate editable source of scientific assertions. The source JSONL inputs, profile review receipts and pinned artifacts remain authoritative.

`coverage.evidence_table_version = "1.0"` identifies the new export contract. A generator fingerprint in coverage binds the compiler, profile schema and privacy boundary to the release ID. Older releases retain their original three exported files and exact checksums. The record-envelope schema remains 1.0.

## Row identity and scope

Each row identifies a record, field and source. Separate claim records add their claim ID, so conflicting assertions can coexist. Stable row IDs are release-pinned: array positions identify the actual profile item in that release and must not be treated as cross-release semantic identities. A multi-source statement produces several citation rows, not several independent findings.

The table contains:

- The record's identifier, kind, name, status, descriptive metadata, facets, relationships and attributes. Objects are flattened by field; arrays retain their exact JSON value.
- Each profile's introduction, facts, explanations, strengths, limitations and diagram, with its specific evidence and review.
- The original printed value of every numerical result, including results whose review is inline rather than a separate claim record.
- Source bibliographic/retrieval metadata and administrative history, explicitly distinguished from scientific claims.

`evidence_scope` distinguishes `individual_claim`, `record_context`, `source_metadata` and `catalogue_metadata`. A record-level source or status never verifies all of its fields. `review_status` retains unreported, unextracted, unavailable and inapplicable states. Context-only fields use `not_individually_reviewed`; missing/unspecified context values are labelled accordingly. A mismatched explicit claim is marked `conflicting_claim` rather than validating the current field.

`value_json` preserves original types, decimal strings and nulls. `value` is a readable representation. CSV formula-leading cells receive an apostrophe for spreadsheet safety; JSONL preserves exact strings. This export performs no scientific normalization, unit conversion, uncertainty reinterpretation or identity consolidation. In particular, `evaluation.attributes.version` is not assumed to be a protocol version, and inherited legacy split text is not a verified partition manifest.

## Provenance columns

The table records `source_id`, title, original URL, DOI, version, exact locator, artifact URL, SHA-256, hash scope, format, archive member and retrieval date. Review method, date, note and any separate extraction artifact are retained. Empty fields mean the metadata was not recorded; they do not imply a successful check.

When a statement cites several sources with one combined locator, `locator_scope = shared_claim_locator`. The table does not invent a separate locator for each source. A source digest is not a scientific identity key: two repositories can contain identical licence bytes with different applicability.

The MFASS v2 source digest identifies the local imported `data/benchmark-runs/mfass-v2.json` manifest, not the upstream repository or each upstream numerical-result file. Its scope is explicitly labelled. Historical run imports retain their original review note and are not new reproductions.

## Website and API

Every record includes a searchable, paginated evidence table. Models, benchmarks and results initially show individual claims; other record types start with their applicable context or source metadata. All scopes remain accessible. The `/evidence/` guide explains the distinctions and links to whole-catalogue downloads.

The public catalogue API provides `catalogue.evidence` with required `release_id` and `id`, optional `q` and `scope`, and the existing `cursor` / `limit` contract (1 to 100 rows). Cursors are bound to the release, record and filters. Pages and the API read the same evidence rows from the prepared release file. Public evidence reads cannot enable contribution routes or expose private submission fields.

## Research boundary

Competitor pages inform presentation and acceptance standards only; scientific facts come from original papers, supplements, official repositories and documentation. See the dated competitor review for inspected pages and limitations.

All current model/benchmark profiles have primary-source explanations or explicit source limitations. That does not mean all dataset/evaluation/baseline metadata has been fully extracted or that all scientific claims have been independently reproduced. Keep gaps visible and correct data only through a reviewed, newly versioned release. Prior numerical records are preserved unchanged.
