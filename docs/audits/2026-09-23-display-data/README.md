# Catalogue display audit, 23 September 2026

Audited release **2026-09-22-f58a0f1d267f**: all **21,974 records**, **594,599 catalogue string fields** and **558,401 evidence rows**. This checks presentation patterns, value types, references and URL syntax. It does not repeat scientific source verification or test remote link availability. Existing scientific review statuses are unchanged.

## Findings and corrections

| Finding | Extent in this release | Correction |
| --- | --- | --- |
| Populated BEELINE conditions embedded as JSON | 440 strings across 44 protocols and 264 evaluations | Display reference network and gene selection as labelled text, preserving their values |
| Empty BEELINE condition blocks | 194 strings across 10 protocols and 120 evaluations | Remove the empty suffix from names; explicitly label absent input-condition metadata in prose |
| Narrative evidence arrays displayed as JSON | 2,205 evidence rows across 690 records | Render procedure steps and documented gaps as lists |
| Other typed evidence structures displayed as JSON | 65,962 array/object rows, including the narrative rows above | Use expandable lists and labelled fields; preserve scalar types and strings |
| Empty metadata objects displayed as blank values | Eight direct attributes across eight records | Show “None recorded” |
| Audit labels repeat affected BEELINE names | 54 protocol names are potentially affected; archived populated-name checks included 132 occurrences | Apply the same name formatter without changing audit evidence |

The per-record sets overlap: **1,130 records** contain targeted presentation cases, **20,841** have no targeted pattern, and **three** retain valid undefined measurements. These are scan outcomes, not scientific quality grades or claims of manual review of every page. The source records still contain the original values; shared renderers handle their presentation.

The fix covers headings, metadata, summaries, comparison options, chart headings and caveats, result filters, protocol links, explorer cards, audit labels and evidence cells. It preserves exact IDs, source text, original scores, links, API responses, executable examples, technical receipts and immutable downloads. It does not alter comparison eligibility or score ordering.

## Integrity results and deliberate exceptions

- No duplicate IDs, dangling record/source/evidence references, malformed IDs, empty required labels, unexpected display-field types, object-coercion strings, NaN/Infinity score tokens, replacement/control characters or HTML entity leakage were found.
- All 9,647 results have string printed values, metrics and units. Numeric values comprise 9,629 valid numeric strings and 18 nulls.
- Three train-mean correlations deliberately print `undefined`, with a null numeric value and an explicit reason. They remain undefined, never zero. The other null scores retain their original N/A or dash labels.
- All evidence `value_json` fields parse: 465,218 strings, 55,958 arrays, 10,004 objects, 7,410 numbers, 2,498 booleans and 17,313 nulls. The renderer parses this typed envelope once; it never parses an inner source string as another document.
- Fourteen executable recipe strings contain JSON objects; 64 raw review-evidence strings contain serialized source cells. These remain literal.
- Catalogue URL-like fields contain 6,296 valid absolute HTTP(S) URLs, four valid root-relative URLs and 163 explicit “unextracted” metadata notes. Evidence URL columns contain 662,090 valid HTTP(S) occurrences and 1,013,113 empty optional values. No malformed clickable URL syntax was found. Remote availability, redirects and source correctness were not rechecked.

## Audit table and reproduction

- [summary.json](summary.json): counts, grouped fields, classifications and compressed input hashes.
- [findings.json](findings.json): exact affected fields, empty objects, valid undefined measurements and integrity findings.
- [record-status.csv.gz](record-status.csv.gz): one row per record, with status and condition, empty-object, narrative-evidence and integrity counts. Use `gzip -dc record-status.csv.gz > record-status.csv` to inspect it.

Run from the repository root, choosing a new output directory:

```sh
node scripts/omics/audit-display-data.mjs \
  --release-dir data/omics/releases/2026-09-22-f58a0f1d267f \
  --output workbench/display-audit-new
```

The script uses Node built-ins, streams evidence, makes no network requests, refuses output overwrites and does not change the release. It produces the three reports above plus complete candidate and URL inventories. Regex hits require contextual review; they are not automatic data corrections.

| Compressed input | SHA256 |
| --- | --- |
| catalogue.json.gz | 48c47c6cf7c8e0c832def37350be0a53aa62cce06e39ea7f5b134e52add9934b |
| evidence.jsonl.gz | 0c791d2e0034d8ea23d2adb05595f63b8a937d13f188b7a13ea5a9b1c4ab3408 |

## Validation scope

Release-backed tests cover all 54 affected protocols, their comparison rendering and metadata, typed evidence lists, source/code preservation, audit labels and malformed-input handling. Local browser review covered BEELINE on desktop and a 375-pixel mobile viewport, including condition labels, all ten empty-condition links and evidence bullets. Original chart values and caveats remained intact. API-backed audit filtering and pagination require live checks after deployment; the correction PR records those results and production validation.
