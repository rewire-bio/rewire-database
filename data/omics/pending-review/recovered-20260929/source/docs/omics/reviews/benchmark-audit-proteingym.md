# ProteinGym v1.3 overall Spearman extraction

Review date: 17 September 2026. Review method: AI-assisted source inspection, independent arithmetic reaggregation and a separate emitted-record source-cell check. No human review or model reproduction is implied.

## Publication boundary

This batch extracts **all 97 model rows of the overall `Average_Spearman` column** from the official pinned zero-shot DMS substitution summary. It does not claim extraction of the full multi-column table, other ProteinGym tracks, or all later updates. Function, MSA-depth, taxon and mutation-depth columns remain deferred. The original 2023 paper’s stability-category results (`lit-017` and `lit-018`) remain distinct and unchanged.

The six primary artifacts are pinned to revision `144fe22b07dfaeec2b366f2346203a9838a55b4c`. Their download hashes and retrieval times are recorded on the emitted source records.

| Artifact | SHA-256 | Primary source |
|---|---|---|
| ProteinGym v1.3 zero-shot substitutions: official overall Spearman summary | `ee61a7c09efbfbd8d9a6c9355092c798032a578fa58c6f6256b5da8778555fd4` | [Pinned file](https://raw.githubusercontent.com/OATML-Markslab/ProteinGym/144fe22b07dfaeec2b366f2346203a9838a55b4c/benchmarks/DMS_zero_shot/substitutions/Spearman/Summary_performance_DMS_substitutions_Spearman.csv) |
| ProteinGym v1.3 zero-shot substitutions: official assay Spearman matrix | `f432423b87f79ac9778dfac86e3d95be041d246bc618dc0a406b35b0b7466437` | [Pinned file](https://raw.githubusercontent.com/OATML-Markslab/ProteinGym/144fe22b07dfaeec2b366f2346203a9838a55b4c/benchmarks/DMS_zero_shot/substitutions/Spearman/DMS_substitutions_Spearman_DMS_level.csv) |
| ProteinGym pinned substitution assay reference | `a8f498011532a74aa9fe556a50555a75e928c5837d19c06a87592ae04049b308` | [Pinned file](https://raw.githubusercontent.com/OATML-Markslab/ProteinGym/144fe22b07dfaeec2b366f2346203a9838a55b4c/reference_files/DMS_substitutions.csv) |
| ProteinGym pinned DMS evaluation and aggregation implementation | `0002bc1b031c02dc2d67fde53da092c8fd301415645e8e83b425b4183570eba2` | [Pinned file](https://raw.githubusercontent.com/OATML-Markslab/ProteinGym/144fe22b07dfaeec2b366f2346203a9838a55b4c/proteingym/performance_DMS_benchmarks.py) |
| ProteinGym pinned benchmark documentation | `321487a8de52c6cfa647a658f61150dd72e0acb0125470524fb94d1f8b23321a` | [Pinned file](https://raw.githubusercontent.com/OATML-Markslab/ProteinGym/144fe22b07dfaeec2b366f2346203a9838a55b4c/README.md) |
| ProteinGym pinned model score configuration | `7cd239d1e4c8b474f6ce2bd6574423b53ab48204f852f219e09a36f25d513608` | [Pinned file](https://raw.githubusercontent.com/OATML-Markslab/ProteinGym/144fe22b07dfaeec2b366f2346203a9838a55b4c/config.json) |

## Numerical review

- All 97 printed overall values are preserved verbatim. The emitted JSONL was checked again against the CSV’s `Model_name` and `Average_Spearman` cells, including weaker methods.
- The reference has 217 assays, 186 distinct UniProt IDs and 2,465,767 variants. These are dataset/reference counts, not independently verified per-model variant scoring coverage.
- All 97 overall means independently reproduce by averaging the published three-decimal assay correlations within UniProt ID and selection type, averaging proteins within each category, then taking an equal mean across the five categories and rounding to three decimals. No model was run.
- The published `Bootstrap_standard_error_Spearman` values are preserved as separate statistical notes. The implementation bootstraps differences against its top model, AIDO Protein-RAG (16B), over protein-by-selection-type rows within categories. This is **not an absolute-score confidence interval** and is not passed to chart error bars. Bootstrap randomness was not reproduced.

## Coverage and comparison decisions

- Protriever has 17 blank assay correlations: its printed overall value is **0.479**, based on 200 available assay metrics. Its exact missing assay IDs and distinct dataset subset are retained. The source does not report why these cells are blank.
- Five source comparison panels separate reported input modalities and include only models with 217 available assay correlations: 45 single-sequence, 22 single-sequence/structure, 19 MSA, six structure/MSA and three structure configurations. That gives 95 chart rows.
- Protriever remains in the results table rather than being compared against the 217-assay population. ESM3 open (1.4B) also remains in the table because it is the only member of its reported sequence/structure/function-annotation input class.
- Input classes are source-reported broad categories, not proof of identical information or compute. Checkpoints, pretraining overlap and inference budgets remain unextracted. The automatic strict compatibility gate must continue to expose missing fields.
- Each reported method name gets an evaluated-configuration record. No family membership or checkpoint equivalence is guessed from names. Sources verify the table identity, not all model metadata.
- Results attach to the existing exact v1.3 protocol. A source-backed membership claim supports its existing link to the ProteinGym suite. Protocol comparison panels can be inherited by the suite through that reviewed path.

## Reproducibility and integrity checks

The ignored research workspace retains acquisitions, exact source bytes, extraction code, arithmetic receipts and independent read-back checks:

```sh
python3 workbench/benchmark-page-audit/research/build_proteingym_batch.py
python3 workbench/benchmark-page-audit/research/check_proteingym_cells.py
./node_modules/.bin/tsx workbench/benchmark-page-audit/research/validate_proteingym_batch.ts
```

The first command stages the two reviewed JSONL inputs. The second verifies all source cells and chart exclusions. The third validates the additions and overlays against the previously published release without mutating it. These local research scripts are not published; the released source records retain sufficient URLs, versions, hashes and cell locators for fresh verification.

| Reviewed input | SHA-256 |
|---|---|
| `benchmark-audit-proteingym.jsonl` | `33b5d9770c7a91084c4876fab173fbb4112bdfb1cc86a1e8cde04e1ad520d508` |
| `benchmark-audit-proteingym-overlays.jsonl` | `773f4d4f4115ae4b66a5eaa1a0fccc57c69013ea001e58b9062024c051312552` |

Batch counts: six sources, one dataset, one dataset subset, one membership claim, 97 evaluated configurations, 97 evaluations and 97 results. Five comparison panels are added by an overlay. Existing records and release bytes are not edited.
