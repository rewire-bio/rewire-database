# Benchmark database interface rework

Status updated 23 September 2026: API PR #28 and interface PR #29 are merged and deployed. The current production deployment also includes reviewed results PR #24 (merge `1894c0e82f537b4f9a2639c65ac7abf2979e6d38`).

## Agreed design

Present a short overview before results. Use four local destinations: Overview, Results, How to run (Use this model for predictive entities), and Evidence. Findings and evaluation pages use Finding, Methods, Reproduction, and Evidence. Keep long methods, specifications, claims and raw metadata available in labelled disclosures. Existing section bookmarks must still reveal their content.

Make search the starting point of the explorer, with Models, Benchmarks, Datasets and Results as the main views. Group specialist entities under More record types. Show linked evaluation and metric-row counts separately, and preserve filters, pagination and return context in URLs. Present coverage as readable counts rather than small bar charts.

Replace the large bar charts with a compact dot plot and an equivalent table. Preserve source order by default, initially show twelve rows, and offer an explicit show-all control. Both views use the same scope, filters and rows. Use established metric bounds and a clearly labelled zoom to observed range; plot only supported uncertainty. Do not create rankings across incompatible evaluations.

Differentiate an empty collection, filters matching no rows, results without a valid chart, and a request failure. Retain visible failures and a retry path rather than showing them as zero records.

Put the execution steps in order. Where Python, CLI and container instructions are alternatives, offer a format selector rather than suggesting users should run all of them. Keep access requirements and validation status visible. Split contributions into New contribution, Your contributions and Submit with Python; retain in-page drafts when switching tasks.

## Implementation batches

1. Additive API support: counts, exact scope filters, typed comparison choices, bidirectional pagination and cursor isolation. Existing response fields and configuration-filter behavior remain compatible.
2. Interface: explorer, section navigation, short overview, shared comparison workspace, ordered execution guidance, evidence guide and contribution tasks.
3. Verification: targeted regression tests, full tests, production export, and desktop/mobile browser checks.

API PR #28 and interface PR #29 completed review in that order and are now on main. Their original isolated preview details below are historical, not a claim that a local server is currently running.

## Scientific and operational boundaries

No scientific records, historical releases, scores, model runs, submission permissions, mail delivery, hosting or production settings are changed. Source review remains distinct from reproduction. Missing coverage and uncertainty stay explicit. Local preview uses the pinned public catalogue with isolated Firebase emulators and no private contributor records.

## Validation

- The full website suite passes, including render/anchor checks over all 30 current top-level benchmarks.
- Service emulator tests pass, with focused tests for the new API fields and cursor/filter boundaries.
- Lint and TypeScript checking pass.
- Browser checks: desktop explorer search; NABench scope, chart/table parity and filtered-empty reset; 375-pixel responsive controls and dot plot; AlphaFold 3's preserved `#specifications` bookmark; contribution draft retained across Python/New task switches; filtered Back to results link.
- The first local build attempt exhausted disk while restoring immutable downloads. Its incomplete generated copy was removed without changing source archives. Subsequent production builds and export checks passed, including deployment run `35791831212` for PR #24. Immutable source archives remain unchanged.

Automated accessibility checks and browser inspection are not a claim of a complete assistive-technology audit. Physical screen-reader testing remains a follow-up.

## Local preview

The review checkout is `rewire-ux`, branch `codex/benchmark-ux`. The implementation preview used `http://localhost:3040/`, with Next on 3041, the local tRPC service on 8787, Firestore emulator on 8485 and Auth emulator on 9499. Preview-only scripts and emulator configuration are ignored under `workbench/ux-preview/`.

The production build and development server both use `.next`; stop this checkout's development server while building. Preview configuration is local-only and must not be copied to production.
