# Independent automated review — 2026-09-23

**Outcome: pass for the bounded descriptive profile additions.** No blocking findings. This is an independent automated, non-human source and code review. It is not human scientific review, independent reproduction, or authorization to publish.

I reviewed both candidate profiles, all 24 facts and corresponding audit rows against the decompressed original source artifacts, rather than accepting the candidate's assertions. All ten decompressed artifact SHA-256 hashes match `retrievals.json`; fresh retrievals from all ten commit-pinned URLs also match those hashes. All 24 audit rows match their fact values, statuses, locators, source IDs and retrieval URLs. Both new source records match their archived bytes; cited existing source hashes match the baseline catalogue.

- The reference CSV independently counts 217 assays and 2,465,767 assay–variant records. Its AMFR row identifies the 47-residue human construct, cDNA-display proteolysis and Stability category, with 820 single and 2,152 multiple substitutions. These are reference metadata, not authentication of every assay archive.
- The runner code (`runner-packages-rewirebench-src-rewirebench-protocols-proteingym.py.gz`, lines 157–249) supports the five metric definitions, three-decimal assay rounding, UniProt/category aggregation, omission of null metrics from means, original assay denominators and exclusion of incomplete assays from category summaries. Lines 232–244 require full scope and all 217 complete assays before exposing track metrics. The upstream scorer confirms metric conventions and aggregation (lines 14–78, 212–226, 269–315).
- The archived AMFR report explicitly has 2,972/2,972 selected variants scored, zero unscored, one complete assay of 217, `scope=subset`, `completion=partial`, `protocol_results.status=partial_track`, and both suite metric objects empty. The candidate preserves that distinction and does not generalize its category summary to the complete track.
- Checkpoint identity, CPU/software environment, no fitting and masked-marginal scoring are correctly presented as reported provenance. Local assay hashing and `expected_hashes_checked` do not authenticate an official archive: the report retains `local_bytes_hashed_not_independently_source_verified`. Training overlap remains unreported. The report supplies no uncertainty interval; upstream bootstrap code estimates standard errors for differences from the best aggregate model, resampling within selection categories, not an absolute assay interval or seed variability.
- `run-README.md.gz` and `executed-reproduce.py.gz` support the bounded claim of originally reported saved-prediction rescoring and five-formula comparison, while excluding execution of the complete upstream aggregation program. The report explicitly states `independently_reproduced=false` and `published_result_reproduction=false`. No model, metric formula, saved prediction or checkpoint was executed/recomputed/downloaded during this review.

The creation path in `scripts/omics/profile-evidence.ts` requires an existing protocol, genuine absence of an own `profile` property, and a matching SHA-256 of the entire serialized record. Null or invalid existing profiles are not treated as absent. Strict patch parsing rejects extra fields; duplicate patches, missing citations and wrong subjects fail. The returned record changes only `attributes.profile`.

In-memory application to the supplied 26,066-record baseline passed both whole-record preconditions, created exactly two profiles and appended two source records. Every pre-existing non-profile field remained equal, unaffected records retained object identity, and the input remained unchanged. The targeted command `TMPDIR="$PWD/workbench/tmp" npm test -- tests/omics-profile-evidence.test.ts` passed all nine tests, including stale preconditions, absent/null profiles, invalid subjects, duplicate patches, citations, source hashes and preservation checks. No release/export/build command ran and no catalogue or release artifact was modified. `review.json` was intentionally absent and was not created by this reviewer; the batch loader remains gated on a completed manifest.

Reviewed input SHA-256 bindings:

| Input | SHA-256 |
|---|---|
| `patches.json` | `f7981fc4004f2e7c9b99123c3c149a18d174f90e8824aacb83f90b43febd8637` |
| `audit.json` | `3b8e5620e5e0cbd7021280fa28c6d1f68409379e4fc1cb0afee647b8e9246459` |
| `retrievals.json` | `5aa8cd8773dd0bd267a24daaf5617a3d54f2fdae02ffbb6cdb77a43c06ca9a24` |
| `sources.jsonl` | `d11a7bfcfcb002af2a56680075a150c158972cf03bd394277fec2876ef34a189` |
| `scripts/omics/profile-evidence.ts` | `37cba6248b3f62ff3967947e1f83984b77e9f8453f319bf3347e0f13c82f2693` |
| `tests/omics-profile-evidence.test.ts` | `7c556ceec96ad21594ac408e59cd6cd6d7d28cb6ae452354bfaede4f6a7f7c1a` |
| Supplied `rewire-spacing-fix/public/omics/catalogue.json` baseline | `02b31c13d3d5199ad5eb0dd55902c127d51f6d12d803c46ff177bc74d64b3200` |
