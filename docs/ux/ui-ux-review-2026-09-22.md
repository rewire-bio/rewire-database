# Benchmark database UI and UX review

Reviewed: 22 September 2026. Status: audit and design recommendations; no product changes or deployment.

## Assessment

The site has useful evidence and a coherent visual style, but its pages still behave like database inspection screens. Readers encounter record types, repeated review notices and large tables before they can answer three questions: **What is this? What do the results show? Can I run it?**

The main problem is hierarchy, not simply the amount of content. Keep the scientific detail, but expose it when it helps a decision. The most urgent work is to simplify benchmark pages, replace the chart presentation and correct misleading empty states. This does not require another database or API rewrite.

## Scope and evidence

- Live site: <https://benchmarks.rewire.it/>.
- Source: main `e844965ea440fea0a4b06f4910dc7bd50c7e3ee9`. The audited worktree at `fd7f12c` has the identical Git tree, `643314125ae050a0753484a94f77ca9481d889eb`.
- Published dataset: `2026-09-20-b2596bdf5206`.
- Read-only HTTP/HTML inspection of all **30 top-level benchmark pages**, plus seven supporting pages. All 37 returned HTTP 200; no missing local fragment targets were found in those HTML pages. This is not a check of every external link or every record page.
- Browser review: home/explorer, NABench, AlphaFold 3, BarcodeBERT result, MFASS v2 protocol, PEtab and Evidence. Contribution form and tracking structure were inspected through browser accessibility output and source. No contributions were created or altered during this audit.
- Desktop screenshots and Chrome responsive emulation at **375 CSS pixels**; AlphaFold 3 also inspected at 400px. Mobile menu and keyboard selection of comparison controls were exercised. This was not a physical-phone, screen-reader, cross-browser or formal WCAG conformance test.
- Shared templates, API query logic, chart code, CSS, contribution form and release data were reviewed. The existing published-comparison test suite passed **22/22 tests**; those tests do not establish visual usability.

Detailed observations are in [the page inventory](ui-ux-page-inventory-2026-09-22.json), [hierarchy review](ui-ux-hierarchy-2026-09-22.md) and [chart review](ui-ux-charts-2026-09-22.md). Source references in those appendices refer to the audited revision, not necessarily the current checkout.

## Findings, in priority order

