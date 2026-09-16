/** Candidate models and applicable test families. No row in this file is a measured result. */

export type DomainId =
  | "dna-genomes"
  | "rna-transcriptomes"
  | "proteins-complexes"
  | "cells-tissues"
  | "microbes-communities"
  | "molecular-interactions";

export type MatchMode =
  | "native prediction"
  | "frozen embedding + trained head"
  | "specialist / baseline"
  | "adapter required"
  | "conditional access";

export type TestStatus = "candidate" | "measured own run";

export type Domain = { id: DomainId; name: string; note: string };
export type CandidateModel = {
  id: string;
  name: string;
  version: string;
  sourceUrl: string;
  access: string;
  kind: "foundation model" | "specialist" | "baseline";
  domainIds: readonly DomainId[];
};
export type CandidateTest = {
  id: string;
  name: string;
  domainId: DomainId;
  note: string;
  status: TestStatus;
};
export type ModelTestMatch = {
  modelId: string;
  testId: string;
  mode: MatchMode;
  note: string;
};

export const CATALOG_SOURCE_CHECKED = "2026-09-16";

export const DOMAINS: readonly Domain[] = [
  { id: "dna-genomes", name: "DNA & genomes", note: "Sequence variation, splicing and gene regulation." },
  { id: "rna-transcriptomes", name: "RNA & transcriptomes", note: "RNA structure and transcript-level function." },
  { id: "proteins-complexes", name: "Proteins & complexes", note: "Mutation effects, folding and protein design." },
  { id: "cells-tissues", name: "Cells & tissues", note: "Single-cell reference mapping, integration and perturbation." },
  { id: "microbes-communities", name: "Microbes & communities", note: "Microbial sequences and metagenomic classification." },
  { id: "molecular-interactions", name: "Molecular interactions", note: "Docking, affinity and multi-molecule structure." },
];

