# Benchmark database SEO report — 22 September 2026

The database has a sound technical base: all 30 benchmark profiles returned HTTP 200 with one self-referencing canonical, one H1, and distinct titles and descriptions. The principal opportunities are to make those profiles easier to discover through ordinary links, improve repetitive record metadata, and decide which supporting records should appear in search. No evidence collected here establishes a ranking penalty, indexing failure, or Core Web Vitals failure.

This report records the live site before the accompanying analytics changes. It proposes SEO work; it does not implement it or alter scientific records.

## Scope and evidence

- **Primary site:** [benchmarks.rewire.it](https://benchmarks.rewire.it/). Main-blog checks cover referral links and the old `/benchmarks/` redirect only; this is not a whole-blog audit.
- **Live evidence:** 77 primary HTTP requests on 2026-09-22, starting at 19:13 UTC, plus follow-up cross-site redirect checks. The sample includes every benchmark, three records each for model/configuration/evaluation/result/source/claim/dataset/protocol, key utility pages, query variants, old URLs, and an invalid URL. Requests used Node fetch, three concurrently, with redirects inspected explicitly. This was not a crawl of all 21,881 records.
- **Full catalog analysis:** immutable local release `2026-09-20-b2596bdf5206`, released `2026-09-20T14:44:11Z`. Its record-type counts match the live sitemap, and the live homepage identifies this release. Metadata analysis uses the same `profile.summary || description` selection as the record template. Whole-page content similarity was not measured across the catalog.
- **Evidence file:** [HTTP observations and catalog statistics](benchmark-seo-evidence-2026-09-22.json). Every primary request includes its URL, status, timestamp, metadata, link counts, and HTML hash. The temporary reproduction script is under ignored `workbench/seo-audit-2026-09-22/`.
- **Limits:** the Mac was locked, preventing interactive browser checks. No authenticated Search Console or GA reports were available. Actual index coverage, Google-selected canonicals, impressions, clicks, rankings, backlinks, rendered Googlebot output, conversion rates, and field performance remain unmeasured. HTTP timings are diagnostic observations, not performance benchmarks. Raw-HTML findings do not prove what a successful JavaScript render would show.

## Verified baseline

| Check | Observed result |
|---|---|
| Robots | [robots.txt](https://benchmarks.rewire.it/robots.txt) permits crawling and declares the sitemap. |
| Sitemap | [sitemap.xml](https://benchmarks.rewire.it/sitemap.xml) returns 200; 21,146 unique absolute URLs; 3,290,345 uncompressed bytes. Includes all 30 benchmarks and all non-claim record types. |
| Benchmarks | 30/30 return 200, one self-canonical, one H1, unique title and description, no observed `noindex`; substantive content and record links exist in initial HTML. |
| Record samples | All 24 current record samples return 200 and self-canonical URLs. This includes three claim records. |
| Utility pages | Homepage, evidence, audits and MFASS v2 return 200 and appropriate canonical URLs. MFASS v1 is `noindex, follow`. |
| Contribution page | Meta `noindex, follow` and response header `noindex, nofollow`; excluded from sitemap. It should remain outside organic landing-page work. |
| Invalid route | A fabricated benchmark ID returns genuine HTTP 404 and `noindex`. |
| URL normalization | HTTP homepage and a benchmark URL without its final slash redirect permanently to HTTPS and the slash form respectively. |
| Main-blog migration | `rewire.it/benchmarks/` → 301 to `www.rewire.it/benchmarks/` → 308 to the database homepage → 200. Main-blog home and article index include direct database-home links. |
| Structured data / sharing | No JSON-LD, detected microdata/RDFa marker, Open Graph tags or Twitter card tags in the sampled database HTML. Code inspection also found no structured-data implementation. |

The sitemap is comfortably below Google's 50,000-URL and 50 MB limits. A sitemap split is an organizational option, not an urgent size repair. Submission and indexing cannot be inferred from its availability. [Google sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap).

## Prioritized work

| Priority | Action | Expected benefit | Acceptance evidence |
|---|---|---|---|
| P1 | Add static benchmark/model indexes and useful topic landing pages | Clear discovery paths and relevant search entry pages | Raw HTML links to all 30 benchmarks; paginated model links; pages have their own canonical/title/content |
| P1 | Improve generated titles/descriptions and review duplicate model identities | Search results describe the specific record and context | Metadata audit shows distinct, factual snippets for retained search landing pages |
| P1 | Establish supporting-record index policy | Aligns search exposure with reader value | Documented policy by record type; canonical, robots and sitemap agree; validate sampled URLs in Search Console |
| P1 | Establish Search Console and analytics baselines | Makes later impact measurable | Verified property, processed sitemap, saved baseline exports; GA events verified after consent |
| P2 | Move old navigation/paper routes to permanent hosting redirects | Reduces dependence on JavaScript for migration | Old routes return 301/308 directly to correct destinations; filters and fragments tested |
| P2 | Add accurate Dataset and breadcrumb markup where applicable | Machine-readable meaning and possible search enhancements | Validated markup matches visible content and actual downloadable resources |
| P2 | Measure and reduce large initial HTML/embedded data | Tests a plausible rendering and download bottleneck | Repeatable mobile lab measurements plus field data when available |
| P3 | Refine sitemap timestamps and social previews | More precise change signals and better shared links | Truthful per-page modification dates; checked preview metadata |

### 1. Give benchmark discovery a static path

The homepage's raw HTML contains exactly **20 distinct record links, all models, and zero benchmark-profile links**. The benchmark tabs, other record types and pagination are buttons in `app/database/Explorer.tsx`. They update client state and fetch API results. The initial response to `/?kind=benchmark`, `/?kind=model&area=dna-genomes`, `/?q=protein`, and an empty-result query is byte-identical to the homepage and canonicalizes to `/`.

Existing benchmark profiles are substantial and linked to related records, so this is a navigation weakness, not proof that they are orphaned or unindexable. The sitemap provides a discovery route. Still, the strongest content should be accessible through normal navigation. Google generally discovers links through anchors with usable `href` attributes; controls that require interaction are not equivalent discovery paths. [Google link guidance](https://developers.google.com/search/docs/crawling-indexing/links-crawlable).

Create a static benchmark index linked from the header/homepage, with short sourced summaries and direct canonical links to every benchmark. Add a model index with crawlable pagination, followed by a few useful biology-area pages when enough distinct content exists. Preserve the interactive explorer for filtering. For example, a protein-benchmark page could explain task and metric differences before linking to ProteinGym, TAPE, ProteinBench and relevant protocols. Do not generate every filter combination as an SEO page.

Explorer record links currently append `return_to`, even in the initial homepage HTML. Their canonicals correctly omit it. Prefer clean canonical anchor URLs, preserving return context through client state if practical. Query-based search and arbitrary filter states should remain navigation tools unless intentionally developed as distinct landing pages. Investigate crawl volume in Search Console/server logs before adding broad robots restrictions: this audit does not establish overcrawling. [Google faceted-navigation guidance](https://developers.google.com/crawling/docs/faceted-navigation).

### 2. Make metadata specific without changing scientific claims

The complete release has **584 empty computed descriptions**: 155 results, 147 evaluations, 143 claims, 98 datasets, 38 sources and three baselines. These are local template inputs; the HTTP sample does not establish how every empty value appears in deployed metadata. Add factual descriptions where the record supports one. Repetition is also substantial outside benchmark profiles:

| Record type | Records | Records sharing an identical description with another same-type record | Records sharing a title |
|---|---:|---:|---:|
| Benchmarks | 30 | 0 | 0 |
| Models | 59 | 24 | 22 |
| Configurations | 2,290 | 2,033 | 570 |
| Results | 9,618 | 9,463 | 1,377 |
| Evaluations | 7,072 | 2,895 | 336 |
| Sources | 886 | 842 | 231 |

Counts include every member of a duplicate group, not only extra copies. Duplicate metadata alone does not establish duplicate pages or low-quality science.

One generic result description is repeated 4,137 times; another 3,826 times. A generic configuration description is repeated 1,731 times. These accurately express review limitations but give little help distinguishing search results. Generate descriptions from already reviewed fields: entity, benchmark/task, metric, value, evaluation conditions, and source-check status. Keep the caveat that source checking is not independent reproduction. Do not infer missing checkpoints, protocols, or family membership to fill a snippet. Source-record descriptions can identify the actual paper/artifact and its role in the database.

All benchmark titles currently equal the short benchmark name, such as `TAPE` or `BEND`. A template such as `TAPE protein benchmark: tasks, results and sources | rewire.it` would make context clearer when supported by the page. For model names repeated across `catalog-model-*` and `discovery-model-*` records, review whether the pages are true equivalents or preserve different scopes; then either distinguish their metadata or consolidate only verified equivalents. Preserve scientific IDs and release artifacts. [Google title guidance](https://developers.google.com/search/docs/appearance/title-link), [description guidance](https://developers.google.com/search/docs/appearance/snippet).

Length counts are editorial diagnostics, not pass/fail rules: 1/30 benchmark descriptions exceeds 160 characters; 5,553/7,072 evaluation titles exceed 60 characters. There is no universal 60/160-character ranking threshold. Prioritize clarity and distinctions over truncating precise scientific names.

### 3. Decide which evidence records merit search landing pages

Results and evaluations account for **16,690 of 21,146 sitemap URLs (78.9%)**. Their scientific traceability is valuable, but individual metric rows may answer a narrower search need than benchmark/model profiles. The audit does not prove these pages are thin: sampled result pages contain context, evidence and links beyond their repeated metadata.

Review representative result, configuration, evaluation, source and claim pages against a documented criterion: can a search visitor understand a distinct finding and its scope without first reconstructing the parent record? Keep useful individual findings indexable; improve their context. Consider `noindex, follow` for pure supporting receipts when they have no distinct search purpose, while retaining access and links for readers. Avoid a blanket noindex rule for all result pages without Search Console evidence.

There are **739 claim records** omitted from the sitemap. All three sampled claim URLs nevertheless return 200, self-canonical and no `noindex`; sitemap exclusion does not prevent indexing. If exclusion was intended to keep claims out of search, implement an explicit policy. Google must be allowed to crawl a page to see its `noindex`. [Google noindex guidance](https://developers.google.com/search/docs/crawling-indexing/block-indexing).

Use canonicalization only for equivalent content. Different models, protocols, measurements or scientific scopes should not canonicalize to a broad parent merely to reduce URL counts. Existing query and legacy-kind canonicals generally point to sensible clean URLs. Verify Google's actual selection in URL Inspection before attributing traffic changes to canonicalization. [Google canonical guidance](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls).

### 4. Replace migration shells with hosting redirects

`/database/`, `/dna-genomes/`, `/literature/`, and the sampled `/literature/papers/2ome-lm-2025/` return **200**, then use `LegacyCatalogueRedirect` and `window.location.replace`. Canonicals identify the destination; database/domain shells also have `noindex`. The footer still links to `/literature/`, sending visitors through a migration shell.

Use explicit permanent hosting redirects for known moved pages, including mappings from old paper pages to corresponding source records. Preserve special historical/excluded-paper behavior rather than redirecting every paper indiscriminately. Keep legacy kind aliases as they are until equivalence and redirect behavior are reviewed. Test query and fragment retention. Link the footer directly to the current published-results view. Google's preferred migration signal is a permanent server/hosting redirect when available. [Google redirect guidance](https://developers.google.com/search/docs/crawling-indexing/301-redirects).

The main-blog redirect already works; shortening its two-hop non-www chain is lower priority. Links back to `https://rewire.it/blog/` also incur a verified redirect to `https://www.rewire.it/blog/`; future navigation edits can use the canonical blog host.

### 5. Add structured data to content that actually fits

The homepage offers a reviewed, versioned downloadable catalog. Evaluate **Dataset** markup there, describing the collection, release, creator and real downloadable distributions. Add license information only when it is known and applies to that resource. A benchmark profile is not automatically a downloadable dataset, and a source citation does not transfer the source's license to the catalog. Dataset markup can aid discovery through Google Dataset Search. [Google Dataset guidance](https://developers.google.com/search/docs/appearance/structured-data/dataset).

Add `BreadcrumbList` to record pages once there are stable, useful index pages to reference. Validate both syntax and the correspondence between markup and visible content. No rich-result display is guaranteed. [Google breadcrumb guidance](https://developers.google.com/search/docs/appearance/structured-data/breadcrumb).

Open Graph and Twitter cards would improve shared-link previews but are a separate presentation task; their absence is not evidence of a Google indexing blocker.

### 6. Measure large payloads before making performance claims

Decoded initial HTML was about **411 KB** for the homepage; benchmark pages ranged from **181 KB to 1.52 MB**. The largest were Virtual Cell Challenge 2026, CAFA, scIB and CASP. These sizes include embedded Next.js data and are not compressed transfer sizes. Existing content is available in HTML, which is useful; reducing duplicated serialized data should not remove essential initial content.

Inspect which initial props, audit/release information and comparison datasets dominate the response. Load optional comparison details when needed, and keep the main summary, evidence and links server-rendered. Run controlled mobile lab tests on the homepage and largest benchmark, then use field data when enough exists. This audit measured neither LCP, INP nor CLS and makes no Core Web Vitals verdict. [Google Core Web Vitals guidance](https://developers.google.com/search/docs/appearance/core-web-vitals).

The sitemap assigns the same release timestamp to virtually all entries. That is truthful only if each page's significant content changed with the release. Prefer per-record/page change timestamps, accounting for linked content changes, or omit `lastmod` where it cannot be supported. Avoid substituting the deploy date for actual content modification. The existing file is within size limits; splitting by profile/results/supporting records could help operational review later. [Google sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap).

## Measurement and analytics handoff

Before this task's implementation, the benchmark layout mounted no analytics and the inspected live benchmark HTML exposed no GA tag. The main blog used measurement ID `G-P0CLMZMKF8`. The accompanying implementation is intended to reuse that existing property for consented public benchmark visits, sanitize query/referrer data, and exclude the contribution route. This report does **not** attest to deployment, GA property access, event ingestion or Realtime verification; use the implementation handoff for current status. GA setup does not itself improve rankings.

Next measurement steps:

1. Verify an appropriate Search Console property for `benchmarks.rewire.it` or an existing domain property covering it; submit the current sitemap and inspect processing status.
2. Inspect the homepage, a benchmark, a model, a result and a claim. Record user-declared versus Google-selected canonical, crawl/render status and actual index coverage.
3. Export a baseline of organic clicks, impressions, CTR, queries and landing pages; segment benchmark/model profiles from supporting records. Record the date of each SEO change.
4. After analytics deployment and opt-in, verify page views in DebugView/Realtime, hostname and clean path reporting. Confirm contribution pages and query contents remain excluded. Consent-based analytics will not count every visitor.
5. Reassess comparable 28-day search periods once data exists, allowing for crawling delays and the database's changing content. Evaluate actual search usefulness and traffic; do not assign an invented SEO score.

## Coverage appendix

All 30 benchmark profiles were checked live: ATOM3D, BEACON, BEELINE, BEND, CAFA, CAMI, CAPRI, CASP, DART-Eval, FLIP, FLIP2, GENEB, Genomic Benchmarks, GlycanML, GUE, HEST-Benchmark, MassSpecGym, mRNABench, NABench, Open Problems, PerturBench, PEtab benchmark collection, PFMBench, PLINDER, ProteinBench, ProteinGym, scIB, TAPE, TDC molecular tasks, and Virtual Cell Challenge 2026. Exact URLs and observations are in the evidence JSON.

Primary implementation references reviewed: `app/robots.ts`, `app/sitemap.ts`, `app/layout.tsx`, `app/page.tsx`, `app/database/Explorer.tsx`, `app/database/[kind]/[id]/page.tsx`, `app/LegacyCatalogueRedirect.tsx`, `app/literature/papers/[id]/page.tsx`, `lib/omics.ts`, `components/header.tsx`, `components/Footer.tsx`, and `firebase.json`. Google documentation linked above was retrieved on 2026-09-22.
