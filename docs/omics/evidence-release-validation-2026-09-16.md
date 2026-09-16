# Evidence-table release validation

Release: `2026-09-16-0cd1ec08033d`. Prior production release: `2026-09-16-e13bae63c156`.

## Delivered

- 45,747 source-origin rows across all 1,669 public records, including all 396 model/benchmark profiles and 167 printed results.
- Searchable per-record tables backed by the existing release-pinned Firebase/tRPC catalogue; CSV/JSONL downloads, checksums and a public evidence guide.
- Explicit individual-claim, context-only, source-metadata and catalogue-metadata scopes. Missing metadata and shared multi-source locators remain visible.
- Two source-reviewed RNA-FM profile corrections; no existing numerical result object changed.
- Competitor assessment and independent provenance/implementation reviews retained in this directory.

## Local acceptance

| Check | Result |
| --- | --- |
| Frontend/data suites | 89 tests pass |
| Service/emulator suites | 49 tests pass |
| Lint and TypeScript | Pass, root and service |
| Production build and static export | Pass; all 1,669 record pages include evidence tables |
| Evidence projection | CSV and JSONL match the release-derived index byte for byte |
| Archived exports | Original release hashes retained; clean restoration and tamper rejection covered by tests |
| Hosting/API integration | Live local Firebase rewrite passes release pinning, pagination, filters and private-route checks |
| Browser, 1,440 px and 390 px | Search, pagination, scopes, keyboard disclosures, BarcodeBERT finding, guide and offline fallback pass; no page errors or document overflow |
| Submission privacy | Disabled in the deployed configuration; shared 13-key private-data boundary tested at import, rendering, query and direct evidence projection |

Browser screenshots and detailed execution logs are in ignored `workbench/provenance-quality/`. Tests use the demo emulator project and perform no model computation.

The table is an index of evidence, not a new scientific replication. Counts do not imply that every inherited dataset/evaluation field is verified. The public guide explicitly describes remaining extraction gaps. Earlier release bundles remain available for durable citation and rollback.
