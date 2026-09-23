# Record search metadata and indexing policy

Issue #37 changes presentation metadata, not scientific records. The policy applies to the current public catalogue and its legacy-kind routes. No IDs, measurements, relationships, checkpoints, source evidence or immutable releases are changed.

## Search eligibility

| Record types | Policy | Reason |
|---|---|---|
| model, benchmark, method, pipeline, service, task, protocol, evaluator | Indexable; self-canonical; included in sitemap | Profiles explain distinct entities, scientific questions or evaluation procedures. |
| configuration, dataset, dataset_subset, baseline | Indexable; self-canonical; included in sitemap | Specific settings, cohorts and controls are meaningful contexts; a configuration name does not establish family identity. |
| result, evaluation | Indexable; self-canonical; included in sitemap | Measurements and their evaluation conditions can answer distinct questions. Repetitive old metadata alone does not justify excluding them. |
| source | Indexable; self-canonical; included in sitemap | Identifies the paper, repository or artifact supporting database evidence. |
| claim | `noindex, follow`; self-canonical; omitted from sitemap | Individual field assertions and extraction/review receipts support other records. Reader access, source links and evidence tables remain available. |

`recordIsIndexable` is the shared record policy for page metadata and sitemap generation. `robots.txt` continues to permit crawling, including claim pages, so crawlers can read `noindex`. Canonicals use the record's current kind and stable ID, omit query parameters and map legacy-kind aliases to that same record. Different scientific records never canonicalize to a broad parent merely to reduce URL counts.

The sitemap omits `lastmod`: release time alone does not establish when every page's significant content changed. Reintroducing timestamps requires evidence of page changes, including changed linked content. The existing utility-page and legacy-route policies are unchanged.

## Description generation

`recordSearchMetadata(record, records)` uses an ID index cached by catalogue-array identity. It follows explicit evaluation links and reads recorded fields. It does not search by model name or infer aliases, checkpoint equivalence, benchmark membership or missing results.

- Models and configurations include their recorded version/checkpoint when present; descriptions retain profile summaries and source context where useful.
- Results identify the metric, displayed value/unit, linked configuration/protocol/dataset, recorded split and aggregation. Scalars use the same three-significant-figure display formatter as result tables. Source strings with uncertainty remain intact; immutable values are untouched. Percent units are not repeated.
- Evaluations describe linked subjects and recorded protocol, inputs, split and adaptation. Sources identify their title, version/year and DOI when supplied.
- Missing summaries fall back to a description of the named record and available context. Source-checked results/evaluations keep the explicit caveat that source checking is not independent reproduction. Other statuses are named without upgrading them.

Metadata retains scientific scope instead of imposing an arbitrary 60/160-character cutoff. Google may select a different title or snippet. Description uniqueness is a diagnostic, not evidence of a ranking improvement.

## Inventory and identity review

The reproducible, read-only audit is:

```sh
npx tsx scripts/seo/audit-record-metadata.ts > metadata-inventory.json
```

The committed [inventory](record-metadata-inventory-2026-09-23.json) records the catalogue SHA-256 and release `2026-09-23-cda1ab0e8294`, per-kind before/after counts, representative descriptions and all 11 same-name model pairs. This release has 26,066 records, so it should not be compared directly with the older 21,881-record SEO report as a traffic or scientific-quality trend. Duplicate counts include every member of a same-kind group.

| Diagnostic | Before | After |
|---|---:|---:|
| Missing descriptions, all types | 584 | 0 |
| Model records sharing a description | 24 | 0 |
| Model records sharing a title | 22 | 0 |
| Configuration records sharing a description | 2,115 | 485 |
| Evaluation records sharing a description | 3,073 | 0 |
| Result records sharing a description | 11,291 | 0 |
| Source records sharing a description | 942 | 12 |

Remaining repeated descriptions and titles are recorded rather than hidden by artificial unique suffixes. Repeated configuration names and sources do not establish identical checkpoints or evaluations. There are 1,112 claim records; the remaining 24,954 records retain search eligibility.

Representative identity findings from the released evidence:

- `catalog-model-esm-2` records version `8M` and a `variant_of` link to `discovery-model-esm-2`, whose version is unspecified and whose profile covers the family. Both link to ESM source records ([recorded repository](https://github.com/facebookresearch/esm)). The metadata distinguishes the recorded version; their IDs and canonical pages remain separate.
- `catalog-model-dnabert-2` records `117M` and existing `variant_of`/`alias_of` links to `discovery-model-dnabert-2`; the latter does not specify a version. The recorded checkpoint source is [DNABERT-2-117M](https://huggingface.co/zhihan1996/DNABERT-2-117M). Existing relationship evidence is retained, but this presentation change does not authorize collapsing scientific records or their result histories.
- `catalog-model-spliceai` records version `1.3.1`; `discovery-model-spliceai` leaves it unspecified. Both cite SpliceAI evidence ([recorded repository](https://github.com/Illumina/SpliceAI)). The version is exposed in metadata without treating it as a newly verified checkpoint identity.

These are reviews of already recorded source/version/relationship evidence, not new external checkpoint-equivalence audits. No model records were merged.

## Validation and remaining evidence

Targeted tests verify sparse inputs, zero values, display rounding, uncertainty, percent handling, distinct model canonicals, claim robots directives, and eligibility parity across all 26,066 records. Existing record-rendering tests verify cleaned protocol headings with original technical evidence retained. The integration build/export checks must verify actual generated head tags and sampled full HTML before deployment; computed metadata and component rendering alone are not deployed-HTML evidence.

Authenticated Search Console evidence was unavailable. This work cannot establish actual index coverage, Google-selected canonicals, crawl/render status, impressions, clicks or ranking changes. After deployment, inspect a model, configuration, result, evaluation, source and claim; record declared/selected canonicals and Googlebot-visible robots tags. Check sitemap processing and export the baseline by record type. Review comparable 28-day periods before expanding any supporting-record exclusions. The lack of Search Console access does not justify a blanket `noindex` rule for results.

Official Google references retrieved 2026-09-23:

- [Block indexing with noindex](https://developers.google.com/search/docs/crawling-indexing/block-indexing): crawlers must be allowed to fetch the page to see the directive.
- [Canonical URLs](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls): canonical signals address equivalent content, not unrelated scientific scopes.
- [Meta descriptions](https://developers.google.com/search/docs/appearance/snippet): programmatic descriptions should accurately describe individual pages; snippet selection remains with Google.
- [Sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap): submit preferred canonical URLs and supply reliable modification times when known.
