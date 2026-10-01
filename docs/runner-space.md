# Hosted runner disk reserve

The producer and website require at least **45 GiB free** before the data build. The cleanup script retains that guard and stops removing installations as soon as it is satisfied. It validates hosted Ubuntu metadata, rejects symlinked paths and checkout overlap, and protects the actual Node, Python, Java, compiler, Git and Google Cloud executables. It never removes either user home or general-purpose caches.

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

Run `npx vitest run tests/omics-runner-space.test.ts` to exercise cleanup against disposable filesystem fixtures. Tests inject every command and never execute real `sudo`, Docker cleanup or filesystem cleanup outside their temporary fixtures.
