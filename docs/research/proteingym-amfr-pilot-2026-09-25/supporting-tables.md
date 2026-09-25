# Supporting tables for the AMFR matched pilot

These tables support the [protocol](README.md). Source identifiers refer to rows of [sources.csv](sources.csv). Planning is complete and passed automated scientific-design and source-feasibility review on 25 September 2026. Execution is not authorised; every gate below remains open until the owner decides.

## 1. Hypotheses considered

Criteria: **value** (does it help answer whether a protein language model adds value beyond an evolutionary baseline, and where), **feasibility** (existing code, available inputs, local CPU), and **outcome independence** (can the choice be made without using scores already seen). No hypothesis was chosen or dropped because of an observed or expected score.

| ID | Hypothesis | Value | Feasibility | Outcome independence | Decision |
|---|---|---|---|---|---|
| H1 | M1 and M2 rank single-substitution stability differently | Direct test of the question against the conventional task-specific control | M1 ready; M2 needs a model (G3) | The checked prior artifacts (R01 to R03) contain no singles-only metric, but the mixed-cohort M1 and null results are known, so selection is exploratory; the population is fixed from model coverage, not scores | Primary |
| H2 | The full Potts model ranks singles differently from the site-independent model refitted from the same fit (M3 vs M2) | Shows whether the full evolutionary model is the stronger comparator for M1 | Needs G3 and a new adapter (G4) | Same population as H1 | Secondary S1, with S2 (M1 vs M3). Fields and couplings both differ, so no attribution to couplings or epistasis |
| H3 | Differences concentrate at particular positions or substitutions | The "which variants" part of the question | Computed from H1 outputs | Fixed display rule; every position shown | Descriptive D4 |
| H4 | ESM-2 adds information conditional on the evolutionary score | The strongest form of "adds value" | Needs label-fitted combination with cross-fitting over positions; about 41 positions give few, unstable folds; changes the track from zero-shot to supervised | Could be pre-specified, but not within this pilot | Not tested; no incremental-information claim |
| H5 | On double mutants, the full Potts model and the site-independent refit rank stability differently | Descriptive comparison of whole models on the only multi-site variants in the assay | Doubles cover 7 deliberately chosen site pairs that share sites | Pairs were selected by the source study, not at random | Descriptive D3 only; no attribution to couplings or epistasis |
| H6 | Larger ESM-2 checkpoints rank better | Scaling within one family; does not address the evolutionary comparison | Only the 8M scalar adapter exists; the 35M adapter produces embeddings for FLIP2, not masked marginals | Would add a model choice after the 8M result was seen | Not tested |
| H7 | Differences depend on conservation or alignment depth | Biologically plausible | One assay has one alignment depth; per-position bins would need thresholds chosen now without a basis | High risk of bins that follow the outcome | Not tested |

## 2. Evidence, measurements and gaps

### Existing evidence

