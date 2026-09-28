# Use-case expansion review, 28 September 2026

The initial collection answered two questions. This expansion adds five distinct
research decisions using evidence already published in catalogue release
`2026-09-25-8af07e960e5f`. It adds no scientific records, measurements, benchmark
runs or clinical validation. All 26,124 baseline records, both original questions
and their three mapping fingerprints are retained.

## Selection and user needs

| Research decision | Evidence retained | Boundary that matters |
| --- | --- | --- |
| Establish controls before modelling UTR translation | Two complete local mRNABench Sample designed controls; one protocol | Reporter mean ribosome load, train-only fitting and a fixed test split; no pretrained-model comparison or therapeutic claim |
| Select methods for plant promoter reporter experiments | AgroNT and the Jores CNN in all six assay-host × sequence-species conditions | Reporter host differs from sequence origin; held-out R² is not prospective design success or pretraining exclusion |
| Select models and controls for genetic perturbation experiments | All four GEARS Table 6 configurations, in two metric protocols | Norman2019 K562 context; expression agreement is not experimental yield, causal mechanism or cross-cell-type transfer |
| Assess rhodopsin wavelength prediction across sequence backgrounds | Five exact Rhomax probes and controls in one protocol | One held-out-background split; exploratory checkpoint follow-up, not calibrated wavelength or a general ESM-2 claim |
| Shortlist molecular identities from tandem mass spectra | Six formula-free configurations at Recall@1 and Recall@20 in each of two splits | The true structure must be present in the 256-candidate mass-filtered pool; retrieval is not confirmed identification |

Together with the original pages, the release has seven questions, 17 mappings
and 57 evaluation references. Metric and split groups can share configurations
and experimental provenance; these counts are not independent studies or
replications. Each mapping retains its complete selected comparison group,
including weak and constant controls. Numerical values remain in the original
result records and are resolved by ID.

## Source checks and review

Codex performed separate curation and cross-review passes. These are automated
source reviews, not independent human scientific review. Each pass checked the
question, assay endpoint, exact configuration and protocol identities, source
locators, comparator completeness, population and transfer limitations. The
review method and gaps are visible on every page. Human scientific review
remains tracked in [#31](https://github.com/rewire-bio/rewire-database/issues/31).

- UTR: the pinned [run instructions](https://github.com/rewire-bio/rewire-benchmarks/blob/ca73fa47136d182f2d4ddb083d084712198fc0e2/research/local-runs-2026-09-20/README.md)
  and both execution reports were freshly retrieved and matched their recorded
  SHA-256 hashes. The [mRNABench primary text](https://pmc.ncbi.nlm.nih.gov/articles/PMC12265608/)
  was inspected from its hash-matched archived XML. Upstream probing and the
  local training-only control protocol are explicitly distinguished.
- Plant promoters: the pinned [Figure 3e table](https://huggingface.co/datasets/InstaDeepAI/plant-genomic-benchmark/tree/78ec8156c2ffb3e5475277fdb7eb603294224e53/Figures)
  was freshly retrieved and hash-matched. The [primary methods](https://www.nature.com/articles/s42003-024-06465-2)
  were checked against the archived XML, including pretraining, fine-tuning and
  promoter-assay sections. Fresh EuropePMC XML retrieval timed out or returned
  503; that did not replace the pinned reviewed bytes.
- GEARS: the [publisher supplement](https://static-content.springer.com/esm/art%3A10.1038%2Fs41587-023-01905-6/MediaObjects/41587_2023_1905_MOESM1_ESM.pdf)
  and [pinned official README](https://github.com/snap-stanford/GEARS/blob/f374e43e197b295016d80395d7a54ddb81cc6769/README.md)
  were freshly retrieved and hash-matched. Table 6, Table 1 and Notes 5 and 14
  bound the endpoint and cell context. The precise Table 6 gene subset and
  printed spread type remain unestablished.
- Rhomax: the five reports and [pinned procedure](https://github.com/rewire-bio/rewire-benchmarks/blob/1663d1f04b2bbd6dfcff77fea78129d30b0de191/research/baseline-programme-2026-09-21/README.md)
  matched the recorded bytes through authenticated curation retrieval and a
  separate public retrieval check. Constant-control correlation remains
  undefined; full-ranking NDCG is not interpreted as top-k precision.
- Molecular retrieval: [MSAlign v1](https://arxiv.org/html/2605.19752v1), Sections
  4–5 and Table 3, was checked against the archived PDF and public versioned
  text. The pinned PDF hash is
  `7395a55141ee7916741b7d9e6d4f42a1d3a03217a36ce6824ac3ff48afd4f26f`.
  The formula-group split does not supply formula to a model. The MCES split
  uses structure clusters with minimum distance greater than 10.

The review corrected a copied formula-split description in the two draft MCES
mappings, added the plant pretraining limitation and made the GEARS K562 context
explicit. No scientific score or record classification was changed. Final
curation bytes and evidence fingerprints are bound by
`data/omics/use-cases/review.json`; builds validate rather than refresh them.

## Candidates deferred

- SegmentNT enhancer localisation has promising evidence, but 84 evaluations
  across different input lengths and adaptation regimes need a clearer grouped
  comparison. Selecting only leading configurations would bias the page.
- Receptor–ligand cofolding needs a separate focused applicability review.
  It is not implied to be unsuitable by its absence here.
- scFoundation and broader single-cell, genomic and molecular benchmark suites
  retain provenance or exact protocol/configuration gaps. AlphaGenome evidence
  marked `needs_review` cannot support an active mapping. A generic task,
  method, pipeline or model-family record is not an exact tested configuration.

## Compatibility and release gates

Some existing evaluations use legacy `benchmark` and `model` relationship names
while already targeting reviewed protocol and configuration records. The shared
resolver now recognises only those exact target kinds. It preserves status,
source-concern, dataset, result and direct relationship checks, and includes the
same dependencies in stale-evidence detection. An independent code review
verified that all three original fingerprints remain unchanged. Incomplete
GEARS family relationships still withhold family backlinks; configuration and
protocol navigation remains available.

The old ten-submission backlog is complete, as recorded by
[#32](https://github.com/rewire-bio/rewire-database/issues/32#issuecomment-5785898237).
This work reuses published records; it does not accept a new submission or
bypass the applicability review. Publication still requires repository checks,
immutable archive verification and website/API agreement under a new release.
