# Second literature batch review

The 26 numeric cells were checked against the named rows and columns of primary paper tables. For 23 articles, the tabular check used the article’s primary full-text XML in Europe PMC. For DART-Eval and ESM2 OFS, the published proceedings/journal PDFs were additionally checked and are the cited version. For the structure-informed pLM, the final Human Genetics article’s Table 4 was checked directly after the Research Square manuscript’s Table 3. Current URLs, publication status, and year refer to the cited version. These are paper-reported observations; unlike protocols and units must not be pooled.

The only selected comparator row whose rerun provenance remains unclear is EDEN’s DNABERT-2 H-CPD MCC. It is marked `paper_compilation`. Other selected rows either report the authors’ own method or are directly described as evaluations in the paper; several papers have additional copied comparator rows in their tables, which are not included here. For example, RLsite Table 1 states that other methods were obtained from previous publications; ESM2 OFS Table I states that CARP, ESM-1v, Progen2 M, RITA L and Tranception values came from ProteinGym. The selected RLsite and ESM2 OFS rows are the authors’ own evaluations.

Publication-version changes verified during audit: DART-Eval is NeurIPS 2024 (Table 3 value 0.876); tokenizer selection is its Bioinformatics 2025 journal version (Table 2 value 0.778); ESM2 OFS is PRX Life 2025 (Table I value 0.403); structure-informed pLM is Human Genetics 2025 (Table 4 value 0.803). PhyloGPN is still linked to the tabulated arXiv version; the same work has a RECOMB 2025 conference record, but the conference version’s Table 1 was not accessible for a direct row check, so this entry stays labelled preprint version.

