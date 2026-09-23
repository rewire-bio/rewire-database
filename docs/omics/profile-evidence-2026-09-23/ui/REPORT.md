# Readable comparison results: local UI verification

## Implementation and ownership

UI work is complete; ownership released to parent. No commit, push, data/release change, or deployment performed.

Changed files:
- `components/catalogue/BenchmarkCharts.tsx`
- `components/catalogue/comparison.module.css`
- `components/catalogue/Results.tsx`
- `app/database/database.module.css`
- `tests/omics-published-comparisons.test.tsx`

Exact printed values are unchanged. Chart rows and the axis share an intrinsic score column using CSS subgrid. Score links stay on one line; overflow is contained in the existing focusable chart/table. Both regions and links have visible keyboard focus. The general results table also keeps the printed value unbroken.

Panel summaries retain metric/direction, protocol, dataset, source and evidence origin. Known generic notes, method context, automated review date, and plot interpretation are accessible in a native details disclosure. Unknown/source-specific caveats remain prominent, regardless of array order. A generated input-conditions note is collapsed only if the exact conditions remain in the visible protocol link. No caveat is removed or duplicated. Missing-score commentary appears only when a missing score exists. Numeric descending/null-last behavior remains unchanged.

## Executed checks

- `npx vitest run tests/omics-published-comparisons.test.tsx tests/catalogue-payload-interactions.test.tsx`: 40 passing tests.
- `npm run lint -- --file components/catalogue/BenchmarkCharts.tsx --file components/catalogue/Results.tsx`: passed.
- `npm run typecheck`: passed.
- `node workbench/readable-results-ui/verify.mjs final-preview`: 263 passing browser assertions, zero failed checks and zero runtime/console errors.

The final browser run used the existing development server at `http://localhost:3016`, actual current UI files and catalogue `2026-09-23-2b89723c6dd9`. No CSS override or API proxy was needed. File hashes, Chrome identity, exact viewport definitions, full assertion details, and screenshots are in `final-preview/conditions.json` and `final-preview/receipt.json`.

At 320, 390 and 1440 px, browser checks cover:
- Actual BEELINE and ATOM3D initial charts/tables and VCC protocol `acquired-protocol-7f9c60e5c29f16e44637`, including source-exact long decimals.
- Exact descending result-ID parity between chart and table.
- Single-line reported values, contained axis ticks, no page overflow.
- Region and link keyboard focus; arrow-key horizontal scrolling exposes exact values within the region.
- Collapsed supporting details, visible origins/material caveats and keyboard disclosure activation.
- A separately labelled DOM-text stress case substitutes long negative, scientific-notation and N/A strings solely to test CSS. It is not scientific evidence or an API/data validation. React rendering tests independently verify these value types, missing-value plotting behavior and chart/table content.

Screenshots were manually viewed, including `narrow-long-values-chart.png`, `mobile-long-values-table.png`, `mobile-panel-header.png` and the desktop long-value chart. Narrow charts intentionally require local horizontal scrolling where necessary; screenshots taken after keyboard scrolling may show the left side of a configuration label outside the local viewport. The label and value remain accessible by scrolling; the document does not overflow.

## Scope and cleanup

This is local rendering/interaction evidence, not a production deployment or performance measurement. Production export and post-deployment checks remain the parent's responsibility. Only Chrome was launched by this verification; its isolated temporary profile and process were cleaned up. The existing parent-owned Next dev server remains running.

Earlier `preview-1` through `preview-3` receipts are retained. Their failures concerned an overly strong harness assumption that native focus always auto-reveals a partially visible value, and using incomplete CDP Enter events for native summary activation. The final harness verifies actual arrow-key reachability and native Space activation; no assertion failures are suppressed.