| Item | What exists | Source | Limits |
|---|---|---|---|
| M1 on all AMFR variants | Spearman -0.209, AUC 0.394, MCC -0.139, NDCG 0.440, top-10% recall 0.057 on 2,972 variants; predictions SHA256 `7ab0c890…0bbca` | R01, R02 | Mixed singles and doubles; no interval; viewed before this protocol |
| N0 on all AMFR variants | Spearman 0.008 and four other metrics, seed 0 | R03 | One fixed ranking; viewed |
| M1 checkpoint | `esm2_t6_8M_UR50D.pt`, 30,099,493 bytes, SHA256 `46f002a9…b928`; the local copy was rehashed on 25 September and matches | R04 | Pinned by rewirebench, fetched from the official host |
| M1 runtime behaviour | SDK batches of 32 records; one masked sequence per forward pass; log-probabilities cached per (sequence, position) for the adapter's lifetime | R25 | Explains why the 0.1878 s timer covers about 47 forward passes |
| M2 implementation | Adapter at rewire-benchmarks `d4531f5` (tree identical to reviewed head `0e9c60e`); parity with pinned upstream on synthetic models on macOS arm64 and two Linux x86_64 runners | R05, R06 | No real model reviewed or scored |
| Reference row | AMFR: 47 residues, 820 singles, 2,152 multiples, `MSA_start` 1, `MSA_num_cov` 41, `MSA_N_eff` 1,245.9, `selection_type` cDNA display proteolysis | R07 | Reference file hash is our observation of the pinned GitHub revision |
| Assay CSV | Observed SHA256 `dd911d92…04c2a`; mutant column shows 47 single positions and 7 double site pairs | R08 | Download hash, not publisher-authenticated; label columns not read for this protocol |
| Alignment | `AMFR_HUMAN_2023-08-07_b04.a2m`, 17,787 sequences, SHA256 `23fe63b7…ba04c`; query row `AMFR_HUMAN/1-47`, lowercase at positions 1 to 5 and 47 | R09 | Retrieved by byte range from the official archive; the ZIP CRC-32 matched, but there is no published checksum |
| Sequence weights | `AMFR_HUMAN_theta0.2_2023-08-07_b04.npy`, 17,781 float64 values summing to 1,245.9 | R10 | Six fewer entries than alignment sequences (gap S6); not used |
| Upstream scorer | Pinned `score_mutants.py` computes `prediction_epistatic` from the full model and `prediction_independent` from `to_independent_model()` on the same file | R11, R12 | `predict_mutation_table` does not catch errors, so an uncovered mutant stops the whole assay |
| plmc behaviour | Focus-column removal applies only with the built-in protein alphabet; rows with out-of-alphabet characters are discarded and counted in stderr; single-site frequencies are weighted alignment counts computed before optimisation; L-BFGS termination is printed to stderr and the parameter file is written regardless; the header stores the requested iteration limit; parameters are written as 32-bit floats | R17, R30 to R33 | Read from source at the pinned commit; not executed |
| EVCouplings plmc call | Passes `-f` with the region suffix removed, `-g`, `-m`, `-t` as 1 − theta, `-lh`, `-le` scaled by (q − 1)(L − 1) with q reduced by one when gaps are ignored; passes `-a` only if an alphabet is configured | R16, R29, R34 | Read from source at the pinned commit |

### Missing measurements

| Measurement | Needed for | Produced at |
|---|---|---|
| Any M2 or M3 prediction on AMFR | H1, H2 | Real-model parity and scoring, after G5 and G6 |
| Any singles-only metric for any method | All analyses | Scoring; deliberately not computed now |
| Actual model index list and P1 size | Coverage, adequacy | G5 |
| plmc fit termination status (Route B) | M3 fit label | G3 |
| Cold load and warm scoring time for every method, and each process's peak memory | Resource comparison | Scoring, under G1 logging |
| plmc build and fit time and memory (Route B) | Preparation cost | G3, under G1 logging |
| EVCouplings artifact preparation time and field-optimizer states on a real model | Preparation cost and acceptance | G3 |
| Uncertainty for any AMFR comparison | Primary analysis | Evaluation |

### Source gaps

| ID | Gap | Effect | Handling |
|---|---|---|---|
| S1 | No AMFR plmc_v2 model found in the ProteinGym README, the v1.3 alignment archive directory or the original EVmutation downloads | M2 and M3 cannot run | Gate G3, Route A or B; not proof that no model exists |
| S2 | ProteinGym's historical EVmutation settings and model files are not published in the checked sources | A Route B model cannot claim to reproduce ProteinGym's rows | Route B identity is a Rewire fit |
| S3 | How ProteinGym's published MSA-based scores handle positions outside focus columns is not stated in the paper or pinned scripts we checked | Published rows are not comparable to a coverage-limited P1 | Published scores are not used |
| S4 | No ESM-2 (UR50/D 2021_04) membership list was checked | Pretraining overlap is unknown | Declared as unknown; may overlap |
| S5 | Assay CSV and alignment hashes are our observations, not publisher checksums | Authenticity rests on retrieval from the official host | Status carried in every receipt |
| S6 | Weights file has 17,781 entries for 17,787 alignment sequences | Weights cannot be mapped to sequences without the ProteinGym preprocessing rule | Not used; Route B lets plmc compute its own weights and records its valid-sequence count |
| S7 | The Tsuboyama Zenodo record (CC BY 4.0) asks users to register their use | Courtesy request, not an access condition | Recorded for the human decision owner; nothing submitted |
| S8 | The pinned plmc `make all-mac` target passes the x86 flag `-msse4.2`; building it on Apple arm64 is untested | Route B build may need a flag change | Only permitted change is removing that flag, recorded with the binary SHA256 |
| S9 | A Route A model may lack the actual training alignment, a source-authored configuration or a record linking them to the model file | Route A blocked | These three are required at G3; historical fit-termination logs are desirable and may be unknown; a different alignment needs a reviewed spec amendment before any prediction |

