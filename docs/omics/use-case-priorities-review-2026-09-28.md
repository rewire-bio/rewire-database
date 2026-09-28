# Publication review: question-led use cases

Automated independent review completed on 28 September 2026. These reviews do not provide human clinical approval.


---

## Clinical definitions

Reviewed by Codex on 28 September 2026 at 14:56 UTC.

**Disposition: PASS. No material scope, endpoint or unsupported clinical-claim issue found.**

This independent automated review compared `publish-clinical.json` and `publish-clinical-source.md` with the completed `use-case-priorities.md` and `evidence-backlog.json`. It checks the accuracy and consistency of workflow definitions and their sourced brief. It is not qualified clinical review, a fresh source-discovery exercise or validation of any model.

- **C1:** Candidate recovery at a stated review budget remains distinct from a confirmed diagnosis. The initial congenital-anomaly/developmental-disorder population, family/centre/time separation, unresolved cases and calling failures preserve the agreed case-level scope.
- **C2:** Programme yield is separated from method improvement. The proposed comparison gives both methods identical updated knowledge, phenotypes and calls; the historical unresolved cohort supplies the programme denominator. Variant reevaluation, whole-case reanalysis and changes in diagnostic knowledge are not conflated.
- **C3:** The initial question is limited to BRCA1/BRCA2 germline evidence review under versioned gene-specific criteria. Independent adjudication, severe errors and predictor circularity are explicit. Variant classification, future cancer risk and treatment choice remain separate; the source brief appropriately scopes the VUS and family-history statements.
- **C4:** Somatic SNV/small-indel oncogenicity preserves the oncogene versus tumour-suppressor distinction. Functional assays are supporting evidence; germline labels and therapeutic relevance are not substituted for independent oncogenicity judgments. Tumour-only findings retain uncertainty about origin.
- **C5:** The initial advanced EGFR-mutant NSCLC question evaluates evidence retrieval and review. Therapy history, progression, sampling, jurisdiction, evidence date, contradictions and native tiers are preserved. Treatment choice, benefit and trial eligibility are explicitly outside that endpoint. Permission and corrected-guidance dependencies remain visible.

All five comparisons are planned hypotheses, with conventional baselines and realistic outcomes. The brief identifies itself as Rewire's workflow definition rather than an independent guideline or model benchmark. It does not claim measured adoption, qualified human approval or clinical effectiveness. Its access limitations and need for further primary-source extraction are explicit.

Structural checks passed: five distinct IDs and slugs, five planned collection plans, clinical-research contexts, exact source-heading locators, automated Codex review attribution and no embedded mappings. No author files were changed. These definitions can proceed through the publication process without representing clinical sign-off or reviewed model applicability.


---

Research publication cross-review

Reviewed by Codex at **2026-09-28T14:53:47Z**. Inputs: `publish-research.json`, `publish-research-source.md`, the R1–R5 synthesis/backlog and `research-methods.md`. No author files were edited and no new source discovery was performed.

**Pass: no material scope, baseline, endpoint or unsupported factual issue found in this bounded review of the question definitions.**

- R1 preserves disease, candidate universe, modulation direction and fixed validation budget. Independent effects, rescue, failures and selectivity remain distinct from association, dependency and clinical success.
- R2 separates allele effects, element–gene linking and experimental selection. Comparator suitability is conditional on the endpoint; reporter activity, endogenous effects and disease causality are not conflated.
- R3 retains the agreed phenotype-hit objective. Expression is intermediate evidence, transfer settings remain separate, and random selection plus explicit tie handling make constant-response baselines meaningful for selection. Information-gain design remains outside scope.
- R4 preserves independent reference-transfer testing, unknown populations, label hierarchy and coverage. R5 separates structural accuracy from experimental utility and includes a conventional experimental-selection comparator.

The source brief retains the exploration’s factual qualifications: infrastructure is not measured adoption; challenge participation is not laboratory use; AlphaFold usage is owner-reported and does not establish complex-prediction success. No new performance claims appear. All five collection plans remain `planned`; IDs are unique and every citation locator matches its source heading.

This review concerns scientific integrity of definitions and collection plans, not model applicability, clinical validation or human expert approval. Source acquisition, numerical extraction and evaluation remain future work.

Reviewed SHA-256:

- JSON: `2dd91ef36ecb770aa87afde6df1dedfeb07f770d6bd2897f9073b49c3b2fcaa7`
- Source Markdown: `1f7c3d2d1e0ba852e4ae725bec2e77e55e0aa81496551242e3fbe9fee7662ae0`


---

Publication code review

Reviewed by Codex at **2026-09-28T14:56:17Z** in `/Volumes/Extreme SSD/rewire-database-issue-65`.

**Pass: no material issue found in this bounded static review.**

Reviewed the optional `collection_plan` schema, current source-byte bindings, index/detail rendering, collection-plan component, explorer navigation, related query/client paths and changed/new tests.

- **Compatibility:** The new field is optional with no defaults; absent historical fields stay absent. Present plans participate in the logical digest. Immutable release validation still reads archived artifacts independently of the expanded current-curation file inventory.
- **Source binding:** Both authored source files enter the existing reviewed-byte checks and content-addressed source-copy mechanism. The diff does not refresh fingerprints automatically or bypass source inventory and checksum checks.
- **Discoverability:** Listing, filtering, pagination and static route generation use all question definitions, regardless of mapping count. A zero-mapping question retains its source references and explicit plan.
- **Evidence integrity:** Backlinks and numerical results remain derived from active scoped mappings; plan metadata does not create either. Existing mappings remain rendered through the original evidence component.
- **Navigation and empty states:** Plan links preserve search/cursor parameters before the fragment. The detail page exposes a matching visible anchor and return context. Planned, collecting and historical cards remain distinct; empty evidence is not presented as evidence that no suitable methods exist.

The added tests cover absent-field digest behaviour, zero-mapping queries without model backlinks, plan visibility, status/empty states, historical rendering, filtered pagination and return links. I inspected these tests but did not execute tests or builds, as requested. Final generated-release and deployment verification remain with the root task.
