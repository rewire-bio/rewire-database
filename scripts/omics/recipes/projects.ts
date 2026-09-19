/**
 * What each benchmark project publishes about running it.
 *
 * A recipe here quotes the project's own instructions. The snippets are taken
 * by line range from a README pinned to a commit, never retyped, so anyone can
 * open that file at that commit and check them. Nothing is executed by this
 * repository, and every instruction says so.
 *
 * Projects that publish no runnable commands in their README are absent rather
 * than filled in with plausible commands. FLIP, GENEB, Open Problems, TAPE and
 * ProteinGym are in that position: their READMEs describe data layout, point at
 * a documentation site, or list resources without a command to run.
 */
export type Instruction = {
  title: string;
  runtime: "python" | "command_line";
  /** Inclusive one-based line range in the pinned README. */
  lines: [number, number];
  heading: string;
};

/** A recipe for rewirebench's own protocol, quoted from the runner's docs. */
export type Runner = {
  protocolId: string;
  doc: string;
  docSha256: string;
  implementation: string;
  implementationSha256: string;
  title: string;
  summary: string;
  inputs: string[];
  outputs: string[];
  data: string;
  software: string;
  hardware: string;
  limitations: string[];
  instructions: Instruction[];
};

export const RUNNER_REPO = "rewire-bio/rewire-benchmarks";
export const RUNNER_COMMIT = "e9b92e0a36260794b682ad1d6c6ad318edc3a60a";

export type Project = {
  key: string;
  benchmarkId: string;
  name: string;
  repo: string;
  commit: string;
  sha256: string;
  licence: string;
  recipe: {
    title: string;
    summary: string;
    inputs: string[];
    outputs: string[];
    data: string;
    weights: string;
    software: string;
    hardware: string;
    limitations: string[];
  };
  instructions: Instruction[];
  /** Present when rewirebench implements this benchmark's scoring itself. */
  runner?: Runner;
};

const unknownHardware =
  "Not stated in the cited section. Several of these steps expect a GPU.";

