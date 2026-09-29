# Research evidence inputs

`manifests.json` describes verified evidence for specific dataset/evaluation pairs. It records exact artifact hashes, original identifiers, metric definitions, source catalogue releases, exposure, limitations and allowed local recipes. A successful source audit alone does not make a dataset ready for research.

`investigations.json` contains only reports that have received explicit human review. It is initially empty. Worker output belongs in ignored `workbench/research-imports/`; staging a report does not publish it or change its review status.

These files add versioned research sidecars to a new catalogue release. They do not replace scientific records or rewrite historical releases. A manifest's source release can precede the release containing the manifest.

## Preparing the initial evidence

The four seed manifests are produced by `scripts/prepare-research-seeds.py` in the sibling `rewire-benchmarks` repository. The script checks the preserved MFASS v2, ProteinGym AMFR, mRNABench Sample designed and FLIP2 Rhomax results. It requires the original local artifacts; re-preparing a dataset can change opaque identifiers and is not a substitute.

Only copy the resulting `manifests.json` here. Keep normalized observation tables, original prepared data, private path resolvers and execution logs in the runner's ignored workspace. A null artifact URI means that the exact artifact must be supplied through a private resolver; it is not publicly downloadable from this catalogue. Hashes establish identity, not redistribution permission.

See [the operator guide](../../docs/omics/research-investigations.md) for readiness, execution and review.
