# Benchmark site analytics

The benchmark site uses the existing Rewire GA4 measurement ID, `G-P0CLMZMKF8`, also present on the main blog. In Analytics, use the **Hostname** dimension to distinguish `benchmarks.rewirebio.io` from the blog. This change does not create a property or change its retention, sharing or administrator settings.

## Deployment

Set the non-secret GitHub repository variable `NEXT_PUBLIC_GA_ID` to that measurement ID. The Firebase workflow validates it before building, includes it in the Next.js client bundle, and checks the exported bundle. Changing it requires a rebuild. Local development, Firebase preview hostnames and builds without a measurement ID do not collect analytics. Production tracking is restricted to `https://benchmarks.rewirebio.io`.

The current implementation measures public **page views** and **engagement time**. It does not instrument catalogue searches, clicks, downloads, scrolling, forms or submissions. Do not interpret it as a complete product-engagement measurement system. Returning to a pathname counts another visit; changing only query parameters or fragments does not.

## Engagement time

Google's tag counts engagement time only while its own document is visible and has focus. The tag runs in a hidden frame that never has focus, so it recorded no engagement time: no hit carried `_et` and no `user_engagement` event was sent, which is why reports showed 0s average engagement (#211).

The page now tells the frame, on load, focus, blur and visibility changes, one boolean: whether the page is visible and focused. The frame times the foreground periods and sends `user_engagement` with `engagement_time_msec` when the visitor moves to another page, when the tab is hidden, and on `pagehide`. On `pagehide` it disables collection only after Google's tag has had its chance to send the queued event. Nothing else crosses into the frame.

Before this change, `pagehide` disabled the tag and cleared its `rewire_bench_*` cookies on every full page load, so each load started a new GA session and a new `first_visit`. The 19 to 25 October figures show this: 34 sessions, 35 `session_start` and 34 `first_visit` for 49 page views. Unload no longer clears those cookies, so a session now spans page loads and session and new-user counts will fall. Withdrawal still disables the tag, denies consent and clears the cookies.

Browser storage restrictions can still affect session metrics.

The `scroll` events in reports are not real scrolling. Enhanced measurement's scroll event fires in the hidden frame about five seconds after each page view, because the frame's document is shorter than its viewport. Turn off **Scrolls** under the web stream's enhanced measurement settings, or ignore that event for this hostname. That is a property setting, shared with the blog, so it is not changed here.

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
6. Stay on a public page for at least 30 seconds in the foreground, then close the tab. Confirm a `user_engagement` event with `engagement_time_msec` in DebugView, and that a day later the hostname's average engagement time is no longer 0s. If DebugView shows the event but reports still show 0s, rename the event (for example `page_engagement`): GA adds up `engagement_time_msec` on any event, and `user_engagement` sent from the data layer may be handled differently from the tag's own.

### Engagement check, 2 November 2026

Run in headless Chromium 156 (Playwright) against the live site with consent stored, GA requests intercepted and answered locally:

- Live site, 25 s on `/evidence/` then 15 s on `/audits/`: `page_view` and `scroll` for each page; no hit carried `_et` and no `user_engagement` was sent.
- Same tag and ID on a test page, top level against a hidden frame, 20 s dwell then a probe event: top level `_et=20035`; in the frame, no `_et` and `document.hasFocus()` false, plus a `scroll` at 5 s.
- Live site with the patched `frame.js` and a parent reporting foreground state: after 24 s on `/evidence/` and an in-app navigation, `user_engagement` with `_et=24277` for `/evidence/`, then the next `page_view` marked `seg=1` (engaged session).

The harness could not observe hits sent while a page unloads, for the original top-level tag as well, so the tab-close and leave-the-site path still needs the real browser check in step 6 below.

At implementation time the Mac was locked, so browser network verification and GA Realtime were not available. Unit and export checks are not evidence of events appearing in the property's reports. Record the real browser/GA check when access is available.

## Rollback

Revert the analytics PR and redeploy the last working site. Keep the repository variable until the revert removes the configuration guard; merely deleting it will deliberately fail a build. Existing contributions, scientific releases and the API are unaffected by analytics changes.

## Sources

- [Google: manually measure page views](https://developers.google.com/analytics/devguides/collection/ga4/views)
- [Google: enhanced measurement and history events](https://support.google.com/analytics/answer/9216061?hl=en)
- [Google: basic and advanced consent mode](https://developers.google.com/tag-platform/security/concepts/consent-mode)
- [Google: single-page application measurement and validation](https://developers.google.com/analytics/devguides/collection/ga4/single-page-applications)