| Paper ID | Cited source | Table location | Printed value | Stored value |
| --- | --- | --- | --- | --- |
| dart-eval-regulatory-2024 | [source](https://proceedings.neurips.cc/paper_files/paper/2024/file/71998bfc3217ffe1cca1ee084dfadadd-Paper-Datasets_and_Benchmarks_Track.pdf) | Table 3, DNABERT-2 row, Zero-Shot Accuracy column | 0.876 fraction | 0.876 |
| fusion-breakpoint-foundation-models-2026 | [source](https://pmc.ncbi.nlm.nih.gov/articles/PMC13182013/) | Table 2, NT / NN (middle) row, ROC AUC column | 0.994 fraction | 0.994 |
| polya-glm-2025 | [source](https://pmc.ncbi.nlm.nih.gov/articles/PMC12799945/) | Table 1, Few-shot HyenaDNA row, G-G AUC column | 0.7510 fraction | 0.7510 |
| phylogpn-2025 | [source](https://pmc.ncbi.nlm.nih.gov/articles/PMC11908359/) | Table 1, 3-prime UTR row, PhyloGPN AUROC column | 0.94 fraction | 0.94 |
| dnabert2-enhancer-2025 | [source](https://pmc.ncbi.nlm.nih.gov/articles/PMC11981215/) | Table 4, first-layer DNABERT2-Enhancer row, AUC column | 0.965 fraction | 0.965 |
| barcodebert-2026 | [source](https://pmc.ncbi.nlm.nih.gov/articles/PMC13008329/) | Table 1, BarcodeBERT (4–4-4) row, unseen-species genus-level 1-NN Acc (%) column | 78.5 percent | 78.5 |
| genomic-tokenizer-selection-2025 | [source](https://pmc.ncbi.nlm.nih.gov/articles/PMC12453675/) | Table 2, Regulatory row, Caduceus (char) MCC column | 0.778 unitless | 0.778 |
| eden-genomic-classification-2026 | [source](https://pmc.ncbi.nlm.nih.gov/articles/PMC12879454/) | Table 5, DNABERT-2 row, H-CPD (MCC) column | 70.52 percent | 70.52 |
| cobra-rna-binding-2026 | [source](https://pmc.ncbi.nlm.nih.gov/articles/PMC12790621/) | Table 2, ERNIE-RNA / TCL focal row, MCC column | 0.657 unitless | 0.657 |
| ernie-rna-2025 | [source](https://pmc.ncbi.nlm.nih.gov/articles/PMC12627772/) | Table 2, ERNIE-RNA zero-shot row, bpRNA-new F1-Score (binary) column | 0.575 fraction | 0.575 |
| codonbert-vaccines-2024 | [source](https://pmc.ncbi.nlm.nih.gov/articles/PMC11368176/) | Table 2, CodonBERT row, Flu vaccines Spearman correlation column | 0.81 unitless | 0.81 |
| mrna-lm-2025 | [source](https://pmc.ncbi.nlm.nih.gov/articles/PMC11962594/) | Table 1, mRNA-LM row, mRNA half-life Spearman column | 0.696 unitless | 0.696 |
| rnaret-2026 | [source](https://pmc.ncbi.nlm.nih.gov/articles/PMC13111708/) | Table 1, MirTarRAW / 5-mer RNAret row, F1 column | 0.9622 fraction | 0.9622 |
| rlsite-rna-binding-2025 | [source](https://pmc.ncbi.nlm.nih.gov/articles/PMC12417085/) | Table 1, RLsite row, T18 AUC column | 0.828 fraction | 0.828 |
| birna-bert-2025 | [source](https://pmc.ncbi.nlm.nih.gov/articles/PMC12635123/) | Table 2, BiRNA-BERT row, F1 Score column | 0.804 fraction | 0.804 |
| mrnabert-2025 | [source](https://pmc.ncbi.nlm.nih.gov/articles/PMC12644827/) | Table 2, mRNABERT (3066) row, Human R-squared column | 0.669 unitless | 0.669 |
| 2ome-lm-2025 | [source](https://pmc.ncbi.nlm.nih.gov/articles/PMC12342186/) | Table 1, 2OMe-LM row, AUC column | 0.919 fraction | 0.919 |
| cathe2-2025 | [source](https://pmc.ncbi.nlm.nih.gov/articles/PMC12631783/) | Table 3, ProstT5 full row, F1 score column | 82.3 percent | 82.3 |
| clathrin-plm-2025 | [source](https://pmc.ncbi.nlm.nih.gov/articles/PMC12238356/) | Table 2, Independent test / ESM-2 row, ACC column | 0.916 fraction | 0.916 |
| gsmformer-ppi-2026 | [source](https://pmc.ncbi.nlm.nih.gov/articles/PMC12873117/) | Table 6, ProstT5 embedding row, AUROC column | 0.988 fraction | 0.988 |
| antibody-deamidation-plm-2024 | [source](https://pmc.ncbi.nlm.nih.gov/articles/PMC11417914/) | Table 1, Global embeddings only row, Accuracy column | 0.944 fraction | 0.944 |
| spin-protein-function-2026 | [source](https://pmc.ncbi.nlm.nih.gov/articles/PMC12970593/) | Table 1, ESM2-35M Test row, F1_m-w column | 0.796 fraction | 0.796 |
| mulan-2025 | [source](https://pmc.ncbi.nlm.nih.gov/articles/PMC12452268/) | Table 2, MULAN-ESM2 S row, HumanPPI AUC column | 0.717 fraction | 0.717 |
| megsite-2025 | [source](https://pmc.ncbi.nlm.nih.gov/articles/PMC12496013/) | Table 2, DNA-129_Test / ESM3 row, AUC column | 0.948 fraction | 0.948 |
| esm2-ofs-fitness-2025 | [source](https://journals.aps.org/prxlife/pdf/10.1103/zhx7-hcmm) | Table I, ESM2: OFS PP row, Aggregate Mean Spearman correlation column | 0.403 unitless | 0.403 |
| structure-informed-plm-2025 | [source](https://pmc.ncbi.nlm.nih.gov/articles/PMC12068927/) | Table 4, AA+SS+RSA+CM row, AUROC column | 0.803 fraction | 0.803 |
