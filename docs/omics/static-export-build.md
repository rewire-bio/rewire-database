# Static export disk usage

`npm run build` generates and validates all reviewed releases, then runs `scripts/build-static.mjs` around Next's production build.

Next normally copies every public download into `out`, doubling the disk needed for historical evidence. GitHub's runner ran out of space at that final copy even after every page had rendered. The wrapper temporarily moves only historical release directories into `workbench/build-static.lock/historical/`. The current release stays in place for page generation, including the audit index and run history.

After Next finishes, the wrapper restores the histories and hard-links each historical file into its original path under `out/omics/releases/`. These are regular files sharing disk blocks, not symlinks or redirects. URLs, filenames and contents are unchanged. The existing export check still validates every historical manifest and SHA-256 checksum. There is no copy fallback on another filesystem.

Build failures and handled SIGINT/SIGTERM interruptions restore the staged histories. Existing destinations are never overwritten. An exclusive lock rejects another wrapper in the same checkout.

For a stale lock after SIGKILL or a machine failure:

1. Inspect `workbench/build-static.lock/recovery.json` and confirm its recorded process is no longer running.
2. Restore each directory in `historical/` to `public/omics/releases/` only if the destination is absent. If both exist, preserve both and inspect the conflict.
3. After every historical directory has been restored, remove the empty staging directory, recovery receipt and lock directory.

Do not delete a nonempty staging directory. The wrapper never removes unrelated workbench files or rewrites the compressed scientific archives in Git. Avoid concurrent builds or release generation in one checkout.
