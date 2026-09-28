# Use-case feature validation — 28 September 2026

This record covers issue [#65](https://github.com/rewire-bio/rewire-database/issues/65):
two research questions, three scoped applicability mappings and navigation to
the existing benchmark evidence. It records engineering and source-presentation
checks, not a new experiment, independent replication, clinical validation or
human scientific review.

## Candidate and automated checks

- Release: `2026-09-25-8af07e960e5f`.
- Use-case input SHA-256:
  `d0c76e33f58fe8d4845cdba114d6bb6bea1920fc68c5a5e43922801c7e7ca27b`.
- Two use cases and three active proxy mappings. All 26,122 baseline scientific
  records are unchanged; the only record additions are two reviewed documentation
  sources. This is a new release, not a rewrite of the baseline archive.

| Check | Result |
|---|---|
| Root test suite | 795 tests passed across 80 files |
| Service test suite with Auth/Firestore emulators | 304 passed; zero failures or skips |
| Root lint and TypeScript | Passed |
| Service TypeScript and Functions load | Passed |
| Production build | Passed; 26,907 generated pages |
| Static export check | Passed; 26,124 record pages, 100 historical paper pages, use-case routes and archived releases |
| HTTP checks | Passed |
| Hosting/API integration | Passed against the full 26,124-record release, including pinned use-case artifact parity, reciprocal links and private-data gates |
| Read-only local website/API probe | Passed, including use-case and source-copy hashes |
| Frozen archive restoration | 410 declared files restored and verified against their hashes; both public source aliases matched their archived bytes |

The automated suites cover lifecycle and evidence eligibility, stale fingerprint
suppression, tombstone history, invalid references, source concerns, legacy
releases, publication/import validation and safe return links. These outcomes
are engineering checks on the candidate, not evidence that a scientific claim
has received human review.

The first hosted CI export exhausted its runner's disk. The revised build keeps
the four current-release rendering inputs visible, stages large downloads and
historical releases, and restores and hardlinks their exact bytes into the
export. This avoids 2.18 GiB of duplicate current downloads. A repeated full
production build, export/checksum verification and local website/API probe passed.
The test total above includes 15 staging/recovery tests and 23 hosted-runner
cleanup tests. Runner preparation requires 45 GiB free, preserves active runtimes
and the checkout, and removes only allowlisted optional SDKs or preloaded images
on the disposable local daemon. Hosted CI and production publication are tracked
on [PR #66](https://github.com/rewire-bio/rewire-database/pull/66) and issue #65.

## Scripted research decisions

### Splicing follow-up

Start from the visible **Use cases** navigation, search for `splicing`, select
DNA/genomes and clinical research, then open **Prioritise variants for splicing
experiments**. Reload the filtered URL and follow an evaluated configuration to
its record and back to the question and search results.

The intended answer is a bounded set of four exact matched MFASS configurations.
All four scored 8,297 of 8,324 held-out variants. Inspect both exclusion classes:
23 assembly-orientation mismatches and four canonical-transcript-span exclusions.
The latter are not established faulty variants, and missing scores are not
negative predictions. The task keeps its existing unreviewed/discovered status.
The page must show the reporter-assay endpoint, the lack of an established
top-100 precision difference, tie sensitivity and the difference between paired
contrast intervals and individual-condition uncertainty.

Deliberately unsupported interpretation: **“These results establish which model
will diagnose pathogenic variants in patient RNA.”** The page must answer no:
clinical applicability is not established, and reporter-assay ranking does not
demonstrate patient-RNA performance, pathogenicity classification or clinical
yield. The next step is validation in the intended population and workflow.

### Protein stability

Search for `protein stability` and open **Assess methods for protein stability
experiments**. Inspect the ESM-2 and fixed-seed random evidence panels, their exact
configuration records, protocol links, result provenance and execution recipes.

The intended answer is limited to a 47-residue AMFR construct and 2,972 variants:
820 single and 2,152 double substitutions. The two completed evaluations retain
separate protocols. Their values do not establish a matched winner, and one
random seed does not supply a chance-performance interval. Recorded section
timings are not total runtime; peak memory remains unreported.

The proposed single-substitution comparison remains visibly planned and
execution-blocked. EVCouplings/EVmutation must not appear as completed evaluations
or winners. Its public reviewed planning copy supplies the execution and
provenance prerequisites.

Deliberately unsupported interpretation: **“A stability score for this construct
establishes disease pathogenicity or general protein-engineering performance.”**
The page must answer no. Clinical pathogenicity, whole-protein function and
generalisation to other proteins remain outside the recorded evidence.

## Browser observations

The production export was served with Hosting and API emulators at
`http://127.0.0.1:5055/`. The walkthrough used the Codex in-app browser at
1280 × 720 and 390 × 844. This was a scripted agent walkthrough, not an external
user study or a complete assistive-technology audit.

| Journey or state | Observed result |
|---|---|
| Discovery | Homepage and desktop navigation expose **Use cases**. The mobile menu exposes the same route. Both questions appear without knowing a model or benchmark name. |
| Splicing search | Keyboard entry, native area/context selectors and Enter submission produced one result for `splicing`, DNA and genomes, clinical research. Reload preserved all three values and the result. |
| Record return | The S0 configuration link preserved the full question/filter context in `return_to`. Its **Back to results** link returned to the filtered question; **Back to use cases** retained the filters. Its reverse link attributed evidence only to S0. |
| Protein search and recipe | `protein stability` with proteins/complexes and research returned the protein question. The ESM-2 recipe opened the exact protocol recipe, and its return link retained the question/filter context. The random evaluation explicitly reported no verified recipe. |
| MFASS evidence | Four exact configurations and their 8,297/8,324 coverage were visible. Both exclusion classes, task status, null individual uncertainty and paired-contrast caveat were explicit. The clinical-scope notice rejected patient-RNA, pathogenicity and clinical-yield inference. |
| AMFR evidence | The 47-residue construct and 820-single/2,152-double cohort were explicit. ESM-2 and the seed-0 control had separate protocol panels. Section timings, missing peak memory and absent uncertainty were visible. The singles comparison stayed in **Planned work / Execution blocked**, with no measured EVmutation/EVCouplings result or winner. |
| Empty state | An unmatched question displayed zero matching use cases, suggested broader search/clearing filters and stated that absence does not establish model unsuitability. |
| Error state | A deliberately invalid cursor produced a recoverable loading error. **Retry** retained the error for the invalid request; **Clear filters** restored the two initial questions. No stale results were presented as a successful filtered response. |
| Mobile and keyboard | Both pages and the collection wrapped at 390 pixels with no page-wide horizontal overflow. The mobile menu and section selector worked. Result regions had visible keyboard focus, and arrow keys scrolled their 580-pixel tables inside 310-pixel regions. |
| Review and downloads | Review method, actor, date and limitations were visible. The download link pointed at the final release's `use-cases.json`; release and input digest matched the candidate. |

The deliberately unsupported interpretations in both scripts were rejected by
the visible scope and gap text. No new positive clinical suitability claim was
observed. The final inspected page had no captured browser warnings or errors.

Reviewed-copy links retained their canonical content-addressed public URLs and
were labelled separately from original repository locations. Direct browser
navigation to a Markdown copy was blocked by the browser client, so browser
rendering of that file is not claimed here. Local HTTP probes and archive checks
verified the served copies and their hashes. Canonical production URLs require
the separate deployment check; this local walkthrough does not establish that
the candidate has been published.

## Ownership and remaining validation

Repository maintainers own engineering, release and ongoing curation. The initial
source curation is labelled **Codex research curation / automated source review**.
The receipt binds the reviewed inputs and source bytes. Maintain the monthly and
evidence-change review cadence described in [use-cases.md](use-cases.md); this
does not create a scheduled automation.

Human scientific review remains unassigned under
[#31](https://github.com/rewire-bio/rewire-database/issues/31). The five external
researcher sessions proposed on roadmap
[#27](https://github.com/rewire-bio/rewire-database/issues/27) have not taken place.
These engineering checks do not establish user-task success or clinical
understanding in that population.
