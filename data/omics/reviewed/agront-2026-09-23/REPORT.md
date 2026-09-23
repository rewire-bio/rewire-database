# AgroNT numerical evidence — 2026-09-23

**Ready for a bounded first ingestion: all 24 rows of the official Figure 3e and 3f source tables, including 12 AgroNT scores and all 12 CNN comparators.** No graph digitization, metric recomputation, inferred score, benchmark execution, tracked edit or publication was performed.

Primary author dataset: [Plant Genomic Benchmark](https://huggingface.co/datasets/InstaDeepAI/plant-genomic-benchmark), immutable revision `78ec8156c2ffb3e5475277fdb7eb603294224e53`. Its README identifies `Figures/` as the source data for the paper's figures. The linked primary paper is [Mendoza-Revilla et al., Communications Biology 7, 835 (2024)](https://www.nature.com/articles/s42003-024-06465-2), DOI `10.1038/s42003-024-06465-2`.

## Complete recommended tables

These are **R², higher is better**, exactly as printed. Each row below pairs two original source rows; the machine receipt preserves each source row separately.

| Task / panel | Assay model label | Sequence species or class | AgroNT | CNN comparator |
| --- | --- | --- | ---: | ---: |
| Promoter / 3e | Maize model | A. thaliana | 0.62 | 0.58 |
| Promoter / 3e | Maize model | S. bicolor | 0.68 | 0.65 |
| Promoter / 3e | Maize model | Z. mays | 0.71 | 0.69 |
| Promoter / 3e | Tobacco model | A. thaliana | 0.62 | 0.57 |
| Promoter / 3e | Tobacco model | S. bicolor | 0.74 | 0.71 |
| Promoter / 3e | Tobacco model | Z. mays | 0.75 | 0.73 |
| Terminator / 3f | Maize model | A. thaliana | 0.69 | 0.68 |
| Terminator / 3f | Maize model | GC | 0.68 | 0.64 |
| Terminator / 3f | Maize model | Z. mays | 0.65 | 0.67 |
| Terminator / 3f | Tobacco model | A. thaliana | 0.77 | 0.77 |
| Terminator / 3f | Tobacco model | GC | 0.67 | 0.65 |
| Terminator / 3f | Tobacco model | Z. mays | 0.76 | 0.76 |

Sources: [complete Figure 3e TSV](https://huggingface.co/datasets/InstaDeepAI/plant-genomic-benchmark/resolve/78ec8156c2ffb3e5475277fdb7eb603294224e53/Figures/Fig3_panele.txt), [complete Figure 3f TSV](https://huggingface.co/datasets/InstaDeepAI/plant-genomic-benchmark/resolve/78ec8156c2ffb3e5475277fdb7eb603294224e53/Figures/Fig3_panelf.txt). Both contain one header plus 12 rows, lines 2–13; metric column `R2`. Within each file, AgroNT occupies lines 2–7 and the baseline lines 8–13 in corresponding order. Baseline names are exactly `CNN (Jores et al.)` for promoters and `CNN (Gorjifard et al.)` for terminators. Preserve them as separate task-specific methods.

## Protocol interpretation and boundaries

Paper XML `Sec21` (“Promoter and terminator strength prediction”) supports 170 bp inputs and use of the original studies' train/test datasets for direct comparison. “Maize model” refers to the maize-protoplast assay and “Tobacco model” to the tobacco-leaf assay; these are not the sequence species. Promoters span −165 to +5 relative to TSS; terminators span −150 to +20 relative to cleavage/polyadenylation sites. Figure 3 caption identifies `GC` as randomized sequences with varying GC content, **not a species**.

`Sec16` describes IA3 parameter-efficient fine-tuning, approximately 1% parameter updates. The paper describes task-specific regression heads. Exact fitted checkpoint hashes, task-specific seed lists, confidence intervals and run-level hyperparameters are not supplied by these two tables; do not infer them from today's pretrained model card. The scores are source-reported evaluations, not independent reproductions.

Comparison panels should remain within task × assay system × sequence class. Do not combine the 12 conditions into a synthetic aggregate, pool R² across tasks, substitute plot-wide Figure 3c/3d scores, or attach these scores to the generic Nucleotide Transformer model.

## Model identity

The official name is **Agronomic Nucleotide Transformer (AgroNT)**, with implementation identifier `1B_agro_nt` and HF repository `InstaDeepAI/agro-nucleotide-transformer-1b`. It is distinct from the general Nucleotide Transformer family that shares the GitHub repository. No distinct `AgrobNT` identity was established in the official sources inspected; do not create an alias from that spelling without evidence.

Identity-only sources retained and hashed:

- [Official AgroNT documentation](https://github.com/instadeepai/nucleotide-transformer/blob/2dc37b86e16a6970fbc731751f7719d9f676f7f9/docs/agro_nucleotide_transformer.md), Git revision `2dc37b86e16a6970fbc731751f7719d9f676f7f9`.
- [Official model card](https://huggingface.co/InstaDeepAI/agro-nucleotide-transformer-1b/blob/b0e1ea1f53a2bf5bb29f8eab7a7e553bf06c1ab1/README.md), revision `b0e1ea1f53a2bf5bb29f8eab7a7e553bf06c1ab1`.

These modern repository revisions pin retrieved documentation, not the unspecified fitted checkpoints used for the 2024 results. The author dataset declares CC-BY-NC-SA-4.0; preserve that provenance metadata. The publisher article declares CC-BY-4.0.

## Excluded source anomaly and honest remaining gaps

The official `Figures/Fig4_panelb.txt` contains 190 AUROC rows: 95 targets × AgroNT/DeepSEA. **All 15 AgroNT MH63 target scores repeat exactly for corresponding ZS97 targets**, despite distinct rice reference-genome labels. This is an observable duplication, not a proven source error. No scores were corrected, averaged or reassigned. Exclude this table from the first ingestion pending source review; exact pairs are in `excluded-fig4-source-anomaly.json`.

The figure repository also contains gene-expression input-context comparisons (Figure 6b/6c) and zero-shot variant-enrichment tables with named comparator scores (Figure 7c). They need separate protocol review and are not part of this first 24-row batch. Figure 7a has multiline unquoted category labels that are unsafe for a naive TSV row parser. Other figure files contain observation-level predictions/curves; deriving metrics from them would be a new calculation, not direct extraction of a reported aggregate. This batch therefore covers two tasks, not all eight tasks described by the author benchmark.

## Preserved receipts

`rows.json` retains all 24 exact source rows, printed values, field identities, pinned URLs, revisions and hashes. `records.jsonl` contains 100 additive catalogue records. `review.json` binds those records and the checked input files to an automated review.

`Fig3_panele.txt` and `Fig3_panelf.txt` preserve complete primary tables. `paper-method-locators.json` provides section locators; `article.xml.gz` preserves the publisher XML snapshot (uncompressed SHA256 `bcc1ad6d01ce59853d4e81c9d097427d2115c392ee51cf41d06bd4434cf1d378`). The XML endpoint supplies no immutable revision.

`excluded-fig4-source-anomaly.json` documents the excluded Figure 4 table. Independent automated source and graph review, including a 24-cell audit table, is stored under `docs/audits/2026-09-23-agront/`.

The release loader verifies both primary TSV hashes, every source row and the review receipt before accepting these additions. Source checking is not experimental reproduction or human sign-off.
