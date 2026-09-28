# Sourced research use cases

Use-case pages connect a research decision to exact catalogue evaluations. They
do not add measurements, expand numeric comparison groups or recommend clinical
care. The collection covers seven bounded research questions. The initial
splicing and protein-stability pages retain their original mappings; the
[September expansion review](use-case-expansion-2026-09-28.md) records the five
additional questions and the evidence deliberately excluded.

## Content and evidence ownership

- Codex authored and performed the initial automated source curation for issue
  [#65](https://github.com/rewire-bio/rewire-database/issues/65), followed by separate
  curation and cross-review of the expansion. The recorded actor
  and method mean automated review, not human domain review or independent
  experimental replication.
- Engineering and release responsibility remains with the repository maintainers
  through the existing review, CI, release and deployment process. A passing
  source receipt does not publish a feature or approve a scientific claim.
- Human scientific review is unassigned. That gap stays visible on both seed
  pages and every added question, and is part of the scientific-review work tracked in
  [#31](https://github.com/rewire-bio/rewire-database/issues/31).
- At each release, evidence fingerprints are checked automatically. Maintainers
  should review active mappings monthly and when a cited protocol, source or
  result changes. This is a maintenance cadence, not a newly scheduled job.

The input receipt is `data/omics/use-cases/review.json`; it binds the exact
curation and source bytes. `inputs.json` contains seven use cases and 17
protocol mappings. `sources.json` supplies the two pinned documentation source
records introduced by the initial release. All 26,124 records in baseline release
`2026-09-25-8af07e960e5f` remain unchanged by the expansion.
Scientific result values are resolved from evaluation IDs rather than copied
into these inputs.

## Initial review boundaries

The MFASS mapping covers the four matched canonical-annotation configurations,
all on the same 8,297 of 8,324 held-out variants. Its 23 assembly-orientation
exclusions and four canonical-transcript-span exclusions remain explicit.
Missing scores are not negative predictions, and the four transcript exclusions
are not established faulty variants. The reporter endpoint is proxy evidence
for wider follow-up decisions, not patient-RNA or pathogenicity validation.
Individual-condition uncertainty is unreported; paired-contrast intervals must
not be assigned to individual conditions. Historical MFASS configurations remain
in their existing protocol groups.

The two AMFR mappings describe separate completed evaluations of 2,972 mixed
single/double variants in a 47-residue construct. They do not become a joint
comparison or establish a winner. The protocols currently have no reviewed
direct task-membership relation, so the mappings omit `task_id`. The planned
single-substitution comparison under #40 remains blocked in `planned_work` and
supplies no evaluation or result. Its resource ceilings are planning limits,
not measured hardware requirements. Neither page supports clinical suitability.

The pinned documentation was obtained through the authenticated GitHub contents
API and compared byte for byte with the pinned Git objects. This is recorded in
source metadata rather than presented as unauthenticated public retrieval.
Original source URLs and SHA-256 digests remain available for audit.
The two reviewed documents also have public copies at
`/omics/sources/<sha256>.md`. Source pages link to these accessible copies and
retain the original pinned URLs in `original_url` and `original_artifact_url`.
They are exact copies, not newly written evidence or republished measurements.

## Release contract

The catalogue remains schema 1.1. A release with use cases has an optional
`coverage.use_cases` declaration and `use-cases.json` in `manifest.files`.
The declaration includes schema version 1.0, input SHA-256, use-case count and
mapping count. Its logical digest is included before the release ID is derived;
the exported artifact then embeds that release ID and has a separate byte hash.
Old releases with no declaration remain valid and return an empty collection.
Declared-but-missing or inconsistent artifacts fail release/import validation.

`coverage.use_case_sources` declares each `use-case-source-<sha256>.md` file and
its digest. Those bytes are archived alongside the sidecar. Archive restoration
reconstructs their stable public aliases and refuses unsafe filenames, changed
bytes or alias collisions. The content-addressed URL avoids a circular
dependency between source records and the containing release ID.

The same resolver serves static pages and the release-pinned API. The sidecar
does not introduce entity kinds or graph edges. Only explicitly listed, reviewed
evaluations support an active mapping. Model backlinks identify the tested
configurations and require reviewed relationships; they do not imply that every
configuration in a model family applies. Legacy evaluation roles `benchmark` and
`model` are accepted only when the existing target already has kind `protocol`
or `configuration`, respectively. This preserves exact reviewed identities; it
does not promote tasks, suites, model families, methods or pipelines. These
targets and their source and relationship dependencies enter the same stale
evidence checks as canonical roles.

The public read procedures are `catalogue.useCases` (question/input search,
area/context filters and pagination), `catalogue.useCase` (detail by slug) and
`catalogue.useCaseLinks` (reverse links by record ID). All accept `release_id`;
website requests pin it and verify the returned input digest. List pages default
to 10 entries and allow at most 100. Cursors bind to the release and filters.
These procedures use the existing public GET API and do not enable contribution
submission or private reads.

Release generation calls `loadUseCases`, which verifies the frozen receipt.
`buildRelease` accepts reviewed inputs as its optional fifth argument and the
reviewed public source bytes as its sixth, derives the declarations and builds
the artifact. It never computes replacement reviewed
fingerprints. A changed referenced record, source or membership claim moves an
active mapping to `needs_review`, withholding active evidence and backlinks.
The artifact retains the original lifecycle and reason in build-generated
`stale_from` metadata. Validation reconstructs the reviewed inputs and checks
their logical digest, then verifies that automatic demotion is the only change.
Curated inputs cannot supply this generated metadata.

## Reviewing a change

1. Read the exact source version, its retrieval record and existing limitations.
   Keep user decision, assay endpoint and transfer assumptions separate.
2. Update the scoped mapping and increment its revision. Record why it changed,
   the reviewer, the actual review method and the review time. Do not convert a
   discovered task into reviewed evidence merely by linking it.
3. During that explicit review, compute `mappingEvidenceHash(snapshot, useCase,
   mapping)` against the intended release's public records. Store the returned
   digest as the reviewed `evidence_sha256` in the input. This is a curator action,
   not a release-build step.
4. Review the final input bytes and refresh the receipt's `files` hashes. Source
   changes also require verified new source bytes and corresponding source
   metadata; do not edit an archived source or release.
5. Generate a new release. Check the unchanged-record inventory and run the
   repository tests, type checks, lint, production build, export checks and
   service/Hosting integration checks before publication.

For withdrawal, retain a mapping tombstone with its ID, use-case ID, lifecycle,
revision, reason and `prior_release_id`. Remove current protocol, task,
evaluation, citation and claim fields. Prior release downloads retain the full
historical evidence. A superseding revision uses a new mapping ID and points at
the prior superseded mapping. Neither tombstones nor stale mappings support
current evidence or active backlinks.
Release assembly verifies the referenced historical catalogue and sidecar against
their immutable receipt. The historical mapping must retain scoped evidence for
the same mapping ID and use case, at a revision no greater than the tombstone's.
An equal revision is permitted when withdrawing that exact identity. A tombstone
kept in later releases retains its original evidence-release pointer; another
empty tombstone is not sufficient history.

## Freezing a reviewed release

Generate the candidate with `npm run omics:release -- --current-only` while
reviewing, then complete the validation gates above. Freeze the exact
`public/omics/releases/<release-id>/manifest.json` bytes as
`data/omics/releases/<release-id>.json`. For every declared `manifest.files`
entry, verify its SHA-256 and preserve its bytes as a gzip file named
`data/omics/releases/<release-id>/<filename>.gz`. Use gzip compression level 9
with no timestamp, verify decompressed bytes against the receipt, and never
overwrite an existing receipt or artifact with different bytes.

The normal production build restores these archives through
`restoreReleaseBundles`. Before publication, restore the newly frozen release
into a clean temporary directory and verify its inventory, every checksum and
both content-addressed source copies. That proves a clean checkout can serve
the same evidence. The candidate's source inputs, receipt and archived files
are reviewed together; freezing them does not by itself deploy the release.

Do not add patient inputs, private contributor fields, automated clinical
recommendations or automatically published AI-generated mappings. Proposed
future mappings enter the normal review process.
