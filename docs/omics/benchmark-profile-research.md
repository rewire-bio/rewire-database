# Benchmark profile research and coverage

Reviewed: 16 September 2026. Review method: automated source review; no human review or new model execution is claimed.

Coverage: **170 / 170 records**, including **40 reviewed explanations** and **130 limited explanations with explicit evidence gaps**. 'Reviewed' describes the explanatory prose only: it does not upgrade a record, protocol, numeric result or reproduction status.

## What was checked

- Pinned official README documents were inspected for task identity, procedure, inputs, scoring, split controls and limitations. Where only an overview was available, the profile does not invent an executable protocol.
- MFASS was checked against the local runner repository at `bee9133b83f3aedaf2bbb9013f1875515845607e`, specifically `benchmarks/mfass/README.md` and the existing v2 run export. v1 remains superseded.
- BarcodeBERT methods were read from the full-text XML linked by the source record: Dataset / Data partitioning, genus-level nearest-neighbour probing, and Table 1. The species-disjoint query set is not an unseen-genus evaluation.
- scIB metrics and integration methods were checked against its pinned README. The Open Problems task-directory entry was also inspected. Their links to the generic batch-integration task are associations, not identical protocol identities.
- Child tasks in CAMI, GlycanML, MassSpecGym and TAPE have source-backed suite membership. Their profiles remain limited until component split manifests and scoring configurations are extracted.
- The other paper-specific tasks expose their existing dataset, split, procedure and metric extractions with exact table locations. A deterministic table-cell check is not a complete methods review; these profiles remain limited.
- Generic task guides describe proposed evaluation designs and task-specific failure modes. They are not claims that the listed candidate baselines were run.

## Coverage by record group

| Group | Reviewed | Limited |
|---|---:|---:|
| catalog-task- | 3 | 17 |
| discovery-benchmark- | 34 | 16 |
| reported-task- | 1 | 97 |
| rewire-mfass- | 2 | 0 |

## Primary-source retrieval ledger

SHA-256 hashes refer to bytes retrieved during this review. The original source records and archived release hashes were not changed. Non-GitHub sites are living pages; their explanations are dated and do not imply a frozen challenge release. Browser retrieval succeeded for CAFA and the Virtual Cell Challenge after direct HTTP retrieval was rejected.