## 3. Gates and stop conditions

Order: G0, G1, G2, G3, G4, G5, G6, then R1 real-model parity, R2 scoring, R3 evaluation. G4 can be developed in parallel with G3 because it uses synthetic fixtures only. No AMFR prediction of any kind happens before G5 and G6.

| Step | Acceptance | Stop or refusal |
|---|---|---|
| G0 | Tim Richardson records approval of this spec (by its SHA256) and of Route A or B | No approval: no execution |
| G1 | Logging harness in place before any later step: section wall and CPU time inside the harness, whole-process wall, CPU and peak memory from `/usr/bin/time -l`, threads, batch sizes, cache policy, versions and bytes written | Missing logging: stop |
| G2 | Reference `a8f49801…b308`, assay CSV `dd911d92…04c2a`, checkpoint `46f002a9…b928` and alignment `23fe63b7…ba04c` all match; retrieval and hashing measured under G1 | Any mismatch: stop; do not adopt the new hash without review |
| G3 | Route B: plmc built (binary SHA256 recorded), fitted with the fixed command, `plmc.stderr` kept and hashed, termination accepted under the fit rule. Route A: actual training alignment supplied and hashed (a different alignment needs a reviewed spec amendment first), source-authored configuration, and a source record linking both to the model file. Either route: query and index audit; consistency review of header, coordinates and stored statistics; provenance review receipt with every required item established; `prepare-baseline-artifact` passes (format and precision, finite values, `model_id` AMFR_HUMAN, `msa_start` 1, index positions match the wild type, field-optimizer states accepted); model, alignment, configuration and prepared-artifact SHA256 frozen in the spec | Rejected fit status, any required provenance item missing, or preparer failure: stop. No refit, automatic route switch, other assay or ad hoc score |
| G4 | Adapter `proteingym-evmutation-epistatic-v1` in rewire-benchmarks reads the same plmc_v2 file; uncovered variants unscored with reasons, as in M2; same-runtime parity with unmodified pinned upstream `prediction_epistatic` within 1e-6 on synthetic fixtures; reviewed and merged; commit recorded | Parity failure or unreviewed code: stop |
| G5 | P1 and P2 computed from the artifact's index list and alphabet plus mutant strings; sorted ID lists and their SHA256 written | Fewer than 30 positions or 300 variants: continue, but no intervals; primary not classified |
| G6 | Analysis script implements this spec; tested on synthetic data with planted differences, ties, constant methods, duplicated positions and same-sign d; SHA256 recorded | Untested script: stop |
| R1 | Unmodified pinned upstream and the M2 and M3 adapters agree within 1e-6 on every frozen P1 and P2 variant | Any disagreement: stop |
| R2 | All four methods score every frozen ID; P0 unscored reasons kept | Any frozen ID unscored, or a ceiling exceeded: stop |
| R3 | Metrics recomputed from saved predictions agree within an absolute tolerance of 1e-12; frozen analysis run unchanged | Post-hoc design change: record as deviation and label the result |

## 4. Resources