export const MODELS: readonly CandidateModel[] = [
  { id: "dnabert-2", name: "DNABERT-2", version: "117M", sourceUrl: "https://huggingface.co/zhihan1996/DNABERT-2-117M", access: "Public checkpoint; remote model code needs review before local use.", kind: "foundation model", domainIds: ["dna-genomes"] },
  { id: "nt-v2", name: "Nucleotide Transformer v2", version: "50M multi-species", sourceUrl: "https://huggingface.co/InstaDeepAI/nucleotide-transformer-v2-50m-multi-species", access: "Public checkpoint.", kind: "foundation model", domainIds: ["dna-genomes"] },
  { id: "evo-2", name: "Evo 2", version: "7B", sourceUrl: "https://github.com/ArcInstitute/evo2", access: "Public checkpoints; official local inference needs CUDA hardware and substantial memory.", kind: "foundation model", domainIds: ["dna-genomes", "microbes-communities"] },
  { id: "alphagenome", name: "AlphaGenome", version: "API / released weights", sourceUrl: "https://github.com/google-deepmind/alphagenome_research", access: "Rate-limited, non-commercial API requires a key. Downloadable weights require accepting non-commercial model terms; local inference recommends an H100 GPU.", kind: "foundation model", domainIds: ["dna-genomes"] },
  { id: "spliceai", name: "SpliceAI", version: "1.3.1", sourceUrl: "https://github.com/Illumina/SpliceAI", access: "Public archived code under PolyForm Strict; model weights are CC BY-NC 4.0 for non-commercial use.", kind: "specialist", domainIds: ["dna-genomes"] },
  { id: "pangolin", name: "Pangolin", version: "published checkpoints", sourceUrl: "https://github.com/tkzeng/Pangolin", access: "Public specialist code and models under GPL-3.0.", kind: "specialist", domainIds: ["dna-genomes"] },
  { id: "rna-fm", name: "RNA-FM", version: "ncRNA", sourceUrl: "https://github.com/ml4bio/RNA-FM", access: "Public code and checkpoint instructions.", kind: "foundation model", domainIds: ["rna-transcriptomes"] },
  { id: "mrna-fm", name: "mRNA-FM", version: "codon-tokenised", sourceUrl: "https://github.com/ml4bio/RNA-FM", access: "Public checkpoint trained on coding sequences (CDS); input must be codon aligned. UTR-only sequences are outside its training modality.", kind: "foundation model", domainIds: ["rna-transcriptomes"] },
  { id: "mimic", name: "MIMIC", version: "1.0", sourceUrl: "https://huggingface.co/polymathic-ai/MIMIC", access: "Public MIT code and 1.25B-parameter weights; large local memory requirement.", kind: "foundation model", domainIds: ["rna-transcriptomes", "proteins-complexes"] },
  { id: "rhofold", name: "RhoFold+", version: "pretrained", sourceUrl: "https://github.com/ml4bio/RhoFold", access: "Public code and checkpoint instructions.", kind: "specialist", domainIds: ["rna-transcriptomes"] },
  { id: "esm-2", name: "ESM-2", version: "8M", sourceUrl: "https://github.com/facebookresearch/esm", access: "Public checkpoint; small 8M variant suits a local pilot.", kind: "foundation model", domainIds: ["proteins-complexes"] },
  { id: "proteinmpnn", name: "ProteinMPNN", version: "v_48_020", sourceUrl: "https://github.com/dauparas/ProteinMPNN", access: "Public code and checkpoints; requires a suitable protein structure.", kind: "specialist", domainIds: ["proteins-complexes"] },
  { id: "esmfold", name: "ESMFold", version: "v1", sourceUrl: "https://github.com/facebookresearch/esm", access: "Public checkpoint; materially larger than ESM-2 8M.", kind: "foundation model", domainIds: ["proteins-complexes"] },
  { id: "chai-1", name: "Chai-1", version: "released weights", sourceUrl: "https://github.com/chaidiscovery/chai-lab", access: "Public code and weights under Apache 2.0; substantial compute required.", kind: "foundation model", domainIds: ["proteins-complexes", "molecular-interactions"] },
  { id: "geneformer", name: "Geneformer", version: "published checkpoints", sourceUrl: "https://huggingface.co/ctheodoris/Geneformer", access: "Public checkpoints; specify exact version before evaluation.", kind: "foundation model", domainIds: ["cells-tissues"] },
  { id: "scgpt", name: "scGPT", version: "whole-human", sourceUrl: "https://github.com/bowang-lab/scGPT", access: "Public code and downloadable checkpoints; use the unfine-tuned whole-human model for a new task.", kind: "foundation model", domainIds: ["cells-tissues"] },
  { id: "scfoundation", name: "scFoundation", version: "100M", sourceUrl: "https://github.com/biomap-research/scFoundation", access: "Public code; model weights have separate terms that must be checked.", kind: "foundation model", domainIds: ["cells-tissues"] },
  { id: "scvi", name: "scVI", version: "scvi-tools", sourceUrl: "https://github.com/scverse/scvi-tools", access: "Public software; train a task-specific model on the permitted split.", kind: "baseline", domainIds: ["cells-tissues"] },
  { id: "gears", name: "GEARS", version: "published implementation", sourceUrl: "https://github.com/snap-stanford/GEARS", access: "Public code; task-specific training data required.", kind: "specialist", domainIds: ["cells-tissues"] },
  { id: "prokbert", name: "ProkBERT", version: "mini", sourceUrl: "https://github.com/nbrg-ppcu/prokbert", access: "Public model family and mini checkpoint.", kind: "foundation model", domainIds: ["microbes-communities"] },
  { id: "metagene-1", name: "METAGENE-1", version: "6B", sourceUrl: "https://huggingface.co/metagene-ai/METAGENE-1", access: "Public Apache 2.0 checkpoint; 512-token context and large local memory requirement.", kind: "foundation model", domainIds: ["microbes-communities"] },
  { id: "kraken2", name: "Kraken2", version: "current database pinned at run time", sourceUrl: "https://github.com/DerrickWood/kraken2", access: "Public classifier; database build/version must be pinned separately.", kind: "baseline", domainIds: ["microbes-communities"] },
  { id: "metaphlan", name: "MetaPhlAn", version: "current marker database pinned at run time", sourceUrl: "https://github.com/biobakery/MetaPhlAn", access: "Public profiler; marker database version must be pinned separately.", kind: "specialist", domainIds: ["microbes-communities"] },
  { id: "boltz-2", name: "Boltz-2", version: "released weights", sourceUrl: "https://github.com/jwohlwend/boltz", access: "Public MIT code and weights; substantial compute required.", kind: "foundation model", domainIds: ["molecular-interactions"] },
  { id: "diffdock-l", name: "DiffDock-L", version: "2024 release", sourceUrl: "https://github.com/gcorso/DiffDock", access: "Public pose-prediction code and weights; no native affinity prediction.", kind: "specialist", domainIds: ["molecular-interactions"] },
  { id: "alphafold-3-server", name: "AlphaFold 3 Server", version: "hosted server", sourceUrl: "https://alphafoldserver.com/output-terms", access: "Manual, non-commercial server access; output terms restrict automated docking combinations.", kind: "foundation model", domainIds: ["molecular-interactions"] },
  { id: "vina", name: "AutoDock Vina", version: "1.2.7", sourceUrl: "https://github.com/ccsb-scripps/AutoDock-Vina", access: "Public docking software; receptor and ligand preparation required.", kind: "baseline", domainIds: ["molecular-interactions"] },
];

