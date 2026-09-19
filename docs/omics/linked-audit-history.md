# Linked catalogue audits

Audits are append-only observations about exact catalogue versions. They are not a single trust badge. A structural check, accessible source, matching historical receipt and newly verified scientific claim are different findings.

## Tables and publication

`data/omics/audits/` holds immutable audit run records and gzip-compressed JSONL checks. Gzip is a storage wrapper; the uncompressed checks are exported as JSONL and CSV. Correction records link earlier findings to supported follow-up checks of the same record, fields and check category. Changing a field or its cited source invalidates applicability of an earlier check. Earlier rows remain available.

Runs pin their baseline release, target inventory hash, reviewer type, verifier revision and scope. Checks link the run, stable catalogue record, field paths, exact content hash, source IDs, source fingerprints, evidence locations and review receipts. Outcomes are supported, contradicted, insufficient evidence, inaccessible or not applicable. A supported source-access check does not verify a model architecture or numerical result.

Audits publish with the catalogue release, before its active pointer changes. The existing Firebase importer stores bounded check/index chunks; public queries read compact indexes and load only a requested record's check chunks. No contributor data or submission credentials enter the audit.

- `catalogue.auditRuns`: release-pinned, paginated run history.
- `catalogue.auditRecords`: release-pinned filters by record type/name, run, outcome, check category and dates.
- `catalogue.auditChecks`: paginated record history and correction links, including whether each check still applies to the current record and sources.
- `/audits/`: public explorer and downloadable JSONL/CSV.

All API queries use stable cursors bound to their filters and release. Existing API fields and archived record files remain unchanged.

## Repeatable workflow

1. Freeze the reviewed catalogue and acquisition inputs. Retrieve primary sources using `scripts/omics/audit/check-sources.py`, preserving source bytes outside the public export and recording exact hashes and access failures.
2. Run independent source-cell and metadata checks. Exact values and narrow field scopes belong in receipts. A parser rerun, link responding with HTTP 200, or an old review date is not a new scientific verification.
3. Generate a new run with `scripts/omics/audit/generate.ts`. The run identity includes the baseline release, inventory, receipt hashes and verifier revision. An existing audit file cannot be overwritten with different bytes.
4. Audit historical versions separately and explicitly link any reused exact-content checks. Do not apply current findings automatically to superseded values or sources.
5. Resolve confirmed errors through a reviewed record change and linked follow-up check. Do not erase contradictory findings or change old release bytes.
6. Generate and validate the release, import its audit tables, then publish through the existing rollback-capable deployment.

Source collection on 19 September adds nine bounded benchmark comparisons. PEtab timing artifacts remain quarantined because their units and experimental scope are unresolved. FLIP2 detailed/summary conflicts, provisional VCC scores, anonymized challenge submissions and source-specific input conditions remain explicit.

Reviewers and scripts must distinguish source transcription from validation of the source's experiments. No model executions or human sign-off are implied by this audit.

## 19 September collection and verification

The audit includes 112,949 checks across 13 runs, covering the current catalogue and all 12 archived releases. There are 41 linked resolutions. Exact unchanged record/source versions reuse explicit check IDs; earlier versions receive their own assessment.

The collection covers 29 of the 30 top-level benchmarks with linked numerical results and source-scoped charts. The nine new batches add 4,137 result rows. These rows are metric observations, not 4,137 independent experiments.

| Benchmark | Added rows | Bounded scope and limitations |
|---|---:|---|
| BEELINE | 588 | Publisher comparison matrices; reference networks and gene selections remain separate. |
| CAFA | 438 | CAFA3 Fmax tables for 146 anonymous submissions across three ontologies. Evaluation-mode interpretation remains unresolved. |
| CAMI | 256 | Sixteen rows and sixteen metrics, including the gold-standard reference; reported standard errors retained. |
| CAPRI | 400 | Model-one submissions for four interfaces; not every CAPRI round. |
| CASP | 270 | Ninety first submissions for T1201-D1 and three metrics; not the complete challenge. |
| FLIP2 | 283 | Complete bounded tables with four source conflicts quarantined and missing cells retained in staging. |
| PLINDER | 33 | A later evaluation on Plinder-L95; inputs and training-overlap concerns retained. Not the original PLINDER paper's complete assessment. |
| scIB | 821 | Pancreas comparison, 69 configurations and 14 metrics; unavailable cells explicit. |
| Virtual Cell Challenge 2026 | 1,048 | All retrieved provisional validation submissions; not final challenge results. |

PEtab's 600 retrieved timing candidates are retained in staging. Units, scope, version and execution conditions need adjudication before chart publication. A missing result is not a zero score.

Independent source readers assessed all 5,481 previously published results: 5,461 numerical cells and 15 explicitly absent cells matched their pinned sources. Four historical source versions remain unresolved: freshly retrieved files agree with their values but differ from the old recorded hashes. One MFASS AP value differs from the pinned runner artifact by one binary64 ULP. Its current record is aligned with that exact artifact through a correction overlay; AP remains 0.286 at published precision. No archived experiment or release was changed.

Source access was checked for 859 existing source records: 650 matched pinned hashes, 203 were accessible without a matching pin, and six were inaccessible. This is an access check, not a verification of every scientific claim. Metadata checks include narrow primary-source findings and explicit unresolved fields. Source transcription never automatically verifies model architecture, training data, licences or scientific comparability.

The scIB overlay corrects conflation of the benchmark study, package and pipeline. Each changed field has a before check, supported follow-up and explicit resolution. MFASS has its own upstream artifact source; the older display/import source is preserved.

Review was automated and AI-assisted, with separate source readers. No human sign-off or new experimental reproduction is claimed.

## Resolution publication binding and archives

Source resolution inputs use `containing-release` until their first publication, avoiding a circular dependency between release identity and audit content. The exported tables bind those resolutions to the release ID. Future exports recover the first publication ID from hash-verified archived resolution exports. They reject conflicting publication bindings. Immutable source resolution inputs remain unchanged, and archived exports retain their checksums.

Before advancing an existing release, preserve its manifest and each exported artifact as a separate gzip file under `data/omics/releases/<release-id>/`. The archive restorer verifies the exact declared artifact set and hashes, including audit exports and numbered serving chunks. Unexpected files, missing chunks and changed historical bytes fail the build.