| Item | Value | Kind |
|---|---|---|
| Host | Mac16,10, Apple M4, 10 logical CPUs (4 performance, 6 efficiency), 16 GiB | Observed 25 September 2026 |
| Accelerator | None used; CPU only for determinism | Decision |
| Free disk | Internal about 1.4 GiB; external SSD about 1.6 TiB | Observed 25 September 2026 |
| M1 inference, all 2,972 AMFR variants | 0.1878 s SDK timer; one thread; SDK batch 32, model forward batch 1, 47 cached positions; rewirebench 0.4.0; excludes loading, preparation and metrics | Measured 20 September 2026 (R01) |
| Peak memory and cold load, all methods | Not recorded; to be measured, with memory reported per process (for example load plus scoring), not per section | Gap |
| SDK prediction batch size | 32 for all four methods; M1 model forward batch 1, kept separate | Decision |
| Warm scoring, all methods | Five repeats after loading; M1 cache emptied before each with forward-pass count; M2 and N0 have no per-call cache; M3 policy recorded from its adapter | Planned |
| CPU time | `time.process_time` deltas for in-process Python sections; each external command's own `/usr/bin/time -l` CPU totals for builds, the compiler and plmc | Planned |
| M1 cache lookup only | One optional pass with a full cache, labelled separately | Planned, optional |
| plmc fit | Ceiling 60 min wall, 4 GiB, one thread | Planning value |
| Every other stage | Ceiling 10 min wall, 4 GiB | Planning value |
| New disk | Ceiling 5 GiB, all on the SSD | Planning value |
| New inputs | Alignment and weights members about 1.5 MB uncompressed; ESM checkpoint 30 MB | Observed sizes |
| Paid compute | None | Decision |
| Monetary cost | Not estimated; no cloud charge | Decision |

## 5. Design decisions needing review

| Decision | Choice | Main alternative | Why this choice |
|---|---|---|---|
| Assay | AMFR, exploratory | An unseen assay | AMFR is the only assay with existing M1 and null runs and receipts; an audited unseen assay is needed for confirmation |
| Third method | Full EVmutation from the M2 model file | ESM-2 35M | Adds a distinct model class sharing M2's inputs; 35M is the same family and has no scalar adapter |
| Primary population | Covered singles | All covered variants | Each single belongs to one position, so resampling by position is well defined; doubles span only 7 overlapping pairs |
| Metric | Spearman, variant-weighted | Position-balanced Spearman | Matches ProteinGym's assay metric; weighting stated explicitly |
| Uncertainty | Paired position bootstrap, 10,000 attempted draws, seed 40, linear quantiles of valid draws, per-contrast validity | Row bootstrap | Rows at one position are dependent |
| Threshold | 0.10 | None, or 0.05 | Proposed planning value: a smaller difference on one small domain should not change which method a user picks, given that M2 and M3 also need an alignment and model fit. Needs human review at G0. |
| Outcome classes | Point-estimate bands plus interval conditions, disjoint | Interval-only rules | A percentile interval need not contain the point estimate |
| Route B fit acceptance | Accept L-BFGS success or the 100-iteration budget, labelled differently; reject anything else | Require success only | 100 iterations is the declared EVCouplings default; the label keeps a budget-limited fit distinct and the rule is fixed before any fit |
| Model route | Chosen at G0 | Fixed now | Depends on whether the owner wants to contact authors or authorise a local fit |

## 6. Issue #40 checklist disposition

| Checklist item | Disposition | Where |
|---|---|---|
| Choose tasks and at least three meaningful methods including conventional or task-specific controls | Done: one task; M1, M2 (conventional task-specific control), M3; N0 as an extra null | README: Task and data; Methods |
| Predeclare inputs, splits, adaptation, metrics, uncertainty, coverage and training overlap | Done | README: Methods; Training and overlap; Analysis populations; Primary analysis; `pilot-spec.json` |
| Separate existing evidence from missing measurements and source gaps | Done | Section 2 |
| Runtime scope, hardware, memory, batch size, preparation versus inference, cost | Done; measured and planning values labelled; SDK and model batch sizes separated | README: Runtime and cost; section 4 |
| Scientific and engineering review owners and a bounded success criterion | Done; automated scientific-design and source-feasibility reviews by Codex (research director) with independent Codex advisers, accepted 25 September 2026; human scientific reviewer unassigned, stated as such | README: Roles and review; Pilot success criterion |
| Execution proposal using available resources; runs and paid compute separate | Done; execution blocked at G0, G3 and G4, with G1 and G6 still to be written | README: Execution plan and gates; section 3 |
| External rerun and second reviewed refresh; no outreach or automation | Done; researcher unassigned; nothing sent or scheduled | README: External rerun and second refresh |
