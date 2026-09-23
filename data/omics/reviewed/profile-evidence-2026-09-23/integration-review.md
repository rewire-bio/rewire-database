# Profile evidence integration review

Date: 2026-09-23. Review method: automated source review by separate research and review agents. No named human scientific review was performed, and no model was executed.

This bounded batch reviews 69 selected facts across 18 existing profiles: DNABERT-2, ESM-2, RNA-FM, scGPT, Boltz, ProteinGym and MFASS families, catalogue entries and specified configurations. The decision table records old and proposed text, status, source identifiers, URLs and evidence locations. Other profile claims retain their earlier review scope; this batch does not reverify the entire catalogue.

The independent review covers DNA/ESM/RNA and both protocols. Integration review separately checked the scGPT official data configuration, filtering code, author comment 2261459134, embedding defaults and cited supplement; and Boltz2 primary-paper XML passages describing the PDB cutoff, structural/distillation/affinity sources, 768-token training crop, steering and affinity workflow. Official README licence claims are kept separate from unresolved exact checkpoint identity. The scGPT author's presumed May15 replacement is not asserted to be identical to the May08 corpus. Boltz's PDB cutoff does not extend to all training data. The frozen DNABERT-2 pipeline remains distinct from the model family. ProteinGym bootstrap differences are not absolute score confidence intervals. MFASS legacy labels and superseded history are preserved.

The official RNA-FM weights registry returned HTTP401 during review. The generic MIT table declaration is acknowledged, while exact distribution terms and a weight digest remain unverified. Publisher-reported weight hashes for DNA/ESM are labelled as registry metadata; weights were not downloaded. Missing facts remain bounded source limitations rather than invented values.

Archived original source bytes are stored as deterministic gzip files. Source hashes refer to decompressed original bytes; this review manifest additionally hashes the compressed files. Existing source records and scientific values are unchanged. Profile patches bind to their prior profile hash and may only add source records or replace descriptive profiles.

Named scientific review and the broader metadata programme in issue31 remain outstanding. This review does not claim independent reproduction, freedom from training overlap, or equivalence between differently configured evaluations.
