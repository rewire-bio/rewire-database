# Catalogue field-provenance audit

Audit date: 2026-09-16. Snapshot: `public/omics/catalogue.json`, release `2026-09-16-e13bae63c156`. This is a read-only audit of the released record graph, current review receipts, migration/enrichment code and relevant pinned primary artifacts. No experimental reproduction or comprehensive new scientific review was performed.

## Findings that should determine the table’s labels

The catalogue has strong **inline profile provenance**, but does not have direct evidence for every field of every record. A provenance export can cover every record now, provided it labels unsupported context and generated metadata honestly. It must not turn a record-level source link or a source-checked score into blanket verification of its model, protocol, dataset or evaluation.

| Inventory | Count | Provenance interpretation |
|---|---:|---|
| All records | 1,669 | Includes sources, claims and editorial/discovery records |
| Models / benchmarks | 226 / 170 | Every record has a profile and a matching profile review receipt |
| Profile fact rows | 4,391 | 3,496 source checked, 645 unreported, 250 inapplicable |
| All profile assertion blocks | 6,611 | Summaries, sections, facts, strengths, limitations and diagrams |
| Multi-source assertion blocks | 1,531 | Multiple sources share one combined locator; not an independently matched locator for every source |
| Sources | 639 | 612 hashes; 600 nonempty versions; 639 retrieval dates |
| Sources cited by profile assertions | 565 | Every referenced profile source has a hash |
| Results / evaluations | 167 / 159 | Score review and evaluation completeness remain separate |
| Dedicated printed-value claim records | 143 | TAPE’s 12 and rewire’s 12 results use inline review provenance instead |
| Datasets / baselines | 101 / 27 | Most use record-level source context, not reviewed field-level assertions |
| All claim records | 180 | 143 printed values, 36 relationship claims, one metadata correction |

All 396 receipt `profile_sha256` values match the current profile bodies under the documented canonical serialization. That verifies artifact integrity; it does not establish the truth of each scientific statement anew.

### High-priority pitfalls

1. **MFASS hash scope is different from its source URL.** `rewire-mfass-v2-source.attributes.artifact_sha256` is calculated from local `data/benchmark-runs/mfass-v2.json` in `scripts/omics/migrate.ts`, while the URL points to the upstream benchmark repository revision. Display “local imported run manifest” for this hash. It is not the digest of the upstream repository or the individual result file named by each result locator. A future source correction can attach individual artifact hashes without changing historical numeric results.
2. **Evaluation fields are mostly unresolved even after profile completion.** Every one of 159 evaluations has null `comparison.adaptation`, `aggregation`, `budget`, `inputs` and `metric_implementation`; 155 have null population, 143 null protocol ID and dataset version, and 113 null split. The richer benchmark/model prose is not evidence that those exact evaluation fields have been resolved. Do not copy family-wide values into an evaluation.
3. **Legacy field names can be misleading.** Migrated evaluation `attributes.version` is copied from the legacy model version. BarcodeBERT’s `4–4–4` is not a protocol version. Its `comparison.split` contains `1-NN probe`, a procedure label, not a split manifest. A field provenance table must expose the literal path and inherited mapping rather than silently improve its semantics.
4. **Zero outstanding profile facts is not zero catalogue gaps.** Current `attributes.missing_metadata` still contains 170 `unextracted` values, alongside 1,146 `not_reported_in_legacy_extract` values. Models and benchmarks also preserve historical missingness separately. Historical missingness must be distinguished from current profile facts; other record kinds’ missingness remains current.
5. **Copied evidence lacks a resolved original identity.** Four evaluations have `origin=paper_compilation`, including EDEN’s DNABERT-2 H-CPD result and two scELMo comparator rows. They have no `original_evaluation` link. Their scores can remain source-checked transcriptions, but original experiment identity is unresolved and they must not count as independent replications.
6. **Matching source hashes do not imply matching claims or identity.** The 612 source hashes represent 507 unique byte hashes, with 73 shared-hash groups. Several are identical Apache licence texts from different repositories. The legal subject and source location still differ. Hash-only deduplication would erase provenance distinctions.

## What is directly supported, and what is not

### Models and benchmarks

Current profile summaries, sections, facts, strengths, limitations and diagrams each carry sources and a locator. Review metadata is profile-scoped and automatically reviewed. A fact’s explicit status governs that fact; the containing record’s `discovered` or `needs_review` status does not erase its field-level review, and a reviewed profile does not upgrade the record envelope.

