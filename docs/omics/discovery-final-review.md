# Discovery benchmark methodology completion

Review date: 2026-09-16. Review method: automated primary-source review. This is a methodology review, not an independent reproduction of benchmark results.

## Delivered scope

The isolated override pack covers all 50 `discovery-benchmark-*` profiles that still had unfinished fields in the earlier benchmark evidence pack. It supplies 36 source records with exact retrieved-artifact SHA-256 hashes. Existing scientific result values, IDs, historical releases and relationship identities are unchanged.

The pack is under `workbench/evidence-completion/discovery-final/`:

- `profiles.jsonl`: 50 complete profile overrides in the existing `{id, profile}` format.
- `sources.jsonl`: 36 additional `evidence-discovery-final-*` records.
- `audit.jsonl`: inspected sources, field changes and remaining source-scoped limitations for every profile.
- `receipts.json` and `artifacts/`: full papers, official task documentation/configuration, raw downloads and retrieval outcomes. TAPE, GUE, ProteinGym and mRNABench reuse previously pinned full-paper artifacts, with their original retrieval metadata.
- `build.py`: deterministic generation from the isolated input snapshots and inspected source notes.
- `pack-checksums.json`: output hashes.

## Substantive completions

ATOM3D now specifies task-dependent random, identity, topology, target and temporal partitions, task metrics, baseline families and three-replicate variation. BEACON now lists its RNA task metrics, per-task partitions and three-seed sample standard deviations. BEND explains chromosome/identity partitions, frozen probes, zero-shot variant scoring and specialist controls. TAPE profiles retain the original paper's precise task partitions and distinguish the later implementation.

CAMI II profiles now explain practice data, confidential challenge truth, the supplied reference-date snapshot, gold-standard versus assembled contigs and task-specific uncertainty. GlycanML separates motif-cluster splits from protein-cluster interaction splits and documents three-seed variation. MassSpecGym now documents MCES-based structural separation and 99.9% bootstrap intervals. HEST distinguishes patient folds from retraining-seed uncertainty.

DART-Eval, GENEB, GUE, Genomic Benchmarks, FLIP/FLIP2, NABench, PFMBench, ProteinBench and PerturBench now cite full protocol passages. CAFA and CASP cite concrete round-specific assessments rather than implying every challenge edition has identical metrics. AMBER, OPAL, scIB, scPertEval and PEtab distinguish evaluator or transductive-inference responsibilities from a supervised model-training split.

The VCC 2026 profile now names its six calibrated metrics, score anchors and partition/panel/anchor-set identity. It does not reuse the 2025 H1 cell identity for intentionally anonymized 2026 contexts. Replicate calibration is not described as an absolute performance ceiling.

## Honest remaining limitations

Across 550 facts: 484 are source-checked, 48 inapplicable and 18 source-scoped unreported. There are no unextracted or unavailable facts in this override pack. Thirty-two profiles have no unresolved field; eighteen retain an explicit limitation.

The remaining fields concern:

- No demonstrated suite-wide leakage policy in the inspected BEACON and GENEB protocols. Published partitions do not establish pretraining independence.
- No universal, defined uncertainty procedure in the inspected BEND, CAMI assembly, CAPRI, original FLIP, Genomic Benchmarks, NABench, Open Problems, PLINDER, original TAPE and TDC source passages. Where a paper provides cross-validation, averages, individual error bars or task-specific intervals, that evidence is described rather than silently upgraded to a suite-wide confidence interval.
- Exact organism/line identities for anonymized VCC 2026 contexts. The public announcement and CLI guide specify the context structure while intentionally withholding line identities.

These are bounded statements about inspected evidence, not claims that no later paper or implementation can report more detail. Uncertainty across folds, test-example bootstrap resamples, training seeds, assay replicates and calibration anchors is kept distinct.

## Retrieval and review boundaries

Full texts were retrieved through arXiv PDF/HTML, Europe PMC XML, official challenge pages and pinned repository files. Some arXiv PDFs returned incomplete bodies; complete HTML revisions were retrieved and hashed instead. OpenReview requests for PerturBench/PLINDER were rejected; PerturBench was read through its complete arXiv version, while PLINDER uses pinned official evaluation documentation and release history. Europe PMC preprint endpoints for PLINDER, mRNABench and ProteinGym returned HTTP 500; the latter two were available in already pinned PMC full-text caches. Live PLINDER blog pages did not expose their full articles to the fetcher and are not used to support detailed scientific claims.

No missing source field was populated with inferred architecture, organism, interval semantics or a universal partition. No new model execution or benchmark score extraction was performed. Existing source-checked profile fields remain attached to their original citations; obsolete progress text was replaced and procedure diagrams rebuilt from the current cited fields.

## Validation

All 50 profiles pass the same Zod profile schema used by the website and service. Every one of the 36 new source hashes was checked against the raw artifact bytes. A search found no remaining unfinished `unextracted`/`not yet resolved` text in the generated profiles. Every override has a corresponding audit row.

Final output SHA-256:

- profiles: `896e5f6846a08bbc1794f0cc7dae724a1cc1ea242d1485263e272db86ee35af3`
- sources: `fa7a27fed69a241375272b5106844fd967091cf7079d7a5c0f77562635dfb2ab`
- audit: `df080181bf8cf542b2125cdbf2537af534bb55c127feeaad8b52bed5ab543d9a`
