# Literature batch 3 review

This batch contains **26 new primary papers and 51 numerical rows**: nine papers on cells and tissues, nine on microbes and communities, and eight on molecular interactions. Five are labelled preprints. It is separate from the 24-paper launch batch and has no duplicate paper ID or DOI with that batch.

Each result is a number printed in a table of the linked primary full text. The `source_locator` identifies the table, row, and metric column; `value` retains the printed scale, with units and uncertainty in their own fields. Primary full text was read from the [PMC article pages](https://pmc.ncbi.nlm.nih.gov/) and independently checked against [Europe PMC full-text XML](https://www.ebi.ac.uk/europepmc/webservices/rest/). Retrieval and row-review timestamps are recorded in the files. No values were estimated from plots or imported from secondary reviews.

The batch files pass schema, paper/result-reference, source-URL, numeric-value, domain-balance, and duplicate-ID/DOI checks. A separate audit found **all 51 values in their cited source tables** across 26 primary XML documents. The coordinates and surrounding table headers were manually inspected before extraction.

Interpretation limits to retain in the UI:

- `deelig-2021` includes TOPBP's previously published PDBbind result as `paper_compilation`. Its protocol is not assumed equivalent to DEELIG's.
- `antibody-flexibility-2025` reports AUC for an interaction classifier using predicted folded complexes. It is not a direct folding-accuracy or DockQ measurement.
- `single-cell-aging-probes-2026` names the best foundation model in the paper text, while Table 2 prints only “best scFM”; the row preserves that table wording.
- `molas-2026` compares an algorithm selector with a single-best-solver baseline under a joint RMSD/physical-validity criterion, not two standalone docking models.
- `ncd-metagenomics-2026` has distinct superkingdom and phylum tasks on the same reads. These values must not be ranked against one another.
- `scxdr-2026` uses the paper's “Scenario 2” transfer setting; the dataset/split details should not be filled in by inference.

Do not pool or rank scores across different papers, splits, metrics, or extraction protocols. Follow the source link and locator before reusing a row in a comparison.
