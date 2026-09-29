# Genomics benchmark table extraction

Reviewed 17 September 2026. This batch transcribes three primary comparison tables into exact paper-specific configurations, protocols, datasets, evaluations and results. It does not run models or establish independent reproduction by rewire. Existing scientific records and scores are unchanged.

## Coverage

| Source table | Complete scope | Stored cells | Public cells | Public comparison panels |
| --- | --- | ---: | ---: | ---: |
| BEND ICLR 2024, Table 3 p.8 | All 16 rows across seven task columns, including unavailable entries | 112 | 96 | 6 |
| GUE / DNABERT-2, Table 6 p.14 | All ten configurations across 28 dataset columns | 280 | 280 | 28 |
| Genomic Benchmarks, Table 2 (Tab2) | All nine datasets, both CNN implementations, Accuracy and F1 | 36 | 36 | 18 |
| Total | | 428 | 412 | 52 |

The batch contains 44 protocols, 44 datasets, 45 evaluated configurations, 410 evaluations, 428 result cells and 44 reviewed suite-membership claims. Genomic Benchmarks Accuracy and F1 share the same evaluation rather than counting as two runs. Seven BEND cells retain the printed dash and a null numeric value; six of those are public after the quarantine described below.

## Primary sources and pinned bytes

- [BEND conference paper](https://proceedings.iclr.cc/paper_files/paper/2024/file/429e7b31625a8b7839f9e4d6e2aa9bb9-Paper-Conference.pdf), source `evidence-expansion-bend-final-f709b6be`, SHA-256 `f709b6bef3120eb979c0a0e02d2582475c49410f29850ed7601ba7a700ca379d`.
- [DNABERT-2/GUE primary paper](https://arxiv.org/pdf/2306.15006), source `evidence-expansion-gue-49300ace`, SHA-256 `49300acee3e4afd44bebc3de9893c3bc310d331bd4805374e0952fdfbf366f06`. This snapshot identifies itself as the ICLR 2024 paper; the artifact hash pins its contents rather than relying on the mutable latest PDF URL.
- [Genomic Benchmarks primary full text](https://www.ebi.ac.uk/europepmc/webservices/rest/PMC10150520/fullTextXML), DOI `10.1186/s12863-023-01123-8`, source `expansion-p3-genomic-benchmarks`, SHA-256 `bda6fe51e3363a5d2fc8d265ca536897d3e83eb76458fc95066c21933e3bd0c0`.

All three artifacts were retrieved afresh; their hashes exactly match the existing source records. Existing source IDs are reused rather than creating duplicate evidence identities. Each result records the precise row, column, source occurrence and original printed value. Every protocol-to-suite relationship has an individual source-backed claim; no broad biological task membership is inferred.

## Scientific boundaries

### BEND

Sections 3–4, Appendix A.1 and A.7 define different tasks, splits and adaptation procedures. Supervised tasks use frozen embeddings with a small trained CNN; variant effects use reference/alternate embeddings without that fitted classifier. One-hot trained baselines and specialist comparisons retain their different procedures. AUGUSTUS and Enformer were evaluated by the BEND authors; DeepSEA expression performance was recomputed from the original study's cross-validated predictions, and disease performance used the online Beluga model. These are not relabelled as copied numeric rows or new rewire runs.

**Quarantine:** all 16 histone-column cells are `needs_review` and excluded from the public release and comparison panels. Table 3 prints DNABERT 0.79, NT-MS 0.78 and Basset 0.74; the Results narrative on the same page instead states 0.74 for DNABERT/NT-MS and 0.72 for Basset. This batch preserves the table as evidence without resolving the conflict by guesswork. Other task columns are not globally invalidated by this local discrepancy.

The Table 3 cells do not provide uniform uncertainty or per-model scored counts. Dataset population cannot establish prediction coverage. No uncertainty, checkpoint revision or split-manifest hash is inferred.

### GUE

Table 6 covers the 28 short-sequence GUE datasets. GUE+ Table 5, preliminary Table 8, cross-task means and other appendix comparisons are separate scopes and are not merged into these panels. MCC is retained on the printed coefficient-times-100 scale, not called accuracy; the COVID task uses F1. All ten rows are included, including weaker baselines.

Section 5 specifies the mean test score across three seeds and validation-loss checkpoint selection every 200 steps. Appendix A.3 distinguishes full DNABERT fine-tuning from NT LoRA (r=8, alpha=16, dropout=0.05). The diamond DNABERT-2 row additionally pretrains on GUE training sets and remains a distinct configuration. Appendix B.2 gives the 8:1:1 random yeast split. Numeric TF dataset labels are retained exactly; this extraction does not infer which accession maps to each index. Per-cell uncertainty and per-model prediction coverage remain explicitly missing.

### Genomic Benchmarks

Table 2 compares PyTorch and TensorFlow implementations of the paper's simple CNN, not two foundation-model families. The Training models section specifies three convolutional layers (16/8/4 filters, kernel size 8), pooling/batch normalization, dense classification, ten epochs and batch size 64. Train/test version hashes, test denominators, repeated-seed uncertainty and the F1 averaging definition are not established by Table 2. Table 1 total dataset sizes are not substituted for scored test counts.

## Verification and integration

Review method: automated deterministic extraction, separate persisted-cell-to-source readback, and visual inspection of the complete PDF tables and headers. This is not human review or experimental reproduction. A second parser checked all 428 persisted cells against the pinned source rows and columns; all passed. The repository's `validateRecords`, `publicRecords`, `validateSnapshot` and catalogue queries passed on the merged snapshot, including chart resolution. Suite queries expose 96 BEND, 280 GUE and 36 Genomic Benchmarks result rows. No original IDs or printed values were overwritten.

Input files:

- `data/omics/reviewed/benchmark-audit-genomics.jsonl`: additive records only.
- `data/omics/reviewed/benchmark-audit-genomics-overlays.jsonl`: `{id, source_ids, attributes}` with appended panels and current research status for the three suites. Existing links and associations are not replaced.

The ignored workspace `workbench/benchmark-page-audit/genomics/` holds exact retrieved PDFs/XML, rendered table images, the deterministic builder, cell receipts, separate checker and validation receipts. All source provenance and row locators needed for publication are also in the tracked records; no private contributor data are present.

Output checksums:

- `data/omics/reviewed/benchmark-audit-genomics.jsonl`: `7fd620ce563f7aad4fde5d266eebde5df54311564a4a8f68875a3b5227ca624f`
- `data/omics/reviewed/benchmark-audit-genomics-overlays.jsonl`: `f719ae80b64d71c0001b99ab0019292ae1a9b49b6e1354eac8bd365c40cc21c6`