export const TESTS: readonly CandidateTest[] = [
  { id: "mfass-splice", name: "MFASS splice-variant prioritisation", domainId: "dna-genomes", note: "Functional exon-recognition assay; mfass-v2 reports a corrected baseline and one complete local DNABERT-2 protocol.", status: "measured own run" },
  { id: "enhancer-effects", name: "Enhancer / MPRA effects", domainId: "dna-genomes", note: "Predict measured activity changes from regulatory sequence variants.", status: "candidate" },
  { id: "long-range-regulation", name: "Long-range regulation", domainId: "dna-genomes", note: "Predict gene-expression or chromatin effects from long-context DNA sequence.", status: "candidate" },
  { id: "rna-secondary-structure", name: "RNA secondary structure", domainId: "rna-transcriptomes", note: "Compare predicted base pairs against held-out RNA structures.", status: "candidate" },
  { id: "rna-tertiary-structure", name: "RNA tertiary structure", domainId: "rna-transcriptomes", note: "Compare predicted 3D folds against independently held-out structures.", status: "candidate" },
  { id: "rna-splice-sites", name: "RNA splice-site mapping", domainId: "rna-transcriptomes", note: "Predict splice-site classes from transcript sequence, using a held-out gene split.", status: "candidate" },
  { id: "utr-translation", name: "Translation / RNA stability", domainId: "rna-transcriptomes", note: "Predict measured translation or stability effects; choose UTR or coding-sequence assays to match each model’s input modality.", status: "candidate" },
  { id: "proteingym-effects", name: "ProteinGym mutation effects", domainId: "proteins-complexes", note: "Rank substitution effects within held-out deep-mutational-scanning assays.", status: "candidate" },
  { id: "protein-monomer-structure", name: "Monomer structure", domainId: "proteins-complexes", note: "Predict single-chain structure from sequence.", status: "candidate" },
  { id: "protein-design", name: "Protein design / inverse folding", domainId: "proteins-complexes", note: "Score or design sequences conditional on a known structure.", status: "candidate" },
  { id: "cell-reference-mapping", name: "Donor-held-out reference mapping", domainId: "cells-tissues", note: "Map unseen donors to a labelled cell-type reference.", status: "candidate" },
  { id: "cell-batch-integration", name: "Batch integration", domainId: "cells-tissues", note: "Test whether cell identity is retained across donors and batches.", status: "candidate" },
  { id: "cell-perturbation", name: "Perturbation response", domainId: "cells-tissues", note: "Predict expression changes after unseen perturbations.", status: "candidate" },
  { id: "microbial-promoters", name: "Bacterial promoter prediction", domainId: "microbes-communities", note: "Classify promoter activity from microbial DNA sequence.", status: "candidate" },
  { id: "phage-pathogen-reads", name: "Phage / pathogen reads", domainId: "microbes-communities", note: "Classify held-out phage or pathogen sequences and record taxonomic distance.", status: "candidate" },
  { id: "heldout-clade", name: "Held-out-clade classification", domainId: "microbes-communities", note: "Hold clades out of downstream fitting and reference databases; evaluate known ancestor labels or unknown-taxon detection, and audit pretraining overlap separately.", status: "candidate" },
  { id: "community-profiling", name: "Community profiling", domainId: "microbes-communities", note: "Estimate taxon abundances in metagenomic samples.", status: "candidate" },
  { id: "ligand-pose", name: "Protein–ligand pose", domainId: "molecular-interactions", note: "Predict the bound ligand geometry from prepared molecular inputs.", status: "candidate" },
  { id: "ligand-affinity", name: "Small-molecule affinity", domainId: "molecular-interactions", note: "Predict measured binding affinity; pose confidence is not an affinity value.", status: "candidate" },
  { id: "complex-structure", name: "Biomolecular complex structure", domainId: "molecular-interactions", note: "Predict joint structure for interacting proteins and other molecules.", status: "candidate" },
];

