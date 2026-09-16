# Evidence-table implementation review — 2026-09-16

## Outcome

The implementation preserves the important scientific distinction between individually cited claims, context-only references and catalogue/source metadata. It does not promote all record metadata to scientific verification. Both confirmed privacy boundary bugs and the misleading row-count label were corrected and verified during this review. No open release-blocking finding remains within the reviewed scope. No catalogue values or release artifacts were edited by this review.

This is an independent code and targeted execution review against [the comparative quality rubric](competitor-quality-review-2026-09-16.md), not an audit of every underlying scientific statement or a claim of WCAG conformance.

## Findings and disposition

### P1 — Inconsistent private-field rejection across public boundaries: fixed

The static record validator rejected thirteen private field names, while the service query validator and static catalogue parser rejected only seven. Before correction, a valid service snapshot with nested `owner_uid` and `private_notes` passed `validateSnapshot`; `createCatalogueQuery(...).evidence(...)` returned both fields and their sentinel values. These are privileged release-import paths, not evidence that anonymous users can read the private submissions collection.

Added a shared recursive denylist in [private-fields.ts](../../services/omics/src/private-fields.ts), wired into the service query/import boundary, static record validator and static catalogue parser. Direct evidence-index construction now independently checks the entire snapshot. Keys are matched case-insensitively through nested objects and arrays; errors do not echo private values. Existing error-message expectations remain compatible.

Regression coverage in [catalogue-privacy.test.ts](../../services/omics/test/catalogue-privacy.test.ts) checks all thirteen names and uppercase variants across service validation, public queries, direct evidence export, static parsing and record validation. It also checks coverage metadata, excluded records and legitimate tokenizer metadata.

### P1 — Legacy release-builder coverage bypass: fixed

`buildRelease([], date, {private_notes: "PRIVATE_SENTINEL"})` emitted the sentinel in `catalogue.json` when `evidence_table_version` was absent. Record validation cannot inspect coverage. The new evidence-enabled path rejects this through the index guard, but the exported release builder also supports historical/no-evidence paths.

Verified correction: [release.ts](../../scripts/omics/release.ts) now calls the shared whole-snapshot validator unconditionally after constructing the snapshot. New regression tests reject private coverage with and without evidence exports, including nested arrays and mixed-case keys. Existing historical reconstruction and receipt tests still pass.

### P2 — Row count describes uncited metadata as source-linked: fixed

The evidence table count previously said “source-linked rows” even when the All recorded fields scope included catalogue metadata with an empty `source_id`. Verified that the live result-count paragraph in [EvidenceTable.tsx](../../components/catalogue/EvidenceTable.tsx) now says “evidence rows”. Rows continue to disclose their scope and missing external citation.

## Checks that passed

| Area | Evidence inspected or executed | Result and limit |
| --- | --- | --- |
| Release immutability | `writeArchive`, historical reconstruction and `restoreReleaseBundles`; read-only SHA-256 comparison against each local manifest | All 36 archived export files present at final recheck matched their receipts. Writes reject changed existing bytes; bundles validate expected filenames and hashes before restoration. Newly generated evidence exports also matched the current index byte for byte; see final release recheck below. |
| Service publication boundary | `importRelease`, `catalogueQuery`, `activateRelease` | Import verifies catalogue digest, preserves release-ID immutability and stages records before readiness. Serving requires readiness plus publication, validates record count/schema and available digest. No evidence route accesses submission/outbox collections. No live Firestore deployment was tested here. |
| Pagination | Existing snapshot `2026-09-16-e13bae63c156`, new evidence index; AF3 pages of seven rows | Traversed all 60 AF3 rows exactly once and matched the unpaginated record index. A cursor reused with different filters and limit 101 were rejected. Cursors carry release and query identity; the router bounds query length and page size. |
| Scientific scope | Evidence-index field extraction and current snapshot | Generated 45,751 index rows; no `source_checked` row lacked a source ID and no conflicting-claim rows occurred in this snapshot. This checks linkage, not whether the source proves the prose. Row count includes context and metadata, not just scientific claims. |
| Provenance | Source joins, review metadata, artifact/extraction columns and UI disclosures | Separate source and extraction hashes, release ID, source version/date, locator and review status survive the projection. Multiple citations explicitly share the original locator rather than inventing per-source locations. Missing hash scope is labelled as missing. |
| Scientific result integrity | Result field mapping and comparison/source-concern code | Only printed result values inherit numerical-result review status. Context fields remain unreviewed unless an explicit matching claim exists. A conflicting claim receives a conflict status. Source concerns remain available and comparisons reject unresolved concerns. |
| CSV | `evidenceCsv` implementation | Quotes delimiters/newlines and doubles embedded quotes; prefixes formula-leading cell content for spreadsheet safety. JSONL preserves values separately. This is code inspection, not a spreadsheet-import compatibility test. |
| Accessibility foundations | JSX and styles | Native labelled inputs/select, table caption, column/row headers, live loading/count status, alert on failure, native disclosure controls, keyboard-focusable horizontal scroll region and visible focus outline are present. React escapes text; external links pass HTTP(S) filtering. |
| Failure behaviour | Evidence-table request lifecycle | Stale responses are ignored; failures preserve existing rows and explain that requested filters were not applied; a retry control is available. Controls and downloads retain the originally pinned release. |

## Verification commands and remaining limits

Executed successfully:

- Service privacy, catalogue-query and validation suites: **29 tests passed**.
- Static `omics-data`, `omics-ui` and `omics-evidence-completion` suites: **28 tests passed**.
- Service TypeScript build: **passed**.
- Independent read-only archive hash check: **36 files passed** at final recheck.
- New `omics-evidence-release` regression suite: **10 tests passed**. Combined run with evidence-completion and historical profile/release tests: **26 tests passed** (overlaps the earlier run; not an additive total).
- Targeted evidence-pagination and source-linkage assertions: **passed**.

Final release recheck: **`2026-09-16-0cd1ec08033d`**, **45,747 evidence rows**. Regenerating the index from this archived catalogue reproduced both `evidence.jsonl` and `evidence.csv` byte for byte. The new archive tests cover clean and repeated restoration for legacy and evidence-enabled bundles; tampered bytes; immutable destination conflicts; either missing evidence file; and unexpected evidence added to a legacy bundle. Temporary test directories are removed after each case.

The review did not perform screen-reader, keyboard-in-browser, mobile layout, network failure or HTTP/emulator interaction tests. Code structure supports those checks but cannot replace them. The UI’s source/claim links lead to current catalogue detail routes; durable citations should retain the release ID and archived evidence row, particularly when later catalogue releases change metadata. The current API derives rows from the pinned snapshot using the deployed index implementation; preserve/version that transformation when its semantics change and keep archived evidence files as the immutable citation target.

The origin table is an index of recorded evidence. It does not independently reproduce experiments, establish universal leakage freedom, or turn scoped source omissions into verified facts.
