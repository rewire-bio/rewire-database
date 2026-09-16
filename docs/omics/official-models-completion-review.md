# Official model metadata completion review

Reviewed 16 September 2026 using automated source inspection. This pack covers 78 catalogue/discovery model records, excluding the two AlphaFold 3 records owned by the main review. No numerical benchmark results or scientific relationships were changed.

## Deliverables

- `workbench/evidence-completion/official-models/profiles.jsonl`: 78 validated profile replacements.
- `sources.jsonl`: 187 cited artifacts, identified by source URL/revision, retrieval time and SHA-256.
- `audit.jsonl`: field outcomes, source locators, unsuccessful retrievals and remaining limitations for every record.
- Raw evidence, retrieval receipts and reproducible pack-generation scripts stay in the ignored workbench.

The pack passes `profileSchema` and `validateProfileSources` for every profile. Each record contains all 12 required fact labels, a cited introduction, explanatory sections, a procedure/architecture diagram, strengths and limitations. All original IDs remain. Family/checkpoint sharing is editorial only; no result aggregation or equivalence relationship is introduced.

## Coverage and interpretation

| Field status | Count |
|---|---:|
| source_checked | 791 |
| unreported | 86 |
| inapplicable | 55 |
| unavailable | 4 |

28 profiles have all fields source checked or inapplicable. 50 remain explicitly limited because one or more fields lack a reported or retrievable value. An `unreported` field means the **named inspected sources** do not establish that value; it is not a claim that no author or source anywhere reports it. `source_checked` does not mean independently reproduced. No human review is implied.

There are no unfinished `unextracted` field placeholders in this pack. Remaining missing metadata is preserved, not invented:

| Remaining field | Count |
|---|---:|
| Parameters | 19 |
| Context limits | 17 |
| Training cutoff | 27 |
| Weights licence | 23 |
| Code licence | 3 |
| Training data | 1 |

Four unavailable fields remain: Geneformer separate code licence files could not be obtained from the checked paths; RNA-FM context-length primary-paper retrieval failed for its two catalogue entries and the separate mRNA-FM entry. The repository examples and loader alone do not establish a validated context maximum. The older non-coding RNA paper cannot automatically establish an mRNA-FM checkpoint limit.

## Material source corrections and distinctions

- AlphaGenome supplementary methods establish approximately 450M parameters, the encoder/transformer/pairwise/decoder flow and component-specific 2025 ENCODE/2021 contact-data retrieval dates.
- Boltz-2 now cites its complete report: Pairformer, atom diffusion, confidence and separate affinity heads; PDB, distillation, MD and affinity data remain distinct.
- Current Chai-1 repository code/weights terms are Apache-2.0; the original report's launch-era non-commercial distribution is not applied as the current licence.
- scFoundation now cites the complete June 2023 manuscript for its sparse transformer encoder, full-gene Performer decoder and read-depth-aware objective.
- scGPT's early 10M-cell manuscript is separate from the current 33M-cell model-zoo checkpoint. Early architecture settings do not supply an exact current parameter total.
- ESMFold2 supports protein, DNA, RNA and ligand inputs; its protein ESM C features do not imply that nucleic acids use the protein encoder.
- RNA-FM and codon-token mRNA-FM have separate inputs, parameter counts, training corpora and diagrams.
- DNABERT-2-117M weight terms are taken from the pinned checkpoint repository LICENSE, not inferred from its README or the licence of a downstream logistic regression model.
- GlycanGT supplementary Table S2 provides all four exact parameter totals. Its main paper reports 83,739 training glycans versus 83,740 in the README; the discrepancy is retained.
- ESM-IF1's 142M checkpoint name conflicts with the 124M repository table. NT-v2's card describes 1,000-token pretraining while the paper/docs describe 2,048-token capacity. METAGENE config has distinct 512-position and 2,048-sequence fields; its actual released pretraining YAML uses 512.
- Original TAPE paper architectures and current PyTorch defaults differ. Original configurations are described without claiming the current package exactly reproduces them.
- ProteinMPNN and RFdiffusion supplementary methods were inspected; structural training releases and training crop sizes are distinguished from inference limits.
- DreaMS code is MIT, whereas its author-linked embedding/SSL checkpoint archive is CC-BY-4.0. Parameter totals distinguish the complete model from embedding-only backbones.

## Verification boundaries

Claims cite the actually inspected paper sections, model cards, implementation configurations and licence texts. Archive hashes identify original retrieved bytes; Chai-1's browser-only paper passages are explicitly labelled an extracted-text artifact rather than a PDF hash. Failed publisher retrievals remain in receipts even where a later Europe PMC retrieval succeeded.

No training, inference, paid computation, commit, push or release publication was performed by this worker. The main task owns integration, cross-pack conflict checks and publication validation. Missing exact checkpoint totals, latest-data dates and separate checkpoint redistribution grants must remain visible after integration.
