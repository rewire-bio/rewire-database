# Benchmark site analytics

The benchmark site uses the existing Rewire GA4 measurement ID, `G-P0CLMZMKF8`, also present on the main blog. In Analytics, use the **Hostname** dimension to distinguish `benchmarks.rewire.it` from the blog. This change does not create a property or change its retention, sharing or administrator settings.

## Deployment

Set the non-secret GitHub repository variable `NEXT_PUBLIC_GA_ID` to that measurement ID. The Firebase workflow validates it before building, includes it in the Next.js client bundle, and checks the exported bundle. Changing it requires a rebuild. Local development, Firebase preview hostnames and builds without a measurement ID do not collect analytics. Production tracking is restricted to `https://benchmarks.rewire.it`.

The current implementation measures public **page views**. Frame visibility and browser storage restrictions can affect session and engagement metrics; they are not validated measures in this release. It does not instrument catalogue searches, clicks, downloads, scrolling, forms or submissions. Do not interpret it as a complete product-engagement measurement system. Returning to a pathname counts another visit; changing only query parameters or fragments does not.

## Consent and private workflows

- No Google tag, analytics frame or collection request is initiated until the visitor chooses **Allow analytics**. Advertising consent stays denied and Google signals are disabled.
- **No thanks**, Do Not Track and Global Privacy Control prevent loading. A host-local preference lasts 180 days. The footer's **Analytics preferences** control permits withdrawal; storage changes propagate between tabs.
- After opt-in, the site stores a random pseudonymous client ID in host-local storage. The frame receives this ID so page views can be associated when third-party cookies are blocked. GA cookies, if permitted by the browser, use the `rewire_bench` prefix on `rewire-it.web.app`. Withdrawal removes the local ID, tells the tag to disable collection and deny consent, clears its cookies, then removes the frame after acknowledgement (or a one-second fallback). It cannot retract events already sent.
- Contribution, authentication, API, unknown and legacy redirect routes do not mount analytics or show a consent prompt. Links into `/contribute/` perform document navigation. Contribution responses retain `no-store`, `no-referrer` and `noindex` headers.
- URLs sent to GA contain the public origin and pathname only. Queries, fragments and internal contribution referrers are omitted. External referrers are reduced to their origin. Public page titles are included; no form values, private records or search terms are sent.

The tag runs in a hidden frame at `https://rewire-it.web.app/_analytics/`, the existing Firebase alias for this same deployment, with no parent referrer. It is a different browser origin: Google’s code cannot read the benchmark page’s URL, DOM or history. A sandbox prevents top-level navigation, and the frame accepts messages only from its parent on the exact benchmark origin. No additional hosting service is introduced. Only sanitized page data is messaged into it after consent. This prevents GA's enhanced measurement from observing the application's history, query strings or form interactions. The frame itself never changes history or contains forms; manual page views are deduplicated and `send_page_view` is disabled on configuration. The frame is noindexed and is absent from the sitemap. This isolation matters because disabling automatic initial page views alone does **not** disable GA enhanced history measurement.

## Verification and limits

Automated tests cover consent expiry, browser privacy signals, production-origin gating, message-origin validation, private route exclusion, query/referrer sanitization, deduplication and page navigation. React lifecycle tests cover local/cross-tab withdrawal, acknowledgement and timeout teardown, rapid re-granting, private navigation and BFCache restoration without reusing a withdrawn identifier. Hosting checks verify the frame's privacy/indexing headers. Export checks verify deployment configuration and the contribution page's lack of tracking markup.

Before reporting real traffic as verified, complete a browser and GA property check:

1. Open a clean browser session on the live benchmark site. Before consent and after declining, confirm no requests to Google Analytics or Tag Manager.
2. Allow analytics; confirm one `page_view` for the initial page and one for a different model/benchmark page. Inspect `page_location` and `page_referrer` for the absence of queries/fragments. Filter changes on the same page must not emit a new view.
3. Enter `/contribute/`, including an email-link callback, and confirm no tracking frame or Google analytics requests. Return to a public page and confirm that the contribution URL is not its reported referrer.
4. Withdraw consent, reload, then test another tab. Confirm no new Google requests and no benchmark client ID in local storage or benchmark-prefixed GA cookies on the frame origin.
5. In the existing GA property, check Realtime or DebugView for the public visit and hostname. Do not send fabricated Measurement Protocol hits to stand in for this check.

At implementation time the Mac was locked, so browser network verification and GA Realtime were not available. Unit and export checks are not evidence of events appearing in the property's reports. Record the real browser/GA check when access is available.

## Rollback

Revert the analytics PR and redeploy the last working site. Keep the repository variable until the revert removes the configuration guard; merely deleting it will deliberately fail a build. Existing contributions, scientific releases and the API are unaffected by analytics changes.

## Sources

- [Google: manually measure page views](https://developers.google.com/analytics/devguides/collection/ga4/views)
- [Google: enhanced measurement and history events](https://support.google.com/analytics/answer/9216061?hl=en)
- [Google: basic and advanced consent mode](https://developers.google.com/tag-platform/security/concepts/consent-mode)
- [Google: single-page application measurement and validation](https://developers.google.com/analytics/devguides/collection/ga4/single-page-applications)
