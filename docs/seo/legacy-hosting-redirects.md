# Permanent legacy redirects

> The redirects are now served by the Cloudflare Worker, which reads the same `hosting.redirects` list from `firebase.json`; Firebase Hosting no longer serves the site. The validation below was measured on Firebase Hosting before the move.

Firebase Hosting issued 301 redirects for 105 explicit paths, with or without a trailing slash:

- `/database/` → `/`.
- `/literature/` → `/?kind=result&origin=literature`.
- Each of the six historical domain paths → `/?kind=model&area=<domain>`.
- 97 historical paper paths → their exact `/database/source/<id>/` records.

The [identity review](legacy-redirect-review-2026-09-23.json) records every paper/source mapping, source URL and version, input checksums and the three scope-excluded citations. Mapping requires the complete `legacy_paper` object, title, source URL and version to match the archived source record. It does not infer identity from a similar name. Scientific records and release artifacts are unchanged.

The three excluded paper pages retain their historical explanation and noindex policy. Unknown paper IDs, unknown domains and unknown nested paths have no redirect rule and remain genuine 404s. Current model/source/benchmark routes, MFASS reports and download filenames are not matched. The footer now points directly to the published-results view.

## Query strings and fragments

Actual Firebase Hosting appends the incoming query string after destination defaults, preserving repeated keys and encoded values. The existing explorer reads the first `kind`, `area` and `origin` value, so the intended destination filter continues to take precedence. Incoming duplicate filter keys remain in the URL, unlike the JavaScript fallback that removed conflicting keys. This preserves effective filter semantics without rewriting arbitrary query data.

Redirect destinations deliberately contain no fragment. Browsers inherit the original fragment, preserving `#mfass-v1`, `#browse` and other saved anchors. A legacy URL without a fragment now opens the destination at its normal top rather than inventing `#browse`. This is required to retain incoming fragments in a static HTTP redirect. Existing fallback components remain available for non-Firebase static hosting and client-side navigation; the production HTTP redirect runs before those files are served.

## Verification

The [validation receipt](legacy-redirect-validation-2026-09-23.json) contains 234 successful HTTP observations from actual Firebase Hosting in a one-hour synthetic preview channel. The fixture contained only dummy HTML; production hosting, the API, DNS and Auth authorised domains were not changed. The preview channel was deleted after testing.

Coverage includes both slash forms of all 105 rules, repeated queries, conflicting default filters, encoded ampersands and slashes, literal percent escapes, Unicode, all three retained exclusions and unmatched-path 404s. Google Chrome headless with fresh temporary profiles confirmed fragment inheritance for MFASS and two other bookmarks by reading the final URL from the dummy page. This establishes redirect behaviour, not visual or screen-reader quality.

The pinned Firebase emulator passed 228 corresponding checks. Its `superstatic` middleware double-encodes reserved query escapes; it therefore cannot establish encoded-query preservation. Those six strict checks passed on actual Hosting. This limitation is explicit in the receipt and does not relax production verification.

Run after deploying the reviewed site:

```bash
node scripts/check-legacy-redirects.mjs https://benchmarks.rewire.it
```

Run against the local Hosting emulator:

```bash
node scripts/check-legacy-redirects.mjs http://127.0.0.1:5055 --emulator
```

The existing `npm run check:http` includes these checks, automatically selecting strict encoded-query checks for a non-local hostname. `tests/legacy-hosting-redirects.test.ts` also binds the committed Hosting rules and receipt to the exact reviewed mappings and checks explorer filter precedence.

The full production build and export run in CI before deployment. Rollback restores the previous Hosting version; no database release or private data migration is involved.

Provider documentation reviewed on 23 September 2026: [Firebase Hosting configuration and redirect priority](https://firebase.google.com/docs/hosting/full-config#redirects). Provider behaviour above was measured, rather than inferred from the documentation.
