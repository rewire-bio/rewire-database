/** Editorial reading links belong to the website, outside the reviewed evidence release.
 * Match questions explicitly: sharing a biological area is not enough. */
export interface UseCaseArticle {
  slug: string;
  title: string;
  description: string;
}

const genomicModels = {
  slug: "genomic-foundation-models-in-2026",
  title: "Genomic Foundation Models in 2026: What Holds Up",
};
const dnaModels = {
  slug: "a-dna-likelihood-is-not-a-functional-assay",
  title: "A DNA Likelihood Is Not a Functional Assay: Genomic Foundation Models in 2026",
};
const worldModels = {
  slug: "biological-world-models-projects-you-should-build",
  title: "Biological World Models: Projects to Build",
};

export const useCaseArticles: Readonly<Record<string, readonly UseCaseArticle[]>> = {
  "brca1-brca2-germline-interpretation": [{
    ...genomicModels,
    description: "Background on variant-effect benchmarks and why retrospective model scores do not establish clinical variant classification.",
  }],
  "cell-type-annotation-transfer": [{
    ...genomicModels,
    description: "Background on single-cell representations and integration benchmarks, including comparisons with simple baselines and limits of transfer to annotation workflows.",
  }, {
    slug: "a-bioinformaticians-guide-to-choosing-genomic-foundation-models",
    title: "Choosing a Genomic Foundation Model (2026 Guide)",
    description: "Practical background on choosing and adapting sequence and single-cell models for downstream tasks.",
  }],
  "genetic-perturbation-response": [{
    ...genomicModels,
    description: "Examines perturbation-prediction evaluations and the simple controls that complex models need to beat.",
  }, {
    ...worldModels,
    description: "Explores perturbation-response prediction from measured before-and-after cell populations.",
  }],
  "phenotype-perturbation-selection": [{
    ...worldModels,
    description: "Background on modelling cellular responses and designing perturbation-prediction experiments.",
  }],
  "plant-promoter-reporters": [{
    ...dnaModels,
    description: "Explains how species, sequence context and assay endpoints constrain the use of genomic models for regulatory prediction.",
  }],
  "protein-variant-stability": [{
    slug: "a-protein-embedding-is-not-an-explanation",
    title: "A Protein Embedding Is Not an Explanation: Protein Language Models in 2026",
    description: "Background on protein variant scoring, assay-specific evaluation and the limits of transferring results between protein tasks.",
  }],
  "regulatory-variant-gene-follow-up": [{
    slug: "alphagenome-variant-effect-prediction",
    title: "AlphaGenome: Variant Effect Prediction",
    description: "Explains regulatory variant scoring and the experimental evidence needed to interpret predicted effects.",
  }, {
    ...dnaModels,
    description: "Distinguishes sequence likelihood from functional-assay evidence and describes validation for regulatory tasks.",
  }],
  "splicing-follow-up": [{
    slug: "mfass-v1",
    title: "MFASS: SpliceAI, Pangolin and a Baseline at 100 Variants",
    description: "Reports the corrected MFASS v2 splice-variant evaluation, its matched coverage and the limitations of the reporter endpoint.",
  }, {
    ...dnaModels,
    description: "Explains how genomic-model outputs and evaluation splits relate to functional variant assays.",
  }],
  "structural-hypotheses-experiments": [{
    slug: "a-fasta-file-is-not-a-specification",
    title: "A FASTA File Is Not a Specification: Protein Structure Prediction in 2026",
    description: "Explains how to specify chains, complexes and ligands, interpret structural confidence and plan experimental checks.",
  }],
  "therapeutic-target-validation": [{
    slug: "why-gene-discovery-methods-find-different-genes",
    title: "Why Gene Discovery Methods Find Different Genes",
    description: "Background on gene-prioritisation biases, complementary genetic evidence and target-validation decisions.",
  }],
  "utr-translation-baselines": [{
    slug: "an-rna-sequence-is-not-a-molecular-state",
    title: "An RNA Sequence Is Not a Molecular State: RNA Foundation Models in 2026",
    description: "Separates UTR translation and RNA stability tasks, with guidance on input scope, simple baselines and held-out evaluation.",
  }],
};

export function relatedUseCaseArticles(slug: string): readonly UseCaseArticle[] {
  return Object.hasOwn(useCaseArticles, slug) ? useCaseArticles[slug] : [];
}

export const articleHref = (article: Pick<UseCaseArticle, "slug">) =>
  `https://rewirebio.io/blog/${article.slug}/`;
