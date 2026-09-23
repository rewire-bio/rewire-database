# Structured data and link previews — 23 September 2026

The homepage describes the website with `WebSite` JSON-LD. Record pages and the static benchmark/model indexes use `BreadcrumbList` generated from the same items as their visible breadcrumbs. Only models and benchmarks have an intermediate index: `/models/` and `/benchmarks/`. Supporting records link directly through the database home. Model pagination includes a visible page number and its canonical page URL. Return-to-results and filter controls remain separate from the breadcrumb hierarchy.

## Catalogue licensing finding

No applicable catalogue licence was established by this implementation. The inspected tracked repository contains no root `LICENSE`/`LICENCE` grant; the public catalogue/manifest schema and release manifest (`2026-09-23-cda1ab0e8294`) do not declare a catalogue licence. Inspection covered `README.md`, `docs/omics/record-contract.md`, `lib/omics.ts`, `scripts/omics/release.ts`, tracked licence filenames and the existing public manifest. Model/source `licence` fields and the archived scIB licence describe third-party resources; they do not establish reuse terms for this compilation.

The homepage has real release-specific JSONL, CSV and evidence-table download links. Those links alone do not establish a licence. **No `Dataset` JSON-LD or inferred licence/distribution claims are emitted.** Enabling it later requires an explicitly applicable catalogue licence and verification of the described release's actual distributions. Benchmark profiles and records whose kind is `dataset` are not automatically labelled as downloadable Schema.org datasets.

This is a bounded repository finding, not a legal conclusion that no applicable terms could exist elsewhere. Scientific records, their source licences and immutable exports are unchanged.

## Sharing behavior

Homepage, all record kinds (including alias routes), benchmark/model indexes and model pagination, evidence/audits guides, and both MFASS reports supply Open Graph and Twitter metadata. Titles and descriptions come from the page's existing metadata, avoiding a second independent snippet. Open Graph URLs use the same canonical as the page. The root layout does not inject a homepage sharing URL into child pages. Archived MFASS v1 retains its `noindex` policy.

The generic branded preview is `public/images/social/catalogue.png`, a 1200 × 630 PNG. It contains no benchmark scores, release counts, model depictions or reproduction claims. Rebuild it with `npx tsx scripts/generate-social-preview.tsx`; the script uses the existing Next.js image renderer and bundled font without network requests or additional dependencies. Commit the generated PNG with any script change. The preview image was visually inspected for clipping and readability.

No modification date is added to JSON-LD or sharing metadata: a catalogue release or deployment does not establish that each record page changed. Sitemap timestamp policy is handled by the separate indexing change.

## Validation and limits

`tests/catalogue-sharing.test.tsx` checks rendered breadcrumbs, real index paths, pagination, canonical alias sharing, title/description parity, JSON-LD script escaping and PNG dimensions/signature. Existing index and display-metadata tests exercise affected integration paths. These are local structural checks; they do not claim Google has crawled the new output or that a social platform has refreshed its cache.

After deployment, inspect a homepage, benchmark, model, model pagination and supporting record in the [Rich Results Test](https://search.google.com/test/rich-results) and relevant sharing preview tools. Check served PNG accessibility and use Search Console URL Inspection for Google's view. Structured data does not guarantee a rich result or indexing; website markup alone does not promise a Google search feature.

Primary guidance consulted on 2026-09-23: [Google breadcrumb structured data](https://developers.google.com/search/docs/appearance/structured-data/breadcrumb) and [Google Dataset structured data](https://developers.google.com/search/docs/appearance/structured-data/dataset). These describe markup requirements, not licensing grants for the catalogue.
