// Compatibility command name retained; downloads now go directly to pinned
// GitHub gzip exports rather than through Firebase byte-range proxying.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export async function checkGithubDownloads(origin, { locations, manifestBytes, fetcher = fetch }) {
  assert.equal(new URL(origin).protocol, "https:", "Supply the HTTPS frontend origin");
  assert.equal(locations.repository, "rewire-bio/rewire-benchmark-data");
  assert.match(locations.revision, /^[a-f0-9]{40}$/);
  const manifest = JSON.parse(manifestBytes.toString());
  const urls = new Map();
  for (const group of locations.groups) for (const file of group.files) {
    urls.set(`${group.destination}/${file}`, `https://raw.githubusercontent.com/${locations.repository}/${locations.revision}/${group.source}/${encodeURIComponent(file)}.gz`);
  }
  const probes = [["/omics/manifest.json", createHash("sha256").update(manifestBytes).digest("hex")]];
  // Verify actual scientific export bytes against the release's declared hash,
  // using the small audit-run index rather than re-downloading the catalogue.
  if (manifest.files?.["audit-runs.json"]) probes.push([`/omics/releases/${manifest.release_id}/audit-runs.json`, manifest.files["audit-runs.json"]]);
  for (const [pathname, expectedHash] of probes) {
    const target = urls.get(pathname);
    assert.ok(target, `Missing pinned download: ${pathname}`);
    const response = await fetcher(`${origin.replace(/\/$/, "")}${pathname}`, { redirect: "manual", signal: AbortSignal.timeout(30_000) });
    assert.equal(response.status, 307, `Download should redirect: ${pathname}`);
    assert.equal(response.headers.get("location"), target);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const download = await fetcher(target, { redirect: "error", signal: AbortSignal.timeout(30_000) });
    assert.equal(download.status, 200, `Pinned GitHub export unavailable: ${pathname}`);
    const compressed = Buffer.from(await download.arrayBuffer());
    const bytes = gunzipSync(compressed, { maxOutputLength: 16 * 1024 * 1024 });
    assert.equal(createHash("sha256").update(bytes).digest("hex"), expectedHash, `Changed export bytes: ${pathname}`);
  }
  return probes.length;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const locations = JSON.parse(await readFile("lib/generated-download-locations.json", "utf8"));
  const lock = JSON.parse(await readFile("benchmark-data.lock.json", "utf8"));
  assert.equal(locations.revision, lock.revision);
  assert.equal(locations.manifest_sha256, lock.manifest_sha256);
  const manifestBytes = await readFile("public/omics/manifest.json");
  const count = await checkGithubDownloads(process.argv[2], { locations, manifestBytes });
  console.log(`Verified ${count} pinned GitHub gzip downloads and uncompressed release hashes.`);
}
