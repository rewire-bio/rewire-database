# Benchmarks UI and information architecture review — 7 October 2026

Changes were prepared on `codex/benchmarks-ui-ia-review-20261007`, based on
`e0c084f`, with the checksum-verified release pinned by
`benchmark-data.lock.json`. Reviewed scientific data and release artifacts
were not edited.

| Finding | Correction |
| --- | --- |
| Paragraphs and lists lost spacing under Tailwind's reset | Restore scoped prose rhythm for discovery and record-detail sections; keep component-specific card/table styles authoritative. |
| Profile action links touched when wrapping and category labels lost their styling | Use flex gaps and consistent control heights; restore the shared category label style. |
| Homepage maintenance information pushed the main search below the fold | Put search directly after the page header, followed by freshness and evidence information. |
| Use-case detail began with a future collection plan | Present applicability, inputs, clinical scope and evaluated evidence before gaps and the collection plan. |
| Every evaluation's long result table was expanded | Keep configuration identity, status, description and interpretation limits visible; disclose results, conditions and reproduction details on demand. |
| Collection methodology dominated the page | Keep the comparison question and next task visible; disclose baseline, outcome and validation requirements. |
| Primary navigation selected Database on model/benchmark profiles | Select the relevant parent section and distinguish exact page from section location. |
| Mobile menu could remain open after navigation and lacked Escape dismissal | Close on route changes; Escape closes the menu and restores focus to its toggle. |
| Section highlighting could be wrong when scrolling backwards or stopping at an anchor | Track section positions with an animation-frame-throttled scroll listener and allow for anchor rounding. |
| A short final section could not reach the sticky navigation at the page bottom | Select the last section at the scroll limit and retain normal tracking when scrolling back up. |
| Fragment targets inside closed disclosures were hidden | Reveal the target and enclosing disclosures; preserve modified-link and different-query behavior. |
| Section navigation compounded section padding | Remove the extra bottom margin and use the shared sticky offset for record sections. |
| More-record-types disclosure lost its marker | Restore a list-item summary and a 44px control height. |
| Small mobile form text could trigger browser zoom | Use 16px text and 44px controls on narrow screens. |

The review covers shared discovery, index and record templates, use-case pages,
search/filter controls, evidence/results views, navigation, audits,
contributions, charts and execution guidance. It is a template review, not a
claim that every released record was manually inspected.

## Validation

UI coverage measures all reusable components and documented route-local views,
including hooks and helpers. CI requires at least 90% for each of statements,
lines, functions and branches. See `docs/ui-testing.md` for the precise scope.
The complete root test suite, lint, type checking, production static export,
and desktop/mobile browser checks are separate validations.

The final coverage run passed 79 test files and 865 tests: statements/lines
98.45%, functions 99.19%, branches 93.57%. Lint and TypeScript checks passed.
The production build rendered 29,007 pages, and the export check verified the
output against the pinned release. HTTP smoke passed on the live site and the
final local preview. Desktop/mobile checks found no page overflow or console
errors on the sampled journeys.

The post-deployment HTTP smoke command checks public page routing, JavaScript
asset availability, release consistency, a database download, search/filter
API behavior and detail links. One Chromium smoke journey then checks client
search/filter interactions, detail return context, BRCA evidence/provenance,
section selection and mobile navigation/table containment. Both run after
Cloudflare publication. Locally, browser test collection and matching CUA
journeys were checked; the automated browser runner has not been executed.
