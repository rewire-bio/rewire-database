import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { isAllowedDestination, verifyLock } from './prepare-benchmark-data.mjs';

// The release files pages read, fetched once per server instance from the
// pinned producer revision on GitHub. Everything is verified against the
// pinned manifest digest and each file's own SHA-256 before it is used.
const MAX_MANIFEST_BYTES = 64 * 1024 ** 2;

/** Destinations rendered by the website; downloads stay on GitHub. */
export function renderEntries(manifest, releaseId) {
  const wanted = new Set([
    'public/omics/catalogue.json', 'public/omics/manifest.json', 'public/omics/refresh.json',
    `public/omics/coverage/${releaseId}.json`,
    ...['manifest.json', 'use-cases.json', 'audit-index.json', 'audit-runs.json'].map(name => `public/omics/releases/${releaseId}/${name}`),
    'data/benchmark-literature/papers.json', 'data/benchmark-literature/results.csv', 'data/omics/scope-audit.jsonl',
    'data/benchmark-runs/mfass-v2.json',
  ]);
  // Release receipts (data/omics/releases/*.json) are small and read by the
  // updates page and feed to verify earlier releases they list.
  const entries = manifest.files.filter(entry => entry.scope !== 'historical' &&
    (wanted.has(entry.destination) || /^data\/omics\/releases\/[^/]+\.json$/.test(entry.destination)));
  for (const required of ['public/omics/catalogue.json', 'public/omics/manifest.json'])
    if (!entries.some(entry => entry.destination === required)) throw new Error(`Pinned manifest lacks ${required}`);
  for (const entry of entries)
    if (!isAllowedDestination(entry.destination) || !/^(?:website\/files|data\/omics\/releases)\/[A-Za-z0-9_./-]+\.gz$/.test(entry.source) ||
        entry.source.split('/').some(part => part === '.' || part === '..') || !/^[a-f0-9]{64}$/.test(entry.sha256) || !Number.isSafeInteger(entry.bytes))
      throw new Error(`Unsafe manifest entry: ${entry.destination}`);
  return entries;
}

const rawUrl = (pin, file) => `https://raw.githubusercontent.com/${pin.repository}/${pin.revision}/${file}`;
async function download(fetchImpl, url, limit) {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(120_000) });
  if (response.status !== 200) throw new Error(`Pinned data unavailable (${response.status}): ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > limit) throw new Error(`Pinned data exceeds its declared size: ${url}`);
  return bytes;
}

/** Returns the directory holding the verified files for this pin. */
export async function hydrateRuntimeData(pin, root, { fetchImpl = fetch, concurrency = 6 } = {}) {
  verifyLock(pin);
  const directory = path.join(root, `${pin.release_id}-${pin.revision}`);
  const receipt = path.join(directory, '.pin.json');
  if (fs.existsSync(receipt) && fs.readFileSync(receipt, 'utf8') === JSON.stringify(pin)) return directory;
  const staging = `${directory}.staging-${process.pid}`;
  fs.rmSync(staging, { recursive: true, force: true });
  try {
    const manifestBytes = await download(fetchImpl, rawUrl(pin, 'website/manifest.json'), MAX_MANIFEST_BYTES);
    if (crypto.createHash('sha256').update(manifestBytes).digest('hex') !== pin.manifest_sha256) throw new Error('Pinned manifest digest mismatch');
    const manifest = JSON.parse(manifestBytes.toString('utf8'));
    if (manifest.schema_version !== 1 || manifest.release_id !== pin.release_id || !Array.isArray(manifest.files)) throw new Error('Pinned manifest release mismatch');
    const write = (destination, bytes) => {
      fs.mkdirSync(path.dirname(path.join(staging, destination)), { recursive: true });
      fs.writeFileSync(path.join(staging, destination), bytes, { flag: 'wx' });
    };
    write('website/manifest.json', manifestBytes);
    const queue = [...renderEntries(manifest, pin.release_id)];
    await Promise.all(Array.from({ length: concurrency }, async () => {
      for (let entry = queue.shift(); entry; entry = queue.shift()) {
        // Recorded checksums describe decompressed bytes.
        const compressed = await download(fetchImpl, rawUrl(pin, entry.source), entry.bytes + 1024 * 1024);
        const bytes = zlib.gunzipSync(compressed, { maxOutputLength: entry.bytes });
        if (bytes.length !== entry.bytes || crypto.createHash('sha256').update(bytes).digest('hex') !== entry.sha256)
          throw new Error(`Pinned data checksum mismatch: ${entry.destination}`);
        write(entry.destination, bytes);
      }
    }));
    fs.writeFileSync(path.join(staging, '.pin.json'), JSON.stringify(pin));
    try { fs.renameSync(staging, directory); }
    catch (error) {
      // Another process completed the same pin first; its copy is equally verified.
      if (!fs.existsSync(receipt)) throw error;
      fs.rmSync(staging, { recursive: true, force: true });
    }
    return directory;
  } catch (error) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}
