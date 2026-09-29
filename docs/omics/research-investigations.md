# Benchmark investigations

This adds an evidence and execution layer to the existing catalogue. It supports questions such as whether a ranking changes on the same observations, whether missing predictions alter the denominator, whether disagreement concentrates in a declared subgroup, and whether a metric or protocol explains an apparent discrepancy.

The first release covers four existing cases. It is not a catalogue of all public biology datasets, a GEO importer, or evidence of a new biological discovery.

## What readiness means

Every dataset, subset and evaluation receives four separate assessments:

| Capability | Evidence required |
| --- | --- |
| Replay | Exact artifacts, valid joins, score semantics and reproduction of recorded metrics. |
| Analysis | Replay evidence plus relevant annotations and an explicit account of dependence. Unknown independence permits descriptive analysis only. |
| Local run | Verified inputs, a registered recipe with pinned code and environment, and a resource estimate. |
| Validation | Verified independent evidence, overlap checks and outcomes unexposed during hypothesis selection. |

Readiness attaches to the exact dataset/evaluation named in a manifest. A parent dataset does not inherit readiness from one prepared subset. Editorial `source_checked` status is not a readiness shortcut. A ready assessment can still require local artifacts; the UI shows that availability separately.

All initial seeds use previously inspected test data. None is ready for independent validation. A model-generated explanation remains exploratory even when its numerical calculations reproduce.

Run `npm run omics:research:audit` after generating a release to write the full assessment to ignored `workbench/research-audits/`. The first audit covers 138 datasets, 253 subsets and 7,077 evaluations. Four exact dataset/subset records and nine evaluations have replay and analysis evidence; two subsets and four evaluations have local execution evidence. These are small verified starting points, not whole-benchmark coverage.

## Initial cases

| Case | Useful questions | Main limitation |
| --- | --- | --- |
| MFASS v2 | Does disagreement vary with boundary distance, replicate agreement or connected gene/exon groups? | Specialists use different sequence contexts; the baseline already uses distance. Historical v1 orientation errors are known, not new findings. |
| ProteinGym AMFR | How do the official per-assay metrics behave across mutation classes? | One protein assay and one saved model do not support model-pair or cross-protein generalization. |
| mRNABench Sample designed | Does a sequence-composition baseline beat the training mean, and where does it fail? | Designed sequences and unknown independent sampling units limit inference. |
| FLIP2 Rhomax | Can ranking and error metrics explain an apparently strong constant control? | Small test set; correlations are undefined for constant predictions. Official NDCG shifts the target by its minimum. |

## Execution and evidence

Execution belongs in the sibling `rewire-benchmarks` repository. Its research runner uses SQLite checkpoints, frozen structured plans and a fixed operation registry. Before the initial planner, a separate hypothesizer session develops one to three precise research questions. Each records the population, comparison, outcome, hypothesis, competing explanation, supporting and contradicting results, confounders, scientific value, missing evidence and independent validation needed. Novelty is explicitly unverified.

Each candidate must identify one decisive test supported by the available evidence and registered operations, or state a blocker. The hypothesizer selects a testable candidate and explains the choice. The runner supplies that candidate's decisive test in the initial frozen plan so the main question cannot be omitted by the planner. When every candidate is blocked, the design is retained in a blocked report without numerical execution. Replay-only runs do not generate hypotheses.

The selected question and all alternatives remain in an optional `question_design` field in the initial specification. Its content is covered by the existing specification and plan hashes. A completed question-design session also exports `question_design_artifact`, containing the design and its canonical JSON SHA-256. This preserves candidate provenance if the planner fails or the budget stops execution before a specification is frozen. When both representations exist they must match exactly. A design with no testable candidate cannot accompany numerical attempts or a completed investigation, including when no specification exists.

Historical specifications and reports without these optional fields remain valid and are not rewritten. The report's top-level question retains the original investigation scope; its initial specification records the precise selected question. This is a record of exploratory question selection, not preregistration on unexposed data or a claim that novelty or independent support has been established.

The planner proposes competing explanations and a separate fresh session critiques the receipts. These sessions cannot supply arbitrary executable code. Missing tools become explicit requests or blockers.

When the critic requests a follow-up, it must name the required registered test in its structured response. The supervisor includes that test in the next frozen plan, retaining it as `followup_test` on a later-round specification. The field records the requested operation and is covered by the specification hash; validation checks that its execution parameters occur in the plan and match the manifest. This prevents a follow-up plan from omitting the comparison that motivated it. Historical plans without the optional field remain valid; private critic responses are not added to public reports.

Registered operations cover artifact checks, metric replay, coverage, paired common-observation comparisons, declared subgroups, group bootstrap, sensitivity checks and registered local SDK recipes. Bootstrap requires a documented independent grouping unit. Intervals remain descriptive and unadjusted; repeated exploratory testing does not establish significance.

The campaign defaults are one active job, an eight-hour campaign deadline, one hour per numerical job, fifteen minutes per Codex call, at most 24 Codex calls, 8 GiB process-tree RSS and 20 GiB workspace storage. A watchdog samples RSS; it is not a hard kernel memory ceiling. Follow-ups are bounded to two rounds and deterministic operation fingerprints prevent rerunning identical attempts. Stop/resume retains failed and interrupted attempts and does not replenish elapsed time or call budgets.

Public manifests contain portable artifact references and byte SHA-256 hashes. SDK prepared-data semantic hashes are recorded separately from the hash of the actual JSON file. Local filesystem resolvers, raw assay data and model-session logs remain private. Missing or changed artifacts block execution. Tool and source versions must be preserved when adding evidence.

The initial manifest generator records the installed runner's Python source digest as `runner_code_sha256`. Regenerate manifests after changing runner code or the dependency lock. A local recipe must execute the pinned implementation; merely finding a copy of an old recipe file is insufficient.

## Staging and review

From this repository, stage a worker bundle against its original source catalogue and private artifact resolver:

```sh
npx tsx scripts/omics/research-import.ts \
  /absolute/path/to/bundle.json \
  /absolute/path/to/manifests.json \
  /absolute/path/to/source-catalogue.json \
  /absolute/path/to/resolver.private.json
```

The importer verifies identities, artifact bytes, frozen plans, operation lineage, numerical receipt hashes and metric definitions. It writes only to ignored `workbench/research-imports/<report-id>`. Receipt integrity is not independent recomputation or scientific review.

A reviewer must inspect all attempts, failed explanations, denominators, code and numerical evidence. Unsupported biological interpretations must be removed or qualified. Version 1 accepts exploratory findings only. Supporting a future independent-validation claim will require a separate contract linking unexposed validation evidence, overlap checks and its execution receipts. Human review cannot turn an exposed test set into independent validation.

After explicit review, a curator can add the report to `data/research/investigations.json` with human review metadata. The release builder rejects pending reports. Generating a local release is separate from publishing the site.

## Release and interface

Research sidecars are checksummed alongside the existing catalogue: `research-manifests.json`, `research-readiness.json` and `research-investigations.json`. Readiness assessments are frozen in each new release, so static pages and API queries retain the same answers when assessment code changes later. Archived source releases remain immutable.

The catalogue provides readiness filters and record-level evidence panels. `/investigations` lists reviewed reports and shows an honest empty state until review occurs. Investigation details retain frozen hypotheses, numerical attempts, failures, findings and limitations.

The immediate measure of value is a reproducible explanation of a discrepancy or a precise statement of missing evidence. Biological knowledge requires a further step: a hypothesis that survives a test on independently collected, unexposed evidence.
