# Benchmark literature collection, 17 September 2026

This release expands the catalogue with primary-source references and complete published comparison tables. It contains a dated discovery audit for all **221 benchmark records in the baseline inventory**, plus **26 complete tables containing 1,187 source cells**. This is an initial collection, not an exhaustive review of every benchmark or all published results.

The conversion adds **1,122 publishable numerical results**, **15 explicitly unavailable results** and **8 quarantined numerical results**. It reuses 26 existing result identities and preserves repeated source occurrences without counting them as independent evidence. The resulting comparison data supports **223 figures across 120 benchmark pages**, including previously reviewed AlphaGenome comparisons.

## Evidence and interpretation

The retained inputs record primary-paper URLs, source versions, retrieval dates, artifact hashes, table or cell locations, protocol context and discovery gaps. Each comparison keeps its dataset, split, metric, configuration and evidence origin. Author-reported evaluations, external evaluations and quoted historical scores remain distinguishable. Dataset population counts do not establish successful prediction coverage.

Independent automated reviewers checked transcriptions against primary artifacts and reviewed the integration. This does **not** imply human review or experimental reproduction. No model training or inference was performed for this collection. The eight quarantines concern ambiguous log-loss units in the viral-mimicry source; explicit unavailable cells remain null, never zero. Other unresolved metadata and unfinished numerical extraction remain documented in the discovery audits.

Historical result IDs, printed values, numerical values, metrics and units are preserved. Reviewed citation, direction and evaluation-context changes are separate overlays. Previous release archives remain the historical record.

## Retained publication inputs

- [Discovery audit](../../data/omics/reviews/benchmark-evidence-2026/search-audit.jsonl)
- [Source tables, receipts and partition audits](../../data/omics/reviews/benchmark-evidence-2026/inputs/)
- [Publication review and checksums](../../data/omics/reviews/benchmark-evidence-2026/review.json)
- [New records](../../data/omics/reviewed/benchmark-evidence-2026.jsonl) and [reviewed overlays](../../data/omics/reviewed/benchmark-evidence-overlays-2026.jsonl)
- [Source occurrences](../../data/omics/reviews/benchmark-evidence-2026/occurrences.json), [integration review](../../data/omics/reviews/benchmark-evidence-2026/integration-review.json) and [coverage summary](../../data/omics/reviews/benchmark-evidence-2026/summary.json)

## Verified converter reproduction

On 17 September 2026, the following commands were executed from the repository root using Python 3. The workspace was new and is ignored by Git. The scripts read the retained baseline release `2026-09-17-a757f4af4277`; they do not require the original research agents' workspaces, source downloads or model execution.

```sh
python3 - <<'PY'
from pathlib import Path
import shutil

source = Path('data/omics/reviews/benchmark-evidence-2026/inputs')
workspace = Path('workbench/benchmark-evidence-rebuild')
assert not workspace.exists(), 'Choose a new workspace rather than overwriting local work.'
shutil.copytree(source, workspace)
PY

python3 scripts/omics/research/normalize-benchmark-evidence.py workbench/benchmark-evidence-rebuild
python3 scripts/omics/research/integrate-benchmark-evidence.py workbench/benchmark-evidence-rebuild

cmp workbench/benchmark-evidence-rebuild/integrated/records.jsonl data/omics/reviewed/benchmark-evidence-2026.jsonl
cmp workbench/benchmark-evidence-rebuild/integrated/overlays.jsonl data/omics/reviewed/benchmark-evidence-overlays-2026.jsonl
cmp workbench/benchmark-evidence-rebuild/integrated/occurrences.json data/omics/reviews/benchmark-evidence-2026/occurrences.json
cmp workbench/benchmark-evidence-rebuild/integrated/summary.json data/omics/reviews/benchmark-evidence-2026/summary.json
```

All four generated files matched the reviewed artifacts byte-for-byte. Their SHA-256 hashes were:

| Generated file | SHA-256 |
|---|---|
| `records.jsonl` | `7afc20bf29f3f49ce46016dadbf5cda54b788d470f97662eb13ad693494dc6e1` |
| `overlays.jsonl` | `ae3b08011bcfb9416e0ee33b5259301b2e4734b4bbe232e2b347e6db4445f6f1` |
| `occurrences.json` | `77cf91571d120376b7c8d7d1215c081619ee6cbe10aea15337e72b83c33e4686` |
| `summary.json` | `a96a0fd9104df57df13ac1d2e05ce8bba36da32286393f53be00549d3e629363` |

This verifies deterministic conversion of the reviewed evidence into publication records. It does not reproduce the scientific experiments or refresh the literature search.