Some blocks combine verified facts and precise omissions, such as an available model input specification with an undisclosed checkpoint digest. Preserve the original prose and its fact status. Do not machine-split the paragraph into newly “verified” atomic claims. The absence statement’s scope is the inspected source, not all possible literature.

Wrapper fields such as `name`, `description`, `facets`, `reported_name`, `version`, `access`, `entity_level`, candidate benchmark IDs and legacy missingness usually have no field-specific claim. The AlphaFold Server entity-level correction is an exception, supported by its dedicated claim. A sourced profile can supersede an old description conceptually without retroactively verifying that description. The old generic descriptions remain separate editorial/legacy text.

Broad task labels, task-guide entity types, candidate applicability and conceptual diagram sequencing include editorial synthesis. A citation supports their biological context; it does not mean the source authors published this catalogue taxonomy or those precise prose formulations. Label such material “reviewed explanatory synthesis” or “editorial metadata” as appropriate.

### Results

Every result has an explicit source locator and inline review object. For 143 migrated results, dedicated claims support `attributes.printed_value`. Do not limit result exports to those claim records: the 12 TAPE rows and 12 historical rewire results have usable inline evidence.

A printed-value review supports transcription of the cited table cell. It does not necessarily verify `numeric_value`, unit conversion, metric direction, uncertainty interpretation, denominator, model identity or full protocol. Preserve the row/header and context that disambiguates the number. Many reviews include exact row/header checks; the later numerical-integrity replay explicitly does not newly establish row/column semantics. Export both reviews without replacing the first review’s purpose with the later replay.

143 metric directions remain `unknown`. Do not infer direction from a metric-name dictionary and then describe it as source-derived. Such a normalization can be useful later, but needs an explicit derived rule and separate review status.

For rewire rows, `existing_run_import` preserves an already documented run. The catalogue ingestion was not a new reproduction. Display the evaluation origin as rewire and the import review as historical import, retaining the historical `reproduced` record status without claiming a new experiment occurred on the ingestion date.

### Evaluations and datasets

All have record-level source links, but these are context, not field evidence. Many were deterministically constructed from a legacy result row. Track the input row and mapping as migration provenance. For example, an evaluation’s model, benchmark and dataset relationships are constructed from hashed legacy identity components; those edges are useful navigation, not proof that every checkpoint or dataset accession was resolved.

The migration constructs dataset IDs from paper, dataset label, dataset version and split. These IDs therefore represent paper-specific dataset contexts; identical original datasets reused in different papers can have different IDs. Conversely, a paper’s dataset label is not sufficient to resolve an original accession. Preserve these IDs and indicate identity resolution status instead of presenting them as globally canonical dataset accessions.

MFASS has a source-checked cohort record and imported coverage counts. The locality and upstream scope of its digest must remain clear. Do not fill other datasets’ missing denominators with MFASS-like defaults or borrow cohort counts from a related but differently filtered evaluation.

### Baselines and proposed applicability

All 27 baseline records are discovery records. Most contain curated task applicability, requirements and proposed controls. A baseline’s citation can substantiate the method or rationale without proving it was measured in any evaluation. Label `applicable_to` and `applicability=proposed` as proposals. A null/chance reference is not a numerical result until its dataset denominator, metric definition and derivation are recorded.

### Sources and claims

A source’s URL, retrieval date, version and hash are source/retrieval metadata. A `source_checked` source status often means artifact identity checked, not all claims reviewed. `review_scope` is therefore material and should be displayed or linked.

For mutable web pages, a retrieval time and content hash identify the observed content but do not guarantee the cited URL can retrieve those same bytes later. Distinguish immutable revision, mutable snapshot and missing version. Respect `hash_scope`, `artifact_format`, `artifact_member` / `archive_member` and archive hashes when present. An extracted member hash is not the ZIP archive hash; rendered text is not the original HTTP body.

Claim records are themselves editorial records describing an evidence assertion. The claim’s `subject` relationship identifies the supported record and `attributes.field` identifies scope. A relationship claim uses `links:<relation>:<target_id>`; do not treat it as ordinary dot-path syntax. A `previous_value` is correction history, not a simultaneously current claim.

## Exact deterministic extraction semantics

Use separate **field rows**, **support edges**, and **review events** internally, even if the UI joins them into one table.

