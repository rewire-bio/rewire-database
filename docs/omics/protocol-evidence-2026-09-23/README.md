# Bounded ProteinGym protocol evidence follow-up

This batch supplies explanatory profiles for two existing protocol IDs:

- `rewire-proteingym-v1-3-dms-substitutions`: the 217-assay ProteinGym v1.3 zero-shot substitution protocol.
- `rewire-protocol-proteingym-amfr-v13`: the preserved local ESM-2 evaluation of 2,972 variants in one AMFR assay.

It adds 24 sourced facts, seven explanatory sections, strengths, limitations and explicit evidence gaps. It does not execute a model, rescore predictions, alter original results or upgrade any result review status. It does not establish named human scientific review or independent reproduction. Issue #31 remains open for broader catalogue gaps and scientific review.

## Evidence and decisions

The additive input lives in `data/omics/reviewed/protocol-evidence-2026-09-23/`. `patches.json` contains complete profiles, `audit.json`/`audit.csv` retain the absent-before state and every fact decision, and `retrievals.json` records fresh immutable URLs, retrieval timestamps, exact original-byte hashes and archive paths. Ten original artifacts are saved with deterministic gzip compression. Archive-file hashes and decompressed artifact hashes serve different purposes and are both checked.

Eight fetched artifacts corroborate existing evidence or serve discovery; existing catalogue source identities are reused only when original-byte SHA-256 matches. Two new source records identify the AMFR reproduction script and protocol implementation at runner revision `ca73fa47136d182f2d4ddb083d084712198fc0e2`. The protocol implementation bytes match the earlier documented recipe revision. This establishes source-code equality, not equivalence of all installed wheel contents or a new execution. A reference-field description is retained as corroborating material without adding an unused catalogue source.

The profiles distinguish:

- Reference counts (217 assays; 2,465,767 assay–variant records) from verified assay data and actual model coverage.
- One complete AMFR assay from a complete substitution track; both report-level suite metric objects remain empty.
- Assay rounding and protein/selection-type/category aggregation from a simple mean across assays or variants.
- Inclusive percentile recall thresholds from an exact 10% sample size when there are ties.
- The runner's absent uncertainty intervals from upstream reference-model-difference bootstrap standard errors.
- A reported checkpoint hash from a newly authenticated weight download; no missing checkpoint identity is inferred for other results.
- Local-byte hash checks from independent source authentication; automated source review from reproduction and human review.

The AMFR report still states `independently_reproduced: false`. Its category summaries apply only to the selected assay. Its original negative correlation and all numerical result records are retained.

## Safe integration

The existing reviewed batch and historical archives are unchanged. `scripts/omics/profile-evidence.ts` applies the original batch first and this additive batch second. A new profile requires an existing protocol with no `profile` property and an exact SHA-256 of the whole pre-profile record serialized with `JSON.stringify`. Null/invalid existing profiles are not absence. Changes to record identity, status, source links, recipes or any other field invalidate the creation precondition. Existing-profile updates retain their existing profile-hash preconditions.

Each batch requires a passing automated source-review manifest. Its inputs and artifacts must match all recorded hashes. Independent automated review is recorded separately from the authoring review; neither is named human scientific review. Review manifests are sealed only after independent review.

For a local review iteration on storage-constrained hosts, the existing command `npm run omics:release -- --current-only` skips expanding historical archives. It creates and validates current release exports and still rejects conflicting existing output bytes, but skips historical restoration and verification for that iteration. Production builds omit `--current-only`, restore historical bundles and run the normal full validation. All large temporary files for this follow-up belong under the external-SSD worktree, with `TMPDIR` set to its `workbench/tmp`.

## Validation scope

Targeted loader tests cover successful creation without mutation, stale whole-record pins, duplicate changes, existing/null profiles, wrong subject kinds, missing citations and extra mutation fields. Candidate integration against baseline release `2026-09-23-cda1ab0e8294` passed the complete record schema, all ten decompressed artifact hashes, source-pin matching and byte-equivalent preservation of 11,291 result records and every non-profile field. Release validation and independent review are recorded with the batch rather than implied by these checks.

## Prepared immutable release

Release `2026-09-23-5fd75097e2dd` contains 26,068 public records. It adds two protocol profiles and two source records to baseline `2026-09-23-cda1ab0e8294`, preserving all 11,291 original result records and every non-profile field. [Archive verification](archive-verification.json) records 255 verified source-input hashes and 407 verified export hashes. New compressed archives use deterministic gzip and are stored alongside their manifest under `data/omics/releases/`; historical archives are unchanged.

The separate [independent automated review](../../../data/omics/reviewed/protocol-evidence-2026-09-23/independent-review.md) passed before the new batch manifest was sealed. It binds the reviewed inputs and code to exact SHA-256 values. This preparation is not publication, experimental reproduction or human scientific approval.

Final local checks passed: nine targeted evidence tests, TypeScript, ESLint, the full production build (including historical release restoration), and `npm run check:export`. The export check verified 26,068 record pages and local links, 100 historical paper pages, MFASS history and release checksums. Both new protocol profiles contain their explanatory facts and coverage limits in the generated HTML. These checks validate source integration and site delivery, not scientific reproduction. No push, PR, merge or deployment was performed by this worker.
