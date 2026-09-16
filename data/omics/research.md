# Omics discovery collection

Initial acquisition pass: **16 September 2026**. This collection is a bounded, primary-source discovery release, not an exhaustive inventory or an independent reproduction of published experiments.

## Contents

`discovery.jsonl` adds 50 benchmark/suite/task/evaluator records, 53 model or method identities, 24 task-specific baseline proposals/references, 3 datasets, 12 evaluations, 12 source-checked results and 74 primary sources. Counts of suites and their constituent tasks are intentionally distinct; 50 records does not mean 50 independent benchmark suites. Discovery IDs are separate from the migrated literature records. Alias reconciliation remains necessary where old paper-specific model identities refer to these same families.

The nine acquisition lanes are covered in `search-ledger.jsonl`: DNA regulation; RNA; protein fitness; protein structure/design; cellular and spatial omics; microbial communities; molecular interactions; other molecular omics; and networks/mechanistic biology. The ledger records included IDs, exact source identities, queries, exclusions and remaining gaps. Source timestamps and SHA-256 digests are attached to every source; GitHub documents are pinned to commits. Mutable project websites have explicit version gaps and are not represented as permanently archived artifacts.

Only primary repositories, primary project pages and an author preprint support published discovery records. Search results, mirrors and community discussions were leads, not evidence. The scope excludes general-purpose doctor/medical chatbots and language-agent benchmarks. In particular, GeneBench-Pro and MetaBench were screened out; protein TAPE was distinguished from the unrelated Russian-language TAPE benchmark.

## Results that have actually been checked

The complete official TAPE **Fluorescence** and **Stability** leaderboard tables were extracted: six methods in each table, including the One Hot comparator. A separate source reading was transcribed into an explicit expected-value map; the parser checked all 12 values against it. The read-only `python3 scripts/omics-research-verify.py` then downloaded the pinned raw document again, checked its SHA-256, parsed both complete tables and reconciled each value with the published records. This verification was executed successfully during collection.

These are historical benchmark-maintainer reports. They are source checked, **not reproduced**. The README alone does not resolve exact model checkpoints, dataset artifact versions, denominators or uncertainty. Those fields remain missing, and automatic cross-study comparisons must be blocked. Neither the historical result age nor a successful transcription makes it current evidence of a universal best protein model.

Other discovered model pages do not acquire numerical results merely because an upstream README contains performance claims. Likewise, repository README licences are not automatically treated as weight or dataset licences.

## Recent discoveries and evidence gaps

- GENEB's current official repository provides a genomic probing benchmark and a machine-readable submission/leaderboard structure. Complete protocol and per-model numerical extraction is a priority follow-up; none of its scores was fabricated or copied into this release.
- The official CAMI site now advertises CAMI III and a corrected sample-to-individual assignment. Its ongoing challenge and exact dataset revisions must be tracked before importing leaderboard values.
- The 2026 Virtual Cell Challenge is represented separately from historical perturbation tasks. Discovery does not establish a completed challenge or available held-out labels.
- Recent ESMC/ESMFold2 and Genie 3 official model documentation is included without endorsing its performance claims. Family discovery is distinct from checkpoint verification.
- Lipidomics is not padded with invented benchmarks: LIPID MAPS reference spectra are a **dataset**, while LipidBlast and LipidFinder are procedures. A pinned split, annotation-resolution policy and scoring protocol are still needed for a reusable lipid-model benchmark.
- GlycanML and GlycanGT provide a glycomics entry point. GlycoGym surfaced in search but remains an unreviewed lead outside the released records.
- PEtab is a collection of biological parameter-estimation problems. It is not evidence that mechanistic models outperform learned models. DREAM challenge-level acquisition remains pending.

## Baseline policy

Twenty-three baselines are explicitly **proposed** applications of sourced procedures or controls; one, TAPE One Hot, is directly supported by a reported comparison. Proposed applicability does not assert a published score or an implemented local benchmark. Baseline requirements record the important choices: reference database, split, training-only fitting, sequence context, ion/adduct conventions, perturbation controls or mechanistic constraints. Experimental replicate agreement is a reference, not a universal ceiling.

Model-to-benchmark `applicable_to` links are candidate relationships. Their attributes state this explicitly. Only evaluation/result records establish reported performance.

## Next reviewed acquisition batches

1. Reconcile family aliases across migrated papers and discovery identities; pin checkpoint and dataset revisions without guessing.
2. Extract GENEB's complete task/protocol JSON and matching submission tables; retain contributor versus benchmark-author provenance.
3. Import ProteinGym assay-level tables, retaining DMS assay identity and supervised/zero-shot distinctions.
4. Extract DART-Eval, BEACON, PerturBench and MassSpecGym complete tables with protocol, score coverage and uncertainty.
5. Pin CAMI III corrected manifests and PLINDER release/iteration before importing their evaluation rows.
6. Expand RNA structural challenges, glycan benchmarks, lipid identification validation and mechanistic DREAM tasks.
7. Extend every lane's search to publication indexes, supplements and model registries with saved pagination and screening decisions.

This pass deliberately does not claim publication-index exhaustion, all-model coverage, human review, or model training. Future reviewed releases should report coverage against the screened source inventory and preserve changes to source versions.
