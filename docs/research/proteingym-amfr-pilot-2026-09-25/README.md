# Matched pilot: protein language model versus evolutionary baselines on AMFR stability

Status, 25 September 2026: **planning complete; automated scientific-design and source-feasibility reviews accepted it on 25 September 2026.** That is automated review only, not a human sign-off. **Execution is not authorised and is currently blocked** (gates G0, G3 and G4 need decisions or new work; G1 and G6 need tooling); running the experiment awaits the owner's separate decision. Nothing in this directory is a benchmark result, a catalogue record or a release, and nothing here authorises publication. Issue [#40](https://github.com/rewire-bio/rewire-database/issues/40) asks for this plan.

Supporting material:

- [supporting-tables.md](supporting-tables.md): hypotheses, evidence and gaps, gates, resources, roles and the issue checklist disposition.
- [sources.csv](sources.csv): every source checked, with revision, hash and retrieval time.
- [pilot-spec.json](pilot-spec.json): the same design in machine-readable form. Where this page and the spec differ, the spec's numbers are intended and the difference is a defect to fix before G0.

## Question

The accepted research direction is: does a protein language model add predictive value beyond an independent evolutionary baseline, and which variants explain the difference?

This pilot answers a narrower, testable version:

> On single substitutions of the 47-residue AMFR construct in ProteinGym, does ESM-2 8M masked-marginal scoring rank proteolysis-inferred folding stability better than the EVCouplings site-independent model, and which variants account for the difference?

Two limits follow from the design and must stay attached to any result:

1. **Comparative ranking, not incremental information.** The primary analysis compares two separate rankings. It does not test whether ESM-2 adds information once the evolutionary score is known. That would need a combination model fitted with labels and cross-fitted across positions, which this pilot does not include (hypothesis H4). No result from this pilot may be described as incremental predictive value.
2. **Exploratory, not confirmatory.** The AMFR labels and the complete-assay ESM-2 8M and seeded-random results (Spearman -0.209 and 0.008 over all 2,972 singles and doubles) were viewed before this protocol was written, including by earlier automated research. New EVCouplings predictions do not make those labels unseen, and knowing the mixed-cohort result already informs expectations for the singles. A confirmatory test needs a different assay whose exposure has been audited; a candidate and the audit rule are in [Future confirmatory candidate](#future-confirmatory-candidate).

The result applies to one assay, one ESM-2 checkpoint and one alignment. It says nothing about the 217-assay ProteinGym track, other proteins, larger ESM-2 models or protein language models as a class. It makes no causal or novelty claim.

## Hypothesis generation and selection

Seven candidate hypotheses were written down and judged on three criteria: scientific value for the question above, feasibility with existing code and local hardware, and independence from outcomes already seen. None was selected or rejected on the basis of any observed or expected score. Full reasoning is in [supporting-tables.md](supporting-tables.md#1-hypotheses-considered).

| ID | Hypothesis | Decision |
|---|---|---|
| H1 | ESM-2 8M and the site-independent model rank single-substitution stability differently | **Primary** |
| H2 | The full Potts model (EVmutation) ranks single substitutions differently from the site-independent model refitted from the same fit | Secondary S1, bounded |
| H3 | Differences between M1 and M2 concentrate at particular positions or substitutions | Descriptive D4 |
| H4 | ESM-2 carries information beyond the evolutionary score (cross-fitted combination) | Not tested; needs a separate supervised design |
| H5 | On double mutants, the full Potts model and the site-independent refit rank stability differently | Descriptive D3 only; 7 non-randomly selected, overlapping site pairs; no attribution to couplings |
| H6 | Larger ESM-2 checkpoints rank better | Not tested; same model family and no scalar adapter |
| H7 | Differences depend on conservation or alignment depth | Not tested; one assay has one alignment depth, and bins would be outcome-prone |

## Task and data

| Item | Value |
|---|---|
| Assay | `AMFR_HUMAN_Tsuboyama_2023_4G3O`, ProteinGym v1.3 DMS substitutions, reference pinned at `144fe22` |
| Construct | 47 residues, `YFQGQLNAMAHQIQEMFPQVPYHLVLQDLQLTRSVEITTDNILEGRI` |
| Measurement | cDNA display proteolysis; folding stability inferred from protease K50 ([Tsuboyama et al. 2023](https://doi.org/10.1038/s41586-023-06328-6)). Dynamic range about 5 kcal/mol. Not AMFR function, cellular activity or organismal fitness. |
| Target | ProteinGym `DMS_score` as supplied; higher is more stable. The reference lists `raw_DMS_phenotype_name` `ddG_ML_float` with directionality +1; no sign change is applied. |
| Variants | 2,972: 820 single substitutions at all 47 positions (7 to 19 per position) and 2,152 double substitutions |
| Double structure | Seven site pairs only, among positions 28, 32, 38, 41 and 46, with 227 to 348 variants per pair. Pairs share sites. The source study chose such pairs deliberately (for example suspected hydrogen-bond or contact pairs), so they are not a random sample of interactions. |
| Split | None. All methods are zero-shot with respect to assay labels. |

The variant counts were taken from the `mutant` column of the local assay CSV (observed SHA256 `dd911d92…04c2a`, matching the 20 September retrieval receipt). The label columns were not read for this protocol. That hash records the bytes we downloaded; it is not a checksum published by ProteinGym.

## Methods

| ID | Method | Inputs | Adaptation | Status |
|---|---|---|---|---|
| M1 | ESM-2 `esm2_t6_8M_UR50D`, masked marginals: for each substituted site, log P(mutant) minus log P(wild type) with that site masked in the wild-type sequence, summed over sites | Wild-type sequence, substitutions | None | Implemented (`ESM2Adapter`); checkpoint SHA256 `46f002a9…b928` |
| M2 | EVCouplings site-independent model: new fields fitted by BFGS to the plmc_v2 model's stored single-site frequencies, N_eff and lambda_h, with couplings set to zero; ProteinGym's `Site_Independent` row | Substitutions, one plmc_v2 model | Label-free estimation from a homologous alignment | Implemented and validated on synthetic models (`proteingym-evcouplings-independent-v1`); no real model yet |
| M3 | EVmutation full model: change in Potts statistical energy using the fitted fields and couplings, including couplings to the wild-type background and between substituted sites ([Hopf et al. 2017](https://doi.org/10.1038/nbt.3769)) | The same plmc_v2 model file as M2 | Same as M2 | Not implemented; gate G4 |
| N0 | `seeded-random-v1`, seed 0 | Variant ID | None | Supplementary null; not one of the three methods |

M2 is the conventional task-specific control. M3 is the conventional coevolution method. M2 and M3 come from one plmc fit, but they do not differ only by the coupling terms: M2's fields are refitted without couplings, while M3 uses the jointly fitted fields and couplings. Comparing them compares a full Potts model with a site-independent model derived from the same alignment statistics. It does not isolate the contribution of couplings, and it cannot attribute a difference to epistasis in the protein. M1 and M2 are different model classes, but these are three configurations, not three independent model families.

M1 and M2 both score a substitution only in the wild-type context and add terms for multiple substitutions. Comparing them therefore cannot show that either captures interactions between mutations.

### Training and overlap declarations

| Method | Labels used | Other training data | Overlap with the target |
|---|---|---|---|
| M1 | No | Pretraining on UniRef50 release 2021_04 (UR50/D), per the ESM README | Unknown; the target sequence or homologues may be in the pretraining data. Not checked: the only public ESM holdout list covers the 2018_03 UniRef50 split used by earlier ESM models, not ESM-2. |
| M2, M3 | No | One Potts model per protein, fitted to an alignment of homologues | Present by construction: the alignment is built around the target family. This is label-free parameter estimation, not zero-shot inference in the sense of having no family-specific fitting. |
| N0 | No | None | None |

The checked runtime boundary is the adapters' input contract: `ESM2Adapter` rejects any input field other than ID, assay ID, wild-type sequence, mutant and mutated sequence, and the EVCouplings adapter reads the same fields and no labels. This keeps labels out of scoring. It says nothing about what the ESM-2 pretraining data contained; publication dates do not settle that either.

## Evolutionary model: the main prerequisite

No AMFR plmc_v2 model with a checkable preparation chain exists in any source we checked (details in [supporting-tables.md](supporting-tables.md#2-evidence-measurements-and-gaps)):

- The ProteinGym v1.3 README lists alignments, sequence weights and precomputed scores, but no EVmutation models. The pinned scoring script expects `AMFR_HUMAN/AMFR_HUMAN/couplings/AMFR_HUMAN.model` and its shell wrapper leaves the model folder as a placeholder. The ProteinGym paper says some checkpoints are on its download server. That server refuses directory listing (HTTP 403), and no checked page or file names an EVmutation model there.
- The remote directory of `DMS_msa_files.zip` (read by byte range, 22,638 bytes) holds 195 `.a2m` files and no model or parameter files.
- The original EVmutation downloads page offers alignments, predictions and coupling-score tables. Its coupling files are APC-corrected Frobenius-norm summaries, not the full parameter set a scorer needs.

This does not prove that no author model exists. It means the model must come through one of two routes, chosen at G0 and fixed before the model is obtained. If the chosen route fails, the pilot stops; switching to the other route is not automatic and needs a new, reviewed protocol decision before any prediction.

- **Route A: an author-held model.** Requires a request to the ProteinGym or EVmutation authors. This issue sends no request; whether to ask is Tim Richardson's decision. The model is usable only with the traceable provenance chain set out under "Provenance review" below. Whether it may be shared with an external rerun depends on the authors' terms, which must be recorded when it is obtained.
- **Route B: a Rewire fit from the pinned alignment.** Label-free training, not authorised by this issue. The command, fixed now:

  ```sh
  plmc -c AMFR_HUMAN.ec -o AMFR_HUMAN.model -f AMFR_HUMAN -g -m 100 \
    -t 0.2 -lh 0.01 -le 7.6 AMFR_HUMAN_2023-08-07_b04.a2m 2> plmc.stderr
  ```

  This follows how the pinned EVCouplings (`e1362407`) calls plmc with its monomer defaults. `-t 0.2` is plmc's divergence form of EVCouplings theta 0.8. `-le 7.6` is lambda_J 0.01 × (q − 1)(L − 1), where EVCouplings sets q to 20 once gaps are ignored and L to the 41 uppercase positions of the query row. `-f AMFR_HUMAN` is the query ID without its region suffix, as EVCouplings passes it. No `-a` is passed: plmc applies focus-column removal only when it uses its built-in protein alphabet, so an explicit alphabet string, even an identical one, would change behaviour. plmc is built from commit `18c9e55` with the unmodified `make all-mac` target (clang, double-precision arithmetic, no OpenMP, so one thread); plmc writes parameters as 32-bit floats whatever the build precision. That target passes the x86 flag `-msse4.2`; if it fails on Apple arm64, the only permitted change is removing that flag, recorded as a build deviation with the binary's SHA256. These settings are not known to match ProteinGym's historical run. The model is labelled "Rewire plmc fit on the ProteinGym v1.3 AMFR alignment", never "ProteinGym EVmutation".

**Fit acceptance (Route B).** plmc writes the parameter file whatever the optimizer outcome, and the file header records the requested iteration limit, not what happened. The only record of termination is the `Gradient optimization:` line in stderr, so `plmc.stderr` is kept and hashed. Acceptance is fixed now, before any fit:

- `Minimization success`: accepted and labelled a converged fit.
- `MAXIMUMITERATION`: accepted and labelled "fixed-budget fit, 100 iterations (EVCouplings default), not converged". This matches the declared EVCouplings configuration; it is a different label from a converged fit and must appear with every M3 result.
- Any other status: rejected; the pilot stops. There is no refit with more iterations or other settings.

M2 is less sensitive to this: its fields are refitted from the stored single-site frequencies, which plmc computes from the weighted alignment before optimisation. M3 depends directly on the fitted fields and couplings.

**Provenance review (both routes).** `prepare-baseline-artifact` checks the model file's hash, format, finite values, coordinate mapping to the wild type and field-optimizer acceptance, and that eight provenance strings are present. It does not verify what those strings say, so passing it does not make a model traceable. G3 therefore also requires a provenance review receipt. Its required items must be established, not merely declared; a missing required item blocks the route.

| Item | Required | Route B check | Route A check |
|---|---|---|---|
| Model file | Yes | SHA256 computed | SHA256 computed |
| Training alignment | Yes | The pinned v1.3 file, SHA256 `23fe63b7…ba04c` | The actual alignment bytes used to train the model, supplied and hashed. If they differ from the pinned v1.3 file, the route is rejected unless a reviewed amendment to this spec adopts that alignment before any prediction; the v1.3 hash is never recorded as its provenance. |
| Query and index audit | Yes | Query `AMFR_HUMAN/1-47`; model index list equals the 41 uppercase positions 6 to 46 | The alignment's query ID, region and focus columns agree with the model's target sequence and index list, and the index list maps onto the wild type |
| Generation configuration | Yes | Exact command line, plmc commit and binary SHA256 | A configuration file or command written by the source, covering method and version, sequence and column filtering, weighting (theta) and regularisation |
| Link between inputs, configuration and model | Yes | Command, `plmc.stderr` SHA256 and model SHA256 recorded together in one receipt | An attributable source record tying that alignment and configuration to this model file: an archived pipeline manifest or log, or a written record from the supplier naming the model and input hashes |
| Consistency review | Yes | Model header (L, N_eff, theta, lambdas, alphabet, index list) and stored frequencies agree with the command and alignment | The same review against the supplied configuration and alignment |
| Fit termination | Route B yes; Route A desirable | Status line under the fit rule above | Historical termination log if available. If unavailable, recorded as unknown; M3 results then make no convergence claim |
| Original search reproduction, original compiler binary, publisher-signed checksum | No | Not required | Not required |

Once the receipt passes, the model, alignment and configuration hashes are frozen in the spec before any prediction. Neither route supports a claim to reproduce ProteinGym's historical EVmutation or site-independent rows. If a required item cannot be established, the pilot stops. It never switches to another assay or to a simpler conservation score under the M2 identity.

**Expected coverage, not yet a fact.** In the alignment's query row, positions 1 to 5 and 47 are lowercase. plmc focus mode drops lowercase columns, so a Route B model should cover positions 6 to 46 (41 positions, matching the reference's `MSA_num_cov` of 41). That would leave 707 of 820 singles and all 2,152 doubles scoreable. Only the actual model index list at G5 counts.

## Analysis populations

- **P0, full:** all 2,972 variants. Each method reports scored and unscored counts with reasons on this denominator.
- **P1, primary:** single substitutions whose position and both residues are in the M2/M3 model's index list and alphabet. M1 covers all 47 positions of this short sequence, so P1 is set by the evolutionary model.
- **P2, doubles:** double substitutions with both sites covered. Descriptive only.

P1 and P2 are computed at gate G5 from the prepared artifact and the mutant strings alone, written as sorted ID lists and hashed. This happens before any method, and before any parity check, produces a prediction on AMFR data. Every comparison uses exactly those IDs for every method. If any method fails to score a frozen ID, the analysis stops.

The analysis unit is the variant within a position. Positions are the resampling unit because variants at the same position share a wild-type residue, a structural environment and, for M1 and M2, a masked or site term.

## Primary analysis

**Estimand.** Δρ = ρ(M1) − ρ(M2), where ρ is the Spearman correlation between a method's score and `DMS_score` on P1, computed by `scipy.stats.spearmanr` with average ranks for ties. Every variant counts once, so positions with more measured substitutions weigh more; resampling positions does not change that. Δρ is undefined, and reported as null with its reason, if M1, M2 or the label is constant on P1. M3 and N0 play no part in the primary contrast's validity.

**Uncertainty: paired position bootstrap.** Exact procedure:

1. List the K distinct P1 positions as integers in ascending order. Within each position, order its P1 variants by variant ID.
2. Create `rng = numpy.random.default_rng(40)`. Make exactly 10,000 draws. In each, `rng.integers(0, K, size=K)` picks K positions with replacement; the resample is those positions' variants in draw order, a position's variants repeated each time it is drawn.
3. In each resample, recompute Spearman from scratch (ranks, with average ranks for the ties that duplication creates) for every method with non-constant scores, then form each contrast.
4. A draw is invalid for a contrast if any of that contrast's methods, or the label, is constant in the resample. The primary contrast needs only M1, M2 and the label. Validity is counted separately for each contrast from the same 10,000 draws. Invalid draws are not replaced.
5. If at most 100 draws (1%) are invalid for a contrast, its interval is the 2.5% and 97.5% quantiles of its valid values from `numpy.quantile(values, [0.025, 0.975], method="linear")`. If more than 100 are invalid, that contrast's interval is refused. Attempted and valid draw counts are reported for every contrast.

With about 41 positions from one protein, the interval describes variation over positions in this assay, assuming positions are roughly exchangeable. It is not a confidence interval for other proteins or for the ProteinGym track. We make no power claim: the effective sample size is closer to the number of positions than to the number of variants.

**Adequacy.** Intervals, primary or secondary, are computed only if P1 has at least 30 positions and 300 variants. Otherwise point estimates are reported as descriptive and no interval is computed.

**Sensitivity.** Δρ recomputed with each P1 position left out, reported for every position in position order.

**Minimum practical difference.** 0.10 in Spearman ρ. This is a planning decision for choosing between these methods on a small stability domain, not a universal or biological threshold, and results are reported whichever side of it they fall.

**Outcome classes.** A percentile interval need not contain the point estimate, so the classes use both and are mutually exclusive:

| Class | Rule |
|---|---|
| Not classified | Δρ undefined, or its interval not computed (inadequate P1) or refused |
| M1 ranked better | Δρ ≥ 0.10 and the interval's lower bound > 0 |
| M2 ranked better | Δρ ≤ −0.10 and the interval's upper bound < 0 |
| Practically equivalent | \|Δρ\| < 0.10 and the whole interval within (−0.10, 0.10) |
| Inconclusive | Any other defined Δρ with a computed interval |

The first three point-estimate conditions do not overlap, so no result fits two classes. Every class, including "not classified", is a valid pilot result.

## Secondary and descriptive analyses

The secondary family is fixed at two contrasts on P1, using the same 10,000 draws, with 97.5% intervals (quantiles 0.0125 and 0.9875, Bonferroni over two) and the same validity, refusal and adequacy rules. No outcome class is assigned to them.

- **S1:** ρ(M3) − ρ(M2), needing M2, M3 and the label to be non-constant. It shows whether the full Potts model ranks singles differently from the site-independent model refitted from the same alignment statistics. As explained under Methods, it does not isolate couplings and supports no claim about epistasis.
- **S2:** ρ(M1) − ρ(M3), needing M1, M3 and the label.

Descriptive analyses have no intervals and no hypothesis tests. Each has its own scope:

- **D1:** the five ProteinGym assay metrics (Spearman, AUC, MCC, NDCG, top-10% recall) for M1, M2, M3 and N0 on P1. AUC uses the supplied `DMS_score_bin` (full-assay median cutoff); MCC and NDCG follow the pinned evaluator. A metric that is undefined for a method is reported as null.
- **D2:** P0 coverage with unscored reasons for each method, and the SDK's partial-status metrics on original denominators.
- **D3:** Spearman for each method over all of P2, and within each of the seven site pairs. A pair's value is reported if the pair has at least 30 covered doubles and neither the method nor the label is constant within it; otherwise its count and the reason are shown. Pairs share sites, so the seven values are not independent observations and are not combined into any test. Differences between M2 and M3 on doubles compare whole models, as under Methods, and are not attributed to couplings or epistasis.
- **D4, which variants differ.** Computed only if M1, M2 and the label are all non-constant on P1. For each P1 variant, convert each method's score and the label to rank fractions over P1, q = (average rank − 0.5) / n. The rank error of method m is \|q_m − q_label\|. Let d = error(M2) − error(M1); positive d means M1 placed the variant closer to its measured rank. Report the mean d and variant count for every P1 position in position order, whatever the count. List up to ten variants with d > 0 (largest first) and up to ten with d < 0 (most negative first), fewer if fewer exist, with ties broken by variant ID; d = 0 is listed in neither. Each listed variant shows position, wild-type and mutant residues and its M1, M2 and label rank fractions. Raw ESM log odds and EVCouplings energies are never compared directly because their scales differ. d displays disagreement; it is not an exact decomposition of Δρ, and the leave-one-position-out values are the influence measure.
- **D5:** M1 and N0 Spearman on the singles the evolutionary model does not cover, only if they number at least 30 variants across at least 5 positions and the method and label are not constant.

**No other subgroups.** Beyond the groups defined above, no subgroup metric, bin or example selection is added after predictions are seen.

## Execution plan and gates

Gates run in this order, and each writes a receipt. Details and acceptance checks are in [supporting-tables.md](supporting-tables.md#3-gates-and-stop-conditions).

| Gate | Requirement | Current state |
|---|---|---|
| G0 | Tim Richardson approves this spec (by SHA256) and the model route | Not given |
| G1 | Resource logging in place before any environment build, retrieval, hashing, preparation, training, parity check or scoring | Not written |
| G2 | Reference, assay CSV, ESM checkpoint and alignment match the hashes in `pilot-spec.json` (measured under G1) | Hashes recorded; rechecked at run time |
| G3 | One AMFR plmc_v2 model obtained (Route A) or fitted (Route B) under logging; fit acceptance; provenance review receipt; M2 artifact prepared by `prepare-baseline-artifact` | Blocked: no model |
| G4 | M3 adapter in rewire-benchmarks: implemented, same-runtime parity with pinned upstream `prediction_epistatic` on synthetic fixtures only, reviewed, commit frozen | Blocked: not implemented |
| G5 | P1 and P2 ID lists frozen and hashed from the artifact and mutant strings | Waits for G3 |
| G6 | Analysis script tested on synthetic data (planted differences, ties, constant methods, duplicated positions, same-sign d), then hashed | Not written |

After G6, on the external SSD:

1. **Real-model parity.** Run the unmodified pinned upstream scorer and the M2 and M3 adapters on the frozen P1 and P2 variants with the G3 model. Upstream aborts on uncovered variants, so it receives only frozen IDs. Scores must agree within 1e-6. This uses mutant strings only, but it is the first AMFR prediction and so comes after the freezes. A failure stops the pilot.
2. **Scoring.** Score all 2,972 variants with M1, M2, M3 and N0; unscored variants keep their reasons.
3. **Evaluation.** Recompute every metric from saved predictions with an independent script, run the frozen analysis and write the report.

Software comes from rewire-benchmarks commit `d4531f5` with its `uv.lock` (SHA256 `3f2ec7f4…5f4296`) plus the frozen G4 commit. The published `rewirebench` 0.5.0 wheel predates the EVCouplings adapter and must not be used.

**Stop conditions.** Stop and report, without switching assay or method, if: any input hash differs; the model or its fit fails G3; M3 fails parity at G4 or in real-model parity; a frozen ID is unscored by any method; a stage exceeds its resource ceiling; or any change to the design is proposed after predictions are compared with labels. A proposed change is recorded as a deviation and the result is labelled accordingly.

## Runtime and cost

**Existing measurement.** The 20 September AMFR run of M1 recorded an SDK inference time of 0.1878 seconds for 2,972 variants (macOS arm64, one thread, rewirebench 0.4.0). That timer excludes checkpoint loading, preparation and metric calculation. It is not an end-to-end or cross-model speed figure, and no peak memory was recorded. Nothing has been measured for M2, M3 or plmc on real data.

**How M1 actually runs.** The SDK passes records to the adapter 32 at a time; that is the SDK batch size. The model itself runs one masked sequence per forward pass. The adapter caches the masked-position log-probabilities by (sequence, position) for the life of the adapter object, so a pass over AMFR needs one forward pass per distinct substituted position (47), and the other substitutions reuse the cache. The 0.1878-second figure is therefore mostly 47 forward passes plus lookups.

**Planned measurements.** For sections that run as Python code inside the harness process (loading, scoring, evaluation), the harness records wall time (`time.perf_counter`) and CPU time (`time.process_time`) at the start and end of each section, so loading and scoring are timed separately even in one process. `time.process_time` excludes child processes, so for external commands (environment builds, the compiler, plmc) CPU time comes from that command's own `/usr/bin/time -l` totals, not from the parent's delta. Every process runs under `/usr/bin/time -l`, which gives whole-process wall time, CPU time and peak resident memory. That peak covers the process's whole life. It is reported as the peak of the named process (for example "load plus scoring process"), never as inference-only memory or memory attributable to one section. Threads, batch sizes, cache policy, software versions and bytes written are recorded for every section. Preparation is never folded into inference.

| Section | Process | Timed separately | Settings recorded |
|---|---|---|---|
| Environment build | Own process | Yes | Tool versions |
| Input retrieval and hashing | Own process | Yes | Bytes read |
| Model preparation: plmc build and fit (Route B) or retrieval (Route A) | Own process per step | Yes | plmc single thread; binary SHA256 |
| M2 artifact preparation | Own process | Yes | NumPy and SciPy versions; one thread |
| Real-model parity | Own process | Yes | Frozen IDs only |
| Cold load, each of M1, M2, M3, N0 | Three fresh processes per method | Yes: construction only (M1: checkpoint hash, load, model build; M2: artifact read and checks; M3: plmc_v2 model read; N0: construction) | One thread |
| Warm scoring, each method | In one of those processes, after loading | Yes: five repeats over all 2,972 variants | See below |
| Evaluation and bootstrap | Own process | Yes | Seed and draws |

Warm scoring starts only after loading has finished. For all four methods the SDK passes records to the adapter 32 at a time (SDK prediction batch size 32). What happens inside each call differs, so per-record work and cache policy are defined per method; only M1 has a model forward batch, which is 1:

- **M1:** per record, one masked-marginal lookup per substitution; a model forward pass (batch 1, one masked sequence) only for a position not yet cached. The adapter's positional cache is emptied before each repeat (the harness replaces the cache with an empty dictionary; no adapter code change), and each repeat reports its forward-pass count. One further pass with a full cache is optional and labelled "cache lookup only".
- **M2:** per record, parse the substitutions and sum the prepared field differences; the adapter at `d4531f5` reads the fields at construction and keeps no per-call cache.
- **M3:** per record, compute the statistical-energy difference from the loaded model; cache behaviour is taken from the frozen G4 adapter's source and recorded, and if it caches, each repeat starts with an empty cache, as for M1.
- **N0:** per record, one SHA256 of the seeded ID; no model and no cache.

**Host and limits.** Mac16,10 (Apple M4, 10 logical CPUs: 4 performance and 6 efficiency; 16 GiB memory), observed 25 September 2026. No GPU, cluster or cloud is assumed. Planning ceilings, which are limits and not predictions: 60 minutes for the plmc fit, 10 minutes for every other stage, 4 GiB peak memory, 5 GiB new disk. The internal disk has about 1.4 GiB free, so every environment, cache and output goes on the external SSD. There is no paid compute and no incremental cloud charge; electricity and staff time are not priced.

## Pilot success criterion

The pilot is complete when all of the following hold, whatever Δρ turns out to be:

1. Gates G0 to G6 and real-model parity passed, each with a receipt, in the order above.
2. M1, M2, M3 and N0 each scored every frozen P1 and P2 ID; P0 coverage and every unscored reason reported on the original 2,972 denominator.
3. The primary Δρ reported with its interval and valid-draw count, or with the reason it is undefined or its interval was not computed, and its outcome class.
4. Every metric recomputed from saved predictions by an independent script, agreeing within an absolute tolerance of 1e-12.
5. Per-stage resource measurements recorded against the ceilings.
6. The report states that the analysis is exploratory, single-assay and comparative, gives the M3 fit label, and does not claim incremental information.

A negative, equivalent, inconclusive or not-classified outcome meets this criterion. A favourable Δρ does not substitute for any missing item.

## Roles and review

| Role | Who | State |
|---|---|---|
| Proposed human decision owner and internal accountable coordinator | Tim Richardson | Approval not given |
| Automated scientific-design review | Codex (research director) with an independent Codex adviser | Accepted 25 September 2026; automated only, not a human sign-off |
| Automated engineering and source-feasibility review | Codex (research director) with an independent Codex adviser | Accepted 25 September 2026; automated only, not a human sign-off |
| Author and proposed engineering executor | Claude Code | Sole author of this protocol; executes nothing until G0 |
| Human scientific reviewer | Unassigned | Needed before any result is published |
| External rerun researcher | Unassigned | No one has been asked or has agreed |

## External rerun and second refresh

**External rerun.** After the pilot runs and passes internal review, Tim Richardson decides whether to invite an independent researcher, who has not worked on the pilot, to rerun it. This issue contacts no one. There are two kinds of rerun, reported separately:

- **Artifact replay.** The researcher receives the frozen plmc_v2 model file, the prepared M2 artifact, the spec, the rewire-benchmarks and G4 commits, the lock file, the frozen ID lists and the analysis script, checks every hash, obtains ProteinGym data and the ESM checkpoint from the official sources, and rescores. For a Route B model, Rewire can share the file privately with the researcher; public redistribution is a separate decision. For a Route A model, sharing depends on the supplier's terms; if they forbid it, the researcher must obtain the same file from the supplier, and if that is impossible, artifact replay is recorded as not possible.
- **Regeneration.** Route B only: the researcher rebuilds plmc and refits from the pinned alignment with the fixed command. A refit on another machine is not expected to be bit-identical, so it is compared as a separate result, not as a check of the replay.

Planning targets for artifact replay, declared now and not changed after results are seen: identical frozen ID hashes; M2 and M3 scores within 1e-6; M1 scores within 1e-5; Δρ and interval bounds equal to three decimals; the same outcome class. These are targets, not demonstrated cross-platform guarantees: small score differences can reorder near-tied variants and shift Δρ or the interval. If both runs have an undefined Δρ or a refused interval for the same reason, that counts as agreement; if only one does, it is a discrepancy. Any discrepancy is investigated and recorded beside the original, which is never overwritten. Neither the rerun nor a discrepancy is published automatically: both go through the same publication review as the original, which this issue does not authorise. A discrepancy is not in itself a scientific refutation of the original result, and a match is not independent confirmation of the finding.

**Second reviewed refresh.** One refresh follows the external rerun, or earlier if a pinned input changes (a new ProteinGym release or reference, a different model artifact, or an adapter fix). It reruns the same protocol under a new pilot version, reports differences from the first run, and keeps all earlier artifacts unchanged. It needs its own approval. No scheduled job or automation is created.

## Future confirmatory candidate

A later confirmatory test needs an assay whose labels and published scores nobody on the project has examined, with the design fixed before access. The rule, applied only to the pinned reference metadata: ProteinGym v1.3 Tsuboyama 2023 assays, other than AMFR, with full alignment coverage (`MSA_perc_cov` 1.0) and `MSA_start` 1, ordered by most single substitutions and then `DMS_id`. The first is **`RS15_GEOSE_Tsuboyama_2023_1A32`** (63 residues, 1,195 singles, no multiples), then `PITX2_HUMAN_Tsuboyama_2023_2L7M` and `MAFG_MOUSE_Tsuboyama_2023_1K1V`.

This is a candidate only. The checked Rewire repositories and workbenches contain only its reference metadata row, but that cannot show that no project member or automated session has looked at its public labels or ProteinGym scores. Before any confirmatory claim, the human decision owner must record an exposure audit: a search of project repositories, workbenches and automated-session logs, plus a declaration from each person involved. If prior exposure is found, RS15 cannot support a confirmatory claim; the next assay in the rule's order is audited instead, and if none passes, no confirmatory test is run. An exposed assay is never retroactively declared unseen. Reserving the candidate does not authorise running it.