### Field row

Required columns:

- `release_id`, `record_id`, `record_kind`, `record_name`.
- `field_pointer`: RFC 6901 pointer into the exact released JSON, including array index where relevant. `field_label` is presentation only.
- `value_json`: canonical JSON preserving strings, decimal precision, null, booleans and arrays; `display_value` may be formatted separately.
- `basis`: `explicit_claim`, `profile_assertion`, `inline_result_review`, `migration_mapping`, `editorial_metadata`, `retrieval_metadata`, `record_context_only`, `derived`, or `unknown`.
- `evidence_status`: original fact/claim status where present; otherwise `unreviewed` or `not_applicable` as appropriate. Keep `record_status` separate.
- `missingness`: `unreported`, `unextracted`, `unavailable`, `inapplicable`, `legacy_not_extracted`, or null, preserving the original reason verbatim.
- `assertion_group_id`, `review_event_ids`, `support_count`, and correction/supersession pointers where applicable.

One profile fact block may be represented by its `/attributes/profile/facts/N/value` row, with status, label and support metadata attached. A section’s body, a strength’s text and a diagram as a conceptual block are distinct assertions. Do not give a paragraph’s citation independently to each arbitrary sentence or create statistical independence by emitting several rows.

A non-claim wrapper field still receives a row. If its only support is `record.source_ids`, label `record_context_only` and leave the precise evidence locator null. Do not borrow a locator from an unrelated profile claim. Technical IDs, name concatenation, facet assignment and timestamps are generated/editorial fields; their origin is the publication pipeline or source record, not a scientific paper.

Exclude embedded historical mirrors (`legacy_row`, `legacy_paper`, `historical_missing_metadata`) from the default current-facts table. Make them available under a history filter or a separate provenance layer. Expose review metadata as review events rather than recursively claiming that `review.reviewer` is itself scientifically sourced. Empty descriptions are empty editorial fields, not unreported scientific values.

### Support edge

Each edge should carry `assertion_group_id`, `source_id`, source URL/version, retrieval time, artifact URL, digest, digest scope, member path where relevant, and exact locator. Also carry `locator_scope=assertion_group` when the existing block has one locator covering several sources. Do not claim that each source independently supports every clause.

Retain multiple support edges in JSONL or relational form. Avoid a CSV cell containing a lossy join of URLs and locators. A denormalized CSV may use one row per field–source edge, but include an assertion ID and make clear those are citations, not extra results or independently reviewed claims.

### Review event

Normalize the existing alternatives without discarding their raw content: `method`, `reviewer` / `reviewer_type`, `reviewed_at` / `date`, `notes` / `note`, scope, outcome and artifact identity. Possible scope labels include transcription, explanatory metadata, relationship identity, source retrieval, mechanical integrity replay and experiment reproduction. Never change “automated” to “human” or “source checked” to “reproduced”.

### Explicit precedence and conflicts

An exact field claim is the strongest scoped evidence for that path. A profile assertion is authoritative only for its own path. Inline result review covers its declared cell/scope. A migration receipt explains where a value came from but does not verify the biological claim. Record-context citations are the fallback.

If two current claims disagree, emit both support claims with conflict status; do not choose by latest retrieval date. A correction’s `previous_value` is history and the released field value is current. Preserve all IDs, evidence hashes and historical releases.

### Results and evaluation identity

The result row should expose result ID, evaluation ID, exact model ID, benchmark ID, dataset IDs, metric, printed value, numeric representation, units, uncertainty and coverage, while retaining their **different evidence scopes**. The graph join supplies navigational context; it does not create evidence for the joined model’s unknown checkpoint.

Define an optional `original_result_identity` only when verified: original source/version, table or artifact identity, complete row/column/subtable coordinates, evaluation configuration and metric. A later paper quoting the same experiment refers back to that identity. Until resolved, leave it unknown and keep `paper_compilation` explicit. Never deduplicate by matching score, model name or artifact hash alone.

`numeric_value` should preserve its current decimal string. If it is a parse of `printed_value`, record `derived_from` and the exact parse rule; if scaled or transformed, record the transformation and original unit. Do not repair ambiguous values or reinterpret ± terms inside a provenance exporter. Data corrections require a reviewed release.

## Suggested UI and acceptance tests

