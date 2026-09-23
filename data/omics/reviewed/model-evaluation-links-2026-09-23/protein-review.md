# Protein/structure evaluation coverage audit

Reviewed 2026-09-23 against the 22,074-record public catalogue. No tracked files, scientific values or release artifacts changed.

**54 proposed associations: 35 `family`, 19 `uses_model`.** The principal problem is missing associations, not absent scores. Proposals are in `proposed-edges.json`; each has subject ID, relation, target ID, existing source ID, source locator and justification. `edge-impact.json` adds subject kind and existing result-cell count. Add source-backed relationship claims as well as links; an unsupported graph edge must not enable result roll-up.

## Family coverage recoverable from existing cells

The counts below count catalogue result records behind proposed family links. They are not pooled metrics, independent experiment counts, or an assertion that overlapping paper-summary and detailed-table records are independent evidence. Do not sum them into a leaderboard score.

| Family target | Existing cells behind proposed family edges | Primary evidence |
|---|---:|---|
| Boltz (generic family; Boltz-1 configurations) | 23 | Stereochemistry study Table 1 and explicit restraint-guidance methods; Boltz-1 report Section 5; antibody-flexibility study |
| Boltz-2 | 1 | Mpro pose/affinity study, Methods “Deep Learning-Based Modeling with Boltz-2” |
| Chai-1 | 3 | LiPP Methods Chai-1 v0.2.0; Ibex comparison; antibody-flexibility no-MSA/template configuration |
| DiffDock-L | 1 | LiPP Methods explicitly DiffDock-L v1.1.3 |
| AlphaFold 3 | 5 | Stereochemistry study explicitly defines AF3; Table 1 and default-parameter methods |
| ESM-1v | 5 | ProteinGym zero-shot ensemble row, Table 2 |
| ESM-2 | 66 | PFMBench; ProteinGym; FLIP2 ESM2-650M likelihood; viral-immune-mimicry fine-tuning |
| ESM-IF1 | 15 | ProteinBench Table 2; ProteinGym Table 2 |
| ESM3 | 58 | ProteinBench Tables 2, 4, 5; PFMBench |
| ESMC | 44 | PFMBench ESM-C 600M; FLIP2 pretrained ESMC-300M supervised |
| ESMFold | 14 | ProteinBench Table 7, CAMEO2022 |
| OpenFold | 14 | ProteinBench Table 7, CAMEO2022 |
| ProteinMPNN | 18 | ProteinBench Table 2; ProteinGym Table 2 and paper-specific summary record |
| RFdiffusion | 20 | ProteinBench Table 3, separate chain-length/metric rows |

ESM-2 already has family links from three Rewire local configurations; it should not be described as universally unevaluated. This audit identifies additional orphaned published cells. Preserve local and author-reported origin distinctions.

AF3 is an important abbreviation match: `acquired-configuration-359fd4eb92fb3f85c4a5` is supported by the paper’s explicit AlphaFold3/AF3 expansion, not a loose name inference. Boltz R/Rc/R1 are explicitly described by their authors as Boltz-1 restraint-guided inference configurations; retain those settings, and do not attach them to Boltz-2.

## Component use is not family performance

The 19 `uses_model` proposals retain composition for FLIP frozen ESM-1v embeddings plus pooling/prediction heads, ProteinGym supervised OHE/embedding estimators, ESM2 OFS, antibody deamidation, CLAPE-SMB, ESM2_AMP variants, MULAN, FUJISAN cosine-similarity scoring, PST task classifiers, PLM-CLA, PRIME and MegSite.

Some are currently typed `configuration` despite the primary methods describing a downstream estimator around frozen model outputs. `uses_model` is the conservative provenance relationship; do not promote those metrics to unqualified ESM family performance. Existing `pipeline` subjects receive only `uses_model` in this proposal. Downstream presentation may show “used in evaluated pipelines” separately from direct family configurations.

## Genuine gaps and next primary extractions

**ESMFold2:** No matching evaluated configuration or pipeline was found. ProteinBench’s 2024 ESMFold row cannot fill a newer ESMFold2 record. The official pinned model card (`biohub/ESMFold2`, revision `69869f737beffec5294845ede23db5fc0b4f509e`) identifies distinct ESMFold2 and ESMFold2-Fast configurations, optional MSA conditioning for the former, and FoldBench / Runs N’ Poses evaluation. Its primary paper is https://www.biorxiv.org/content/10.64898/2026.06.03.729735. Extract original reported tables/source data with complete baselines, MSA setting, complex class and inference-budget boundaries. The card embeds performance images but does not supply an already-reviewed numerical table here; no image digitization or scores were inferred. Exact paper table numbers remain unverified.

