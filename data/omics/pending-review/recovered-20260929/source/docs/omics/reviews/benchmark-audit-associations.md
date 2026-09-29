# Benchmark association and MFASS chart review

Review date: 2026-09-17. Method: automated primary-source and pinned-artifact review; no human review or new benchmark execution is claimed.

## Scope and inventory

The audit ran the production `createCatalogueQuery` implementation, exhaustively paginated results, and inspected `published_comparisons` for all 264 active benchmark/task/protocol/evaluator records in release `2026-09-17-b9bc163c8ab1`. The catalogue SHA-256 was `beee4871a021371d5945f8ac5e703ab4557372b3fc50ba600a885d992ec219cf`.

| Entity | Records | With results | With a reviewed chart |
| --- | ---: | ---: | ---: |
| Benchmark | 30 | 3 | 3 |
| Task | 134 | 112 | 27 |
| Protocol | 96 | 91 | 90 |
| Evaluator | 4 | 0 | 0 |

These are pre-correction counts. No broken target IDs or existing unclaimed `part_of`/`evaluates_task` edges explained the empty pages. Some paper-scoped tasks had results but lacked reviewed suite membership. Most empty suites still need result extraction. Shared dataset names and sources are discovery clues, not evidence of protocol equivalence.

The ignored research workspace `workbench/benchmark-page-audit/graph/` contains `audit.json` (every record, direct and descendant counts, exact results, panels, sources, claims), `counts.csv`, `corrections.json`, source downloads, generation and verification scripts, and the MFASS receipt manifest. These audit intermediates are not publication inputs.

## Reviewed changes

The new records in `data/omics/reviewed/benchmark-audit-associations.jsonl` contain source receipts and field-scoped claims. `benchmark-audit-association-overlays.jsonl` appends links/source IDs and patches only named attributes. No historical release, result identity, score, printed value, status or metric is changed.

| Source task | New parent | Evidence | Existing result rows made reachable |
| --- | --- | --- | ---: |
| `reported-task-cdbee1c9285568` | `discovery-benchmark-dart-eval` | DART-Eval §3, §4.1, Table 3; Appendices D.2–D.3/E.1 | 1 |
| `reported-task-57dc3dcdb67a81` | `discovery-benchmark-mrnabench` | mRNABench task definitions, Appendix B MRL-MPRA, Appendix C and Tables 5–6 | 2 |
| `reported-task-6243658a1bc215` | `discovery-benchmark-proteingym` | ProteinGym 2023 Table A7 / XML T11, Stability column and caption | 2 |

All are `part_of` relationships, supported by separate source-checked claims. These claims verify suite membership only. They do not upgrade incomplete protocol metadata or relabel the original ProteinGym paper as version 1.3. The ProteinGym task remains a stability subgroup; it is not an all-assay aggregate.

Primary sources were retrieved again and their byte hashes match the original receipts:

| Source ID | Artifact | SHA-256 |
| --- | --- | --- |
| `dart-eval-regulatory-2024` | [NeurIPS proceedings PDF](https://proceedings.neurips.cc/paper_files/paper/2024/file/71998bfc3217ffe1cca1ee084dfadadd-Paper-Datasets_and_Benchmarks_Track.pdf) | `e5aee5b1f7cc6fd961b1d2a131d02cf243b79e091d5e418fbabee7fde9b39b22` |
| `mrnabench-2025` | [PMC12265608 XML](https://www.ebi.ac.uk/europepmc/webservices/rest/PMC12265608/fullTextXML) | `79f6264ee883535203c63a313547e7c57baa85585f76b42f8d899eb17fb7e600` |
| `proteingym-2023` | [PMC10723403 XML](https://www.ebi.ac.uk/europepmc/webservices/rest/PMC10723403/fullTextXML) | `4519641f13271bdd09b166e7d93232f22542489bc52a25b5a1628c3df8badce1` |

## MFASS compatibility and original metrics

Three panels compare the corrected feature baseline with frozen DNABERT-2 plus its fitted logistic head: AUROC, average precision and precision at 100. The original result JSON scores are retained. The review loaded every prediction ID from both pinned TSVs, rejected duplicates, and checked exact equality against the canonical split's test IDs. Both have the same 8,324 IDs, matching group IDs and labels, 315 positives and 463 groups. Their split hashes also match the original JSON metadata. Equal row counts alone were not accepted as evidence of compatibility.

The methods have different features: the baseline includes exon distances and conservation, while DNABERT-2 uses reference/mutant sequence embeddings. The panels explicitly disclose this difference. They do not establish a claim about all foundation models or all splice-variant methods.

Pangolin scores 8,301 variants; SpliceAI scores 8,194. Their marginal values cannot join these same-sample panels. Their existing rows remain visible in result tables. Pairwise inference belongs to the archived comparisons on shared scored subsets; those values must not replace marginal values silently.

The twelve MFASS rows receive precise metric locators. The correct JSON keys are `$.metrics.auroc`, `$.metrics.average_precision_sklearn`, and `$.metrics.precision_at_capacity` with capacity 100. The latter two previously pointed to the catalogue's normalized metric names rather than actual JSON keys. Byte-specific sources are added without replacing the historical source.

The baseline AP's stored decimal is within one floating-point rounding unit of its pinned JSON value; the existing value is preserved. The paired DNABERT-2 comparison uses rounded TSV scores, giving a roughly 0.000000198 AUROC difference from full-precision result JSON. Panels use original result JSON and do not attach the TSV-derived intervals as if they came from identical floating-point predictions.

Pinned runner revision: `bee9133b83f3aedaf2bbb9013f1875515845607e`. Receipts below refer to `benchmarks/mfass/` paths at that exact revision, read as Git object bytes:

| Artifact | SHA-256 |
| --- | --- |
| `results/baseline-kmer-position-v2.json` | `9a0b78674cc714177fec6e8c487588d6186d4fe93d6d7dbcb48bed6858885e15` |
| `results/dnabert2-117m-frozen-pair-logreg.json` | `60b28541853de349f878d6d1ccbcbe7dfd21b69db976e9c01f60e88bdba0f2a1` |
| `results/pangolin-maskFalse.json` | `bb0bb6732808699e54938233df1835dfc1f775f33ba7d6acd916e53d588a3c44` |
| `results/spliceai-1.3.1.json` | `6d5c59eb0fd60d95064d97e331c9cdb12b2a34db7dc509ff73dfb9502ddf02dd` |
| `splits/split-v2.tsv` | `999ebcb7e63a5c5eaa8780fa468e59ac1f934260ad50102814174c396317f052` |
| `results/baseline-kmer-position-v2.predictions.tsv` | `2f3117c225a8da9ea737abfa2d0f7e1dec97696ae4bacd263864bec9d7f923eb` |
| `results/dnabert2-117m-frozen-pair-logreg.predictions.tsv` | `3abded2932366e6e2c8d6e0da5836c4240239372758b3c68cd5f19635b8cee11` |
| `results/compare-baseline-v2-vs-dnabert2.json` | `52216e003f4e5332ecb43511864c9f0b3df7b1ed0f731c631412dc7311f505c3` |

## Preserved gaps and rejected shortcuts

- MFASS v1 is superseded and remains an archival identity; corrected v2 scores do not populate it.
- Three AlphaGenome protocols have unresolved source conflicts; their quarantine is retained.
- BEACON background citations do not turn BPfold RNA-structure rows into BEACON evaluations.
- CAMI training data or custom read subsamples do not establish CAMI challenge equivalence.
- A custom PLINDER/PDBbind subset does not establish an official PLINDER protocol or a PoseBusters evaluator run.
- The ProteinGym 1.3 runner protocol receives no synthetic run or smoke result from this association batch.
- Other proposed broad-task navigation edges remain recommendations in the audit, awaiting their own scoped association review.

## Validation

An isolated in-memory application of this batch to the current release passes the actual query and published-comparison resolver. DART-Eval gains one result row, mRNABench two, and historical ProteinGym two. MFASS retains all twelve rows and gains exactly three valid panels. Every appended source and link target resolves; original numeric values, printed values, metrics and units are byte-for-byte unchanged as JSON values. No archive is rewritten.

Commands used from the database repository:

```bash
python3 workbench/benchmark-page-audit/graph/build-corrections.py
./node_modules/.bin/tsx workbench/benchmark-page-audit/graph/verify-corrections.ts
```

The release loader integration, full repository checks and immutable release generation are performed separately by the parent implementation. Source verification here is not a claim that models were rerun.