Default columns: **Field / Value / Evidence basis / Review status / Source and location**. Secondary details: version, retrieval time, digest scope, exact pointer, record status and review method. Keep filters for current evidence, source omissions, editorial/generated fields, historical fields and unresolved context.

A compact coverage banner should count reviewed assertions and unresolved fields rather than claim “all data verified.” Distinguish source-checked explanatory content from result transcription and actual rewire runs. Broad task guides should not appear to have a complete executable protocol merely because their inapplicable fields are filled.

Acceptance examples:

1. BarcodeBERT: 78.5% points to Table 1’s unseen-species genus 1-NN cell; its model version is not shown as protocol version, and `split=1-NN probe` is visibly a legacy procedure field.
2. TAPE: all 12 scores appear despite lacking dedicated printed-value claim records; their inline review and source-review receipt remain visible.
3. MFASS: all 12 scores appear; local manifest hash scope is explicit, historical import is not a fresh reproduction, and coverage differences remain visible.
4. EDEN/scELMo quoted rows remain quoted, with unresolved original identity; citation rows do not increase evaluation counts.
5. AlphaFold Server entity-level correction has its own source and locator; generic legacy description/source references are not promoted to verified architecture claims.
6. Profile unknowns retain their exact statuses and absence scope. Current profiles and historical missingness do not overwrite each other.
7. Same Apache licence bytes in two repositories remain distinct source applications.
8. A two-source paragraph with one combined locator is represented as one reviewed assertion with two supporting references, not two independently verified statements.
9. Source hash/member/format scope survives round-trip CSV and JSONL exports; row ordering and checksums are deterministic.
10. All field rows resolve to the release and value they describe; field counts exclude historical mirrors by default, and all 1,669 records are represented without implying all fields are scientifically verified.

## Primary-source spot checks retained in this audit

The previously inspected pinned sources were revisited for exact methodological scope: Cell2Sentence Table 5 reports checkpoint-specific parameter totals; ENBED’s supplement separates enhancer split counts from mutation-generation leakage controls; DeepInterAware’s supplement separates antigen, antibody and joint holdouts; the original miTAR paper identifies the human interaction datasets reused by RNAret. These support specific metadata assertions, not propagation of those details to every family member or evaluation. The audit’s broader completeness counts are structural checks, not a second full reading of all scientific sources.


## Independent implementation review

Reviewed `services/omics/src/evidence-table.ts`, `catalogue-query.ts`, release export integration and `components/catalogue/EvidenceTable.tsx`. Added `tests/omics-evidence-table.test.ts` with 18 tests against the reconstructed current catalogue and synthetic edge cases. The catalogue is rebuilt from tracked authoritative inputs rather than depending on an ignored local snapshot, so the checks also work from a clean checkout.

All 18 tests passed on 2026-09-16. Coverage includes all 1,669 public records, every one of the 167 printed result values (including the 24 without dedicated printed-value claims), exact profile fact statuses and citations, source hashes and MFASS manifest scope, quoted origins, source concerns, pagination across record/scope/query/release boundaries, CSV escaping, private-field exclusion and deterministic ordering under shuffled input records. Null, zero, false and empty arrays remain distinct. Equal source bytes do not collapse distinct source identities.

The review identified issues that the implementing agent corrected and that the tests now cover:

- Explicit null claim values previously fell through to target IDs and falsely conflicted.
- Object property ordering previously caused false conflicts between equivalent JSON values.
- Conflicting claim values were absent from subject evidence rows; `claimed_value_json` now preserves them alongside the catalogue value and original claim status.
- Dedicated result claims previously lost the inline extraction receipt. Receipt inheritance now requires the same value, source and locator; a matching number from a different table cell cannot inherit that review artifact.
- The table count previously called all rows source-linked, including metadata rows without external sources. It now says evidence rows.

The table correctly leaves metric units, numeric encodings, evaluation version strings and other unclaimed contextual metadata outside individual source-check status. Profile missingness remains field-specific, with `unreported` and `inapplicable` preserved rather than relabelled verified. Source metadata is labelled catalogue bookkeeping. Combined locators are explicitly shown as shared by the listed references. These boundaries are essential: this export makes existing review provenance inspectable; it does not independently validate every legacy field or resolve missing experimental protocols.

This is a code/data and targeted test review. Browser rendering, production deployment and broader application validation remain the implementing agent's responsibility. No source record or numerical result was changed by this audit.
