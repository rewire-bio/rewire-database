# Explanatory model and benchmark pages with visible results

Status: **Implementation resumed by explicit user instruction, 2026-09-16.** Kept on a review branch; public deployment remains separate. See [delivery and validation](../omics/stage-1-profile-delivery.md).

## Purpose and completion boundary

Improve every model and benchmark page in the current catalogue: 226 model records and 170 benchmark/task records at planning time. Explain architectures and procedures, provide accessible diagrams, describe sourced strengths and limitations, and expose evaluated results directly. Shared profiles require verified identity relationships; editorial topic grouping alone is not evidence of equivalence.

No composite rankings, new benchmark runs, speed measurements or paid compute in this stage. Hosting migration remains separate from this review build.

## Model pages

Lead with biological inputs, outputs and supported tasks. Show known versions, training information, context limits, access, code and component-specific licences. Add an annotated architecture diagram and readable explanation; conventional methods get an algorithm/procedure explanation rather than a fabricated neural architecture.

Provide a prominent Benchmarks and results section, distinguishing evaluation counts from metric-row counts. Group results by protocol and evaluated configuration; include metric, units, uncertainty, origin and source. Support configuration, metric and origin filters. Keep proposed applicable tests separate from completed evaluations. Where no evaluation is linked, say “No evaluations linked in this release.”

Explain demonstrated strengths, limitations and untested capabilities with claim-level citations. Present sources and version/correction history. Keep raw metadata and identifiers available in expandable details.

## Benchmark pages

Explain the biological question and what the test can and cannot establish. Identify whether the record is a task, suite, challenge, protocol or evaluator. Add an annotated procedure diagram and tables describing datasets, organisms, assays, splits, allowed inputs, adaptation, metrics and meaningful baselines.

Show tested models and results with direct links to exact configurations. Generic tasks provide a guide and source-backed links to concrete protocols; suites list their component tasks; evaluators explain scoring. Do not portray a conceptual diagram as an exact executable protocol.

For cell batch integration, explain both preservation of biological variation and removal of batch effects. Link scIB and Open Problems only through researched, source-backed associations. Do not invent evaluations for the generic task.

## Result and evaluation navigation

Lead result pages with the finding and direct links to the evaluated model, benchmark and dataset. For BarcodeBERT result `b2-barcodebert-2026`, show 78.5% accuracy with its source, genus-level nearest-neighbour procedure and exact reported configuration. Distinguish the source-checked numerical transcription from unresolved model/protocol metadata.

Build stable-ID relationship indexes: result → evaluation → model, benchmark, dataset, with reverse navigation. Expose readable evaluation protocols and associated results. Keep Related records as a supplementary section.

Separate families, checkpoints, adapters and complete pipelines. A frozen DNABERT-2 encoder plus logistic regression is not the same evaluated entity as its base model. Family pages may aggregate results only through verified relationships, showing exact configurations. Preserve existing IDs and URLs; consolidate browsing entries only where identity equivalence is supported.

## Content and release implementation

Add a validated enrichment input to the existing JSONL release pipeline. Merge profiles, supported associations and evidence claims by stable ID. Store typed profile content under `attributes.profile` in the existing extensible record envelope. Include summaries, explanation sections, diagram references, sourced facts, strengths, limitations and precise source locations.

Configuration pages may reuse a verified shared profile while retaining their own methodology and results. Validate profile and relationship inputs. Keep the existing Firebase/tRPC service and schema envelope; no new database is required. Catalogue browsing, filters, pagination and comparisons use release-pinned read procedures on that service. Static pages use the same query engine at build time for initial rendering and require no live database credentials. Publish enrichment through a new immutable release, preserving old releases, result values, downloads and MFASS history.

Research primary papers, supplements, official repositories and model cards. Cite individual factual claims and record source versions, review method and date; automated review must not imply human review. Missing architecture or protocol details must remain explicit. Use accessible native SVG diagrams with equivalent text descriptions. Reuse diagrams only when the underlying mechanism is verified as shared.

## Delivery and issue tracking

Use the existing 157 model and 89 benchmark editorial topics as a planning inventory, not an identity registry. Start layout and research examples with BarcodeBERT, DNABERT-2, SpliceAI, Pangolin, ESM-2, scGPT, RNA-FM and Boltz; benchmark examples are cell batch integration, scIB, MFASS and ProteinGym. These examples do not reduce the agreed full-catalogue completion scope.

Update parent issue #71 and convert only these pilot issues to profile work: #80, #104, #206, #174, #114, #198, #191, #83, #230, #277, #229, #244. Leave other issue bodies unchanged and track remaining coverage in the parent issue.

Deliver reviewable batches: direct navigation and relationships, page layouts, then source-reviewed content by domain. Public deployment follows review; do not silently publish unfinished profiles during migration.

## Acceptance

- Every result is reachable from its exact evaluated model and benchmark, with reciprocal direct links.
- BarcodeBERT exposes the 78.5% result without hiding the model behind Related records.
- Verified family associations preserve exact configurations; ambiguous names are not merged.
- Numerical review never automatically upgrades identity, training or protocol claims.
- Proposed, superseded, quoted and independently evaluated results remain distinguishable.
- Every model and benchmark has reviewed explanatory coverage or a documented source limitation; no invented architecture or protocol.
- Diagrams, tables and navigation work on mobile, desktop and keyboard; diagrams have text alternatives.
- Existing URLs, filters, MFASS history, download values and archived checksums survive.
- Relationship, profile-validation and rendering tests, lint, TypeScript, production build and export checks pass.