| Source ID | Primary URL | Retrieval SHA-256 | Outcome |
|---|---|---|---|
| src-discovery-altoslabs-perturbench | https://github.com/altoslabs/perturbench/blob/c84038bc1ea409aa54f3832cfa6f34f5059adf0c/README.md | 4aa29fa1d4333a72013fd2c60545218f0015b85b95b76878cbdb88962ff4e55d | Retrieved primary document |
| src-discovery-benchmarking-initiative-benchmark-models-petab | https://github.com/Benchmarking-Initiative/Benchmark-Models-PEtab/blob/ddaa86d13f708926c57ec8918ce75a6b50e2e562/README.md | 5a089ca429ed2a314e257fddacd70251c863e62a3547b793c38f56785861cac1 | Retrieved primary document |
| src-discovery-biomap-research-pfmbench | https://github.com/biomap-research/PFMBench/blob/53758ffcbdf1d79b5d125383e4dd52d6fd59d2a1/readme.md | 2736a9546e94b367e1bb3d1052e22460bb2188229d432b71eb9b01fe6b2a9b1a | Retrieved primary document |
| src-discovery-cafa | https://biofunctionprediction.org/cafa/ | not recorded | HTTP Error 406: Not Acceptable |
| src-discovery-cami | https://cami-challenge.org/ | 17825bf33280f40b596a104c547b57fae5ee5c07f8d60b396d0f4780d47ef9a5 | Retrieved primary document |
| src-discovery-cami-challenge-amber | https://github.com/CAMI-challenge/AMBER/blob/f8b3a601043d13fc4227d5691c13561eb4490e50/README.md | 5908389c2f1f5797ffb73d45776684ff0b34c0fc61a69a2b5b9dbd88df58dcec | Retrieved primary document |
| src-discovery-cami-challenge-opal | https://github.com/CAMI-challenge/OPAL/blob/98120c326eef08e391899e4bd3a362e0e6558b4a/README.md | d123b202234d3ed520911982dcf88e2fcfd888c83e65378effb2d2e269d0abb1 | Retrieved primary document |
| src-discovery-capri | https://www.capri-docking.org/ | 5e22606895cf0c30565ed4456bc680ca97c10c8c5d38054f82a6e4677c8d8c24 | Retrieved primary document |
| src-discovery-casp | https://predictioncenter.org/ | de391b68636462ddb78d0659d8784128909d23e9c015832cca94d883f404a3f7 | Retrieved primary document |
| src-discovery-darlednik-geneb | https://github.com/darlednik/GENEB/blob/9642d481e40c0af23995dcd162b779613f789f97/README.md | 0f2074b432ba2516d0ea05fafab833e953201a3fbe0129c5b6beed9f5f089e81 | Retrieved primary document |
| src-discovery-drorlab-atom3d | https://github.com/drorlab/atom3d/blob/4c2f3b7e9efe128791b83f03b2e8cae91e78b018/README.md | 6e404699412cb687bd737c4423c568f6ece1bad9f62a13e15ac1785062ccccd1 | Retrieved primary document |
| src-discovery-flip2 | https://flip.protein.properties/ | cd991ae6e76a5e84ea5449f91c4ed86ba4f57942682dc3c50d872c366bbbd4b7 | Retrieved primary document |
| src-discovery-frederikkemarin-bend | https://github.com/frederikkemarin/BEND/blob/ac6e80c75e09d83cf47a7b4bcf0e44599c5706cf/README.md | a40358504726ee4e086f0623348fb2206c24ab8166d04a83d944579e9c62bdc8 | Retrieved primary document |
| src-discovery-glycanml-glycanml | https://github.com/GlycanML/GlycanML/blob/9f392aa6f9c6d74a296a250199beb347923d04e0/README.md | 5237cd1af3f1d7b9cf07cfe3cf722987bb27e10ee356ec108584943446bbb836 | Retrieved primary document |
| src-discovery-j-snackkb-flip | https://github.com/J-SNACKKB/FLIP/blob/62cace8735f5610e2743cf06ce0f944b37fffaa6/README.md | f6e3b46a5f6744806846ccb4a054bcf3bec3da3d4249ada42fb9acac2a32024d | Retrieved primary document |
| src-discovery-kundajelab-dart-eval | https://github.com/kundajelab/DART-Eval/blob/af2a86d666c35304257c2fa7e15180e1fbcabb01/README.md | d21ee86b56c9b794f5b58f3c39c3e27c51d027a3b280d848457abf53f521f052 | Retrieved primary document |
| src-discovery-maabuu-posebusters | https://github.com/maabuu/posebusters/blob/6236d07017493531851cce775e8ef834d4763d2f/README.md | 71fee661aba53ea2285b776d572982a57c8637275687dfe4c5b7f5113a807d0e | Retrieved primary document |
| src-discovery-magics-lab-dnabert-2 | https://github.com/MAGICS-LAB/DNABERT_2/blob/f25bed9ee20db966dff39e5c1571249d04e36404/README.md | 734a8cec5f667d74d421bf3b273ad7e256216109636da45aa7ceba21cd34de16 | Retrieved primary document |
| src-discovery-mahmoodlab-hest | https://github.com/mahmoodlab/HEST/blob/3ddb5eaf5bd2a8133e0c0e8015816489a3d99dc3/README.md | 3d002564045d3c493f30386df7983ee34b0f2f7ac89bf32ac63a5f780395d811 | Retrieved primary document |
| src-discovery-mims-harvard-tdc | https://github.com/mims-harvard/TDC/blob/c310c35f27e3f506411018ac43d97b8ba23ca652/README.md | e2dacff9ad56bca50c31373a1e87041eef948721b8aa0be001a95185c375c15f | Retrieved primary document |
| src-discovery-ml-bioinfo-ceitec-genomic-benchmarks | https://github.com/ML-Bioinfo-CEITEC/genomic_benchmarks/blob/605d8539830e16c85abe7826990958303ffc5e1c/README.md | 926f0f196439564b095cbabe65f6a0acee3f22afbb0f6c8fe50bb3964082d15b | Retrieved primary document |
| src-discovery-morrislab-mrnabench | https://github.com/morrislab/mRNABench/blob/74f96b8e6ae9f41cc3cccff089d826a62d5604b8/README.md | f0c67304e20ced42938829dfee39480cef51ee3a4357ee8b53eafc89c305fa60 | Retrieved primary document |
| src-discovery-mrzzmrzz-nabench | https://github.com/mrzzmrzz/NABench/blob/99c8681ec1eab706e10ff90a5c329dcf184cc1d1/README.md | e9c0b76d743af53198b0197bfa58305bf26cff822538658d0366880fcf56a8a9 | Retrieved primary document |
| src-discovery-murali-group-beeline | https://github.com/Murali-group/Beeline/blob/37464085eb8a95d6cc6a3d3a3c649d36db6052ed/README.md | b9e620179f6b9a9aafd9eaf8b874b8f1fa2c8c4ffdced39f2e075391ec3d476d | Retrieved primary document |
| src-discovery-oatml-markslab-proteingym | https://github.com/OATML-Markslab/ProteinGym/blob/144fe22b07dfaeec2b366f2346203a9838a55b4c/README.md | 321487a8de52c6cfa647a658f61150dd72e0acb0125470524fb94d1f8b23321a | Retrieved primary document |
| src-discovery-openproblems-bio-openproblems | https://github.com/openproblems-bio/openproblems/blob/0ca5d0cd040b741c1b6cc2e4cad7230cb2c50131/README.md | ee26d791b60868c3e7701357831a49d8325f8d4d7cb0769b5177e5a67713114b | Retrieved primary document |
| src-discovery-plinder-org-plinder | https://github.com/plinder-org/plinder/blob/85b3f1cb1763530a6cfd934f4263a1777c41afa4/README.md | 1d53c3b89030dc4651d3e7bf4749256b7e579330fc7a660cffaa992d646da34a | Retrieved primary document |
| src-discovery-pluskal-lab-massspecgym | https://github.com/pluskal-lab/MassSpecGym/blob/f259fe3780d5bd227fc6ece36ce6f397c2eef716/README.md | 08bf3607e6e2e5462b81eac85d0e71d9d23ce1c9bf1a370c9d1079ecd60ee2d8 | Retrieved primary document |
| src-discovery-proteinbench | https://proteinbench.github.io/ | 2e488850a6557bb57407615f2df9194351718b3dc0298a03c0c97d8e93460712 | Retrieved primary document |
| src-discovery-songlab-cal-tape | https://github.com/songlab-cal/tape/blob/6d345c2b2bbf52cd32cf179325c222afd92aec7e/README.md | b28c74fe3cd6b69a8ba6d84891d0539e54dfef882abd5ed4d11ed0b029bb477a | Retrieved primary document |
| src-discovery-terry-r123-rnabenchmark | https://github.com/terry-r123/RNABenchmark/blob/da7f9c7ac3f39605af27e1dfcdf879adba963d79/README.md | 0403f84453aace301c7d02895d94a977ccbbec77c3a94a49a23d0d529dd48d31 | Retrieved primary document |
| src-discovery-theislab-scib | https://github.com/theislab/scib/blob/cd67913396b4c0430710b3d90f1d1841f5fa4468/README.md | db7aa3a701778d541bf47d8214b50e1ce9f73e92dc3e810bfd740270e9e353aa | Retrieved primary document |
| src-discovery-vcc2026 | https://arcinstitute.org/news/virtual-cell-challenge-2026 | not recorded | HTTP Error 403: Forbidden |
| src-discovery-virtual-cell-research-community-scperteval | https://github.com/Virtual-Cell-Research-Community/scPertEval/blob/4685f11927e887745737600170da7a655b727553/README.md | d8522e585806ec0008a36558e0dd1f6f0b0bb4deffb3f64a7ee4f09cd087e9f4 | Retrieved primary document |

