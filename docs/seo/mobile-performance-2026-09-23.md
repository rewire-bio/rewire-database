# Mobile performance baseline — 23 September 2026

The four largest benchmark pages tested carry **1.08–1.52 MB of decoded HTML**, with **90–94% inline React Flight scripts**. Their data repeatedly embeds the same scientific records. The measured opportunity is payload reduction; these runs do **not** establish severe startup blocking.

This is the **before** receipt for [issue #39](https://github.com/rewire-bio/rewire-database/issues/39). After-deployment timing and live functional validation are **pending**, and their completion receipt belongs on that issue. No after result is claimed here.

## Source and method

Measured the actual public production site at `https://benchmarks.rewire.it`, baseline commit `4f354d9df8037e61b187a15831d88c4bef8d0026`, Hosting `32f3ab9d36d4e615` (parent deployment verification), catalogue `2026-09-22-f58a0f1d267f`. The four record IDs came from that immutable catalogue. No Next dev timings or full local build were used.

Chrome **153.0.8010.54**, headless on **Apple M4 / arm64, 16 GiB**, used **390×844 CSS pixels, DPR1**, actual Chrome UA, **4× CPU slowdown**, **150 ms latency**, **1.6 Mbps down / 750 Kbps up** via CDP. Three sequential round-robin runs per page used a fresh isolated browser context, cache disabled, service workers bypassed and no interaction or analytics consent. Cold browser cache does not imply cold CDN, DNS or connections.

A preload-injected PerformanceObserver captured FCP, LCP candidates, layout shifts and top-frame long tasks for at least **20 seconds** and five seconds after load, capped at 60 seconds. All 15 samples completed in approximately 20 seconds. CLS uses the maximum session window (one-second gap / five-second window), excluding recent-input shifts. “Long-task total” sums observed tasks over 50 ms. **TBT and INP were not measured.**

## Results

Median milliseconds, with three-run ranges in parentheses:

| Page | FCP | Observed LCP | CLS | Long tasks: median count / total | Longest task |
| --- | ---: | ---: | ---: | ---: | ---: |
| Home | 1,204 (1,192–1,232) | 2,036 (2,016–2,036) | 0.000222 | 0 / 0 ms | None observed |
| VCC | 1,340 (1,320–1,448) | 2,696 (2,656–2,828) | 0 | 0 / 0 ms | None observed |
| CAFA | 1,292 (1,256–1,372) | 2,260 (2,228–2,268) | 0 | 1 / 55 ms | 55 ms |
| scIB | 1,324 (1,248–1,352) | 1,324 (1,248–1,352) | 0 | 2 / 108 ms | 66 ms |
| CASP | 1,228 (1,208–1,260) | 2,184 (2,176–2,244) | 0 | 2 / 103 ms | 53 ms |

The final LCP element is **analytics-consent text** on Home/VCC/CAFA/CASP and the introductory paragraph on scIB. These are not chart completion times. Changing the consent UI would confound an LCP comparison. All measured pages returned 200; no application errors or failed network requests were observed.

| Page | Decoded HTML bytes | Compressed HTML body bytes | Inline Flight script bytes | Median total wire bytes |
| --- | ---: | ---: | ---: | ---: |
| Home | 417,321 | 38,214 | 342,381 | 634,511 |
| VCC | 1,523,180 | 107,036 | 1,436,203 | 498,026 |
| CAFA | 1,304,674 | 44,565 | 1,224,562 | 433,788 |
| scIB | 1,086,903 | 35,910 | 984,106 | 426,552 |
| CASP | 1,081,746 | 33,778 | 1,003,563 | 422,694 |

External JavaScript is **506,290 decoded bytes**, approximately **133 KB wire**, on each page; inline Flight is additional. Six shared fonts transfer approximately **188 KB**. Benchmark catalogue-link RSC prefetch adds **321,518 decoded / ~32,603 wire bytes**; homepage prefetch adds **564,211 decoded / 26,779 wire bytes**.

## Diagnosis and acceptance boundary

The first chart alone contributes **503–665 KB JSON** through `panels`. Initial all-results data contributes another **198–530 KB**; VCC's result facets alone are **329,189 bytes**. VCC embeds **1,003 record objects for 318 IDs**, including the same protocol 225 times, dataset 224 times and source 119 times. Byte-identical duplicate record copies account for **330–358 KB of JSON-level surplus** on each benchmark. This is a duplication estimate, not a predicted HTML/wire saving: escaping and compression change those sizes.

A lossless record dictionary and deferred initially hidden results/facets address this evidence. Keep all initial chart rows, values, uncertainty, tested configurations and evidence. Validate unpacked metadata and navigation separately from byte savings.

The homepage is the control. Its initial 20-item response is **233,140 JSON bytes**, and it immediately re-fetches `catalogue.list` (~233 KB uncompressed). Benchmark pages initially re-fetch evidence (~20–22 KB); no all-results request was observed in their measured initial state. These request receipts help distinguish startup payload changes from unrelated timing variance.

## Field data and retained evidence

**No field data was available.** A public unauthenticated PageSpeed Insights mobile request returned **429 / quota exceeded**, without URL or origin `loadingExperience`. No authentication/payment was added. These results are not CrUX percentiles or a field Core Web Vitals assessment.

Compact tracked receipts: [JSON](performance/mobile-baseline-2026-09-23.json) and [CSV](performance/mobile-baseline-2026-09-23.csv). Large HTML, decoded Flight, screenshots, per-run resource/observer receipts, headers, PSI failure and SHA-256 manifest remain ignored under `workbench/performance-2026-09-23/before/`. The compact JSON records the raw manifest hash. No raw captures are required in Git.

## Commands and repeatability

The baseline was actually collected with the ignored prototype, then summarized without rerunning:

```sh
node workbench/performance-2026-09-23/fetch-html.mjs
node workbench/performance-2026-09-23/measure.mjs
node workbench/performance-2026-09-23/analyse-html.mjs
node workbench/performance-2026-09-23/summarize.mjs
```

The reusable [mobile-lab.mjs](../../scripts/performance/mobile-lab.mjs) packages the same observers, thresholds, conditions and round-robin sampling. It additionally owns Chrome startup/cleanup, saves the measured document on the first run and refuses existing output phases or occupied debugging ports. It never attaches to an existing browser/profile. CLI/environment configure origin, port, output root and phase; `--help` lists options. Default Chrome path is macOS's standard application path; use `--chrome` or `PERF_CHROME` elsewhere.

Tool validation commands (separate from the 15-run baseline):

```sh
node --check scripts/performance/mobile-lab.mjs
node scripts/performance/mobile-lab.mjs --help
node scripts/performance/mobile-lab.mjs --phase tooling-smoke \
  --output workbench/performance-2026-09-23 --targets home --runs 1 \
  --revision 4f354d9 --hosting-version 32f3ab9d36d4e615
```

The one-page tooling smoke passed and cleaned up Chrome (FCP 1,200 ms, observed LCP 2,080 ms; not added to the baseline). Existing-phase and occupied-port refusal checks passed, and all before-receipt SHA-256 hashes remained unchanged.

After the exact deployment succeeds, run the matched full suite into a **new** phase:

```sh
node scripts/performance/mobile-lab.mjs --phase after \
  --output workbench/performance-2026-09-23 \
  --origin https://benchmarks.rewire.it \
  --revision <deployed-sha> --hosting-version <hosting-version>
```

Use the same host/Chrome version and default three runs. Compare decoded HTML/Flight, compressed and total wire bytes, intended request suppression, and timing medians/ranges against the homepage control. Do not present overlapping variance as a proven speedup. Deployment labels are operator-supplied; verify them independently.

The after receipt must also cover live chart/table switching, first lazy load, filters, pagination/back, loading/error/retry states and preservation of scientific metadata/evidence. Startup measurements alone do not test interaction responsiveness. Before evidence remains immutable; browser processes/profiles are cleaned after each collection.
