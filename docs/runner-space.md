# Hosted runner disk reserve

The producer and website require at least **45 GiB free before dependency installation**. The website uses **44 GiB after dependencies and the pinned compressed checkout are installed**, because dependency installation is no longer part of the remaining budget. The cleanup script retains that guard and stops removing installations as soon as it is satisfied. It validates hosted Ubuntu metadata, rejects symlinked paths and checkout overlap, and protects the actual Node, Python, Java, compiler, Git and Google Cloud executables. It never removes either user home or general-purpose caches.

Producer run `36836317489` on image `20260927.320.1` failed after the previous allowlist and preloaded Docker images were exhausted: 48,035,872,768 bytes (44.74 GiB) free, 282,509,312 bytes short. Its read-only inventory identified these additional unused installations:

| Exact directory | Measured bytes |
| --- | ---: |
| `/opt/hostedtoolcache/PyPy` | 547,770,368 |
| `/home/packer/.rustup` | 630,726,656 |
| `/home/packer/.cargo` | 21,131,264 |
| `/home/runner/.dotnet` | 183,328,768 |
| `/home/packer/.dotnet` | 183,332,864 |
| `/usr/local/aws-sam-cli` | 206,561,280 |

These total 1.65 GiB of theoretical additional cleanup capacity on the measured image. Run `36874882852` showed that the runner cannot inspect `/home/packer/.rustup` (`EACCES`). All optional SDK paths with an `EACCES` inspection error are therefore preserved and logged, without privileged inspection. Excluding all three Packer paths leaves 937,660,416 bytes (0.87 GiB) in the PyPy, runner .NET and AWS SAM installations. This exceeds the observed 282,509,312-byte shortfall, but only successful cleanup and a fresh disk measurement establish available space. Image sizes and permissions can change. The unchanged free-space check remains authoritative. An active PyPy executable causes the entire PyPy installation to be preserved. The fixture tests reproduce the observed shortfall, exercise active-runtime protection, preserve inaccessible SDKs during both `lstat` and `realpath` inspection, retain the 45 GiB failure when space is still insufficient, and verify that unrelated files in both homes survive. Other inspection errors continue to fail closed.

Pinned upstream installer evidence for image `ubuntu24/20260927.320`:

