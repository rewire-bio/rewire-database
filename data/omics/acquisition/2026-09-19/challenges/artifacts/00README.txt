
This supplementary data accompanies the results of the CAFA3 and CAFApi experiments as described in "The CAFA challenge reports improved protein function prediction and new functional annotations for hundreds of genes through experimental screens" (Submitted 2019).

The aim is to provide (1) transparency (2) reproducibility and (3) archiving of the data used for the CAFA3 and CAFApi experiments. The data are provided under the CC-0 licence.

Official CAFA3 challenge website: https://www.synapse.org/#!Synapse:syn5840147/wiki/395753
Official CAFApi challenge website: https://www.synapse.org/#!Synapse:syn11533497/wiki/497636

The following describes the data in the repository. 

Many of the file contents are described by their names, using the following abbreviations which are elaborated upon in the paper:

MFO: Molecular Function Ontology
BPO: Biological Process Ontology
CCO: Cellular Component Ontology
NK (or type1): no-knowledge benchmarks
LK (or type2): limited-knowledge benchmarks
full: full mode (all) targets
partial: partial mode (>5,000 targets)
auc: area under the curve, term centric analysis
fmax: analysis scored by Fmax.
wfmax: analysis scored by weighted Fmax.
nsmin: analysis scored by normalized Smin
smin: analysis scored by Smin

Category code:
all: all benchmark
eukarya: all eukaryotic organisms
prokarya: all prokaryotic organisms
ARATH: Arabidopsis thaliana
DANRE: Danio rerio
DICDI: Dictyostelium discoideum
DROME: Drosophila melanogaster
ECOLI: Escherichia coli K12
HUMAN: Homo sapiens
MOUSE: Mus musculus
PSEAE: Pseudomonas aeruginosa
RAT: Rattus norvegicus
SCHPO: Schizosaccharomyces pombe
YEAST: Saccharomyces cerevisiae
CANAX: Candida albicans (strain SC5314 / ATCC MYA-2876)

Directory contents:
.
|-- cafa3
|   |-- benchmark20170605.tar  benchmark lists of proteins for each benchmark category from preliminary collection (README file available inside tarball)
|   |-- benchmark20171115.tar  benchmark lists of proteins for each benchmark category from final collection (README file available inside tarball)
|   |-- CAFA3_targets.tgz target proteins for CAFA3 experiment in fasta format (README file available inside tarball)
|   |-- plots CAFA3 result plots
|   |-- sheets CAFA3 result sheets, models are represented by anonymized IDs
|
|-- cafapi
|-- |-- benchmark
|   |-- |-- candida_biofilm
|   |   |   |-- target.237561.fasta  target file for CAFApi predictions in candida
|   |   |   |-- benchmark_can_biofilm.txt  experimental screening results for candida, 'T' means the genes is associated with biofilm formation, 'F' otherwise
|   |   |   |-- mapping_can_biofilm.txt    mapping between CGD (Candida Genome Database) gene name, CGD ID and Uniprot accession
|   |   |   |-- F_T_can_biofilm_annotations_ref.csv  genes already annotated with biofilm formation but NOT found to be associated in our experiment
|   |   |   |-- T_F_can_biofilm_annotations.tab  genes NOT annotated with biofilm formation NEWLY found to be associated in our experiment
|   |   |   |-- T_T_can_biofilm_annotations_ref.csv genes already annotated with biofilm formation AND found to be associated in our experiment
|   |-- |-- pseudomonas_biofilm
|   |   |   |-- target.208963.fasta  target file for CAFApi predictions in pseudomonas
|   |   |   |-- benchmark_pseu_biofilm.txt  experimental screening results for pseudomonas, 'T' means the genes is associated with biofilm formation, 'F' otherwise
|   |   |   |-- mapping_pseu_biofilm.txt    mapping between pseudomonas gene ID in the PA14 strain, PAO1 strain and Uniprot accession
|   |   |   |-- F_T_pseu_biofilm_annotations_ref.csv  genes already annotated with biofilm formation but NOT found to be associated in our experiment
|   |   |   |-- T_F_pseu_biofilm_annotations.tab  genes NOT annotated with biofilm formation NEWLY found to be associated in our experiment
|   |   |   |-- T_T_pseu_biofilm_annotations_ref.csv genes already annotated with biofilm formation AND found to be associated in our experiment
|   |-- |-- pseudomonas_motility
|   |   |   |-- target.208963.fasta  target file for CAFApi predictions in pseudomonas
|   |   |   |-- benchmark_pseu_motility.txt  experimental screening results for pseudomonas, 'T' means the genes is associated with motility, 'F' otherwise
|   |   |   |-- mapping_pseu_motility.txt    mapping between pseudomonas gene ID in the PA14 strain, PAO1 strain and Uniprot accession
|   |   |   |-- F_T_pseu_motility_annotations_ref.csv  genes already annotated with motility but NOT found to be associated in our experiment
|   |   |   |-- T_F_pseu_motility_annotations.tab  genes NOT annotated with motility NEWLY found to be associated in our experiment
|   |   |   |-- T_T_pseu_motility_annotations_ref.csv genes already annotated with motility AND found to be associated in our experiment
|-- |-- sheets CAFApi results, teams are represented by anonymized IDs. For candida and pseudomonas, CAFApi submissions were evaluated. For drosophila, CAFA3 submissions in Drosophila were extracted and evaluated.
