# OpenADMET PXR discovery recovery

Preserves the six discovery records, one search-ledger entry and research note from blog commit `19949f47a0f0c1cb29f4e3f9f3f61998941549ab`. That commit postdated the closure of blog PR #322 and never reached the database repository.

These files are **pending review** and are not inputs to production catalogue generation. No model performance results are included. Original IDs, source URLs, retrieval metadata and record bytes are retained; provenance.json records file hashes.

## Before catalogue inclusion

- Adapt the old challenge/task relationships to the current catalogue contract. In a trial import, the two `has_task` relations failed current schema validation.
- Add records through a current additive input path: editing the original discovery.jsonl changes the inputs used to reconstruct the immutable September 16 release.
- Recheck official source hashes and phase-specific data availability. Resolve the announced 110 structural ligands versus the dataset card's 184 molecules, exact scoring membership, split manifests and scoring implementation before using these records for comparisons.
- Keep the original release timestamp out of the new release. Create and validate a new release only after review.

The source research note describes the original September 28 discovery; it is not a statement that this pending batch is already live.
