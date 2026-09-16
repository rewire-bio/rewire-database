# Catalogue evidence review, 16 September 2026

This release expands all 226 model and 170 benchmark/task profiles. Review was automated primary-source inspection, not human expert sign-off or independent experimental reproduction. The requested completeness means that every expected field has an explicit evidence state; values absent from the inspected sources are not invented.

Prepared immutable release: `2026-09-16-e13bae63c156`; 1,669 public records.

## Coverage

| Field evidence state | Facts |
|---|---:|
| source_checked | 3496 |
| unreported | 645 |
| unavailable | 0 |
| unextracted | 0 |
| inapplicable | 250 |

There are 440 additional pinned source artifacts. Every profile has a cited summary, structured facts, explanatory content and documented limitations. Diagrams are provided when the mechanism or procedure is established; ambiguous aggregate model identities do not receive invented architecture diagrams. 96 profiles resolve all required fields within their cited scope; 300 retain documented evidence limitations. Review coverage does not change the record's numerical evidence status.

`unreported` means the named inspected sources do not establish the exact field. It does not mean every possible source was searched. `unavailable` records a retrieval limitation. `unextracted` identifies work still needed and must never be relabelled merely to improve a completion count. Protocol-wide fields are inapplicable only when they genuinely do not apply at that entity level.

## AlphaFold 3 and AlphaFold Server

Both profiles now explain inputs, outputs, the Pairformer and atom-coordinate diffusion pipeline, confidence outputs, training evidence, access, context limits and separate code/weights/service terms. Supplementary architecture and training tables were inspected alongside the paper, pinned implementation and current server documentation.

The server is a hosted service using the model, not a second model family. The official FAQ says the released model and server use the same weights and equivalent model code, with possible MSA differences from search sharding. This is an attributed statement, not an independently checked weight digest. Server restrictions and the local implementation's compilation bucket are not presented as a universal architecture limit.

Two primary-source inconsistencies stay visible: the paper's PoseBusters training-cutoff statements disagree, and the current repository's direct weight-download instructions differ from the FAQ's application-form instructions. A parameter total not established by inspected sources remains unreported.

## Scientific and interface corrections

- Exact evaluated configurations retain their own profiles even when a family profile exists. Family membership does not overwrite configuration-specific methods, licences or results.
- Model versions, quoted comparisons, trained downstream heads and hosted services remain distinct. No new family membership is inferred from matching names.
- Original discovery missingness is preserved under `historical_missing_metadata`; current field evidence comes from `profile.facts`. This prevents stale “not extracted” labels contradicting newly checked facts while preserving the original record history.
- Profile structure is validated by the same contract in static releases and API imports. Historical releases may omit the newly optional summary citations and fact statuses.
- The TCINet source does contain a metagenomic experiment. Its sample identities, split manifests and reference-label construction remain unresolved; an unrelated text/image cross-validation procedure is not assigned to it. Its printed result remains visible with a precise concern and cannot enter an automatic comparison.
- A follow-up retrieved the complete RNA-FM v5 paper and resolved its original training/input limits. The separate mRNA-FM checkpoint limit remains unreported. Geneformer records the official repository’s Apache-2.0 declaration while noting the absence of a separate code-licence file at the inspected revision.
- A separate spot review corrected CAMI Figure 4 to standard deviations (Figure 3 uses standard errors), clarified BEND’s mature-protein identity split, and pinned the inspected ATOM3D paper to arXiv v4.
- Conventional software and broad task guides describe algorithms or evaluation objectives without forcing them into a neural architecture or a single concrete protocol.

## Numerical integrity

All 167 pre-existing published result records are preserved without value, identity or evidence-origin changes. The numerical receipt distinguishes mechanical replay from semantic review:

- 140 source artifact and selected-value presence checks reuse existing reviewed table transcriptions; they are not new row/column semantic verification.
- 12 TAPE rows were matched to their exact pinned table entries.
- 12 MFASS rows were reconciled to existing pinned run artifacts and coverage counts, without new model execution.
- Two DART-Eval/OFS rows were checked in the actual PDF tables and one SI-pLM row in its source table.

The result receipt documents these different review scopes. Source-checked metadata does not upgrade author-reported experiments to independently reproduced evidence.

## Reproducibility and preservation

The authoritative inputs are the reviewed profile JSONL files, source records, reviewed associations and narrowly scoped metadata corrections in Git. `data/omics/reviews/2026-09-16-profile-review.jsonl` pins all 396 final profiles to SHA-256 digests and the cited source artifacts. Raw papers and research workspaces remain ignored; no licensed source corpus or private submission data is published.

The original `2026-09-16-b5213be10a49` release is reconstructed byte-for-byte from its preserved inputs. The previously live `2026-09-16-d74d282221a9` release is restored from a checked bundle and immutable receipt. The new `2026-09-16-e13bae63c156` release also has its own checked archive bundle. Existing downloads, MFASS history and legacy literature identifiers remain available. This change introduces no paid infrastructure, model execution or public submission activation.

## Validation

Local validation passed: 61 website tests; 34 service tests against Firebase emulators; lint; both TypeScript builds; the production export and all 1,669 record routes; historical release checksums; API/Hosting integration; HTTP routing; and ten desktop/mobile page checks with no browser errors or horizontal overflow. Keyboard-accessible diagram alternatives were checked. CI repeats the service tests before the complete API integration check. The correction PR records CI and production deployment results.

The detailed research boundaries are recorded in the official-model, reported-model and benchmark review documents in this directory. Later targeted passes supersede their earlier field counts; the table above and immutable profile receipts describe this release's final coverage.
