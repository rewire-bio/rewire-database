# Use-case publication: questions lead evidence collection

Publication scope: ten new use-case definitions, alongside the seven existing pages.
The new questions have collection plans and no applicability mappings. They are
selected for the user decision, documented workflow and potential impact,
independently of present catalogue coverage.

## User needs and scope

| Clinical workflow | Research workflow |
| --- | --- |
| Rare-disease causal variant and gene prioritisation | Therapeutic target validation |
| Reanalysis of unresolved rare-disease cases | Regulatory variant and effector-gene follow-up |
| BRCA1/2 germline variant interpretation | Perturbation selection for a defined cellular response |
| Somatic small-variant oncogenicity | Single-cell annotation transfer |
| EGFR-mutant NSCLC actionability and resistance evidence review | Structural hypotheses for experiment planning |

The broader exploration considered 20 candidate workflows. These ten are a
focused product selection, not a measured cross-domain popularity ranking.
Professional guidance, commissioned services, documented implementations,
maintained research infrastructure and owner-reported adoption were distinguished
as different demand signals. Rewire usage analytics and user interviews were not
performed.

A useful question remains visible while comparative evidence is missing.
Collection status does not claim that a model is applicable or clinically
validated. Existing evidence-review requirements still govern future mappings.

## Published definition and plan

Each new page states the user, decision, inputs, expected output, biological
setting, exclusions and evidence gaps. The optional `collection_plan` adds:

- The collection status: planned or collecting.
- A falsifiable comparison question.
- Conventional baselines.
- Decision-relevant outcomes.
- Validation requirements.
- The next concrete collection task.

All ten start at **planned**. There is no claimed acquisition activity, human
scientific approval, independent replication or new experimental finding.
Cards and detail pages state the status, and the evidence section explains that
no model comparison has been collected for that question yet. Search, filters,
pagination and static detail routes include questions with no mappings.

The [collection backlog](use-case-collection-backlog-2026-09-28.json) preserves the
full candidate-source and acceptance-criteria plan from the exploration. Its
C1–C5 and R1–R5 identifiers are planning labels rather than catalogue record IDs.
No named reviewer is assigned by these plans.

## Scientific distinctions retained

- Rare-disease candidate recovery is evaluated at the patient-case level with
  review effort, coverage and adjudication. A balanced variant-classification
  set is a proxy.
- Reanalysis programme yield and method improvement are different comparisons.
  Method comparisons use the same refreshed knowledge, phenotypes and calls.
- Germline predisposition classification, somatic oncogenicity, tumour-specific
  actionability and person-level cancer risk are separate decisions.
- Cancer evidence review measures retrieval and correctly scoped interpretation.
  It does not infer treatment benefit or certify trial eligibility.
- Regulatory allele effects, element–gene links and disease causality have
  separate endpoints. Reporter and endogenous experiments are distinguished.
- Perturbation selection concerns a prespecified phenotype at a fixed test
  budget. Information-gain experiment design requires a separate evaluation.
- Target selection, cell annotation and structural prediction require independent
  transfer tests and useful conventional baselines. Intermediate model scores do
  not establish experimental or clinical success.

## Source and review provenance

Two new content-addressed source records preserve the authored clinical and
research workflow briefs and their primary-source references. Their origin is
Rewire documentation, not an external guideline, an original experimental study
or model-performance evidence. Source checks and separate automated content/code
reviews are recorded explicitly. Qualified human clinical review remains a
future evidence requirement.

The four source documents are bound by `data/omics/use-cases/review.json`,
archived with the release and available as public content-addressed copies.
Only the two new documentation source records are added to the scientific
catalogue. All 26,124 prior records are preserved exactly. The new release
therefore contains 26,126 records, 17 use cases and the same 17 mappings to
57 existing evaluations.

## Compatibility and release checks

The optional plan has no defaults, so historical inputs retain their exact
logical digests. The catalogue remains schema 1.1 and the sidecar schema 1.0;
the new optional property requires the updated parser for this release while old
artifacts remain readable. The API is deployed before activating the new
release. Previously published releases and source copies remain immutable.

Regression checks cover discovery and API resolution without mappings, absence
of invented evidence/backlinks, changed plan digests, unchanged historical
digests, exact preservation of all seven old questions and 17 mappings, and
archival restoration. Publication also requires the repository's full tests,
lint, service build, production website build, type checking, export checks and
Hosting/API emulator checks. Live verification checks the release-pinned API,
all ten pages, search and pagination.

The release receipt and deployment logs record the final checks and immutable
release identity. Publication of these definitions does not publish future
submissions or future evidence mappings automatically.