export const PROJECTS: Project[] = [
  {
    key: "tdc",
    benchmarkId: "discovery-benchmark-tdc-molecular-tasks",
    name: "Therapeutics Data Commons",
    repo: "mims-harvard/TDC",
    commit: "c310c35f27e3f506411018ac43d97b8ba23ca652",
    sha256: "e2dacff9ad56bca50c31373a1e87041eef948721b8aa0be001a95185c375c15f",
    licence: "MIT",
    recipe: {
      title: "Run the ADMET benchmark group with PyTDC",
      summary:
        "Install PyTDC and evaluate a model against the ADMET benchmark group, which is the group whose baselines this page records.",
      inputs: [
        "A model that predicts a property for a SMILES string.",
        "No local data download: the loader fetches each dataset on first use.",
      ],
      outputs: [
        "A per-dataset score from the group's own evaluator, under the scaffold split the group defines.",
      ],
      data: "Downloaded by PyTDC on first use; the benchmark group fixes the split.",
      weights:
        "None. The baselines are trained from the featurisation you choose.",
      software: "Python with PyTDC installed from PyPI.",
      hardware: "CPU is enough for the paper's own baselines.",
      limitations: [
        "The group evaluates each dataset with its own metric; there is no single ADMET score.",
        "The figures on this page are the paper's baselines, not the current leaderboard.",
      ],
    },
    instructions: [
      {
        title: "Install",
        runtime: "command_line",
        lines: [73, 73],
        heading: "Using `pip`",
      },
      {
        title: "Evaluate against the benchmark group",
        runtime: "python",
        lines: [208, 229],
        heading: "TDC Leaderboards",
      },
    ],
    runner: {
      protocolId: "tdc-admet-group-v1",
      doc: "docs/tdc-admet.md",
      docSha256:
        "860890c1214075f311e65314fbcbfaad8c83c7a5e95fb9ad7e714344ccdc85c3",
      implementation:
        "packages/rewirebench/src/rewirebench/protocols/tdc_admet.py",
      implementationSha256:
        "027f01e4485b5c5316875c54440bee37e6ead9723ae246a530bce9d4004764bb",
      title: "Score your own model with rewirebench",
      summary:
        "Prepare a dataset TDC has written to disk, then score an adapter with the metric TDC assigns that dataset.",
      inputs: [
        "The dataset directory TDC's BenchmarkGroup wrote locally.",
        "An adapter returning one number per Drug_ID: a predicted value, or a positive-class score for a classification dataset.",
      ],
      outputs: [
        "A local report with the metric, its direction, the coverage and the digest of the files it read.",
      ],
      data: "Whatever TDC downloaded locally. The runner records its SHA-256 rather than claiming a canonical split.",
      software: "Python 3.11 with the pinned rewirebench environment.",
      hardware: "CPU for scoring. Your own model decides what it needs.",
      limitations: [
        "Six of the 22 datasets are errors where lower is better; the report states the direction per dataset.",
        "A matching metric is not a matching result: the split on disk, the featurisation and the training all have to match a published number too.",
      ],
      instructions: [
        {
          title: "Prepare a dataset",
          runtime: "command_line",
          lines: [36, 38],
          heading: "Prepare, run and score",
        },
        {
          title: "Run and score an adapter",
          runtime: "command_line",
          lines: [47, 50],
          heading: "Prepare, run and score",
        },
      ],
    },
  },
  {
    key: "genomic-benchmarks",
    benchmarkId: "discovery-benchmark-genomic-benchmarks",
    name: "Genomic Benchmarks",
    repo: "ML-Bioinfo-CEITEC/genomic_benchmarks",
    commit: "605d8539830e16c85abe7826990958303ffc5e1c",
    sha256: "926f0f196439564b095cbabe65f6a0acee3f22afbb0f6c8fe50bb3964082d15b",
    licence: "Apache-2.0",
    recipe: {
      title: "Load a Genomic Benchmarks dataset",
      summary:
        "Install the package and load one of the nine sequence classification datasets whose baseline scores this page records.",
      inputs: ["A sequence classifier you want to train and score."],
      outputs: ["Train and test splits as the package ships them."],
      data: "Downloaded by the package; the splits are fixed by the release.",
      weights: "None. The published baseline is a small convolutional network.",
      software: "Python with the genomic-benchmarks package from PyPI.",
      hardware:
        "CPU is enough to load the data; training the baseline benefits from a GPU.",
      limitations: [
        "The scores here are the paper's own baseline in two frameworks, not a leaderboard.",
      ],
    },
    instructions: [
      {
        title: "Install",
        runtime: "command_line",
        lines: [13, 13],
        heading: "Install",
      },
      {
        title: "List the datasets",
        runtime: "python",
        lines: [40, 43],
        heading: "Usage",
      },
    ],
    runner: {
      protocolId: "genomic-benchmarks-v1",
      doc: "docs/genomic-benchmarks.md",
      docSha256:
        "54cc5e958ba059b8772a4fd056b8510af90c6db6ec3004689858eafd663fd3e2",
      implementation:
        "packages/rewirebench/src/rewirebench/protocols/genomic_benchmarks.py",
      implementationSha256:
        "81d63c5a4d9ba36720a669a95cc6bf1acf69398baeef059a6a234e5a242437f8",
      title: "Score your own classifier with rewirebench",
      summary:
        "Prepare a downloaded dataset and score an adapter on accuracy and F1 over the packaged test split.",
      inputs: [
        "The dataset directory the genomic-benchmarks package downloaded.",
        "An adapter returning a class index, or a probability for a binary dataset.",
      ],
      outputs: [
        "A local report with accuracy, F1, the coverage and the digest of the sequences it read.",
      ],
      data: "Whatever the package downloaded locally, read from its train and test directories.",
      software: "Python 3.11 with the pinned rewirebench environment.",
      hardware: "CPU for scoring. Your own model decides what it needs.",
      limitations: [
        "Class labels are assigned from the sorted class name, because upstream takes them from filesystem order, which differs between machines. Compare class names, not indices.",
        "For the one dataset with three classes the paper does not say which F1 averaging it used, so macro and weighted are both reported and neither is the paper's number.",
      ],
      instructions: [
        {
          title: "Prepare a dataset",
          runtime: "command_line",
          lines: [37, 39],
          heading: "Prepare, run and score",
        },
        {
          title: "Run and score an adapter",
          runtime: "command_line",
          lines: [47, 50],
          heading: "Prepare, run and score",
        },
      ],
    },
  },
  {
    key: "atom3d",
    benchmarkId: "discovery-benchmark-atom3d",
    name: "ATOM3D",
    repo: "drorlab/atom3d",
    commit: "4c2f3b7e9efe128791b83f03b2e8cae91e78b018",
    sha256: "6e404699412cb687bd737c4423c568f6ece1bad9f62a13e15ac1785062ccccd1",
    licence: "MIT",
    recipe: {
      title: "Download and load an ATOM3D task",
      summary:
        "Install the library and download one of the eight three-dimensional molecular tasks scored on this page.",
      inputs: ["A model over three-dimensional atomic structure."],
      outputs: ["An LMDB dataset for the chosen task and split."],
      data: "Downloaded by the library into a local LMDB dataset.",
      weights: "None. The reported networks are trained from scratch.",
      software: "Python with the atom3d package from PyPI.",
      hardware: unknownHardware,
      limitations: [
        "Two of the metrics on this page are errors where lower is better.",
        "The comparison methods appear in the paper only as citations.",
      ],
    },
    instructions: [
      {
        title: "Install",
        runtime: "command_line",
        lines: [24, 24],
        heading: "Installation",
      },
      {
        title: "Download a dataset",
        runtime: "python",
        lines: [42, 43],
        heading: "Downloading a dataset",
      },
      {
        title: "Load a dataset",
        runtime: "python",
        lines: [52, 55],
        heading: "Loading a dataset",
      },
    ],
  },
  {
    key: "gue",
    benchmarkId: "discovery-benchmark-gue",
    name: "DNABERT-2 and GUE",
    repo: "MAGICS-LAB/DNABERT_2",
    commit: "f25bed9ee20db966dff39e5c1571249d04e36404",
    sha256: "734a8cec5f667d74d421bf3b273ad7e256216109636da45aa7ceba21cd34de16",
    licence: "Apache-2.0",
    recipe: {
      title: "Evaluate a model on the GUE benchmark",
      summary:
        "Fine-tune and score a model across the GUE datasets, using the authors' own evaluation script.",
      inputs: [
        "A tokeniser and model checkpoint loadable by transformers.",
        "The GUE dataset directory.",
      ],
      outputs: ["Per-dataset scores under the split the benchmark fixes."],
      data: "The GUE archive, downloaded separately as the README describes.",
      weights: "A published checkpoint, or your own.",
      software:
        "Python with transformers and the repository's finetune scripts.",
      hardware: unknownHardware,
      limitations: [
        "Scores are MCC, except Covid variant classification which is F1.",
        "The diamond entry on this page is DNABERT-2 with further pre-training on the GUE training sets.",
      ],
    },
    instructions: [
      {
        title: "Load the model",
        runtime: "python",
        lines: [84, 88],
        heading: "4. Quick Start",
      },
      {
        title: "Evaluate on GUE",
        runtime: "command_line",
        lines: [138, 151],
        heading: "6.1 Evaluate models on GUE",
      },
    ],
  },
  {
    key: "bend",
    benchmarkId: "discovery-benchmark-bend",
    name: "BEND",
    repo: "frederikkemarin/BEND",
    commit: "ac6e80c75e09d83cf47a7b4bcf0e44599c5706cf",
    sha256: "a40358504726ee4e086f0623348fb2206c24ab8166d04a83d944579e9c62bdc8",
    licence: "BSD-3-Clause",
    recipe: {
      title: "Embed, train and evaluate on a BEND task",
      summary:
        "Precompute embeddings for a DNA language model, then train and score the downstream head on one of the seven tasks.",
      inputs: [
        "A supported embedder, or your own.",
        "The task data the repository downloads.",
      ],
      outputs: ["Precomputed embeddings and a scored downstream model."],
      data: "Downloaded by the repository's scripts.",
      weights: "A published DNA language model checkpoint.",
      software: "Python with the repository's environment and hydra configs.",
      hardware: unknownHardware,
      limitations: [
        "The metric differs by task, so the figures on this page cannot be averaged.",
        "The expert entries on this page are specialist models, each compared on one task only.",
      ],
    },
    instructions: [
      {
        title: "Precompute embeddings",
        runtime: "command_line",
        lines: [58, 58],
        heading: "3. Computing embeddings",
      },
      {
        title: "Train and evaluate on a task",
        runtime: "command_line",
        lines: [117, 117],
        heading: "Training and evaluating supervised models",
      },
      {
        title: "Score variant effects",
        runtime: "command_line",
        lines: [162, 162],
        heading: "Unsupervised tasks",
      },
    ],
  },
  {
    key: "beacon",
    benchmarkId: "discovery-benchmark-beacon",
    name: "BEACON",
    repo: "terry-r123/RNABenchmark",
    commit: "da7f9c7ac3f39605af27e1dfcdf879adba963d79",
    sha256: "0403f84453aace301c7d02895d94a977ccbbec77c3a94a49a23d0d529dd48d31",
    licence: "Apache-2.0",
    recipe: {
      title: "Fine-tune a model on a BEACON task",
      summary:
        "Clone the benchmark, then fine-tune a model on one of the thirteen RNA tasks scored on this page.",
      inputs: [
        "A model checkpoint and the task data laid out as the README shows.",
      ],
      outputs: ["A fine-tuned model and its score on the task's test split."],
      data: "Laid out under the repository's data directory as the README describes.",
      weights:
        "A published RNA language model checkpoint, or none for the supervised baselines.",
      software: "Python with the repository's environment.",
      hardware: unknownHardware,
      limitations: [
        "Metrics differ by task, and VDP is an error where lower is better.",
        "The Literature SOTA row in the paper is not part of this benchmark's own runs.",
      ],
    },
    instructions: [
      {
        title: "Clone and install",
        runtime: "command_line",
        lines: [20, 23],
        heading: "Installation",
      },
      {
        title: "Fine-tune on a task",
        runtime: "command_line",
        lines: [148, 149],
        heading: "Finetuning",
      },
      {
        title: "Compute embeddings",
        runtime: "python",
        lines: [155, 170],
        heading: "Computing embeddings",
      },
    ],
  },
  {
    key: "mrnabench",
    benchmarkId: "discovery-benchmark-mrnabench",
    name: "mRNABench",
    repo: "morrislab/mRNABench",
    commit: "74f96b8e6ae9f41cc3cccff089d826a62d5604b8",
    sha256: "f0c67304e20ced42938829dfee39480cef51ee3a4357ee8b53eafc89c305fa60",
    licence: "AGPL-3.0",
    recipe: {
      title: "Run a linear probe over mRNA embeddings",
      summary:
        "Install the package, embed a dataset with a supported model, and score the linear probe this page reports.",
      inputs: ["A supported embedding model, or your own embeddings."],
      outputs: ["Per-task probe scores over the benchmark's splits."],
      data: "Downloaded by the package.",
      weights: "A published mRNA or nucleotide model checkpoint.",
      software:
        "Python with the mrna-bench package and the model's own environment.",
      hardware: unknownHardware,
      limitations: [
        "Metrics alternate between AUPRC on a percentage scale and Pearson R.",
        "Each row on this page is the best checkpoint of a family, chosen by the authors.",
      ],
    },
    instructions: [
      {
        title: "Install",
        runtime: "command_line",
        lines: [34, 34],
        heading: "Datasets Only",
      },
      {
        title: "Load a dataset",
        runtime: "python",
        lines: [77, 80],
        heading: "Usage",
      },
      {
        title: "Embed and evaluate",
        runtime: "python",
        lines: [85, 109],
        heading: "Usage",
      },
    ],
  },
  {
    key: "hest",
    benchmarkId: "discovery-benchmark-hest-benchmark",
    name: "HEST",
    repo: "mahmoodlab/HEST",
    commit: "3ddb5eaf5bd2a8133e0c0e8015816489a3d99dc3",
    sha256: "3d002564045d3c493f30386df7983ee34b0f2f7ac89bf32ac63a5f780395d811",
    licence: "see repository",
    recipe: {
      title: "Install HEST and run the benchmark",
      summary:
        "Install the library with its benchmark extras, then evaluate a patch encoder across the ten cohorts on this page.",
      inputs: ["A histology patch encoder."],
      outputs: [
        "Per-cohort Pearson correlation from the benchmark's own head.",
      ],
      data: "HEST-1k, downloaded by the library.",
      weights: "A published patch encoder checkpoint.",
      software:
        "Python with the repository installed in editable mode and its benchmark extras.",
      hardware: unknownHardware,
      limitations: [
        "Every figure comes from the same Random Forest head, so it measures the encoder rather than a full pipeline.",
        "Cohorts differ in size and difficulty and are not comparable to each other.",
      ],
    },
    instructions: [
      {
        title: "Install",
        runtime: "command_line",
        lines: [46, 50],
        heading: "HEST-Library installation",
      },
      {
        title: "Add the benchmark extras",
        runtime: "command_line",
        lines: [56, 56],
        heading: "Additional dependencies (HEST-Benchmark)",
      },
      {
        title: "Inspect the data",
        runtime: "python",
        lines: [80, 83],
        heading: "Inspect HEST-1k with HEST-Library",
      },
    ],
  },
  {
    key: "perturbench",
    benchmarkId: "discovery-benchmark-perturbench",
    name: "PerturBench",
    repo: "altoslabs/perturbench",
    commit: "c84038bc1ea409aa54f3832cfa6f34f5059adf0c",
    sha256: "4aa29fa1d4333a72013fd2c60545218f0015b85b95b76878cbdb88962ff4e55d",
    licence: "see repository",
    recipe: {
      title: "Train and evaluate a perturbation model",
      summary:
        "Install the environment, load a benchmark dataset with its split, and train a model through the repository's configuration system.",
      inputs: [
        "A perturbation response model implemented against the repository's base class.",
      ],
      outputs: [
        "Trained model checkpoints and the evaluation the pipeline runs.",
      ],
      data: "Downloaded by the repository's dataset accessors.",
      weights: "None required; models are trained from the data.",
      software:
        "Python with the repository's conda environment and hydra configs.",
      hardware: unknownHardware,
      limitations: [
        "RMSE and both rank metrics on this page are better when lower.",
        "The two experiments use different datasets and are not comparable to each other.",
      ],
    },
    instructions: [
      {
        title: "Install",
        runtime: "command_line",
        lines: [17, 22],
        heading: "Install PerturBench",
      },
      {
        title: "Load a dataset",
        runtime: "python",
        lines: [35, 39],
        heading: "Dataset Access",
      },
      {
        title: "Apply the benchmark split",
        runtime: "python",
        lines: [49, 52],
        heading: "Data Splitting",
      },
      {
        title: "Train a model",
        runtime: "command_line",
        lines: [66, 66],
        heading: "Hydra Training Script",
      },
    ],
  },
  {
    key: "pfmbench",
    benchmarkId: "discovery-benchmark-pfmbench",
    name: "PFMBench",
    repo: "biomap-research/PFMBench",
    commit: "53758ffcbdf1d79b5d125383e4dd52d6fd59d2a1",
    sha256: "2736a9546e94b367e1bb3d1052e22460bb2188229d432b71eb9b01fe6b2a9b1a",
    licence: "see repository",
    recipe: {
      title: "Fine-tune and score a protein foundation model",
      summary:
        "Clone the benchmark, create its environment, and run either a fine-tuning task or the zero-shot evaluation.",
      inputs: ["A protein foundation model supported by the repository."],
      outputs: ["Per-task scores under the benchmark's own splits."],
      data: "Prepared by the repository as its README describes.",
      weights: "A published protein foundation model checkpoint.",
      software: "Python with the repository's conda environment.",
      hardware: unknownHardware,
      limitations: [
        "The metric differs by task, so the figures on this page cannot be averaged.",
        "Table 3 scores are adapter fine-tuning; the ProteinGym figure is zero-shot and not comparable to them.",
      ],
    },
    instructions: [
      {
        title: "Clone and create the environment",
        runtime: "command_line",
        lines: [29, 36],
        heading: "Installation",
      },
      {
        title: "Fine-tune a single task",
        runtime: "command_line",
        lines: [104, 109],
        heading: "Fine-tuning a single task",
      },
      {
        title: "Zero-shot evaluation",
        runtime: "command_line",
        lines: [115, 120],
        heading: "Zero-shot evaluation",
      },
    ],
  },
  {
    key: "nabench",
    benchmarkId: "discovery-benchmark-nabench",
    name: "NABench",
    repo: "mrzzmrzz/NABench",
    commit: "99c8681ec1eab706e10ff90a5c329dcf184cc1d1",
    sha256: "e9c0b76d743af53198b0197bfa58305bf26cff822538658d0366880fcf56a8a9",
    licence: "see repository",
    recipe: {
      title: "Embed and score a nucleotide model on NABench",
      summary:
        "Create the environment, produce embeddings for a model, and run the benchmark's own evaluation over the scored assays.",
      inputs: [
        "A nucleotide foundation model and the assay data the repository downloads.",
      ],
      outputs: ["Per-assay scores aggregated the way the benchmark defines."],
      data: "Downloaded as the README's data section describes.",
      weights: "A published nucleotide model checkpoint.",
      software:
        "Python with the repository's conda environment and requirements file.",
      hardware: unknownHardware,
      limitations: [
        "Zero-shot, few-shot and cross-validation figures come from different protocols and are not comparable.",
        "The per-type and overall figures on this page describe the same runs at different resolutions.",
      ],
    },
    instructions: [
      {
        title: "Create the environment",
        runtime: "command_line",
        lines: [99, 104],
        heading: "Usage and Reproducibility",
      },
      {
        title: "Produce embeddings",
        runtime: "command_line",
        lines: [114, 115],
        heading: "Usage and Reproducibility",
      },
      {
        title: "Evaluate",
        runtime: "command_line",
        lines: [122, 123],
        heading: "Usage and Reproducibility",
      },
    ],
  },
  {
    key: "glycanml",
    benchmarkId: "discovery-benchmark-glycanml",
    name: "GlycanML",
    repo: "GlycanML/GlycanML",
    commit: "9f392aa6f9c6d74a296a250199beb347923d04e0",
    sha256: "5237cd1af3f1d7b9cf07cfe3cf722987bb27e10ee356ec108584943446bbb836",
    licence: "Apache-2.0",
    recipe: {
      title: "Run a GlycanML task",
      summary:
        "Create the environment and run one of the benchmark's single-task or multi-task configurations.",
      inputs: ["A model configuration from the repository's config directory."],
      outputs: ["Task scores written by the run script."],
      data: "Prepared by the repository's configs.",
      weights: "None required; models are trained from the data.",
      software: "Python with the repository's conda environment and torchdrug.",
      hardware: unknownHardware,
      limitations: [
        "Task scores use different metrics and are not a single leaderboard.",
      ],
    },
    instructions: [
      {
        title: "Install",
        runtime: "command_line",
        lines: [30, 38],
        heading: "Installation",
      },
      {
        title: "Run a single task",
        runtime: "command_line",
        lines: [80, 81],
        heading: "Single-Task Learning",
      },
      {
        title: "Run the multi-task setting",
        runtime: "command_line",
        lines: [98, 99],
        heading: "Multi-Task Learning",
      },
    ],
  },
  {
    key: "massspecgym",
    benchmarkId: "discovery-benchmark-massspecgym",
    name: "MassSpecGym",
    repo: "pluskal-lab/MassSpecGym",
    commit: "f259fe3780d5bd227fc6ece36ce6f397c2eef716",
    sha256: "08bf3607e6e2e5462b81eac85d0e71d9d23ce1c9bf1a370c9d1079ecd60ee2d8",
    licence: "MIT",
    recipe: {
      title: "Load MassSpecGym and evaluate a model",
      summary:
        "Install the package and load the benchmark dataset that the scores on this page are measured over.",
      inputs: ["A model for one of the benchmark's spectrum tasks."],
      outputs: [
        "The benchmark dataset and the scores its evaluation produces.",
      ],
      data: "Downloaded by the package on first use.",
      weights: "None required.",
      software: "Python with the massspecgym package from PyPI.",
      hardware: unknownHardware,
      limitations: [
        "The tasks use different metrics and are scored separately.",
      ],
    },
    instructions: [
      {
        title: "Install",
        runtime: "command_line",
        lines: [43, 43],
        heading: "Installation",
      },
      {
        title: "Load the dataset",
        runtime: "python",
        lines: [76, 77],
        heading: "Getting started with MassSpecGym",
      },
    ],
  },
  {
    key: "dart-eval",
    benchmarkId: "discovery-benchmark-dart-eval",
    name: "DART-Eval",
    repo: "kundajelab/DART-Eval",
    commit: "af2a86d666c35304257c2fa7e15180e1fbcabb01",
    sha256: "d21ee86b56c9b794f5b58f3c39c3e27c51d027a3b280d848457abf53f521f052",
    licence: "see repository",
    recipe: {
      title: "Run the regulatory element identification task",
      summary:
        "Generate the task's dataset, then score a model zero-shot, probed or fine-tuned, which are the three settings this page separates.",
      inputs: ["A DNA language model supported by the repository."],
      outputs: ["Per-setting scores for the chosen task."],
      data: "Generated by the repository's dataset generators from ENCODE inputs.",
      weights: "A published DNA language model checkpoint.",
      software: "Python with the dnalm_bench package from the repository.",
      hardware: unknownHardware,
      limitations: [
        "The evaluation setting is part of the result: zero-shot, probed and fine-tuned runs of one model are different entries on this page.",
        "The commands take a model name through an environment variable, so each one runs a single model.",
      ],
    },
    instructions: [
      {
        title: "Generate the dataset",
        runtime: "command_line",
        lines: [39, 39],
        heading: "Dataset Generation",
      },
      {
        title: "Score zero-shot",
        runtime: "command_line",
        lines: [56, 56],
        heading: "Zero-shot likelihood analyses",
      },
      {
        title: "Extract embeddings",
        runtime: "command_line",
        lines: [84, 84],
        heading: "Probing models",
      },
      {
        title: "Train a probing model",
        runtime: "command_line",
        lines: [90, 90],
        heading: "Probing models",
      },
      {
        title: "Evaluate a probing model",
        runtime: "command_line",
        lines: [96, 96],
        heading: "Probing models",
      },
    ],
  },
];
