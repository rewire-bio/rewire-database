# Reported configuration profile review

Reviewed 16 September 2026. Method: automated primary-source review, with repository and supplement inspection. This is not human review or independent reproduction.

## Coverage

The staging pack covers every assigned record: **142 paper-specific configurations and four Rewire pipelines**, 146 records in total. It contains **152 additional source records** and 1,606 structured facts:

| Status | Facts | Meaning |
|---|---:|---|
| Source checked | 1,124 | The stated claim is supported within its cited source/version scope. |
| Unreported | 430 | The inspected evidence does not establish that exact field, or contains an explicit conflict/ambiguous identity. |
| Inapplicable | 52 | For example, a pretrained neural parameter count for a reference-index algorithm. |

No assigned ID is omitted. No numerical result was changed. Unknown exact checkpoints, combined pipeline parameter counts, licensing scope and context limits were not invented to fill a table. A family’s current default is not evidence of a historical comparator’s identity.

The input inventory covers 97 paper sources and the Rewire run evidence. The review used complete primary-text artifacts, including 94 XML sources and the separately retrieved DART-Eval, OFS and structure-informed pLM documents. Additional original-method and supplemental evidence includes iPro70-FMWin’s author-hosted full paper and BPfold Supplementary Table 6. Follow-up searches found maintained implementations for Cell-DINO, DeepInterAware, GREmLN, Cell2Sentence, CATHe2, MolAS, Boltz and the structure-informed pLM. Repository receipt files retain both successful retrievals and failures.

## Publication-ready staging files

- `workbench/evidence-completion/reported-models/profiles.jsonl`: stable record ID and typed profile.
- `workbench/evidence-completion/reported-models/sources.jsonl`: pinned new source records.
- `workbench/evidence-completion/reported-models/audit.jsonl`: source checks, field statuses, exact gaps and retrieval/search attempts for each assigned ID.
- `workbench/evidence-completion/reported-models/field-evidence-scan.jsonl`: field-level source search and evidence candidates; candidate matches are not themselves assertions of support.
- `workbench/evidence-completion/reported-models/validation.json`: coverage and integrity summary.

`notes.py` contains manually composed paper-specific explanations. `build.py` assembles the typed pack and evidence links. Raw source artifacts and retrieval receipts remain in the ignored workspace. Do not publish raw licensed source documents with the generated release.

## Material corrections and boundaries

- BarcodeBERT retains its four-layer, four-head, 4-mer configuration and 660-base sequence setting. Its 78.5% reported result is unchanged.
- Frozen DNABERT-2 plus logistic regression remains a pipeline, not a result for an unadapted encoder. Rewire source inspection is pinned to `bee9133b83f3aedaf2bbb9013f1875515845607e`.
- Vaxign-DL’s added ESM features come from **ESM-1b**, not ESM-2.
- The ENBED context is 16,384 tokens; the 512-token paragraph describes a dense-attention baseline.
- BPfold’s 7,962,416-parameter count was checked in its actual Supplementary Table 6, rather than inferred from architecture.
- MolAS reports approximately 638,000 selector parameters. Pretrained feature extractors are separate components.
- PlantCAD2 has an unresolved parameter conflict: 676M in Abstract/Methods versus 694M for the large configuration in Results. BiRNA-BERT also reports differing parameter totals. These conflicts remain visible.
- EDEN’s DNABERT-2 comparison is quoted evidence, not an additional independent evaluation.
- The TCINet/HTRS paper does contain a genomic experiment in Section 4.3. Its exact samples, splits and label construction remain unresolved; the text/image experiment’s five-fold split is not reassigned to genomic rows. The root review tracks this as a source concern.
- The Cell-DINO README calls its code licence CC BY-NC, but its linked code licence is headed Creative Commons Attribution 4.0 International. This is recorded as a conflict requiring clarification. The model materials use the FAIR Noncommercial Research License. DINOv2’s root Apache licence is not inherited.
- DeepInterAware’s maintained repository declares CC BY-NC 4.0 and documents its February 2026 migration. A generic absent-code statement was replaced with this source.
- SpliceAI code and model weights have different terms. Rewire runner MIT terms do not override upstream model terms. DNABERT-2’s exact 117M checkpoint repository licence is separately cited; Pangolin’s weight-specific grant remains unresolved.
- TOPBP (Complex) remains an unresolved table identity. It receives no invented architecture diagram. Aggregate best-model labels are not converted into a single checkpoint.

## Remaining evidence limitations

The 430 unreported facts mostly concern immutable historical configuration identity, licences for exact fitted artifacts, aggregate pipeline parameter totals and an explicit maximum context for the evaluated configuration. Each absence claim is bounded by the inspected source scope; it does not claim that every possible external source was searched or that authors cannot supply additional details.

Some original methods have no established public checkpoint in the inspected record, including original AK-score and the fitted Vaxign-DL plus ESM extension. AK-Score2 was found during discovery but is a different method and was not substituted. Broad access links and current repositories do not prove that the authors’ historical checkpoint is recoverable.

Source checked describes the transcription and explanatory metadata review. It never upgrades an author-reported result into independently reproduced evidence, resolves an ambiguous model family automatically, or establishes that a model has never been evaluated elsewhere.

## Validation

- All 146 assigned IDs covered exactly once.
- Typed `profileSchema` validation and `validateProfileSources` passed for every profile.
- All referenced source IDs resolve against the current catalogue plus the pack.
- SHA-256 checks replayed successfully for 173 retrieved repository artifacts.
- A prose pass corrected missing spaces and removed unrelated publisher/funding/acknowledgement locators from generated evidence pointers.
- Original result records, release files and historical run artifacts were not edited by this worker.

Application integration, full production build and deployment belong to the root task and are not claimed by this report.