Additional primary pages inspected:

- https://openproblems.bio/benchmarks/ (Batch Integration entry, retrieved 2026-09-16).
- https://www.ebi.ac.uk/europepmc/webservices/rest/PMC13008329/fullTextXML (BarcodeBERT; sections and Table 1 above).

## Source limitations and follow-up

The limited records are deliberately not described as fully researched protocols. For the paper-specific records, exact split membership, source dataset revisions, permitted inputs, hyperparameter selection and evaluator implementations remain to be reviewed in their original methods and supplements. Each profile names the dataset and retained paper-specific procedure so this work can be completed without guessing from a broad task label.

For suite records, a reviewed introduction is not sufficient to submit a comparable result. New numerical evaluations still need a concrete release, task, dataset, split, configuration and metric implementation. No measurements were added, altered or inferred by this enrichment.

## Validation

- All 170 benchmark IDs appear exactly once. Each has a text-equivalent procedure or conceptual diagram; incomplete paper outlines and proposed task designs are labelled explicitly.
- Every cited source ID exists and is a source record.
- All association subjects and targets exist; no alias/identity relationships were inferred.
- No legacy scientific result, dataset identity or archived release file was edited.

## Limited-record ledger

| Record | Specific remaining evidence gap |
|---|---|
| catalog-task-cell-perturbation | A concrete protocol, dataset release, split manifest and metric implementation must be selected and source-checked. Candidate comparisons in this guide are proposals, not recorded evaluations. |
| catalog-task-cell-reference-mapping | A concrete protocol, dataset release, split manifest and metric implementation must be selected and source-checked. Candidate comparisons in this guide are proposals, not recorded evaluations. |
| catalog-task-community-profiling | A concrete protocol, dataset release, split manifest and metric implementation must be selected and source-checked. Candidate comparisons in this guide are proposals, not recorded evaluations. |
| catalog-task-complex-structure | A concrete protocol, dataset release, split manifest and metric implementation must be selected and source-checked. Candidate comparisons in this guide are proposals, not recorded evaluations. |
| catalog-task-enhancer-effects | A concrete protocol, dataset release, split manifest and metric implementation must be selected and source-checked. Candidate comparisons in this guide are proposals, not recorded evaluations. |
| catalog-task-heldout-clade | A concrete protocol, dataset release, split manifest and metric implementation must be selected and source-checked. Candidate comparisons in this guide are proposals, not recorded evaluations. |
| catalog-task-ligand-affinity | A concrete protocol, dataset release, split manifest and metric implementation must be selected and source-checked. Candidate comparisons in this guide are proposals, not recorded evaluations. |
| catalog-task-ligand-pose | A concrete protocol, dataset release, split manifest and metric implementation must be selected and source-checked. Candidate comparisons in this guide are proposals, not recorded evaluations. |
| catalog-task-long-range-regulation | A concrete protocol, dataset release, split manifest and metric implementation must be selected and source-checked. Candidate comparisons in this guide are proposals, not recorded evaluations. |
| catalog-task-microbial-promoters | A concrete protocol, dataset release, split manifest and metric implementation must be selected and source-checked. Candidate comparisons in this guide are proposals, not recorded evaluations. |
| catalog-task-phage-pathogen-reads | A concrete protocol, dataset release, split manifest and metric implementation must be selected and source-checked. Candidate comparisons in this guide are proposals, not recorded evaluations. |
| catalog-task-protein-design | A concrete protocol, dataset release, split manifest and metric implementation must be selected and source-checked. Candidate comparisons in this guide are proposals, not recorded evaluations. |
| catalog-task-protein-monomer-structure | A concrete protocol, dataset release, split manifest and metric implementation must be selected and source-checked. Candidate comparisons in this guide are proposals, not recorded evaluations. |
| catalog-task-rna-secondary-structure | A concrete protocol, dataset release, split manifest and metric implementation must be selected and source-checked. Candidate comparisons in this guide are proposals, not recorded evaluations. |
| catalog-task-rna-splice-sites | A concrete protocol, dataset release, split manifest and metric implementation must be selected and source-checked. Candidate comparisons in this guide are proposals, not recorded evaluations. |
| catalog-task-rna-tertiary-structure | A concrete protocol, dataset release, split manifest and metric implementation must be selected and source-checked. Candidate comparisons in this guide are proposals, not recorded evaluations. |
| catalog-task-utr-translation | A concrete protocol, dataset release, split manifest and metric implementation must be selected and source-checked. Candidate comparisons in this guide are proposals, not recorded evaluations. |
| discovery-benchmark-cami-genome-binning | Component-specific split manifest and complete scoring configuration have not yet been extracted. |
| discovery-benchmark-cami-metagenome-assembly | Component-specific split manifest and complete scoring configuration have not yet been extracted. |
| discovery-benchmark-cami-taxonomic-binning | Component-specific split manifest and complete scoring configuration have not yet been extracted. |
| discovery-benchmark-cami-taxonomic-profiling | Component-specific split manifest and complete scoring configuration have not yet been extracted. |
| discovery-benchmark-glycanml-glycosylation-type-prediction | Component-specific split manifest and complete scoring configuration have not yet been extracted. |
| discovery-benchmark-glycanml-immunogenicity-prediction | Component-specific split manifest and complete scoring configuration have not yet been extracted. |
| discovery-benchmark-glycanml-protein-glycan-interaction-prediction | Component-specific split manifest and complete scoring configuration have not yet been extracted. |
| discovery-benchmark-glycanml-taxonomy-prediction | Component-specific split manifest and complete scoring configuration have not yet been extracted. |
| discovery-benchmark-massspecgym-de-novo-molecule-generation | Component-specific split manifest and complete scoring configuration have not yet been extracted. |
| discovery-benchmark-massspecgym-molecule-retrieval | Component-specific split manifest and complete scoring configuration have not yet been extracted. |
| discovery-benchmark-massspecgym-spectrum-simulation | Component-specific split manifest and complete scoring configuration have not yet been extracted. |
| discovery-benchmark-tape-contact-prediction | Component-specific split manifest and complete scoring configuration have not yet been extracted. |
| discovery-benchmark-tape-fluorescence | Component-specific split manifest and complete scoring configuration have not yet been extracted. |
| discovery-benchmark-tape-remote-homology-detection | Component-specific split manifest and complete scoring configuration have not yet been extracted. |
| discovery-benchmark-tape-secondary-structure | Component-specific split manifest and complete scoring configuration have not yet been extracted. |
| discovery-benchmark-tape-stability | Component-specific split manifest and complete scoring configuration have not yet been extracted. |
| reported-task-003d746a129c9b | Dataset release/accession and complete split manifest for stimulated immune PBMC have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-00e594df6a182d | Dataset release/accession and complete split manifest for PRIME mutated RBD have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-016f70615f2cfc | Dataset release/accession and complete split manifest for DEBFold TestSetβ have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-031186b57c62de | Dataset release/accession and complete split manifest for Human thymus scRNA-seq have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-0647b0364def8f | Dataset release/accession and complete split manifest for antibody peptide-mapping training dataset have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-09c3100b77dcc5 | Dataset release/accession and complete split manifest for Bernett PPI dataset have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-0c92cda11228c4 | Dataset release/accession and complete split manifest for Antibody–antigen GEP test set have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-132da895d4c381 | Dataset release/accession and complete split manifest for Genomic Benchmarks Mouse Enhancers have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-13dfe6b33e71ed | Dataset release/accession and complete split manifest for poly(A) Gene-Gene have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-167f08013c270e | Dataset release/accession and complete split manifest for scXDR transfer scenario 2 have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-1c74661df2c401 | Dataset release/accession and complete split manifest for flu-vaccine sequences have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-1ebf9b408517f9 | Dataset release/accession and complete split manifest for FUJISAN test sub-dataset have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-22024610c4d658 | Dataset release/accession and complete split manifest for enhancer independent comparison have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-2cbac97dd849f5 | Dataset release/accession and complete split manifest for DNALongBench ETGP have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-3063ed4da76b4b | Dataset release/accession and complete split manifest for hESC cell-type-specific GRN have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-3109f8d0f2b7b5 | Dataset release/accession and complete split manifest for Andropogoneae genome-wide conservation have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-369dcfef14c4a9 | Dataset release/accession and complete split manifest for Simulated viral metagenome have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-3891811dcce8b3 | Dataset release/accession and complete split manifest for E. coli sigma70 promoter dataset have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-3a3bff34cce634 | Dataset release/accession and complete split manifest for CoBRA compound-binding test set have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-3d4dec23120fef | Dataset release/accession and complete split manifest for testing viral metagenome dataset have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-4420dcdfe8338d | Dataset release/accession and complete split manifest for AMP have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-45105e1c486251 | Dataset release/accession and complete split manifest for CAMI II Sample_0 10,000-read subsample have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-45ead9a1eddf8d | Dataset release/accession and complete split manifest for HIV neutralization have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-46e927bea10702 | Dataset release/accession and complete split manifest for MirTarRAW have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-47465954d606e6 | Dataset release/accession and complete split manifest for vaccine candidate validation have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-4df1fb456d3deb | Dataset release/accession and complete split manifest for Aorta single-cell dataset have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-53506fe386e4a1 | Dataset release/accession and complete split manifest for human and viral proteins have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-53e3d216eef6db | Dataset release/accession and complete split manifest for 20 medium/high-complexity viral simulations have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-5693847493f19f | Dataset release/accession and complete split manifest for mRNA half-life have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-571f0a2e7faed3 | Dataset release/accession and complete split manifest for HumanGut-all strain-level query have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-57dc3dcdb67a81 | Dataset release/accession and complete split manifest for mRNABench MRL-MPRA have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-5b929593eefc76 | Dataset release/accession and complete split manifest for M.S. single-cell dataset have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-5ec7581b246ea6 | Dataset release/accession and complete split manifest for RNA8F have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-6243658a1bc215 | Dataset release/accession and complete split manifest for ProteinGym substitution DMS: stability assays have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-6312c8a7ac045e | Dataset release/accession and complete split manifest for non-immune cells have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-6330d593980b5b | Dataset release/accession and complete split manifest for Zymo LOG 10% have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-64607443a9ba15 | Dataset release/accession and complete split manifest for human enhancer dataset have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-660753ec94e631 | Dataset release/accession and complete split manifest for hPancreas have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-6e54c7452b2b81 | Dataset release/accession and complete split manifest for HumanPPI have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-7621fa1be55362 | Dataset release/accession and complete split manifest for HPA-FoV have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-77a32496ce8fe6 | Dataset release/accession and complete split manifest for CASF-2016 have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-786c09824e9bf5 | Dataset release/accession and complete split manifest for CLA-IND0.6 have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-7efe245cc94ee5 | Dataset release/accession and complete split manifest for L1000 have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-82fc7843f07324 | Dataset release/accession and complete split manifest for human RNA 2OMe sites have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-83be0998084c91 | Dataset release/accession and complete split manifest for variant-effects benchmark have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-8406b6aabfb8c0 | Dataset release/accession and complete split manifest for Real mock community MAGs have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-86a628af87ff8f | Dataset release/accession and complete split manifest for Liu training dataset have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-92137759a9e7b0 | Dataset release/accession and complete split manifest for CAMI II Toy human gastrooral sample19-new have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-94802534b7026d | Dataset release/accession and complete split manifest for Fingerprint-scoring benchmark have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-988ff78f86471e | Dataset release/accession and complete split manifest for Human 5mC have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-9917a0e69f33e7 | Dataset release/accession and complete split manifest for DNA-129_Test have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-99afd88cb12895 | Dataset release/accession and complete split manifest for immune tissue have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-9f62e739c6371e | Dataset release/accession and complete split manifest for GUE H-CPD have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-9f9ab0090f6522 | Dataset release/accession and complete split manifest for GenomeOcean natural/artificial sequence test have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-a1151e386a3d3f | Dataset release/accession and complete split manifest for 23 independent prokaryotic promoter test sets have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-a2bf7ddbc71d23 | Dataset release/accession and complete split manifest for bpRNA-new have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-a2c37b8c420bc3 | Dataset release/accession and complete split manifest for CAMI II Sample_0 10,000-read subsample have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-a5141363b0ee45 | Dataset release/accession and complete split manifest for ProteinShake VEP datasets have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-a7803ecf7708cc | Dataset release/accession and complete split manifest for CASF-2016 blind docked poses have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-a78312d5df6dad | Dataset release/accession and complete split manifest for CASF-2016 have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-ac191e878dff5e | Dataset release/accession and complete split manifest for genome-wide TF binding sites have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-b00a636d1ed8d9 | Dataset release/accession and complete split manifest for T18 have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-b181ed450cdd41 | Dataset release/accession and complete split manifest for SJC have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-b46b7b839bff93 | Dataset release/accession and complete split manifest for PBMCs-BS have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-b9199a30a0bcb2 | Dataset release/accession and complete split manifest for Yoruban LCL dsQTLs have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-bf513ed6db92c5 | Dataset release/accession and complete split manifest for PLINDER-L95 have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-c04bb5ee6ecea6 | Dataset release/accession and complete split manifest for Boltz-1 structure test set have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-c40dac20d9af66 | Dataset release/accession and complete split manifest for extremely long-sequence species classification have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-c4a578065f44b2 | Dataset release/accession and complete split manifest for TRX have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-c7a8a372f77886 | Dataset release/accession and complete split manifest for ProteinGym substitutions have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-c7ce06b753b8b6 | Dataset release/accession and complete split manifest for ncRNA interaction pairs have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-c98e91ffc7247d | Dataset release/accession and complete split manifest for CATH superfamily benchmark have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-c9d2a6435979e9 | Dataset release/accession and complete split manifest for KEx have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-cd127e56fb1f04 | Dataset release/accession and complete split manifest for genomic benchmark categories have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-cdbee1c9285568 | Dataset release/accession and complete split manifest for DART-Eval cCREs versus matched shuffled controls have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-d1c46526c39983 | Dataset release/accession and complete split manifest for PoseBusters have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-d3fd502fdc2b38 | Dataset release/accession and complete split manifest for MetaHIT have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-d5f897ab0f6f67 | Dataset release/accession and complete split manifest for SARS-CoV-2 Mpro ligands have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-d6018ca598e525 | Dataset release/accession and complete split manifest for AIDA v2 PBMC cohort have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-d635fc6c281a27 | Dataset release/accession and complete split manifest for liver editing sites have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-d7e6274011946e | Dataset release/accession and complete split manifest for mRNA-RBP pairs have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-d81be76396e644 | Dataset release/accession and complete split manifest for PDBbind core v2016 have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-d82b6284f3f431 | Dataset release/accession and complete split manifest for MosA1 reference → WholeBrainA query have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-dc82fcbfb44935 | Dataset release/accession and complete split manifest for PDB RNA set have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-dd001540e0f4ec | Dataset release/accession and complete split manifest for LAMBDA genome-wide prophage test have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-dec9e0f5e3da2a | Dataset release/accession and complete split manifest for α-synuclein Ligand 47 MD ensemble have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-df18c710f45213 | Dataset release/accession and complete split manifest for Rfam have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-dfa8f2285dbfa5 | Dataset release/accession and complete split manifest for paper PPI test set have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-e2009c35eabd69 | Dataset release/accession and complete split manifest for CRC microbiome cohort have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-e5c34f686ac403 | Dataset release/accession and complete split manifest for Independent E. coli sigma70 test dataset have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-ed3dd3b83c4505 | Dataset release/accession and complete split manifest for ClinVar 3-prime UTR variants have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-ee34721cf55590 | Dataset release/accession and complete split manifest for gene fusion breakpoint DNA sequences have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-f0ed5188dbb6d4 | Dataset release/accession and complete split manifest for Dset_448 have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-f3a12dbc0e0439 | Dataset release/accession and complete split manifest for ImmuneBuilder antibody test set have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-f4b1c9373f0929 | Dataset release/accession and complete split manifest for ICCTax Complete dataset have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-f7142c3b3e0f3c | Dataset release/accession and complete split manifest for human ultra-long mRNAs have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
| reported-task-ff2dec63c5a3dd | Dataset release/accession and complete split manifest for LiPP lipid–protein complexes have not been verified in this profile. Allowed inputs, model selection and evaluator implementation require methods-level review. |
