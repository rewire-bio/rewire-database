# Retrieval log

Date: 2026-09-30. Search engine and direct primary-source retrieval; no benchmark execution.

## Search queries

- #334: `GEARS genetic perturbation prediction Norman 2019 no perturb CPA supplementary table 6 benchmark`
- #335: `MassSpecGym MSAlign benchmark molecular structure retrieval formula unknown v2`
- #336: `plant core promoter Jores 2021 CNN linear model promoter strength R2`
- #337: `ProteinGym Tsuboyama stability benchmark FoldX Rosetta Spearman 2023`
- #337: `ProteinGym pinned repository tree: benchmarks/DMS_zero_shot/substitutions/Spearman`
- #338: `Rhomax rhodopsin wavelength prediction FLIP2 benchmark RMSE`
- #339: `Pangolin SpliceAI MFASS benchmark splice disrupting variants reporter performance`
- #340: `Optimus 5 prime Sample 2019 mean ribosome load model benchmark R2 0.93 designed UTR`

## Access and processing

- Primary RhoMax and FramePool PMC HTML pages returned browser verification pages to web access. Public Europe PMC fullTextXML endpoints succeeded; exact XML bytes retained.
- Jores publisher page exposed abstract and figure links; the author-hosted version-of-record PDF succeeded. `pdftotext -layout` extracted Fig8/Methods; no values were inferred by digitising plots.
- FramePool S1 and S4 were retrieved directly from the publisher supplemental-file endpoints. ZIP/XML parsing preserved all printed cell values. S7 was rendered to verify metric labels.
- ProteinGym repository tree was read using the GitHub API to locate the exact assay-level CSV at the existing metadata commit. Direct pinned raw CSV retrieval succeeded.
- MSAlign unversioned PDF returned v2 with a changed hash. Explicit v1 PDF retrieval returned HTTP406. The v2 source record uses a versioned URL, records the actual unversioned retrieval URL, and pins the bytes by SHA256.
- Fresh GEARS supplement, AgroNT Fig3e source table, mRNABench primary XML, PerturBench v1 and ProteinGym reference metadata matched their existing source hashes.
- Fresh matched-MFASS, MFASS prior and both local mRNABench reports matched existing hashes.
- Raw artifacts, parser script and extracted text remain ignored under workbench/use-case-coverage/experimental. Tracked records contain source URLs, SHA256, exact table/cell locators and review scope.