- [Toolset](https://github.com/actions/runner-images/blob/ubuntu24/20260927.320/images/ubuntu/toolsets/toolset-2404.json) declares the PyPy tool-cache installation.
- [Rust installer](https://github.com/actions/runner-images/blob/ubuntu24/20260927.320/images/ubuntu/scripts/build/install-rust.sh) populates `.rustup` and `.cargo` under `/etc/skel`; the failed image inventory confirms the remaining copies in the Packer home.
- [.NET installer](https://github.com/actions/runner-images/blob/ubuntu24/20260927.320/images/ubuntu/scripts/build/install-dotnetcore-sdk.sh) installs global tools into `/etc/skel/.dotnet/tools`; the failed image inventory confirms the copies in both homes.
- [AWS installer](https://github.com/actions/runner-images/blob/ubuntu24/20260927.320/images/ubuntu/scripts/build/install-aws-tools.sh) installs AWS SAM CLI; the failed image inventory confirms its separate installation directory.

## Image 20261004.327 post-dependency shortfall

Production run `37638882775` (head `73af4c591b826ac76b5e436864c96c455ab96e6a`) failed in `prepare-runner-space --after-dependencies`: 46,886,711,296 bytes (43.67 GiB) free against the 44 GiB (47,244,640,256 byte) floor, 357,928,960 bytes short. Every earlier allowlist entry and the image cache were exhausted; the three Packer paths were preserved after `EACCES`, as intended. The log's read-only `du` inventory shows these further installations, none of which this job uses:

| Exact path | Measured bytes | Installer evidence |
| --- | ---: | --- |
| `/usr/local/share/vcpkg` | 217,796,608 | `install-vcpkg.sh` sets `VCPKG_INSTALLATION_ROOT=/usr/local/share/vcpkg` and symlinks the `vcpkg` binary into `/usr/local/bin` |
| `/usr/share/gradle-9.8.0` | 172,609,536 | `install-java-tools.sh` unzips the latest Gradle release into `/usr/share` and symlinks `/usr/bin/gradle` |
| `/usr/share/kotlinc` | 97,673,216 | `install-kotlin.sh` unzips the JetBrains compiler into `/usr/share` and symlinks its binaries into `/usr/bin` |
| `/usr/local/share/edge_driver` | 35,524,608 | `install-microsoft-edge.sh` installs `msedgedriver` there; Microsoft Edge itself is already on the allowlist |

Installer scripts are pinned at [`ubuntu24/20261004.327`](https://github.com/actions/runner-images/tree/ubuntu24/20261004.327/images/ubuntu/scripts/build) (commit `e3fe113a581eb9a44ca43f479b69f9c93f36df34`). The failed job's "Set up job" record confirms image `ubuntu24.04` version `20261004.327.1`, with Included Software tagged `ubuntu24/20261004.327`.

The four paths total 523,603,968 bytes, 165,675,008 bytes more than the shortfall. Vcpkg alone is not enough, and vcpkg, the Edge driver and Kotlin together (350,994,432 bytes) are still 6,934,528 bytes short, so Gradle is required. Gradle is matched by the exact pattern `gradle-<major>.<minor>[.<patch>]` under `/usr/share`, the same way as the Julia and Azure module directories, so the unversioned apt directory and any `-bin`, `-rc` or wrapper siblings are preserved.

Why they are unused: this job runs Node (`npm`, Next.js, Vitest), the Firebase emulators (which need Java, not Gradle or Kotlin) and the Cloudflare/Firebase deployment steps. Nothing in the repository or the workflows references vcpkg, Gradle, Kotlin or a WebDriver (`smoke/playwright.config.mjs` uses Playwright, which brings its own browsers). Removing them leaves dangling symlinks in `/usr/bin` and `/usr/local/bin`, which nothing here invokes. The protected executables (`node`, `python3`, `java`, `git`, `gcc`, `g++`, `make`, `gcloud`) and `JAVA_HOME`, `CLOUDSDK_PYTHON`, `PYTHONHOME` and `CONDA_PREFIX` are still resolved first; any path containing one is skipped. The new entries are last in the order, so they are only removed when earlier entries did not reach the floor.

The fixture tests reproduce the measured shortfall, check that all four are needed, protect an active executable inside each path, reject checkout overlap and symlinked paths, and check that only exact versioned Gradle directory names are removed.

Run `npx vitest run tests/omics-runner-space.test.ts` to exercise cleanup against disposable filesystem fixtures. Tests inject every command and never execute real `sudo`, Docker cleanup or filesystem cleanup outside their temporary fixtures.

## Website budget after installed dependencies

Run `36981931877` had 47,979,589,632 bytes (44.68 GiB) free after dependencies and the public data checkout. Requiring the original pre-installation budget again rejected an otherwise sufficient runner. The second check now uses the fixed `--after-dependencies` phase with a 44 GiB minimum; the initial and producer checks remain 45 GiB. No arbitrary threshold override is accepted.

The clean 7,076-file hydration audit used 29.996 GiB allocated with verified immutable hardlinks. The completed 28,935-page local export used approximately 3.61 GiB for additional output files and 3.75 GiB for `.next` (excluding hardlinked archive copies). That is approximately 37.36 GiB for hydrated data plus both page trees, leaving over 6 GiB at the post-installation floor. Historical exports and staged downloads share existing inodes. These measurements justify crediting only 1 GiB for dependencies already installed; the second guard still fails below 44 GiB.

## Full-history publication staging

The combined AMP producer package has 34 immutable snapshots and about 42.36 GiB of unique expanded payload content. A full production run authenticates the clean compressed producer clone against its public remote, pinned Git revision and package digest, then saves it to its revision-bound cache before expansion. This avoids creating an approximately five GiB cache tarball alongside 42 GiB of hydrated payloads. It then strictly hydrates every package entry and invokes `release-prepared-data-checkout.mjs`. That helper re-runs native full hydration with the committed pin, checks the exact public remote, clean pinned HEAD, plain checkout directories and hosted Ubuntu metadata, and removes only `workbench/benchmark-data`. Hydrated archives, website outputs, the consumer Git directory and all other workbench entries remain. It records the producer revision, package digest, release and actual available bytes in an ignored receipt. It refuses local worktrees, overridden revisions, symlinks, unsafe receipt paths and verification failures.

The full build then invokes `build-static.mjs` directly because hydration has passed and the temporary source has been released. Web-only and pull-request paths retain their existing preparation. Export, full-history retention, Firebase/API, Cloudflare and rollback gates remain. Cache save precedes full expansion and removal; a future run restores the complete compressed source and still performs native full payload verification before building.

Run `npx vitest run tests/omics-runner-space.test.ts tests/release-prepared-data-checkout.test.ts` for disposable-fixture verification. The tests never clean an actual runner or data checkout.

## AMP checkout admission deficit

Production run `37645058948` on image `ubuntu24/20260927.320.1` stopped before publication after installing the larger combined AMP checkout. It had 46,974,353,408 bytes free (43.75 GiB), 270,286,848 bytes below the unchanged 44 GiB floor. Its read-only inventory measured 509,935,616 bytes in `/opt/pipx/venvs`, enough to cover this admission deficit.

The exact optional installation is created by the pinned [Python installer](https://github.com/actions/runner-images/blob/ubuntu24/20260927.320/images/ubuntu/scripts/build/install-python.sh) and [pipx package installer](https://github.com/actions/runner-images/blob/ubuntu24/20260927.320/images/ubuntu/scripts/build/install-pipx-packages.sh); the [toolset](https://github.com/actions/runner-images/blob/ubuntu24/20260927.320/images/ubuntu/toolsets/toolset-2404.json) selects `ansible-core` and `yamllint`. This publication workflow invokes neither package. System/active Python and the sibling pipx shared, cache, log and binary directories remain.

Cleanup considers only `/opt/pipx/venvs`, only when all child names are those two known installations. Unknown packages or inaccessible child inventories preserve the entire directory. Existing symlink, checkout-overlap and active-runtime protections still apply. Both 45/44 GiB floors stay fixed, and actual `df` remains authoritative. Disposable fixtures reproduce the exact observed deficit and preserve unknown packages, inaccessible inventories and an active Python in a known environment, including a symlink to a system interpreter. Both the located executable path and its resolved target are protected. Full hydration, source release, build/export and publication gates still follow.

## Final browser fallback before source staging

Run `37647702339` on image `ubuntu24/20260927.320.1` failed the post-checkout admission check before authenticated source staging could run. The strict pipx inventory guard preserved `/opt/pipx/venvs` because `.ansible-core.lock` and `.yamllint.lock` were unknown children. Keep that guard unchanged. After every other allowed SDK and preloaded Docker image was removed, it had 46,974,304,256 bytes (43.75 GiB) free, 270,336,000 bytes below the unchanged 44 GiB floor. Its read-only inventory measured `/opt/google/chrome` at 457,588,736 bytes, which exceeds that deficit by 187,252,736 bytes.

The pinned [Google Chrome installer](https://github.com/actions/runner-images/blob/ubuntu24/20260927.320/images/ubuntu/scripts/build/install-google-chrome.sh) installs Google's Debian package and sets `CHROME_BIN=/usr/bin/google-chrome`; the failed runner inventory confirms the exact installation directory above. Production uses the Playwright Chromium downloaded by `npx playwright install --with-deps chromium`, with no Chrome channel or executable override in `smoke/playwright.config.mjs`. The separate manual `scripts/performance/mobile-lab.mjs` is not invoked by production CI.

Cleanup now considers only `/opt/google/chrome` as a final fallback after the existing SDKs, versioned SDKs and preloaded Docker images. It preserves Chrome whenever those earlier removals reach the floor. An explicit `PERF_CHROME` selection protects both its located path and resolved target, alongside the existing runtime protections; the image's default `CHROME_BIN` alone does not select a workload. Hosted-runner guards, checkout exclusion, symlink rejection, immutable archives and both admission floors remain unchanged. An insufficient final measurement still fails the job. No user-machine cleanup is permitted.

Fixture tests reproduce the observed deficit with unknown pipx lock files preserved, verify removal order, retain Chrome when Docker supplies enough space, preserve explicitly selected browser paths and targets and active runtimes, fail closed for an unresolved browser, and reject Chrome checkout overlap and symlinks. Tests inject all commands and confine filesystem operations to temporary fixtures.

## Generated-page duplication during the AMP build

Production [run `37649770579`](https://github.com/rewire-bio/rewire-database/actions/runs/37649770579) passed admission, authenticated caching, full hydration and the second native verification/source-checkout release. It then exhausted disk during the website build; the runner's check annotation reports `No space left on device` for its diagnostic log. Passing the archive admission floor did not establish enough space for two generated page trees.

Independent measurement of the completed combined local export found 58,964 identical route pairs: 29,482 HTML files and 29,482 RSC files. Their second copies consumed 3,849,216,000 allocated bytes (3.58 GiB); every pair had the same SHA-256. Existing archive and Cloudflare staging hardlinks already avoided duplicating immutable downloads. The remaining duplication was Next's final copying of finished prerendered pages from `.next/server/app` into `out`.

`build-static.mjs` now preloads a repository-owned copy adapter in the Next build parent. It requires Next 14.2.16 and the exact reviewed `dist/export/index.js` SHA-256, `552c92740df3190364a9639a505c8929f8aad56ff919b4854129a93ec3a3ce7b`. For finished App Router `.html` and `.rsc` files only, it accepts the exact trailing-slash export route and creates a hardlink. Root `index` maps to `out/index.html` / `out/index.txt`; other routes map to their own `index.html` / `index.txt`. Source files and destination parents must have canonical paths. Symlinks, collisions, unexpected flags/routes and cross-filesystem links fail; there is no duplicate-copy fallback. All other copy operations and prerender workers retain their original behavior. No dependency file is edited.

The build logs linked file/byte counts and refuses successful completion with zero linked files. Later deletion of the intermediate `.next/server` removes its directory entries while preserving the exact exported bytes in `out`. Both admission floors, all immutable snapshots, the source pin and every full export/API/publication/rollback check remain unchanged. Tests cover file identity and byte retention after Next cleanup, root/nested HTML and RSC routes, untouched ordinary copies, symlink/collision rejection, exporter identity, cross-device failure and child interruption/archive restoration. Re-review and update the exporter guard before changing Next's locked version. Actual Linux disk measurements and the complete production run remain the publication authority.
