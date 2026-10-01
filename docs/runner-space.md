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

These provide 1.65 GiB of additional cleanup capacity on the measured image; they are not a claim about future image sizes. The unchanged free-space check remains authoritative. An active PyPy executable causes the entire PyPy installation to be preserved. The fixture tests reproduce the observed shortfall, exercise active-runtime protection and verify that unrelated files in both homes survive.

Pinned upstream installer evidence for image `ubuntu24/20260927.320`:

- [Toolset](https://github.com/actions/runner-images/blob/ubuntu24/20260927.320/images/ubuntu/toolsets/toolset-2404.json) declares the PyPy tool-cache installation.
- [Rust installer](https://github.com/actions/runner-images/blob/ubuntu24/20260927.320/images/ubuntu/scripts/build/install-rust.sh) populates `.rustup` and `.cargo` under `/etc/skel`; the failed image inventory confirms the remaining copies in the Packer home.
- [.NET installer](https://github.com/actions/runner-images/blob/ubuntu24/20260927.320/images/ubuntu/scripts/build/install-dotnetcore-sdk.sh) installs global tools into `/etc/skel/.dotnet/tools`; the failed image inventory confirms the copies in both homes.
- [AWS installer](https://github.com/actions/runner-images/blob/ubuntu24/20260927.320/images/ubuntu/scripts/build/install-aws-tools.sh) installs AWS SAM CLI; the failed image inventory confirms its separate installation directory.

Run `npx vitest run tests/omics-runner-space.test.ts` to exercise cleanup against disposable filesystem fixtures. Tests inject every command and never execute real `sudo`, Docker cleanup or filesystem cleanup outside their temporary fixtures.