| Priority | Finding and evidence | Change |
|---|---|---|
| P1 | **Benchmark explanations come too late.** NABench opens with a long chart and up to 25 detailed result groups before At a glance. All 30 benchmark pages have four disclosures open by default; AlphaFold 3 has none. | Put a compact overview before results. Apply the model pages' progressive disclosure consistently to benchmarks and protocols. |
| P1 | **The chart is too tall to compare comfortably.** NABench's first chart has 25 rows, each repeating entity type and evidence origin. A numeric axis exists, but only above the entire plot; it disappears while scrolling. Published panels reach 80 rows. | Use aligned, compact rows with one persistent scale, a chart/table switch and model search. Move shared origin/source information into the chart header. |
| P1 | **Homepage charts are illegible on phones.** At 375px, fixed-width SVGs shrink the text with the bars. Source dimensions imply roughly 6–7px labels. The browser screenshot confirms severe shrinkage. | Render labels and counts as normal HTML text; scale only the graphic. Provide an accessible table/list, with exact zero states. |
| P1 | **Filtering can falsely imply missing evidence.** Verified live: NABench → Evaluation setup “AIDO.RNA … CCV-CORR-APTAMER” → Metric “auc” gives “No evaluations linked in this release”, despite the page having 1,101 evaluations. | Say “No results match these filters”, show the unfiltered count and offer Reset filters. Reserve the existing message for genuinely empty records. |
| P1 | **Results tables repeat too much prose.** Protocol names, dataset links, source titles, missingness and the source-checking disclaimer recur through each group. BarcodeBERT repeats the same configuration and task across its summary, result table and reproduction panel. | Show shared context once. Use compact metric rows and expandable row details. Keep coverage, uncertainty and material caveats visible. |
| P2 | **Selectors expose the storage structure.** Homepage shows 4 main and 12 secondary entity controls before search. ProteinBench has 95 chart choices; NABench's setup filter enumerates individual evaluations rather than a small set of protocols. Some released chart titles contain JSON. | Search first; four primary browse views; “More record types” for specialist entities. Use separate readable protocol, dataset/adaptation and metric controls with search when needed. |
| P2 | **Chart and result table are separate experiences.** Changing NABench's chart updates the figure, but does not select the same scope in the results table. | One comparison workspace with shared scope and a Chart / Table view. Keep a separate, clearly labelled option to browse all evaluations. |
| P2 | **Coverage graphics contain actual presentation errors.** Zero counts receive a minimum-width bar. Coverage is ordered by metric-row count while displaying evaluation counts, so the bars look inconsistently ordered. | Draw zero as zero, sort by the displayed measure and label counts as catalogue coverage, not scientific performance. |
| P2 | **Sparse records are unhelpful dead ends.** AlphaFold 3 and PEtab lead with zero evaluations. Their source-backed explanations remain useful, but the page does not explain the absence near the count. MFASS and PEtab also trigger a rejected chart request with an empty panel ID, then render no chart explanation. | Explain “No reviewed evaluations linked here” beside the count. Offer sources, applicable protocols or a contribution action. Link to separately identified configurations only when associations are verified. Do not manufacture a comparison. Skip the API request when no chart exists. |
| P2 | **Navigation does not preserve a research session well.** Results offer First page and Next, but no Previous, row range or URL state. The long local menu scrolls away. The brand takes the reader to the separate blog. | Preserve filters, comparison and pagination in shareable URLs; add Previous and Back to results; use four persistent local destinations. Give the database its own home link and keep Articles explicitly separate. |
| P2 | **Evidence history competes with current information.** NABench shows an old extraction-gap note followed by a warning that it may already have been resolved. The Evidence landing page starts with download/schema mechanics before explaining review scope. | Lead with current coverage and what review status means. Put dated search history, original gaps, exports and technical receipts in the appropriate Evidence subsections. Preserve the historical records. |
| P2 | **Running and contributing need clearer entry points.** Execution steps live in a dropdown; installation, preparation and scoring are not visible as a sequence. Contributions combine sign-in, tracking, SDK guidance and a long form. | Use an ordered run flow with scope and prerequisites first. Separate New contribution, Your contributions and Submit with Python in the contribution UI; keep verification and pending-review states explicit. |

P1 means address in the first redesign batch; P2 means include in the following interaction pass. These priorities describe usability impact, not a claim that the scientific data is wrong.

## Recommended information hierarchy

Use **Overview → Results → How to run → Evidence** as the main structure for benchmark and protocol pages. Models should use **Overview → Results → Use this model → Evidence** where usage information is available.

| Area | Default view | Available on demand |
|---|---|---|
| Homepage | Search; Models / Benchmarks / Datasets / Results; readable filters; compact records with purpose and evaluation availability | Other entity types, collection coverage, release/export details |
| Benchmark overview | Biological question, what a good score means, task/protocol scope, concise procedure diagram, evaluation availability | Full dataset and scoring specifications, task inventory, limitations by protocol |
| Results | Selected protocol/dataset/adaptation and metric, essential caveat, chart/table, source and counts | Exact configurations, per-row provenance, uncertainty definition, extraction receipts |
| Model overview | One short explanation, biological inputs/outputs, architecture diagram, access and evaluated versions | Training detail, complete specifications and licences, full strengths/limitations |
| Individual result | Score, metric, tested configuration, dataset/split, procedure, coverage, uncertainty and source | Sibling metrics, exact reproduction details, audit history and raw metadata |
| How to run | What will be executed, access and hardware requirements, validation status, ordered steps | Alternative environments, private-model adapter, full manifests and source revisions |
| Evidence | Review meaning, principal sources, current evidence gaps and review date | Claim table, search history, corrections, archived releases and technical downloads |

Use a short overview and a few key facts before the diagram. Avoid solving the wall of text by replacing it with a wall of equally prominent cards. Give prose a narrower reading width; allow data tables to use the full content width.

Retain entity distinctions. A task is not a protocol; a service is not a checkpoint; a pipeline result does not automatically belong to its encoder. Readers should learn these distinctions through context and labels rather than sixteen navigation buttons.

## Replace the bar graph presentation

There are two different visualisation jobs, and they should use different designs.

