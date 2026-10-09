# Reliability and scientific-integrity fixes, 19 September 2026

This change addresses the defects in [the project evaluation](project-evaluation-2026-09-19.md). It does not claim to reproduce the papers' experiments or to fill the ten outstanding benchmark evidence gaps.

| Finding | Correction |
| --- | --- |
| Oversized benchmark responses | Public detail responses carry the first chart and chart descriptors. `catalogue.comparison` loads one source-scoped figure at a time, pinned to the release. Linked records omit nested profiles and chart definitions; their complete records and downloads remain available. |
| Incompatible pooled rankings | Removed the cross-protocol pooled view. The deprecated `aggregate_comparisons` field remains an empty array for compatibility. No source figures or values are discarded. |
| Runtime memory | Keep one full release in the warm-instance cache and construct the evidence index lazily. Runtime memory is 512 MiB with concurrency four; no minimum instances were added. |
| Adapter label leakage | Runner 0.3.0 introduces Genomic Benchmarks v2 with opaque IDs and label-independent ordering. V1 prepared artifacts must be recreated. Website instructions pin `aecb9e79a2a5e83b59e482212b1a8b812dd16079`. |
| Extraction verification | All eight PDF extractors authenticate source bytes and internally derive text with conversion receipts. Unknown cells fail. All 17 batches were rechecked. See the [source review](https://github.com/rewire-bio/rewire-benchmark-data/blob/main/docs/reviews/2026-09-19-extraction-integrity.md). |
| Scientific metadata | Restore 16 omitted ProteinBench percentage cells, correct percent/correlation units, and withdraw unsupported TDC standard-deviation labels. Existing numeric and printed values remain unchanged. |
| Evaluation counts | Explicit, hash-locked source review groups Genomic Benchmarks into 18 scopes for 36 metric rows, and ProteinGym into 88 scopes for 221 metric rows. These scopes are not counts of individual runs, assays or independent experiments. Original record IDs and links remain available. |
| Coverage audit | Uses the production query and comparison gates. Per-benchmark result/chart floors prevent one benchmark hiding another's regression. |
| Deployment failure | Capture both the previous catalogue pointer and Hosting version. Retry transient probes and restore both after failure, including partial Hosting success. |
| Submission truncation | Stable contributor/curator pagination, scoped cursors, contributor continuation and complete CLI retrieval. Production contributions remain disabled. |
| Runner output validation | Undefined TDC metrics use null with a reason. Export provenance has an explicit key allowlist. Runner and service share strict TDC/Genomic local-copy submission rules. |
| Page hierarchy | Charts and results precede detailed methods and instructions; navigation follows this order. ProteinGym charts moved from roughly 6,161 to 556 CSS pixels from the top at a 1,280-pixel desktop viewport. |

The public API's `get` response now includes `comparison_options`; additional figures are requested with `{release_id, id, panel_id}` at `catalogue.comparison`. Internal static rendering can still resolve all figures for validation. Results preserve complete evidence and original evaluation links; profile details are fetched through their record URLs.

The previously published release `2026-09-17-26ec7db1590e` is preserved as individually compressed artifacts with the original manifest and hashes. Its combined JSON bundle would exceed Node's string-size limit. Restoration checks every artifact's bytes and rejects conflicting files. Earlier archive formats remain supported.

Validation recorded for this change:

- 368 database tests and 64 service tests against isolated Firebase Auth/Firestore emulators, with no skips.
- 184 runner tests, offline dependency-lock check, wheel/sdist build and standalone wheel import.
- Python-generated synthetic contribution bundles for all 31 TDC/Genomic datasets accepted by the service schema.
- Runner PR CI passed native, Podman and Apptainer parity for core, ESM and DNABERT-2 environments.
- NABench detail regression budget under 500 KB, compared with approximately 379 MB before the fix; each selectable figure under 1 MB.
- Source-checked extraction corrections and evaluation grouping have separate receipts in `data/omics/reviews/`.
- Production build and export checks passed for 13,485 record pages, 100 historical paper pages, MFASS history, local links and archive checksums.
- Local Hosting/API integration and deployment probes passed for release `2026-09-19-f5c67a009c10`. Browser checks confirmed that changing ProteinGym's chart loads 21 source rows without errors and filtering CARP shows one evaluation scope with five metric rows. Desktop layout had no horizontal overflow; no new mobile-device test is claimed.

The ten benchmarks without usable linked results remain explicitly empty. Expanding those source collections, benchmarking new models and activating public contributions are separate work.

The local export remains about 6.3 GB: 4.5 GB is current and historical downloads, and 1.8 GB is record pages. Removing duplicated chart payloads improves pages and API responses, but preserving archived bytes limits storage savings. Moving archives to separate storage needs its own compatibility and cost review.