export const MATCHES: readonly ModelTestMatch[] = [
  { modelId: "dnabert-2", testId: "mfass-splice", mode: "frozen embedding + trained head", note: "Reference/mutant embeddings need a head fitted on the MFASS training split." },
  { modelId: "dnabert-2", testId: "enhancer-effects", mode: "frozen embedding + trained head", note: "Sequence representation needs assay-specific calibration." },
  { modelId: "nt-v2", testId: "mfass-splice", mode: "frozen embedding + trained head", note: "Paired variant representation needs a train-only head." },
  { modelId: "nt-v2", testId: "enhancer-effects", mode: "frozen embedding + trained head", note: "Use a head fitted without held-out assay leakage." },
  { modelId: "evo-2", testId: "enhancer-effects", mode: "adapter required", note: "Likelihood or embeddings need a predeclared variant-effect adapter." },
  { modelId: "evo-2", testId: "long-range-regulation", mode: "adapter required", note: "Long context is available, but output needs a task-specific mapping." },
  { modelId: "alphagenome", testId: "enhancer-effects", mode: "conditional access", note: "Regulatory outputs require a declared MPRA scoring adapter; access is through the API or downloadable weights under model terms." },
  { modelId: "alphagenome", testId: "long-range-regulation", mode: "conditional access", note: "Native long-context regulatory outputs via the API or downloadable weights; local inference needs substantial GPU resources." },
  { modelId: "spliceai", testId: "mfass-splice", mode: "specialist / baseline", note: "Native splice-effect score is an existing specialist comparator." },
  { modelId: "pangolin", testId: "mfass-splice", mode: "specialist / baseline", note: "Native splice-effect score is an existing specialist comparator." },
  { modelId: "rna-fm", testId: "rna-secondary-structure", mode: "native prediction", note: "Repository provides a separately trained secondary-structure head; evaluate the complete released pipeline, not the embedding backbone alone." },
  { modelId: "rna-fm", testId: "rna-tertiary-structure", mode: "adapter required", note: "RNA-FM embeddings feed a separate 3D structure module such as RhoFold+." },
  { modelId: "rna-fm", testId: "rna-splice-sites", mode: "frozen embedding + trained head", note: "Transcript embeddings need a splice-site classifier fitted on training genes." },
  { modelId: "mrna-fm", testId: "utr-translation", mode: "frozen embedding + trained head", note: "Applicable to coding-sequence translation/stability assays with codon-aligned inputs and a train-only head; not a direct match for UTR-only assays." },
  { modelId: "mimic", testId: "utr-translation", mode: "adapter required", note: "RNA-track outputs are not a direct translation-effect score." },
  { modelId: "mimic", testId: "rna-splice-sites", mode: "native prediction", note: "Released model generates per-position splice-junction classes from RNA sequence." },
  { modelId: "mimic", testId: "proteingym-effects", mode: "adapter required", note: "Protein sequence outputs need a mutation-effect scoring rule." },
  { modelId: "rhofold", testId: "rna-tertiary-structure", mode: "specialist / baseline", note: "Native RNA 3D prediction." },
  { modelId: "rhofold", testId: "rna-secondary-structure", mode: "specialist / baseline", note: "3D pipeline also emits a secondary-structure file." },
  { modelId: "esm-2", testId: "proteingym-effects", mode: "adapter required", note: "Predeclare a masked-marginal or likelihood-ratio variant score." },
  { modelId: "esm-2", testId: "protein-monomer-structure", mode: "adapter required", note: "ESM-2 alone emits representations, not atomic coordinates." },
  { modelId: "proteinmpnn", testId: "proteingym-effects", mode: "specialist / baseline", note: "Structure-conditioned amino-acid scores can be a comparator where structures exist." },
  { modelId: "proteinmpnn", testId: "protein-design", mode: "native prediction", note: "Native structure-conditioned sequence design and scoring." },
  { modelId: "esmfold", testId: "protein-monomer-structure", mode: "native prediction", note: "Native single-sequence 3D structure prediction." },
  { modelId: "chai-1", testId: "protein-monomer-structure", mode: "native prediction", note: "Native structure prediction, with protocol controls for sampling." },
  { modelId: "chai-1", testId: "complex-structure", mode: "native prediction", note: "Native multi-component structure prediction." },
  { modelId: "chai-1", testId: "ligand-pose", mode: "native prediction", note: "Joint complex output includes ligand pose." },
  { modelId: "geneformer", testId: "cell-reference-mapping", mode: "frozen embedding + trained head", note: "Cell embeddings need train-donor reference labels and a classifier." },
  { modelId: "geneformer", testId: "cell-perturbation", mode: "adapter required", note: "In-silico perturbation representation needs a predeclared response decoder." },
  { modelId: "scgpt", testId: "cell-reference-mapping", mode: "frozen embedding + trained head", note: "Use frozen whole-human cell embeddings with the same reference labels as baselines." },
  { modelId: "scgpt", testId: "cell-batch-integration", mode: "adapter required", note: "Fine-tuning or integration procedure must be fitted only on allowed donors." },
  { modelId: "scfoundation", testId: "cell-reference-mapping", mode: "frozen embedding + trained head", note: "Cell embeddings plus a train-donor head; confirm model-weight terms." },
  { modelId: "scfoundation", testId: "cell-perturbation", mode: "adapter required", note: "Published downstream code uses extra task-specific training." },
  { modelId: "scvi", testId: "cell-reference-mapping", mode: "specialist / baseline", note: "Train a latent reference on permitted donors, then classify with the same reference labels." },
  { modelId: "scvi", testId: "cell-batch-integration", mode: "specialist / baseline", note: "Task-trained count-model baseline for integration." },
  { modelId: "gears", testId: "cell-perturbation", mode: "specialist / baseline", note: "Task-trained perturbation predictor; not a pretrained general foundation model." },
  { modelId: "prokbert", testId: "microbial-promoters", mode: "frozen embedding + trained head", note: "Public promoter examples use task-specific fitting." },
  { modelId: "prokbert", testId: "phage-pathogen-reads", mode: "frozen embedding + trained head", note: "Sequence classifier needs training on a declared taxonomic split." },
  { modelId: "prokbert", testId: "heldout-clade", mode: "frozen embedding + trained head", note: "Report performance on clades excluded from head training." },
  { modelId: "metagene-1", testId: "phage-pathogen-reads", mode: "frozen embedding + trained head", note: "Metagenomic sequence embeddings need a read-classification head." },
  { modelId: "metagene-1", testId: "heldout-clade", mode: "frozen embedding + trained head", note: "Fit a head on known taxa and test taxonomic shift." },
  { modelId: "evo-2", testId: "microbial-promoters", mode: "adapter required", note: "Genome likelihood or embedding output needs promoter calibration." },
  { modelId: "evo-2", testId: "heldout-clade", mode: "adapter required", note: "Genome representation needs a taxonomic classifier." },
  { modelId: "kraken2", testId: "heldout-clade", mode: "specialist / baseline", note: "Remove held-out clades from the reference database; score retained ancestor ranks or unclassified reads, not exact labels absent from the database." },
  { modelId: "kraken2", testId: "phage-pathogen-reads", mode: "specialist / baseline", note: "Native read classification with a pinned reference database." },
  { modelId: "metaphlan", testId: "community-profiling", mode: "specialist / baseline", note: "Native marker-based community abundance profiling." },
  { modelId: "boltz-2", testId: "ligand-pose", mode: "native prediction", note: "Native complex structure prediction includes ligand pose." },
  { modelId: "boltz-2", testId: "ligand-affinity", mode: "native prediction", note: "Native small-molecule binding-affinity output." },
  { modelId: "boltz-2", testId: "complex-structure", mode: "native prediction", note: "Native multi-component structure prediction." },
  { modelId: "diffdock-l", testId: "ligand-pose", mode: "specialist / baseline", note: "Native docking pose, not a binding-affinity value." },
  { modelId: "alphafold-3-server", testId: "complex-structure", mode: "conditional access", note: "Manual hosted prediction; use output only within server terms." },
  { modelId: "alphafold-3-server", testId: "ligand-pose", mode: "conditional access", note: "Manual complex prediction only; terms prohibit combining output with automated docking systems." },
  { modelId: "vina", testId: "ligand-pose", mode: "specialist / baseline", note: "Native docked poses; scoring-function energy is not measured affinity." },
];

export const getDomain = (id: string) => DOMAINS.find((domain) => domain.id === id);
export const getModel = (id: string) => MODELS.find((model) => model.id === id);
export const getTest = (id: string) => TESTS.find((test) => test.id === id);
export const getDomainTests = (id: DomainId) => TESTS.filter((test) => test.domainId === id);
export const getDomainModels = (id: DomainId) => MODELS.filter((model) => model.domainIds.includes(id));
export const getModelMatches = (id: string) => MATCHES.filter((match) => match.modelId === id);
export const getTestMatches = (id: string) => MATCHES.filter((match) => match.testId === id);