**Scientific comparisons:** use a compact horizontal dot plot aligned with a numeric table. Each row contains the tested configuration, plotted estimate, printed score and a source/details action. Where reviewed structured uncertainty is available, show an interval with its meaning stated. Where it is unavailable, show a point and “uncertainty not reported”; do not invent an interval or treat the current black end-cap as one.

- One compatible protocol, dataset/subset, adaptation and metric at a time. Keep unknown compatibility and critical limitations visible above the plot.
- Label the axis with the metric and units. Use a documented, appropriate range; do not silently rescale each selection. If a zoomed range is offered, label it explicitly. Bars, where retained, need a meaningful zero baseline.
- Show readable model names in a fixed label column and decimal-aligned values. Avoid repeated “Configuration · Author-reported evaluation” on every row when those facts are shared.
- Default to source order; allow name or score sorting within the selected comparison. Score order does not establish statistical significance or an overall model ranking.
- For long panels, show a clearly labelled initial subset with “Showing X of Y” and access to all rows. Do not present the subset as the complete evidence or select only winners.
- Keep the axis visible or repeated while reading long charts. Provide Chart / Table views of the **same rows and filters**, source citation, and a linkable selection.
- On mobile, stack readable row labels above the graphic or offer the compact table. Do not shrink the complete desktop SVG.

**Catalogue coverage:** use a searchable list of benchmark names and exact counts, optionally with small bars. Keep this on Coverage/About, below the primary discovery workflow. Count bars describe how much evidence the catalogue contains, not which benchmark or model is better. Zero should say “No linked evaluations” and have no filled bar.

The existing compatibility checks are a strength. Tests reject mismatched metrics, units, directions, protocols, datasets and specified comparison conditions. However, equally missing conditions can still be grouped with caveats; describe this as a source-scoped comparison, not proof of complete comparability or reproduction.

## Accessibility and interaction follow-up

Preserve native disclosures, labelled filters, keyboard-focusable table regions and the existing printed-value alternatives. Add a skip-to-content link, current-page navigation semantics, unambiguous row-control names and useful result-count announcements. Give the overview charts a semantic count table/list: the present accessibility tree reports generic chart images rather than the category values.

Do not reintroduce a repetitive visible “Read diagram as text” block. Provide a concise accessible description and a useful data table where relevant. W3C recommends meaningful descriptions for [complex images](https://www.w3.org/WAI/tutorials/images/complex/). Validate text reflow at 320px and zoom as well as ordinary mobile widths; genuinely two-dimensional tables can retain local scrolling under [W3C's reflow guidance](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html). Axis and bar recommendations should follow [ONS bar-chart guidance](https://service-manual.ons.gov.uk/data-visualisation/chart-types/bar-charts).

No blanket accessibility compliance conclusion is justified by this audit. Full keyboard journeys, screen-reader output, 200–400% zoom, contrast measurement and additional browser/device testing remain acceptance work.

## Delivery order and acceptance

1. **Correct misleading states:** filtered-empty wording and reset; honest zero bars; coverage sorting; empty-panel request guard; explicit missing-comparison state.
2. **Pilot the new structure:** NABench for dense evidence, PEtab for missing numerical evidence, MFASS for reproducibility and AlphaFold 3 for configuration ambiguity. Move explanation before results and consolidate Evidence/history.
3. **Replace the comparison workspace:** shared filters, compact dot/table views, readable mobile labels, source/context header, honest uncertainty and persistent selections.
4. **Apply shared navigation and browse changes:** search-first explorer, advanced entity types, stateful pagination, meaningful breadcrumbs, run stepper and contribution task separation.
5. **Validate before wider publication:** no scientific record changes are needed for these presentation fixes. Any new identity association or scientific claim still needs a reviewed release.

Acceptance should demonstrate that a reader can find a benchmark, understand what it measures, select a compatible comparison, inspect the original score/source and reach applicable execution instructions without traversing repeated provenance blocks. Test no-data, filtered-zero, unavailable comparison, failed load, negative score, lower-is-better, missing uncertainty and long-name cases. Preserve all original values, IDs, citations, review distinctions and MFASS correction history.

On desktop and mobile, the first screen should establish purpose and a next action. Chart scales and labels must remain readable; zero must never appear as measured nonzero coverage. Back navigation, shared URLs and Previous/Next must restore the selected context. A filter yielding no rows must not claim that no evidence exists. Production build and existing scientific-relationship tests must still pass before deployment.