**Genie 3:** No evaluated Genie 3 configuration was found. The pinned author README (`aqlaboratory/genie3`, revision `d77ae5ac04212ff1e8b29b585859a3244c614804`) points to https://www.biorxiv.org/content/10.64898/2026.05.01.722168v1 and identifies unconditional generation, motif scaffolding and binder design. Its Evaluation results sections document per-design `info.csv`, success subsets and clustering outputs. Inspect the original paper’s aggregate tables and released evaluation artifacts; per-design CSVs are not permission to silently recompute aggregate metrics. Paper access returned 403 in this audit, so exact table IDs and numerical values remain unverified.

These are bounded catalogue gaps, not claims that the models have no published evaluations.

Additional extraction can improve sparse coverage without using wrong identities: the already retrieved Boltz-1 report Section 5 explicitly compares AlphaFold3 and Chai-1; LiPP and the antibody-flexibility study also contain AlphaFold3 comparisons. Review complete original tables before adding missing cells. ProteinBench tables already contain extensive data for seven requested families, so repairing associations comes before re-extracting those same scores.

## Rejected or deferred matches

- **Genie ≠ Genie 3 ≠ GENIE3.** ProteinBench’s `proteinbench-method-genie` is the earlier protein backbone-design method; do not attach it to the 2026 Genie 3 family. The three acquired `GENIE3` configurations belong to gene-regulatory-network inference/BEELINE, not protein design.
- **AlphaFold2 ≠ AlphaFold3.** The existing ProteinBench AlphaFold2 cells do not support AlphaFold 3 coverage.
- **DiffDock ≠ DiffDock-L without explicit version evidence.** Generic DiffDock, DiffDock holo and DiffDock-NMDN candidates were not assigned to DiffDock-L. Their sources may establish a DiffDock component, but the requested target is the specific L release.
- **ESM-1b and ESM-untrained are not ESM-1v/ESM-2.** The original FLIP Table 3 distinguishes them. Do not exploit shared repository names.
- **FLIP2 “ESMC-300M naive supervised” is a random-initialized control.** Section 4.3 explicitly distinguishes pretrained from randomly initialized weights. Do not count these 31 cells as pretrained ESMC performance. Retain the comparator and its architecture-control identity.
- **Leaderboard submission strings are insufficient.** VCC names containing ESM2, ESMC or “Sidechain” remain unlinked until original submission code/configuration metadata establishes the component. A string match is not scientific evidence.
- **RESM is not an ESM model based on its substring.** No proposal for `nabench-method-resm`.
- **Vaxign ESM identity remains deferred.** Generic “ESM Only” or “Vaxign-DL + ESM” does not establish ESM-1v versus ESM-2 from the scoped reviewed sources.
- **SPIN + ESM2-35M:** the newly fetched paper explicitly supports component use, but its XML bytes differ from the catalogue’s artifact hash. No edge is proposed using that old source receipt. First retain and review the changed source snapshot or retrieve the original bytes; do not present a hash mismatch as a verified old receipt.

## Duplicate IDs and aliases

All duplicate model IDs remain intact. No speculative `alias_of` edges are proposed. The candidate records contain meaningful qualifiers:

- `catalog-model-esm-2`: version `8M`, versus the broad `discovery-model-esm-2` family.
- `catalog-model-proteinmpnn`: version `v_48_020`, versus the broad discovered family.
- `catalog-model-esmfold`: version `v1`, versus the broader discovered identity.
- `catalog-model-boltz-2`: a distinct generation within Boltz, not an alias of every Boltz version.

They already carry `variant_of` links in the catalogue. Verify the associated relationship claims and exact qualifier semantics; do not replace these with aliases merely to make scores appear. Broad-family evidence from 650M/15B ESM-2 or another ProteinMPNN checkpoint must not flow into a specific 8M/v_48_020 record. Exact-size/checkpoint configuration links can be reviewed separately against the relevant source/configuration receipts.

## Receipts and limits

- `catalogue-receipt.json`: audited release, record count, SHA256 and relation counts.
- `source-receipts.json`: 27 independently fetched original artifacts, URLs, timestamps, hashes and comparisons to catalogue receipts. 25 matched immediately.
- ESMFold2’s existing `artifact_url` points at a dynamic Hugging Face `/blob/` HTML page. Re-fetching the pinned `/resolve/` README produced **exactly the stored SHA256** `7f20294b352b7e490689229c0fe26760115e3ffc66869d96dd89347729fe941d`. See `additional-source-receipts.json`; this is a route/representation issue, not altered pinned README bytes.
- SPIN remains the one unresolved changed artifact. No proposed edge relies on it.
- All proposed source IDs resolve in the catalogue; all proposed subjects/targets exist; no numerical values were added or changed. This is relationship review, not revalidation of every historical result cell, experimental reproduction, or release approval.
