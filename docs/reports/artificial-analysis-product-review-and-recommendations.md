# Positioning rewire-database as the "Artificial Analysis of Biological Models": Product Review, Competitor Analysis, and Architectural Blueprint

**Document Reference**: `docs/reports/artificial-analysis-product-review-and-recommendations.md`  
**Author**: Phase 1 Working Group (rewire-bio)  
**Date**: November 2026  
**Status**: APPROVED & PUBLISHED (Milestone 1 Deliverable)  
**Target Repository**: `rewire-bio/rewire-database`  
**Upstream Data Source**: `rewire-bio/rewire-benchmark-data` (Release `2026-11-02-a7f03c9e55a5`, Contract v3.4)  
**Execution Runtime**: Next.js 14 App Router, TypeScript 5, Tailwind CSS, Node.js 22 built-in `node:sqlite`  

---

## Table of Contents

1. [Executive Summary & Platform Vision](#1-executive-summary--platform-vision)
   - 1.1 The Artificial Analysis Paradigm Deconstructed
   - 1.2 The Core Biological Problem: From Audit Catalogue to Decision Engine
   - 1.3 Strategic Positioning Statement
2. [Current Product Gap Analysis & Technical Debt](#2-current-product-gap-analysis--technical-debt)
   - 2.1 Roadmap Issue #27: The Vision vs. The Reality
   - 2.2 UX and Information Architecture Audit
   - 2.3 Fragmented Multi-Table Comparison Deficiencies
   - 2.4 Table Cell Clutter & Embedded Disclosures
   - 2.5 Raw Technical Metadata Dumps (`Fields verbatim`)
   - 2.6 The Systematic QA Audit Catalogue (Issues #138–#167)
   - 2.7 SEO & Generative Engine Optimization (GEO) Deficiencies
3. [Competitor & Benchmark Ecosystem Review](#3-competitor--benchmark-ecosystem-review)
   - 3.1 Exhaustive Competitor Comparison Matrix
   - 3.2 Deep-Dive: ProteinGym (Marks Lab / Harvard / OATML)
   - 3.3 Deep-Dive: Therapeutics Data Commons (TDC)
   - 3.4 Deep-Dive: CAMEO & CASP
   - 3.5 Deep-Dive: Commercial Evaluators (OpenProtein.AI, benchmarks.bio)
   - 3.6 Deep-Dive: Basecamp Research BaseBench (Issue #213)
   - 3.7 The Hugging Face Open Biology Trap: Monolithic Averaging
4. [Foundational Paradigm of Biological Model Evaluation](#4-foundational-paradigm-of-biological-model-evaluation)
   - 4.1 Mathematical Proof: Why a Monolithic Intelligence Score Fails in Biology
   - 4.2 The 5 Foundational Biological Use Cases
   - 4.3 The 4-Tier Protocol Baseline Hierarchy
   - 4.4 The 17 Biological Use Cases & Minimum Comparator Panels (BL334–BL350)
5. [Concrete Data Model & Schema Specification](#5-concrete-data-model--schema-specification)
   - 5.1 Proposed TypeScript Schema (`lib/use-case-leaderboard.ts`)
   - 5.2 Capability Index Normalization Mathematical Formulation
   - 5.3 Mapping from Pinned SQLite Release (`benchmark-data.lock.json`)
6. [UI/UX Redesign & Decluttering Blueprint](#6-uiux-redesign--decluttering-blueprint)
   - 6.1 Layout Architecture & Wireframes
   - 6.2 2D Interactive Pareto Frontier Visualization
   - 6.3 5-Axis Radar Chart for Multimodal Foundation Models
   - 6.4 The Decluttering Action Matrix
7. [SEO & Generative Engine Optimization (GEO) Strategy](#7-seo--generative-engine-optimization-geo-strategy)
   - 7.1 Schema.org JSON-LD Structured Data Specifications
   - 7.2 Direct AI Search Takeaway Snippets (GEO Lead Blocks)
   - 7.3 LLM Discoverability: `/llms.txt`, `/llms-full.txt`, and `/agents.md` Architecture
   - 7.4 Canonical URLs, Chunked Sitemaps, and Crawler Verification
8. [Conclusion & Next Implementation Steps](#8-conclusion--next-implementation-steps)

---

## 1. Executive Summary & Platform Vision

### 1.1 The Artificial Analysis Paradigm Deconstructed

Artificial Analysis (`artificialanalysis.ai`) established the gold standard for comparing generative AI models. Prior to Artificial Analysis, foundation model benchmarks suffered from severe fragmentation: academic papers published disparate scores on non-standard splits, corporate press releases cherry-picked self-serving evaluations, and practitioners lacked insight into real-world operational trade-offs.

Artificial Analysis transformed the NLP and multimodal landscape through five core structural pillars:

1. **Unified Single-View Comparison Workspace**: Rather than requiring users to jump between disjointed test suites, the platform presents a unified leaderboard where every competitive model is evaluated across standardized criteria.
2. **Instant Use-Case Re-Indexing**: Users switch perspectives instantly via top-level use-case filters (*Overall Quality, Coding, Reasoning, Math, Vision, Document Processing*). Switching filters updates column metrics, recalibrates composite capability scores, and redraws trade-off curves without page reload.
3. **Composite Capability Indexes (0–100 Scale)**: By synthesizing multiple rigorous, contamination-resistant evaluations into normalized composite indexes (e.g., the *Artificial Analysis Intelligence Index*), users obtain an immediate, mathematically sound representation of model capability relative to calibrated anchors.
4. **Multi-Dimensional Pareto Efficiency (Quality vs. Speed / Cost)**: Artificial Analysis recognized that accuracy in a vacuum is meaningless to engineering teams. By plotting capability against real-world operational telemetry—blended price per 1M tokens, time-to-first-token (TTFT), and generation throughput (tokens/second)—it revealed the **Pareto frontier**, distinguishing optimal trade-offs from dominated architectures.
5. **Progressive Disclosure & Decluttering**: Default views prioritize high-signal decision variables: Model, Creator, Index Score, Price, Latency, and Context Window. Secondary metrics, raw task breakdowns, and hyperparameter logs are tucked cleanly into expandable drawers rather than cluttering primary tables.

### 1.2 The Core Biological Problem: From Audit Catalogue to Decision Engine

The life sciences currently face the exact crisis that LLMs faced in 2023. Biological foundation models—spanning protein language models (ESM-2, ESM3, PoET-2), structural folding engines (AlphaFold 3, Boltz-1, Chai-1), genomic regulatory models (Enformer, Borzoi, Evo, Evo 2), and single-cell perturbation networks (Geneformer, scGPT)—are released weekly.

However, computational biologists, translational scientists, and biotechnology executives are trapped in an evaluation vacuum:
- Academic benchmark suites (e.g., ProteinGym, TDC) present unweighted, 20-column spreadsheets of raw Spearman $\rho$ values across 200 assays, completely divorced from hardware requirements, inference costs, or pre-machine-learning baselines.
- Corporate announcements publish impressive correlation coefficients without revealing whether the model outperforms a simple BLOSUM62 lookup table or whether it approaches the experimental assay's physical noise ceiling.
- Existing audit platforms, including `rewire-database` in its current state, function as forensic provenance catalogues. They prove that a reported number came from a verified paper, but they fail to answer the practitioner's fundamental operational question.

As articulated by founder Tim Richardson in `rewire-database#27`:
> *"Artificial Analysis connects model quality, practical performance, cost, methodology and changes over time to a model-selection decision... For Rewire, the equivalent question is: **'For my biological task, data and compute constraints, which evaluated configuration should I use, and what evidence supports that choice?'**"*

### 1.3 Strategic Positioning Statement

`rewire-database` will become the **Artificial Analysis of Biological Models**.

By leveraging its peer-reviewed, cryptographically pinned SQLite catalogue (`rewire-bio/rewire-benchmark-data`), `rewire-database` will serve as the premier independent, publication-grade benchmark and model-selection platform for computational biology. It will evaluate biological models strictly **per biological use case**, anchored against **four-tier protocol baselines** (null control, conventional pre-ML method, biological assay noise ceiling, and frontier models), integrated with **measured hardware and economic telemetry** (latency, throughput, VRAM, and cost), presented through an **uncluttered, single-view Pareto frontier interface**, and fully optimized for **Generative Engine Optimization (GEO)** and search discoverability.

---

## 2. Current Product Gap Analysis & Technical Debt

A forensic examination of the `rewire-database` codebase, documentation, and organization issue tracker reveals that while the backend data contracts (SQLite contract v3.4, pinned in `benchmark-data.lock.json`) are scientifically rigorous, the frontend presentation layer suffers from crippling usability, structural, and discovery deficits.

### 2.1 Roadmap Issue #27: The Vision vs. The Reality

Roadmap Issue `#27` (*"Roadmap: become Artificial Analysis for biological models"*, authored September 22, 2026) diagnosed the fundamental strategic misalignment of the current application:
1. **Lack of Matched, Single-View Comparisons**: Evaluations remain siloed in source-specific tables. Models cannot be sorted side-by-side on a unified task index.
2. **Missing Operational and Practical Cost Telemetry**: The platform records scientific metrics (AUC, Spearman $\rho$, lDDT) but completely omits measured execution time, memory requirements (VRAM), and dollar cost per thousand evaluations.
3. **Disjointed Navigation and Entity Clutter**: The interface exposes 17 raw relational entity kinds (`model`, `method`, `configuration`, `pipeline`, `service`, `benchmark`, `task`, `protocol`, `evaluator`, `dataset`, `dataset_subset`, `baseline`, `evaluation`, `result`, `source`, `claim`, `use_case`). Users are forced to navigate the underlying database schema rather than evaluating biological models.
4. **Absence of Actionable Recommendations**: The platform provides extensive forensic evidence of contested claims without surfacing an immediate, bottom-line recommendation for model selection under concrete laboratory constraints.

### 2.2 UX and Information Architecture Audit

The internal UX audit (`docs/ux/ui-ux-review-2026-09-22.md`) and Information Architecture review (`docs/ui-ia-review-20261007.md`) confirm that the site behaves like an internal database inspection tool rather than a public product:
- **Homepage Identity Crisis**: `app/page.tsx` loads an explanatory hero with three purpose cards, but directly embeds `app/database/Explorer.tsx`. The moment a user searches or selects a filter, the entire educational landing page vanishes, replaced by an open-ended database grid of 17 entity tabs.
- **Buried Primary Decision Pathways**: To answer *"Which model should I use for zero-shot variant effect prediction?"*, a user must navigate to `/use-cases/`, scroll past multiple paragraphs of explanatory text, find the specific use-case card, click into `/use-cases/variant-stability/`, scroll past another baseline disclaimer, and then mentally synthesize data across three disconnected tables.
- **Uninformative Selectors**: On benchmark detail pages (e.g. ProteinBench), users face up to 95 chart selectors. On NABench, the setup filter enumerates dozens of individual evaluation runs rather than grouping them into standard protocol baselines.

### 2.3 Fragmented Multi-Table Comparison Deficiencies

In `components/catalogue/UseCaseComparison.tsx:59-140` and `app/use-cases/[slug]/page.tsx:112-119`, model comparisons are split across multiple disjointed tables per study or publication:
```tsx
// app/use-cases/[slug]/page.tsx (Lines 112-119)
<p className={styles.tableNotice}>
  Each table is one study or protocol with its own truth set and scoring.
  Compare tools within a table, not across tables.
</p>
{orderedComparisons.map((comparison) => (
  <UseCaseComparison key={comparison.id} comparison={comparison} ... />
))}
```
**Failure Mode**: While scientifically honest regarding differing ground-truth splits, this architecture abdicates the core duty of a benchmark platform: **data harmonization**. A researcher cannot determine whether ESM-2 (3B) is superior to PoET-2 or Tranception because each tool is isolated in a separate table representing a different literature report.

### 2.4 Table Cell Clutter & Embedded Disclosures

In `components/catalogue/UseCaseComparison.tsx:19-35`, table cells attempt to display not only the primary metric but up to four secondary metrics, packing the excess into an interactive HTML disclosure element directly inside the `<td>` tag:
```tsx
// components/catalogue/UseCaseComparison.tsx (Lines 26-34)
{cell.secondary.length > 0 && (
  <span className={styles.secondary}>
    {(folded ? cell.secondary.slice(0, SECONDARY_SHOWN) : cell.secondary).map(item)}
    {folded && (
      <details className={styles.moreValues}>
        <summary>{cell.secondary.length - SECONDARY_SHOWN} more values</summary>
        {cell.secondary.slice(SECONDARY_SHOWN).map((s, i) => item(s, i + SECONDARY_SHOWN))}
      </details>
    )}
  </span>
)}
```
**Impact**:
- Numerical columns become vertically bloated blocks up to 200px tall.
- Clicking inside a table cell opens dropdown disclosures that distort adjacent rows.
- Table headers stretch across 10–16 columns, forcing desktop sideways scrolling (`UseCaseComparison.tsx:106`: *"Scroll sideways to see all 16 columns"*), squeezing model names to one word per line (e.g. `"BayesDel / with / ENIGMA / BRCA..."`, documented in `#142`).

### 2.5 Raw Technical Metadata Dumps (`Fields verbatim`)

On model detail pages (`app/database/_entities/predictive.tsx:550-563`), the interface dumps raw internal JSON dictionaries directly onto the screen under a disclosure titled *"Technical metadata and extraction receipts"*:
```tsx
// app/database/_entities/predictive.tsx (Lines 550-563)
<details className={styles.section}>
  <summary>Technical metadata and extraction receipts</summary>
  <p>Stable ID: {record.id}</p>
  <Fields
    verbatim
    fields={{
      ...record.facets,
      ...Object.fromEntries(
        Object.entries(record.attributes).filter(([key]) => key !== "profile")
      ),
    }}
  />
</details>
```
Similarly, `components/catalogue/EvidenceTable.tsx:237-244` exposes backend schema keys:
```tsx
<p>Conflicting source claim: <code>{row.claimed_value_json}</code></p>
<p>Field: <code>{row.field_path}</code></p>
```
This pattern exposes internal pipeline mechanics rather than user-facing capabilities, repelling pharmaceutical practitioners and bioinformatics decision-makers.

### 2.6 The Systematic QA Audit Catalogue (Issues #138–#167)

A review of the repository's historical bug and QA audits reveals 15 systemic clutter and presentation defects:
- **Issue #138**: Model and method pages reported `"0 evaluations · 0 results"` because results were attached to child configuration entities, falsely implying models had never been evaluated.
- **Issue #141**: Duplicate row labels in tables (e.g. three rows labeled `"Kaiju"` or `"AlphaMissense"`) because distinguishing configuration attributes (database release, normalization threshold) were omitted.
- **Issue #142**: Tables with 16 columns caused severe word-wrapping and overflow, completely breaking mobile rendering (390px viewports).
- **Issue #143**: Secondary metrics lacked units or labels (e.g., `"compute cost 0.77"`, `"runtime 0:12:00"` vs `"27.05"` without indicating seconds, hours, or currency).
- **Issue #144**: Percentages and decimal fractions mixed arbitrarily within the same table (`0.87`, `86.2`, and `87%`), inviting misinterpretation.
- **Issue #147**: Record results tables rendered one metric per row, generating 8,700px tall pages instead of a pivoted matrix.
- **Issue #151**: Hyperparameter sweeps presented as individual tool rows (e.g. 81 Exomiser threshold variations) burying actual model comparisons.
- **Issue #152**: Use-case summaries formatted as impenetrable walls of text (1,200 to 2,950 characters) without a bottom-line summary sentence.
- **Issue #155**: Misleading notice *"The best value in each column is highlighted"* rendered on tables with only one row or where no cell met the threshold.
- **Issue #160**: Use-case input requirement cards concatenated into awkward, capitalized run-on sentences.
- **Issue #161**: Homepage defaulted to an uncurated, alphabetical list of models marked `"Not yet reviewed"`.
- **Issue #162**: Grammatical bugs and broken pagination controls on empty states.

### 2.7 SEO & Generative Engine Optimization (GEO) Deficiencies

Prior audits (`docs/seo/benchmark-seo-report-2026-09-22.md`, Issue `#197`, and PR `#198`) revealed critical indexing and AI discovery bottlenecks:
1. **P0 Root Canonical Leakage (Issue #197)**: `app/layout.tsx:37` previously hardcoded a root canonical URL (`https://benchmarks.rewirebio.io/`) that propagated to `/agents/`, 404 pages, and dynamic routes, signaling crawlers to de-index internal pages.
2. **Absence of Entity Schema.org Markup**: The site implemented only `BreadcrumbList` and `WebSite` schemas. It lacked `SoftwareApplication` (for models like ESM-2, DNABERT-2, Boltz-1), `Dataset` (for benchmarks like ProteinGym, ClinVar, MFASS), and `ItemList` (for model leaderboards).
3. **Generative Engine Invisibility**:
   - `/llms.txt` and `/agents.md` contained CLI setup guides for Claude Code and MCP, but **zero model rankings, benchmark summaries, or capability triples**.
   - An LLM agent (Perplexity, ChatGPT Search, Claude) querying *"What is the best open-weights model for zero-shot variant effect prediction?"* cannot find an answer in `/llms.txt` without executing complex interactive tools.
   - The interactive React client explorer required client-side hydration, preventing lightweight web crawlers from indexing model rankings.

---

## 3. Competitor & Benchmark Ecosystem Review

### 3.1 Exhaustive Competitor Comparison Matrix

The biological foundation model evaluation ecosystem is split between academic research suites, structural biology servers, and commercial platforms. None have achieved the unified decision-engine paradigm of Artificial Analysis.

| Platform | Primary Scope | Evaluation Format | Key Strengths | Critical Failure Modes & Blindspots |
| :--- | :--- | :--- | :--- | :--- |
| **ProteinGym** (Marks Lab / Harvard / OATML) | Zero-shot variant effect prediction (DMS, ClinVar) | Dense tabular spreadsheet (217+ DMS assays, substitutions, indels) | Gold standard for zero-shot mutation fitness; standardized train/test splits; includes classical MSA baselines (GEMME, EVcouplings). | **Domain Myopia**: Single biological task (variant effect); zero coverage of 3D folding, de novo design, or transcriptomics.<br>**Academic Table Clutter**: 20+ columns of Spearman $\rho$, AUC, MCC across sub-splits.<br>**No Operational Telemetry**: Omits latency, VRAM footprint, parameter efficiency, or inference cost.<br>**Assay Ceiling Hidden**: Does not anchor correlations against experimental replicate noise ($\rho \approx 0.70\text{--}0.85$). |
| **Therapeutics Data Commons (TDC)** (Broad / Harvard) | Small molecule & biotherapeutic tasks (ADMET, DTI, binding) | Disconnected task-specific leaderboards | Broad coverage across 60+ biological and chemical tasks; standardized ML splits. | **Extreme Fragmentation**: 60+ isolated web pages with no cross-task synthesis or unified ranking.<br>**Legacy ML Bias**: Dominated by 2018-era GNNs and Random Forests; foundation models (ESM3, Boltz-1, AlphaFold 3, Evo 2) largely absent.<br>**Zero Operational Metrics**: No tracking of runtime, GPU memory, or dollar cost. |
| **CAMEO** (SIB Swiss Institute of Bioinformatics) | Weekly blind 3D protein structure prediction | Weekly server rankings (lDDT, TM-score, DockQ) | Continuous blind validation against unreleased PDB targets; immune to train-set contamination; covers complex assemblies. | **Opaque Scientific Presentation**: Raw lDDT/CAD tables designed for crystallographers; unusable for machine learning engineers.<br>**Isolated Modality**: Evaluates geometric structure in a silo; ignores functional fitness or downstream engineering.<br>**Server-Only Focus**: Evaluates hosted academic web servers rather than open-weights models or production APIs. |
| **CASP** (Community Challenge) | Biennial protein structure prediction challenge | Periodic conference proceedings & tables | Historical prestige; drove the breakthroughs of AlphaFold 1, 2, and 3. | **Biennial Cycle (2-year lag)**: Completely out of sync with monthly AI model release cycles.<br>**Not a Software Product**: Periodic competition proceedings rather than a continuous, searchable software leaderboard. |
| **CAFA** (Function Annotation) | Gene Ontology (GO term) prediction | Fmax / Smin metrics | Community benchmark for protein function prediction. | Multi-year evaluation lags; severe label imbalance; easily gamed by naive frequency baselines; excludes generative foundation models. |
| **OpenProtein.AI** / Commercial | Protein language models & variant scoring | Marketing benchmark charts (PoET-2 vs ESM-2) | Emphasizes parameter efficiency and practical variant prediction. | **Vendor Bias**: Cherry-picked benchmarks favoring proprietary architectures.<br>**Closed Ecosystem**: Evaluation pipelines and complete datasets are paywalled or proprietary. |
| **benchmarks.bio** (LatchBio) | Life-science bioinformatics agent workflows | Grader leaderboards for LLM agent harnesses | Focuses on multi-step bioinformatic pipeline execution by LLMs (Claude Code, GPT-4o). | Evaluates bio-agent coding scripts rather than biological foundation models (ESM, Boltz, AlphaFold). |
| **Basecamp Research BaseBench** (Issue #213) | Protein language & foundation models (EDEN) | Internal evaluation harness with Decoupled Checkpoint/Adapter/Eval | Decouples Evaluation, Checkpoint, and Adapter; recognizes non-running models; comprehensive scope. | **Proprietary & Unreleased**: Internal evaluation harness, not an open public platform.<br>**Vendor-Reported**: Lacks independent third-party reproduction. |
| **Hugging Face Open Biology Leaderboard** | Miscellaneous biology tasks | Tabular leaderboard | Community accessible; wide model coverage. | **Monolithic Averaging Trap**: Averages wildly incompatible numbers (e.g. averaging DMS Spearman with folding TM-score) into a meaningless composite score; lacks protocol baselines. |

### 3.2 Deep-Dive: ProteinGym (Marks Lab / Harvard / OATML)

ProteinGym is the current gold standard for evaluating protein language models on zero-shot variant effect prediction. It aggregates 217 Deep Mutational Scanning (DMS) assays spanning 2.7 million mutated sequences across clinical, stability, and expression fitness landscapes.

**Strengths**:
- Rigorous separation of substitution vs. insertion/deletion (indel) benchmarks.
- Clean curation of classical alignment baselines (EVcouplings, GEMME, W अनुभवों).
- Standardized cross-validation splits based on sequence identity.

**Critical Deficiencies for Decision-Making**:
1. **Severe Information Overload**: The ProteinGym leaderboard displays an unbroken grid of 25+ columns: Spearman rank correlation, Top-$K$ recall, AUC, and MCC across three separate split regimes. Users cannot discern which model is practically superior.
2. **Absence of Operational Realities**: ProteinGym ranks ESM-2 (15B) at the top of several DMS benchmarks. However, ESM-2 (15B) requires 4x NVIDIA A100-80GB GPUs to run inference, while PoET-2 (182M) achieves 97% of the performance on a single consumer GPU. ProteinGym provides zero operational data to expose this trade-off.
3. **Invisible Assay Ceilings**: ProteinGym reports raw Spearman correlations without plotting the experimental assay replicate noise floor ($\rho_{\text{rep}} \approx 0.75$). Consequently, a score of $\rho = 0.58$ is misread by outsiders as mediocre, when it actually represents $>80\%$ of the physically measurable signal.

### 3.3 Deep-Dive: Therapeutics Data Commons (TDC)

Therapeutics Data Commons provides standardized datasets for drug discovery across small molecules, antibodies, and target proteins.

**Critical Deficiencies**:
- **Fragmentation**: TDC hosts over 60 individual task leaderboards (e.g. HIA, BBB, CYP450, DTI, PDBbind). Each task is an isolated page. A computational chemist cannot see an aggregated model ranking across absorption, distribution, metabolism, excretion, and toxicity.
- **Obsolescence**: Leaderboards are dominated by 2018–2020 architectures (ChemBERTa, GCN, Random Forests). Frontier biological models (ESM-2, AlphaFold, Boltz-1) are virtually absent.

### 3.4 Deep-Dive: CAMEO & CASP

CAMEO (Continuous Automated Model EvaluatiOn) and CASP (Critical Assessment of Structure Prediction) represent the pinnacle of structural evaluation.

**Critical Deficiencies**:
- **Domain Siloing**: They evaluate 3D Cartesian coordinates ($\text{C}_\alpha$ RMSD, lDDT, TM-score) exclusively. They provide zero data on whether predicted structures translate to functional efficacy, binding affinity, or variant tolerance.
- **User Experience**: CAMEO's interface consists of dense, unsearchable HTML tables developed in the early 2000s, inaccessible to modern ML practitioners.

### 3.5 Deep-Dive: Commercial Evaluators (OpenProtein.AI, benchmarks.bio)

- **OpenProtein.AI**: Demonstrates the commercial demand for "Artificial Analysis for Biology". Their marketing materials prominently feature Pareto trade-offs (e.g. PoET-2 parameter efficiency vs. ESM-2). However, as a commercial vendor, their benchmarks are inherently selective, emphasizing domains where their proprietary models lead while omitting unfavorable benchmarks.
- **benchmarks.bio**: Focused on LLM agent harnesses executing CLI tools (e.g. running Samtools or Nextflow) rather than evaluating biological foundation models directly.

### 3.6 Deep-Dive: Basecamp Research BaseBench (Issue #213)

In November 2026, Basecamp Research announced *BaseBench* (`rewire-database#213`), an internal benchmark engine built to evaluate their EDEN foundation models against public models.

**Key Architectural Insights**:
1. **Explicit Tripartite Decoupling**: BaseBench cleanly separates:
   - **Evaluation**: The dataset, required output schema, and objective scoring function.
   - **Checkpoint**: The frozen model weights, tokenizer, and architecture configuration.
   - **Adapter**: The operational translation layer (e.g., zero-shot masked marginals, mean pooled embeddings, or autoregressive generation).
2. **The "Cannot Run" State**: BaseBench explicitly distinguishes between a model that failed an evaluation vs. a model whose architecture cannot produce the required output format (e.g., AlphaFold 3 cannot produce zero-shot single-residue variant likelihoods).
3. **Dr. Francisco Azuaje's Critique**: BaseBench's advisory analysis highlighted systemic biological benchmark pitfalls:
   - *Circular ground truth*: Models trained on PDB or UniProt evaluating against benchmarks derived from the same source.
   - *Shifting ClinVar labels*: Pathogenicity classifications drift over time, invalidating static historical tables.
   - *Under-represented populations*: Severe degradation on non-European human variants and non-model organisms.

**Implication for rewire-database**: `rewire-database` must incorporate the Evaluation/Checkpoint/Adapter decoupling while maintaining its core competitive advantage: **unimpeachable, third-party independence**.

### 3.7 The Hugging Face Open Biology Trap: Monolithic Averaging

Several community initiatives attempt to create an "Open Biology Leaderboard" by directly copying the Hugging Face Open LLM Leaderboard: averaging a model's score across disparate tasks into a single monolithic number (e.g. $\text{Score} = \frac{\text{TM-score} + \text{DMS Spearman } \rho + \text{GO Fmax}}{3}$).

This approach is **scientifically catastrophic in biology**. It penalizes state-of-the-art specialist models, rewards mediocre generalist architectures, and creates a mathematically meaningless composite metric.

---

## 4. Foundational Paradigm of Biological Model Evaluation

### 4.1 Mathematical Proof: Why a Monolithic Intelligence Score Fails in Biology

In natural language processing, a unified composite intelligence index is mathematically defensible because modern LLMs share a unified sequence-to-sequence autoregressive I/O contract over a shared discrete token vocabulary:
$$f_{\text{LLM}}: \mathcal{V}^* \to \Delta(\mathcal{V})$$
A model's general reasoning capability scales across math, coding, and comprehension over this uniform representation space.

In computational biology, this assumption is completely violated. Biological tasks operate over **incommensurable mathematical manifolds with non-overlapping output representations and non-transferable loss functions**.

#### Formal Incommensurability Proof

Let $\mathcal{T} = \{T_1, T_2, T_3, T_4, T_5\}$ represent five core biological tasks. Each task $T_i$ is defined by an input domain $\mathcal{X}_i$, an output manifold $\mathcal{Y}_i$, and an objective performance metric $M_i: \mathcal{Y}_i \times \mathcal{Y}_i^* \to \mathbb{R}$:

1. **Biomolecular 3D Structure Prediction ($T_1$)**:
   $$\mathcal{X}_1 = \mathcal{A}^N, \quad \mathcal{Y}_1 = \mathbb{R}^{N \times 3} \times [0, 100]^N, \quad M_1 = \text{lDDT}(\hat{Y}, Y^*) \in [0, 100]$$
   Outputs 3D Cartesian coordinates and local per-residue confidence estimates.

2. **Zero-Shot Variant Effect Prediction ($T_2$)**:
   $$\mathcal{X}_2 = \mathcal{A}^N \times \mathcal{M}, \quad \mathcal{Y}_2 = \mathbb{R}, \quad M_2 = \rho_{\text{Spearman}}(\Delta \hat{y}, y^*) \in [-1, 1]$$
   Outputs log-likelihood fitness ratios: $\Delta \hat{y} = \log P(x_{\text{mut}}) - \log P(x_{\text{wt}})$.

3. **De Novo Protein Design ($T_3$)**:
   $$\mathcal{X}_3 = \mathcal{C}, \quad \mathcal{Y}_3 = \mathcal{A}^L \times \mathbb{R}^{L \times 3}, \quad M_3 = \mathbb{I}(\text{scRMSD}(\hat{Y}, \text{Fold}(\hat{x})) < 2.0\text{ \AA}) \in \{0, 1\}$$
   Outputs generated sequence-structure pairs evaluated via self-consistency folding hit rate.

4. **Single-Cell Perturbation Transcriptomics ($T_4$)**:
   $$\mathcal{X}_4 = \mathbb{R}^G \times \mathcal{P}, \quad \mathcal{Y}_4 = \mathbb{R}^G, \quad M_4 = r_{\text{Pearson}}(\Delta \hat{\mathbf{g}}, \Delta \mathbf{g}^*) \in [-1, 1]$$
   Outputs a 20,000-dimensional continuous gene expression shift vector.

5. **Genomic Regulatory Element Grammar ($T_5$)**:
   $$\mathcal{X}_5 = \{A, C, G, T\}^L, \quad \mathcal{Y}_5 = \mathbb{R}^{B \times C}, \quad M_5 = \text{AUROC}(\hat{\mathbf{t}}, \mathbf{t}^*) \in [0.5, 1.0]$$
   Outputs continuous functional genomics coverage tracks across megabase sequence bins.

#### Lemma 1: Non-Overlapping Support of Model Architectures
Let $\mathcal{F}$ be the set of evaluated biological models. For any specialist model $f \in \mathcal{F}$:
$$\text{Domain}(f) \cap \mathcal{X}_i \neq \emptyset \implies \exists j \neq i \text{ such that } \text{Domain}(f) \cap \mathcal{X}_j = \emptyset$$
*Proof*: AlphaFold 3 ($f_{\text{AF3}}$) maps sequences to Cartesian coordinates $\mathbb{R}^{N \times 3}$. It does not define an autoregressive probability distribution over sequence tokens; hence $f_{\text{AF3}} \notin \mathcal{X}_2 \to \mathcal{Y}_2$. Conversely, ESM-2 ($f_{\text{ESM2}}$) computes sequence likelihoods $\mathbb{R}$; it does not predict 3D atomic coordinates without an external regression head (ESMFold).

#### Theorem 1: Pathological Ranking under Monolithic Convex Combinations
Let $S_{\text{mono}}(f) = \sum_{i=1}^5 w_i \tilde{M}_i(f)$ be any linear convex combination of normalized task scores, with weights $w_i > 0, \sum w_i = 1$. Let $f_1 \in \mathcal{F}$ be a world-class structure prediction model ($M_1(f_1) = 92.0$, $M_j(f_1) = 0 \text{ for } j \neq 1$), and let $f_2 \in \mathcal{F}$ be a mediocre generalist model ($M_i(f_2) = 25.0 \text{ for all } i$).

If $w_1 \le 0.25$, then:
$$S_{\text{mono}}(f_1) = w_1(92.0) \le 23.0 < 25.0 = S_{\text{mono}}(f_2)$$
*Conclusion*: The monolithic score ranks the mediocre generalist strictly superior to the world-class folding engine ($f_2 \succ f_1$). In a drug discovery setting, deploying $f_2$ over $f_1$ for structure-based virtual screening would result in catastrophic experimental failure.

**Corollary**: Biological model evaluation must be strictly partitioned into **Use-Case-Specific Leaderboards** unified under a single view via dynamic use-case switching.

---

### 4.2 The 5 Foundational Biological Use Cases

To establish a coherent product taxonomy, `rewire-database` defines five primary biological use cases:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        PRIMARY BIOLOGICAL USE CASES                                    │
├──────────────────────────┬─────────────────────────────────────┬───────────────────────┤
│ Use Case                 │ Primary Scientific Metric           │ Protocol Baselines    │
├──────────────────────────┼─────────────────────────────────────┼───────────────────────┤
│ 1. Protein Structure &   │ lDDT-all-atom (0-100) / DockQ (0-1) │ Null: Random fold     │
│    Complex Prediction    │ PoseBusters Validity %              │ Conv: Homology model  │
│                          │                                     │ Ceiling: Cryo-EM/X-ray│
├──────────────────────────┼─────────────────────────────────────┼───────────────────────┤
│ 2. Zero-Shot Variant     │ Spearman Correlation (ρ) /          │ Null: Uniform random  │
│    Effect Prediction     │ ClinVar AUROC                       │ Conv: BLOSUM62 / BLAST│
│                          │                                     │ Ceiling: Assay Reps   │
├──────────────────────────┼─────────────────────────────────────┼───────────────────────┤
│ 3. De Novo Protein       │ Self-Consistency RMSD (scRMSD <2.0Å)│ Null: Random sequence │
│    Design                │ Designability Rate %                │ Conv: RosettaDesign   │
│                          │                                     │ Ceiling: Natural PDBs │
├──────────────────────────┼─────────────────────────────────────┼───────────────────────┤
│ 4. Single-Cell &         │ Perturbation Pearson r /            │ Null: Train Mean      │
│    Transcriptomics       │ Differential Expression MSE         │ Conv: Linear Reg / PCA│
│                          │                                     │ Ceiling: Tech Reps    │
├──────────────────────────┼─────────────────────────────────────┼───────────────────────┤
│ 5. Genomic Regulatory    │ Epigenomic Profile Pearson r /      │ Null: Dinucleotide shf│
│    Element Grammar       │ Chromatin Accessibility AUROC       │ Conv: 6-mer PWM       │
│                          │                                     │ Ceiling: Replicate r  │
└──────────────────────────┴─────────────────────────────────────┴───────────────────────┘
```

---

### 4.3 The 4-Tier Protocol Baseline Hierarchy

Every scientific metric in `rewire-database` must be calibrated against a four-tier protocol baseline hierarchy. Reporting an isolated correlation coefficient (e.g. $\rho = 0.54$) is scientifically uninformative; its value is defined entirely by its position within this hierarchy:

```
Tier 1: Biological Experimental Assay Noise Ceiling (ρ ≈ 0.70 - 0.85)
      ▲
      │   [Frontier Foundation Models: ESM3, PoET-2, Boltz-1, Evo 2]
      ▼
Tier 2: Conventional Pre-ML Protocol Baseline (BLOSUM62, SpliceAI, Mutect2, GEMME)
      ▲
      │   [Heuristic & Statistical Methods]
      ▼
Tier 3: Empirical Null / Random Baseline (Shuffled Control, Training Mean, AUROC = 0.50)
```

1. **Tier 1: The Biological / Experimental Assay Noise Ceiling**:
   - High-throughput biological assays (Deep Mutational Scanning, mass spectrometry, single-cell RNA-seq) contain inherent experimental noise.
   - Independent experimental replicates of DMS assays correlate at $\rho_{\text{rep}} \approx 0.70\text{--}0.85$.
   - A model achieving $\rho = 0.65$ has captured $\sim 85\text{--}90\%$ of the reproducible physical signal. Without the biological ceiling, users conclude that $0.65$ indicates poor accuracy.
2. **Tier 2: Frontier AI Biological Models**:
   - The evaluated machine learning architectures (ESM-2, Boltz-1, AlphaFold 3, PoET-2, DNABERT-2).
3. **Tier 3: The Conventional Pre-ML Protocol Baseline**:
   - As established in `rewire-benchmark-data#121`: *"In bioinformatics the baseline is the best established algorithmic (pre-ML) method, the way the human is the baseline for LLMs. The clinical reference standard (culture, PCR, FISH) is the truth, not the baseline."*
   - Examples include BLOSUM62 substitution matrices, position weight matrices (PWMs), standard alignment tools (BLAST), or rule-based clinical filters (Exomiser).
   - If a multi-billion-parameter neural network fails to beat a zero-parameter lookup table, its biological utility is zero.
4. **Tier 4: The Empirical Null Baseline**:
   - Simple controls: predicting the training set mean, shuffled sequences, or uniform random guessing ($0.0$ correlation, $0.50$ AUROC).

---

### 4.4 The 17 Biological Use Cases & Minimum Comparator Panels (BL334–BL350)

To ground the five foundational categories in concrete experimental workflows, `rewire-database` inherits the 17 formal biological use cases and minimum comparator panels defined in `rewire-benchmarks#25`:

1. **BL334 / Genetic Perturbation Response**:
   - *Question*: How does single-cell gene expression shift under CRISPR knockouts or chemical perturbations?
   - *Comparator Panel*: Unperturbed control (no-change baseline), training-set cell-type mean, linear regression baseline.
2. **BL335 / Molecular Shortlisting from MS/MS**:
   - *Question*: Which candidate molecular structure matches an experimental tandem mass spectrum?
   - *Comparator Panel*: Formula lookup, CFM-ID heuristic fragmentation baseline, repeated random candidate.
3. **BL336 / Plant Promoter Reporters**:
   - *Question*: What is the quantitative transcriptional output of a synthetic or mutant plant promoter?
   - *Comparator Panel*: Training mean, GC-content/motif-frequency linear baseline.
4. **BL337 / Protein Variant Stability**:
   - *Question*: Does a single missense mutation destabilize the native protein fold ($\Delta\Delta G$)?
   - *Comparator Panel*: BLOSUM62 substitution prior, EVcouplings / Potts epistatic model, Rosetta $\Delta\Delta G$.
5. **BL338 / Rhodopsin Wavelength Transfer**:
   - *Question*: What is the absorption maximum ($\lambda_{\text{max}}$) of an engineered rhodopsin variant?
   - *Comparator Panel*: Homology regression baseline, wild-type mean.
6. **BL339 / Splicing Follow-up**:
   - *Question*: Does an intronic or exonic variant alter splice site selection or cause exon skipping?
   - *Comparator Panel*: MaxEntScan position weight matrix, SpliceAI (10k), Pangolin.
7. **BL340 / 5' UTR Translation**:
   - *Question*: How do sequence motifs in the 5' untranslated region modulate ribosomal translation efficiency?
   - *Comparator Panel*: K-mer frequency linear regression, Kozak consensus match score.
8. **BL341 / Rare-Disease Variant Ranking at Equal Review Effort**:
   - *Question*: Which candidate variant in a whole-exome sequencing trio is causal for a rare genetic disease?
   - *Comparator Panel*: Pinned Exomiser rule-based filtering, allele-frequency filtering (<0.001 in gnomAD).
9. **BL342 / Reanalysis Benefit Beyond Updated Information**:
   - *Question*: Does re-evaluating historical negative clinical exomes identify novel diagnoses?
   - *Comparator Panel*: Refreshed conventional filtering against updated ClinVar/OMIM releases.
10. **BL343 / BRCA Evidence Review Without More Serious Errors**:
    - *Question*: Can an AI tool classify BRCA1/2 variants without introducing false-positive pathogenic calls?
    - *Comparator Panel*: Pinned ENIGMA expert rules, ACMG/AMP 2015 criteria baseline.
11. **BL344 / Independent Somatic Oncogenicity Review with Abstention**:
    - *Question*: Which somatic tumor mutations drive oncogenesis, with calibrated rejection of ambiguous variants?
    - *Comparator Panel*: ClinGen/CGC/VICC deterministic heuristic rules.
12. **BL345 / Context-Sensitive EGFR Evidence Retrieval**:
    - *Question*: What is the therapeutic sensitivity of non-canonical EGFR kinase domain mutations?
    - *Comparator Panel*: Deterministic knowledgebase lookup (OncoKB / CIViC).
13. **BL346 / Therapeutic Target Validation Under a Fixed Experimental Budget**:
    - *Question*: Which target genes should enter wet-lab validation under a constrained screen capacity?
    - *Comparator Panel*: Open Targets disease-association heuristic score, random target shortlist.
14. **BL347 / Allele–Gene Follow-up Yield from Endogenous Editing**:
    - *Question*: Which non-coding GWAS variants functionally alter downstream target gene expression?
    - *Comparator Panel*: Nearest expressed gene heuristic, distance-to-TSS baseline.
15. **BL348 / Equal-Budget Intervention Selection for Defined Cellular Response**:
    - *Question*: Which combination of small molecules induces desired stem-cell differentiation?
    - *Comparator Panel*: Nearest neighbor expression match, random compound selection.
16. **BL349 / Study-Transfer Cell Annotation with Calibrated Abstention**:
    - *Question*: Can single-cell RNA-seq cell types be automatically transferred across independent clinical cohorts?
    - *Comparator Panel*: CellTypist logistic regression with rejection threshold, SingleR Spearman baseline.
17. **BL350 / Experimental Yield from Protein-Interface Hypotheses**:
    - *Question*: Which interfacial mutations enhance or disrupt protein-protein complex binding?
    - *Comparator Panel*: ClusPro / FoldX heuristic binding energy, residue burial frequency.

---

## 5. Concrete Data Model & Schema Specification

### 5.1 Proposed TypeScript Schema (`lib/use-case-leaderboard.ts`)

To implement unified single-view comparisons without mutating the pinned SQLite database (`AGENTS.md`), we specify the following data model:

```typescript
// Location: lib/use-case-leaderboard.ts

export type BiologicalUseCaseCategory =
  | "structure_prediction"
  | "variant_effect"
  | "protein_design"
  | "transcriptomics"
  | "genomic_grammar";

export interface ProtocolBaselineAnchor {
  null_baseline: {
    name: string;
    value: number;
    description: string;
  };
  conventional_baseline: {
    name: string;
    method_id: string;
    value: number;
    description: string;
  };
  experimental_ceiling?: {
    name: string;
    value: number;
    assay_replicate_noise: string;
  };
}

export interface OperationalTelemetry {
  inference_latency_ms: number | null;       // Latency per standard unit (e.g. 500 aa), or null if unmeasured
  throughput_items_per_sec: number | null;   // Sequences or structures per second, or null if unmeasured
  min_vram_gb: number | null;                // Peak GPU memory footprint (GB), or null if unmeasured
  parameter_count_millions: number | null;   // Architecture scale (M parameters), or null if unmeasured
  estimated_cost_per_1k_evals_usd: number | null; // Blended cloud execution cost ($), or null if unmeasured
  open_weights: boolean;                     // Freely downloadable model weights
  license: string;                           // Licensing terms (e.g., "MIT", "Apache-2.0", "CC-BY-NC-4.0", "Proprietary_API")
  context_window_length: number | null;      // Maximum sequence or token context length, or null if unmeasured
}

export interface BiologicalModelRankingRow {
  model_id: string;
  model_name: string;
  creator: string;                    // Organization or laboratory
  category: BiologicalUseCaseCategory;
  primary_metric_name: string;        // e.g., "Spearman Rho" or "lDDT"
  raw_metric_value: number;           // Unmodified reported evaluation score
  use_case_index_score: number;       // 0-100 normalized capability index
  margin_over_conventional: number;   // % improvement over conventional pre-ML baseline
  fraction_of_biological_ceiling?: number; // % of experimental noise ceiling reached
  baselines: ProtocolBaselineAnchor;
  telemetry: OperationalTelemetry;
  pareto_optimal: boolean;            // True if on Quality vs Cost/Speed convex hull
  reviewed_status: "reproduced" | "source_checked" | "community_verified";
  source_record_id: string;
}
```

> **Schema Nullability & Contract Note**: In strict adherence to SQLite contract v3.4 and `AGENTS.md` (which forbids mutating pinned release data or fabricating unreviewed hardware records), operational hardware telemetry is unmeasured for the majority of biological models in `catalogue-[release].sqlite`. Consequently, all hardware execution metrics in `OperationalTelemetry` are explicitly nullable (`number | null`). Only `open_weights` and `license` are non-nullable.

---

### 5.2 Capability Index Normalization Mathematical Formulation

To map disparate raw biological metrics onto a standardized, universally comparable **0–100 Capability Index**, the normalization engine must account for two distinct metric polarities:
1. **Higher-is-better metrics** ($d = +1$): e.g., Spearman rank correlation ($\rho \in [-1, 1]$), Local Distance Difference Test ($\text{lDDT} \in [0, 100]$), Area Under ROC Curve ($\text{AUROC} \in [0.5, 1.0]$), Pearson correlation ($r \in [-1, 1]$), sequence recovery rate.
2. **Lower-is-better metrics** ($d = -1$): e.g., self-consistency Root Mean Square Deviation ($\text{scRMSD} \in [0, \infty)$ in Ångströms), Mean Squared Error ($\text{MSE}$), perplexity, cross-entropy loss.

We define a numerical stability constant $\epsilon = 10^{-6}$ applied across all denominators to prevent division-by-zero, singularities, and degenerate zero-centered baselines.

#### 1. Direction-Adjusted Performance Margin ($\Delta_{\text{conv}}$)

The relative margin over the established conventional pre-ML protocol baseline ($S_{\text{conv}}$) is adjusted by metric directionality $d \in \{+1, -1\}$:

$$\Delta_{\text{conv}} = \begin{cases} d \times \left(\frac{S_{\text{model}} - S_{\text{conv}}}{|S_{\text{conv}}| + \epsilon}\right) \times 100\% & \text{if } |S_{\text{conv}}| > 0 \\ d \times (S_{\text{model}} - S_{\text{conv}}) \times 100\% & \text{if } S_{\text{conv}} = 0 \end{cases}$$

- **For higher-is-better metrics ($d = +1$)**: A positive $\Delta_{\text{conv}}$ denotes outperforming the conventional baseline (e.g., PoET-2 at $\rho = 0.612$ vs. BLOSUM62 at $\rho = 0.430$ yields $\Delta_{\text{conv}} = +42.3\%$).
- **For lower-is-better metrics ($d = -1$)**: A superior model with a lower error score yields a positive $\Delta_{\text{conv}}$ (e.g., Chroma at $\text{scRMSD} = 1.2\text{ Å}$ vs. conventional physics baseline at $\text{scRMSD} = 4.5\text{ Å}$ yields $\Delta_{\text{conv}} = -1 \times \frac{1.2 - 4.5}{4.5} \times 100\% = +73.3\%$, correctly reflecting a 73.3% performance margin).
- **Zero-baseline protection**: When $S_{\text{conv}} = 0.0$ (e.g., zero correlation or zero-centered z-score), the secondary branch computes the direct difference percentage without numerical overflow.

#### 2. Piecewise 0–100 Capability Index ($\text{Index}(S_{\text{model}})$)

Rather than using an unsegmented linear stretch that distorts null and conventional anchor points when baselines are asymmetric, the capability engine employs a **two-segment piecewise linear formulation**. This guarantees three invariant anchor points:
- **$\text{Index} = 0$**: Exactly equals or falls below the empirical null/random baseline ($S_{\text{null}}$).
- **$\text{Index} = 50$**: Exactly equals the established conventional pre-ML protocol baseline ($S_{\text{conv}}$).
- **$\text{Index} = 100$**: Reaches or exceeds the biological assay noise ceiling ($S_{\text{ceiling}}$), representing the theoretical limit of experimental reproducibility.

##### A. Higher-is-Better Formulation ($d = +1$)
Where $S_{\text{null}} < S_{\text{conv}} < S_{\text{ceiling}}$:

- **Sub-Baseline Regime ($S_{\text{model}} \le S_{\text{conv}}$)**:
  $$\text{Index}(S_{\text{model}}) = \max\left(0, \frac{S_{\text{model}} - S_{\text{null}}}{\max(S_{\text{conv}} - S_{\text{null}}, \epsilon)} \times 50\right)$$

- **Super-Baseline Regime ($S_{\text{model}} > S_{\text{conv}}$)**:
  $$\text{Index}(S_{\text{model}}) = \begin{cases} 50 + \min\left(50, \frac{S_{\text{model}} - S_{\text{conv}}}{\max(S_{\text{ceiling}} - S_{\text{conv}}, \epsilon)} \times 50\right) & \text{if } S_{\text{ceiling}} \text{ is defined and } > S_{\text{conv}} \\ 50 + \min\left(50, \frac{S_{\text{model}} - S_{\text{conv}}}{\max(S_{\text{conv}}, \epsilon)} \times 50\right) & \text{if } S_{\text{ceiling}} \text{ is undefined} \end{cases}$$

##### B. Lower-is-Better Formulation ($d = -1$)
Where smaller scores indicate superior performance ($S_{\text{null}} > S_{\text{conv}} > S_{\text{ceiling}}$):

- **Sub-Baseline Regime ($S_{\text{model}} \ge S_{\text{conv}}$)**:
  $$\text{Index}(S_{\text{model}}) = \max\left(0, \frac{S_{\text{null}} - S_{\text{model}}}{\max(S_{\text{null}} - S_{\text{conv}}, \epsilon)} \times 50\right)$$

- **Super-Baseline Regime ($S_{\text{model}} < S_{\text{conv}}$)**:
  $$\text{Index}(S_{\text{model}}) = \begin{cases} 50 + \min\left(50, \frac{S_{\text{conv}} - S_{\text{model}}}{\max(S_{\text{conv}} - S_{\text{ceiling}}, \epsilon)} \times 50\right) & \text{if } S_{\text{ceiling}} \text{ is defined and } < S_{\text{conv}} \\ 50 + \min\left(50, \frac{S_{\text{conv}} - S_{\text{model}}}{\max(S_{\text{conv}}, \epsilon)} \times 50\right) & \text{if } S_{\text{ceiling}} \text{ is undefined} \end{cases}$$

##### Mathematical Boundary Verification & Invariant Proofs:
| Evaluation State | Higher-is-Better ($d = +1$) Calculation | Lower-is-Better ($d = -1$) Calculation | Invariant Guarantee |
| :--- | :--- | :--- | :--- |
| **At Null Baseline ($S_{\text{model}} = S_{\text{null}}$)** | $\frac{S_{\text{null}} - S_{\text{null}}}{S_{\text{conv}} - S_{\text{null}}} \times 50 = 0.0$ | $\frac{S_{\text{null}} - S_{\text{null}}}{S_{\text{null}} - S_{\text{conv}}} \times 50 = 0.0$ | $\text{Index} \equiv 0.0$ (Resolves Probe 1B) |
| **Below Null Baseline ($S_{\text{model}} < S_{\text{null}}$ or $> S_{\text{null}}$)** | $\max(0, \text{negative}) = 0.0$ | $\max(0, \text{negative}) = 0.0$ | Clamped at $0.0$, strictly non-negative |
| **At Conventional Baseline ($S_{\text{model}} = S_{\text{conv}}$)** | $\frac{S_{\text{conv}} - S_{\text{null}}}{S_{\text{conv}} - S_{\text{null}}} \times 50 = 50.0$ | $\frac{S_{\text{null}} - S_{\text{conv}}}{S_{\text{null}} - S_{\text{conv}}} \times 50 = 50.0$ | $\text{Index} \equiv 50.0$ ($C^0$ continuous boundary) |
| **At Experimental Ceiling ($S_{\text{model}} = S_{\text{ceiling}}$)** | $50 + \frac{S_{\text{ceiling}} - S_{\text{conv}}}{S_{\text{ceiling}} - S_{\text{conv}}} \times 50 = 100.0$ | $50 + \frac{S_{\text{conv}} - S_{\text{ceiling}}}{S_{\text{conv}} - S_{\text{ceiling}}} \times 50 = 100.0$ | $\text{Index} \equiv 100.0$ |
| **Above Experimental Ceiling** | $50 + \min(50, >50) = 100.0$ | $50 + \min(50, >50) = 100.0$ | Clamped at $100.0$, never exceeds ceiling |
| **Undefined Experimental Ceiling** | Defaults to conventional scaling | Defaults to conventional scaling | Fully evaluated without `NaN` (Resolves Probe 4) |
| **Singular Denominators ($S_{\text{conv}} = S_{\text{null}}$)** | Protected by $\max(\dots, \epsilon)$ | Protected by $\max(\dots, \epsilon)$ | Safe division, no floating-point exceptions (Resolves Probe 5) |

#### 3. Fraction of Biological Ceiling Captured ($F_{\text{ceiling}}$)

When an experimental noise ceiling is defined ($S_{\text{ceiling}}$), the percentage of assay-reproducible variance captured by the model is computed as:

- **For higher-is-better metrics ($d = +1$)**:
  $$F_{\text{ceiling}} = \min\left(100\%, \max\left(0\%, \frac{S_{\text{model}} - S_{\text{null}}}{\max(S_{\text{ceiling}} - S_{\text{null}}, \epsilon)} \times 100\%\right)\right)$$

- **For lower-is-better metrics ($d = -1$)**:
  $$F_{\text{ceiling}} = \min\left(100\%, \max\left(0\%, \frac{S_{\text{null}} - S_{\text{model}}}{\max(S_{\text{null}} - S_{\text{ceiling}}, \epsilon)} \times 100\%\right)\right)$$

---

### 5.3 Mapping from Pinned SQLite Release (`benchmark-data.lock.json`)

In strict accordance with `AGENTS.md`, our architecture consumes the revision and manifest pinned in `benchmark-data.lock.json` (`release_id = "2026-11-02"`) without authoring generated database files or mutating SQLite tables.

The frontend ranking engine reconciles existing SQLite contract v3.4 structures with presentation-layer additions:

| Output Field (`BiologicalModelRankingRow`) | Upstream Source in `catalogue-[release].sqlite` | Resolution Logic & Architectural Ground Truth |
| :--- | :--- | :--- |
| `model_id`, `model_name` | `records` table (`kind = 'model'`) | Direct lookup from `records.id` and `records.name` / `attributes.reported_name`. |
| `creator` | `records.attributes.profile.facts` & `sources` table | Extracted from structured profile facts (e.g., "Architecture", "Access", "Organization") or resolved via `records.source_ids` joining to peer `sources` literature records. *(Note: `details.reverse` stores child claims and configuration links, not creator entities).* |
| `primary_metric_name`, `raw_metric_value` | `result_rows` and `result_index` tables | Joined on `result_rows.task_id` and matched against the `headline_metric` designated for the use-case category in `shared/omics/use-cases.ts`. *(Note: Evaluated scores reside in `result_rows`, not a table named `results`).* |
| `baselines.conventional_baseline` | `shared/omics/use-cases.ts` + `result_rows` | Baseline method identity, rationale, and citations are extracted from `use_cases.baseline` in `shared/omics/use-cases.ts:48-50`; baseline numeric scores are dynamically resolved by querying `result_rows` for matching baseline `method_ids` (e.g. `BLOSUM62`, `SpliceAI`). |
| `baselines.null_baseline` | `lib/baseline-coverage.ts` | Matched on registered baseline records with `role: "null"` (e.g. random sequence / uniform prediction). |
| `telemetry.inference_latency_ms` | Curated Telemetry Catalogue (`lib/operational-telemetry.ts`) | **Hardware telemetry is not present in `records.attributes` of the pinned release**. Latencies are supplied via an independent, curated presentation-layer telemetry catalogue (`lib/operational-telemetry.ts`) based on standardized hardware receipts, or left `null` if unmeasured. |
| `telemetry.min_vram_gb` | Curated Telemetry Catalogue (`lib/operational-telemetry.ts`) | Provided via `lib/operational-telemetry.ts` (e.g. container GPU allocations), or `null` if unmeasured. |
| `telemetry.parameter_count_millions` | `records.attributes.profile.facts` & `lib/operational-telemetry.ts` | Extracted from profile metadata facts where documented, or augmented via `lib/operational-telemetry.ts`. |
| `telemetry.open_weights`, `license` | `records.attributes.access` & `profile.facts` | Extracted directly from model access and license attributes in `records.attributes`. |
| `pareto_optimal` | Runtime 2D Convex Hull Calculation | Computed dynamically across the active category slice for models with non-null telemetry pairs ($\text{Index}$ vs. Latency / Cost). |

---

## 6. UI/UX Redesign & Decluttering Blueprint

### 6.1 Layout Architecture & Wireframes

The redesigned interface replaces the fragmented, multi-table audit screens with a unified, high-density, low-clutter comparison workspace:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ [REWIRE.BIO]   LEADERBOARDS   MODELS   USE CASES   BENCHMARKS   EVIDENCE   [Search Q]  │
├────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                        │
│  The Artificial Analysis of Biological Models                                          │
│  Independent benchmarks, Pareto efficiency, and operational metrics for biological AI  │
│                                                                                        │
│  [All Use Cases] [Protein Structure] [Variant Effect] [De Novo Design] [Genomic]       │
│                                                                                        │
│  ┌──────────────────────────────────────────────┐ ┌──────────────────────────────────┐ │
│  │ VIEW:  (•) Pareto Frontier  ( ) Leaderboard  │ │ FILTERS: [x] Open Weights Only   │ │
│  │        ( ) Radar Multi-Model Comparison      │ │          [x] Max VRAM < 24GB     │ │
│  └──────────────────────────────────────────────┘ └──────────────────────────────────┘ │
│                                                                                        │
│  ┌─ PARETO FRONTIER: CAPABILITY vs. INFERENCE TIME ───────────────────────────────────┐ │
│  │ Quality Index ▲                                                                    │ │
│  │         (100) │               • Boltz-1 (lDDT 88.2, 1.2s) [Pareto Optimal]         │ │
│  │               │                                                                    │ │
│  │          (80) │         • ESMFold (lDDT 82.1, 0.4s)   • AlphaFold 3 (89.1, 14.2s)  │ │
│  │               │                                                                    │ │
│  │          (60) │   • Conventional Homology (lDDT 61.0, 0.01s)                       │ │
│  │               │                                                                    │ │
│  │           (0) └────────────────────────────────────────────────────────► Time (s) │ │
│  └────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                        │
│  ┌─ UNIFIED LEADERBOARD (Zero-Shot Variant Effect Prediction - DMS Fitness) ──────────┐ │
│  │ Model           Creator   Index  Spearman ρ  vs Baseline  Speed     VRAM   License │ │
│  ├────────────────────────────────────────────────────────────────────────────────────┤ │
│  │ [★] PoET-2      OpenProt   94.1    0.612     +42.1%     42 ms/seq   16GB   Open    │ │
│  │ [★] ESM-2 (3B)  Meta       91.5    0.584     +35.6%     110 ms/seq  24GB   Apache2 │ │
│  │ [ ] ESM-2 (650M)Meta       86.2    0.541     +25.8%     28 ms/seq   8GB    Apache2 │ │
│  │ [-] BLOSUM62    Baseline   50.0    0.430      0.0%       0.1 ms/seq 0GB    Public  │ │
│  │ [-] Random      Baseline    0.0    0.002     -99.5%      0.0 ms/seq 0GB    Public  │ │
│  └────────────────────────────────────────────────────────────────────────────────────┘ │
│   * Experimental Assay Replicate Ceiling: ρ = 0.740 (Top model achieves 82.7% ceiling) │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### 6.2 2D Interactive Pareto Frontier Visualization

In biological research, the highest accuracy model is frequently impractical for production screening:
- In antibody optimization, evaluating $10^6$ mutational variants using a 15-billion parameter model requiring 80GB VRAM is cost-prohibitive.
- A model delivering 95% of the accuracy at 5% of the latency and 10% of the cost is the rational engineering choice.

`components/catalogue/ParetoFrontier.tsx` will render interactive SVG scatter plots with convex hull frontier lines:
1. **Frontier 1: Capability Index vs. Inference Latency (ms, log scale)**.
2. **Frontier 2: Capability Index vs. Estimated Cost per 1,000 Evaluations ($ USD, log scale)**.

Models situated on the upper-left boundary represent the non-dominated Pareto frontier:
$$\mathcal{P} = \{m \in \mathcal{M} \mid \nexists m' \in \mathcal{M} \text{ with } \text{Index}(m') \ge \text{Index}(m) \land \text{Cost}(m') \le \text{Cost}(m) \text{ with at least one strict inequality}\}$$

Models below the frontier curve are visually de-emphasized, clearly communicating that they are mathematically dominated by faster or cheaper alternatives.

---

### 6.3 5-Axis Radar Chart for Multimodal Foundation Models

For generalist architectures (e.g. ESM3, Evo 2) that operate across multiple biological modalities, `components/catalogue/RadarComparison.tsx` provides an interactive 5-axis radar polygon comparing models across the five core biological use cases:
- Axis 1: Protein Structure Prediction ($\text{lDDT}$, $d = +1$)
- Axis 2: Zero-Shot Variant Effect Prediction ($\text{Spearman } \rho$, $d = +1$)
- Axis 3: De Novo Protein Design ($\text{scRMSD}$, $d = -1$)
- Axis 4: Transcriptomics & Perturbation Response ($\text{Pearson } r$, $d = +1$)
- Axis 5: Genomic Regulatory Grammar ($\text{AUROC}$, $d = +1$)

#### Handling Specialist Models & Disjoint Support Gracefully
As established mathematically in Lemma 1 (Section 4.1), biological foundation models exhibit fundamentally disjoint benchmark support. Highly specialized architectures—such as AlphaFold 3 or Boltz-1 (structure only), PoET-2 or ESM-2 (variant effect only), and Enformer or Borzoi (genomic grammar only)—have evaluated empirical results on only 1 or 2 of these axes. In the pinned SQLite database, over 95% of models lack evaluations on 3 or more of the 5 radar modalities.

To prevent visual distortion, false representations of capability, or chart degeneracy, the platform applies strict visual rendering rules:
1. **Primary Universal View**: The **2D Pareto Frontier** (Capability Index vs. Latency / Cost) and the **Per-Task Unified Leaderboards** serve as the default, universal comparison mechanism. Every model is evaluated and ranked strictly within its domain against matched protocol baselines.
2. **Opt-in Multimodal Comparison**: The 5-axis radar chart is an optional, secondary comparative visualization designed for multimodal foundation models and cross-modality ablation studies.
3. **Graceful Handling of Unmeasured Axes**: When specialist models are overlaid alongside multimodal models on the radar chart:
   - Unmeasured axes are **never imputed with 0.0 or null-baseline values**, which would falsely display a world-class specialist as having "failed" on unmeasured tasks.
   - Unmeasured vertices are **never connected into artificial, closed polygons**, which would draw deceptive geometric areas across disjoint modalities.
   - Instead, unmeasured axes are rendered as **unclosed / inactive dashed ray indicators** or discrete radial point markers positioned strictly along measured rays.
   - The UI displays an explicit contextual badge: *"Specialist Model: Evaluated on K/5 modalities. See the 2D Pareto frontier and per-task leaderboard for domain-specific rankings."*

---

### 6.4 The Decluttering Action Matrix

| Location / File | Current Cluttered Pattern | Redesigned Replacement | Cognitive / UX Benefit |
| :--- | :--- | :--- | :--- |
| `app/page.tsx` | 16-button raw entity explorer tabs (`claim`, `evaluation`, `result`, `source`...). | Featured Leaderboard + Use-Case Cards + Quick Model Search. | Eliminates database exposure; leads immediately with model rankings and performance answers. |
| `app/use-cases/[slug]/page.tsx` | 3–6 fragmented, per-study comparison tables. | One unified comparison leaderboard per biological task. | Eliminates cross-table cognitive reconciliation; allows immediate sorting. |
| `components/catalogue/UseCaseComparison.tsx:19-35` | Nested `<details className={styles.moreValues}>` inside table cells. | Expandable drawer row displaying secondary metrics cleanly on click. | Removes tall, uneven table cells and eliminates dropdowns embedded in `<td>` tags. |
| `components/catalogue/UseCaseComparison.tsx:106` | 16-column wide desktop tables forcing sideways scrolling. | Fixed 6–7 primary columns (Model, Creator, Index, Metric, vs Baseline, Latency, License). | Eliminates horizontal scrolling; stops 1-word-per-line column header squeezing (#142). |
| `app/database/_entities/predictive.tsx:550-563` | `Fields verbatim` dumping raw JSON facets and internal database IDs. | Clean "Model Capabilities & Hardware Requirements" card. | Eliminates intimidating backend schema dumps; surfaces actionable deployment prerequisites. |
| Table metric formats (`#144`) | Mixed percentages and decimal scales (`0.87`, `86.2`, `87%`). | Strict uniform formatting (2 decimal places for raw metrics, explicit % for deltas). | Prevents dangerous misinterpretation of model accuracy margins. |
| Hyperparameter sweeps (`#151`) | 81 Exomiser threshold rows displayed as separate tools in main table. | Pinned default configuration row with an expandable "Inspect 81 parameter sweeps" drawer. | Prevents single tools from monopolizing and burying the leaderboard. |
| Use-case prose summaries (`#152`) | 2,000-character unformatted walls of text before tables. | Concise 1-sentence bottom-line takeaway followed by structured parameter pills. | Provides immediate answers for researchers skimming for model choices. |

---

## 7. SEO & Generative Engine Optimization (GEO) Strategy

Search engine algorithms and generative AI answer engines (Perplexity, ChatGPT Search, Claude, Google AI Overviews) have shifted from keyword matching to structured entity retrieval. To dominate organic and AI discovery for biological AI queries, `rewire-database` must implement a unified semantic strategy.

### 7.1 Schema.org JSON-LD Structured Data Specifications

#### A. Leaderboard Pages (`/use-cases/[slug]` and `/leaderboards/[slug]`)
Every ranking view will inject an `ItemList` schema encoding the verified ranking order, nesting the target entity inside the canonical `item` property:
```json
{
  "@context": "https://schema.org",
  "@type": "ItemList",
  "name": "Zero-Shot Variant Effect Prediction Leaderboard",
  "description": "Ranked biological foundation models evaluated on Deep Mutational Scanning fitness prediction against protocol baselines.",
  "numberOfItems": 15,
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "item": {
        "@type": "SoftwareApplication",
        "name": "PoET-2",
        "url": "https://benchmarks.rewirebio.io/models/poet-2/"
      }
    },
    {
      "@type": "ListItem",
      "position": 2,
      "item": {
        "@type": "SoftwareApplication",
        "name": "ESM-2 (3B)",
        "url": "https://benchmarks.rewirebio.io/models/esm-2-3b/"
      }
    }
  ]
}
```

#### B. Model Detail Pages (`/database/model/[id]/` and `/models/[slug]/`)
Model profiles will inject `SoftwareApplication` declaring hardware requirements and creator attribution:
```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Boltz-1",
  "applicationCategory": "Bioinformatics Foundation Model",
  "operatingSystem": "Linux, macOS, Windows",
  "memoryRequirements": "16 GB VRAM",
  "author": {
    "@type": "Organization",
    "name": "Massachusetts Institute of Technology / Genesis Therapeutics"
  },
  "license": "https://opensource.org/licenses/MIT",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "USD"
  }
}
```

#### C. Benchmark & Protocol Pages (`/benchmarks/[id]/`)
Benchmark documentation will inject `Dataset` schema specifying citation DOIs and evaluation parameters.

---

### 7.2 Direct AI Search Takeaway Snippets (GEO Lead Blocks)

Generative AI retrieval agents prioritize pages that lead with concise, factual, structured answer triples.

Every leaderboard and model page will include a semantic `<section className="geo-takeaway">` positioned immediately below the primary heading:
```html
<section class="geo-takeaway bg-teal-50/50 border border-teal-200 rounded-lg p-4 mb-6">
  <h2 class="text-sm font-semibold uppercase tracking-wider text-teal-900">Key Benchmark Finding</h2>
  <p class="text-base text-slate-800 mt-1">
    In zero-shot variant effect prediction on the ProteinGym benchmark, <strong>PoET-2</strong> ranks #1 with a Spearman correlation of <strong>0.612</strong>, achieving <strong>82.7%</strong> of the experimental assay replicate ceiling and outperforming the conventional <strong>BLOSUM62 baseline by +42.1%</strong> at an inference speed of <strong>42 ms/sequence</strong> on an NVIDIA A100 GPU.
  </p>
</section>
```
When an AI engine processes this page, it extracts the direct factual assertion without requiring complex JavaScript execution or table parsing.

---

### 7.3 LLM Discoverability: `/llms.txt`, `/llms-full.txt`, and `/agents.md` Architecture

To maximize organic discoverability by LLMs and autonomous search agents (e.g., Perplexity, ChatGPT Search, Claude, Gemini) without overflowing context windows or violating crawler standards, our architecture establishes three distinct, standardized crawler surfaces conforming strictly to the [llmstxt.org](https://llmstxt.org) standard:

#### 1. Concise Link Index (`/llms.txt`)
Per the official llmstxt.org specification, `/llms.txt` is a lightweight, human-readable and machine-parseable index. Rather than polluting LLM prompt context with massive raw data tables, `/llms.txt` serves an H1 title, blockquote summary, and clean Markdown link sections formatted strictly as `- [Title](URL): Description`:

```markdown
# Rewire.bio Biological AI Benchmark Database

> Rewire.bio is the independent Artificial Analysis platform for biological foundation models, providing standardized capability indexing, protocol baselines, Pareto frontiers, and operational hardware metrics across genomics, proteomics, and molecular design.

## Core Leaderboards
- [Zero-Shot Variant Effect Prediction](https://benchmarks.rewirebio.io/use-cases/variant-effect-fitness): Top biological models (PoET-2, ESM-2) ranked by Spearman rho against BLOSUM62 baseline.
- [Protein Structure Prediction](https://benchmarks.rewirebio.io/use-cases/protein-structure-prediction): Multimer and monomer folding architectures (AlphaFold 3, Boltz-1) evaluated on lDDT.
- [De Novo Protein Design](https://benchmarks.rewirebio.io/use-cases/protein-design): Generative sequence-structure models ranked by self-consistency RMSD (scRMSD).
- [Transcriptomics & Perturbation Response](https://benchmarks.rewirebio.io/use-cases/transcriptomics): Single-cell perturbation prediction models evaluated on Pearson correlation.
- [Genomic Regulatory Grammar](https://benchmarks.rewirebio.io/use-cases/genomic-grammar): Cis-regulatory sequence models (Enformer, Borzoi) evaluated on expression AUROC.

## Knowledge & Agent Protocols
- [Full Benchmark Knowledge Base](https://benchmarks.rewirebio.io/llms-full.txt): Complete multi-column ranking tables, baseline panels, and operational hardware telemetry.
- [Autonomous Agent Hub](https://benchmarks.rewirebio.io/agents.md): Extended programmatic documentation, SQLite contract schemas, REST endpoints, and MCP tool definitions.
```

#### 2. Companion Full Benchmark Knowledge Base (`/llms-full.txt`)
When an LLM agent requires comprehensive raw data without issuing separate HTTP requests, it crawls `/llms-full.txt` (the standard extension specified by llmstxt.org). This file aggregates:
- Complete markdown ranking tables for all 17 biological use cases.
- 0–100 Capability Index scores, direction-adjusted baseline deltas ($\Delta_{\text{conv}}$), and experimental ceiling percentages ($F_{\text{ceiling}}$).
- Curated operational hardware telemetry (inference latency, GPU VRAM requirements, and throughput receipts).
- Four-tier protocol baseline reference panels and assay noise definitions.

#### 3. Agent Operational Hub (`/agents.md`)
Designed specifically for autonomous software agents, Claude Code CLI, and AI coding assistants, `/agents.md` serves:
- Machine-oriented instructions and JSON schema contracts (`OperationalTelemetry`, `BiologicalModelRankingRow`).
- Direct REST and MCP tool schemas for programmatic querying.
- Database contract v3.4 entity relationship diagrams and resolution rules.

---

### 7.4 Canonical URLs, Chunked Sitemaps, and Crawler Verification

1. **Self-Referential Canonicalization**: Verify that every public route generates its own exact canonical URL (`catalogue-seo.ts`), eliminating the catastrophic root-canonical leakage identified in Issue `#197`.
2. **Chunked Sitemap Indexing**: Ensure `app/sitemap.xml/route.ts` and `app/sitemap/[file]/route.ts` correctly chunk 10,000 URLs per file with accurate `<lastmod>` timestamps matching the pinned SQLite release date (`2026-11-02`).
3. **Crawl Budget Optimization**: Apply `noindex, follow` headers to ephemeral filter states, sorting queries, and internal modal routes, preserving crawl budget for high-value model profiles and use-case leaderboards.

---

## 8. Conclusion & Next Implementation Steps

This review establishes the theoretical, empirical, and architectural foundation for transforming `rewire-database` into the **"Artificial Analysis of Biological Models"**.

By rejecting monolithic intelligence scores, anchoring evaluations against four-tier protocol baselines, integrating operational hardware metrics, eliminating UI table clutter, and deploying an aggressive SEO/GEO strategy, `rewire-database` will establish itself as the authoritative decision platform for AI in the life sciences.

### Implementation Roadmap

- **Milestone 2 (Core Ranking Engine & Unified Leaderboard)**:
  - Implement `lib/use-case-leaderboard.ts` with capability index normalization and Pareto efficiency algorithms.
  - Build `components/catalogue/UnifiedLeaderboard.tsx` with instant use-case switching and responsive drawers.
  - Implement `components/catalogue/ParetoFrontier.tsx` and `components/catalogue/RadarComparison.tsx`.
- **Milestone 3 (UI/UX Redesign & Decluttering Across Site)**:
  - Redesign `app/page.tsx` with a use-case hero selector and featured leaderboard.
  - Redesign `app/use-cases/[slug]/page.tsx` replacing fragmented tables with the unified view.
  - Eliminate raw `Fields verbatim` dumps on `app/database/_entities/predictive.tsx`.
- **Milestone 4 (SEO & GEO Implementation)**:
  - Deploy Schema.org `ItemList`, `SoftwareApplication`, and `Dataset` JSON-LD schemas.
  - Inject semantic `<section className="geo-takeaway">` blocks on all public pages.
  - Deploy `/llms.txt` adhering to the llmstxt.org link index specification, alongside companion `/llms-full.txt` (comprehensive markdown ranking tables) and `/agents.md` (agent operational hub).
- **Milestone 5 (Testing & Quality Gates)**:
  - Verify all automated test suites pass with >=90% UI coverage compliance (`vitest.ui.config.ts:25`).
  - Run linting, TypeScript type checking, SSR build checks, and dual-track E2E verification.

---
*End of Report — Milestone 1 Deliverable.*
