# Paper-reported biological benchmark results

This directory is the source of the `/benchmarks/literature/` explorer. It is deliberately separate from rewire.it's own benchmark runs. `papers.json` identifies the primary paper, its version and review status; `results.csv` stores individual numerical values copied from a named source table. The static build validates the data and exports both files for download.

Each paper needs at least one exact numeric result row. The `source_locator` identifies the table, row and column; `source_url` links to the primary text; `retrieved_utc` and `reviewed_utc` record when the source and value were checked. Keep the printed value and unit unchanged. Add dataset version, split, uncertainty and protocol details when the paper supplies them. State important limits, such as training overlap or a multi-stage scoring pipeline, in `protocol` rather than implying a model produced the score directly.

`evaluation_origin` has three meanings:

- `author_reported`: a paper's result for the method it introduces.
- `independent_paper`: a comparator the paper's authors evaluated under their protocol.
- `paper_compilation`: a value the paper copied from another paper or benchmark table.

`publication_status` distinguishes a peer-reviewed version of record from a preprint. A newer version may change both the status and numbers; re-check the source before updating them. Scores are not comparable merely because they share a metric name. The explorer is an evidence index, not a cross-paper leaderboard.

Run `npm run validate:benchmark-literature` after editing either file. Keep new reviewed batches under `batches/` until their papers, rows and source locators have passed the same audit. Run `python3 scripts/merge-benchmark-literature-batches.py` to merge every audited batch into the two main files, then validate again before building the site. The merge is idempotent and rejects changed values under existing IDs.
