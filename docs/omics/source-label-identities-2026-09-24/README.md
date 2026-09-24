# Source-label identities (issue #58)

Some benchmark tables name a compared method only by a citation, such as `[Karimi et al., 2019]`, or by an author surname, such as `Ciga`. The catalogue copied those labels into the name of the tested configuration, so result rows did not say which method produced a score.

This batch gives nine such configurations a readable name taken from the benchmark text and the cited original sources. The printed label is kept in `attributes.source_label`, remains searchable, and is shown beside the name in result tables and on detail pages.

## Names

| Record | Printed label | Display name |
|---|---|---|
| `atom3d-method-zt-rk-et-al-2018` | `[Öztürk et al., 2018]` | DeepDTA (ATOM3D baseline) |
| `atom3d-method-karimi-et-al-2019` | `[Karimi et al., 2019]` | DeepAffinity (unified RNN/RNN-CNN; DSSP-derived SPS) |
| `atom3d-method-rao-et-al-2019` | `[Rao et al., 2019]` | TAPE Transformer (ATOM3D baseline) |
| `atom3d-method-liu-et-al-2019` | `[Liu et al., 2019]` | N-Gram Graph XGB (ATOM3D baseline) |
| `atom3d-method-tsubaki-et-al-2019` | `[Tsubaki et al., 2019]` | Molecular GNN, SMILES implementation (ATOM3D baseline) |
| `atom3d-method-sanchez-garcia-et-al-2018` | `[Sanchez-Garcia et al., 2018]` | BIPSPI, sequence-only (ATOM3D baseline) |
| `atom3d-method-pag-s-et-al-2019` | `[Pagès et al., 2019]` | ProQ3D (CAD-trained; rotameric optimization), reported by Pagès et al. |
| `atom3d-method-watkins-et-al-2020` | `[Watkins et al., 2020]` | Rosetta scoring function (RSR configuration unresolved) |
| `hest-method-ciga` | `Ciga` | SimCLR histology encoder + random forest (HEST; Ciga et al.) |

Each entry in `data/omics/reviewed/source-label-identities-2026-09-24/identities.json` records the basis, page-level locators, source-supported configuration details and the details that remain unknown. Examples of unknowns: DeepAffinity's attention variant and LBA split, the ProQ3D checkpoint, the specific Rosetta score function and the Watkins/Alford citation conflict, and the HEST Ciga backbone and training recipe, which the HEST paper states inconsistently. No checkpoint is inferred for any entry.

The Pagès identity rests on ATOM3D's attribution to Pagès et al. together with a match on all six PSR statistics to the single ProQ3D row of Pagès et al. Table 2. The TAPE identity rests on the ATOM3D text; the matching RES value only corroborates it.

DeepDTA and DeepAffinity get method-level model records (`identity-model-deepdta`, `identity-model-deepaffinity`) with sourced profiles covering the original methods only. The ATOM3D configurations link to them, and to the existing TAPE Transformer record, by reviewed `family` links. Scores stay with the configurations.

## How it is applied

`scripts/omics/source-label-identities.ts` runs as the last release step. For each reviewed entry it:

- requires the configuration's whole-record SHA-256 to match, its name to equal the printed label, and the label to match its declared form (bracketed citation or single author surname);
- renames the configuration and replaces the label, as a whole word, in the names and evaluation descriptions of the linked evaluations and results;
- keeps IDs, links, values, locators, denominators and comparison conditions unchanged;
- adds `family` links and their claims through `applyModelEvaluationLinks`.

Nothing is renamed by pattern alone. Snapshot validation (`services/omics/src/source-identity.ts`) requires each renamed evaluation to test the identity subject through its model link, and each renamed result to reach that subject through its evaluation. Self-references and unrelated subjects are rejected.

Catalogue, browse and chart-row searches use one helper that includes the printed label.

## Audit

`npx tsx scripts/omics/audit/source-label-names.ts <catalogue.json>` screens 2,642 tested-entity names with seven citation patterns and reports two surname shorthands found by the independent semantic audit. On release `2026-09-23-5fd75097e2dd` it finds 14 candidates: 9 renamed here, 4 AgroNT names retained because they already give the method type ("CNN (Jores et al.)"), and `discovery-model-tape-bepler` deferred. That last one is a model-level record with an existing profile; the reviewer's permitted name is recorded in `audit.json`. VCC, CAPRI, CAFA, CASP and RhoFold participant labels are not bibliography identities.

## Review status

The review is AI-assisted: an implementation review and a separate source review, both included in the batch. No human scientific review and no reproduction of any score were performed. All inputs and artifacts are hash-sealed in `review.json`.

## Release

Release `2026-09-24-eb3fb1cb4c7f` has 26,085 public records. Against `2026-09-23-5fd75097e2dd`, it renames 9 configurations, 30 evaluations and 30 results, and adds 12 sources, 2 models and 3 identity claims. All 11,291 earlier result records keep their original scientific payloads: every original attribute, link, source and status is unchanged. The 30 renamed results also gain `source_label` and `source_identity` display-identity attributes, so those result objects are not byte-identical to the earlier release. See [archive verification](archive-verification.json). Historical archives are unchanged.
