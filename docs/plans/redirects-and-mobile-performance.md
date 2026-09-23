# Legacy redirects and mobile payloads

Plan and implementation record, 23 September 2026. Issues #38 and #39; source revision `4f354d9df8037e61b187a15831d88c4bef8d0026`.

## Scope

Replace verified migration shells with permanent Firebase Hosting redirects and reduce unnecessary data on large benchmark pages. Preserve scientific release `2026-09-22-f58a0f1d267f`, API contracts, historical downloads, MFASS bookmarks, exact result values and provenance. Slides, new model runs, paid infrastructure and scientific publication are outside this batch.

## Redirects

1. Inventory legacy database/domain/literature routes and verify each paper-to-source identity against existing records.
2. Use explicit permanent hosting redirects. Preserve query values, filter defaults and browser fragments; retain excluded-paper behaviour and genuine unknown-page 404s.
3. Point navigation directly at canonical destinations. Test both ordinary and encoded queries, including duplicate keys.
4. Test Firebase emulator and actual Hosting with a temporary synthetic fixture when emulator behaviour differs. Remove the test channel afterward. Do not publish private repository content in a preview.

## Performance

1. Save a repeatable production baseline for the homepage, Virtual Cell Challenge, CAFA, scIB and CASP: decoded HTML, compressed transfer, embedded data, request sizes and controlled mobile browser observations. Report laboratory results separately from unavailable field data.
2. Reduce the measured sources of duplication. Keep the default comparison server-rendered, with all scientific values, original ordering, uncertainty and evidence unchanged. Use a lossless internal transport for repeated records; keep the public API and released data unchanged.
3. Load the separate All evaluations table and its filter options only when requested if a comparison is initially shown. Pages without comparisons retain an initial results table. Preserve loading/error/retry states and release pinning.
4. Avoid immediately refetching the same immutable, release-pinned results/evidence already rendered by the server. Filter, pagination and retry requests still use the API and retain the last successful rows on errors.
5. Repeat the same browser measurements after deployment. Report actual payload and laboratory differences, without claiming a field Core Web Vitals improvement or attributing network variability to code.

## Validation and delivery

- Verify redirect identities, Unicode/reserved query characters, fragments, filters, special exclusions and unknown routes.
- Prove lossless comparison round trips and unchanged initial scientific HTML; exercise chart/table/search/sort/show-all, lazy results, filters, pagination, back navigation, stale-response protection and API failures.
- Test mobile/desktop layouts and keyboard access in isolated Chrome, preserving user browser profiles.
- Run tests, lint, type checking, service checks, full CI production build, export and Hosting/API integration checks. No full local export on the space-constrained laptop.
- Raise a focused integration PR with evidence, merge after checks, deploy through the existing rollback-protected workflow, verify live behaviour and close #38/#39 only against completed acceptance checks.

## Findings before implementation

Production decoded HTML: homepage 417,321 bytes; Virtual Cell Challenge 1,523,180; CAFA 1,304,674; scIB 1,086,903; CASP 1,081,746. Embedded React data accounts for about 82–94% of those responses. Compression already reduces transferred HTML substantially; decoded size is not transfer size or a performance score.

Local prop inspection found that large initial comparison panels serialize roughly 550–698 KB, while a separate initially hidden result table contributes another 211–540 KB, including filter options. Scientific metadata is repeated across rows. The planned changes target these observations rather than removing initial summaries, charts or citations.

Firebase's local emulator double-encodes some reserved query values in redirects. A minimal actual-Hosting preview preserves them. Keep the discrepancy explicit and require live encoded-query acceptance tests; do not compensate by decoding user queries a second time.
