import crypto from 'node:crypto';
import path from 'node:path';

/**
 * Public download locations from the exact producer manifest a pin names.
 * Each public file maps to its manifest `source`: the gzip export at that
 * path, never a guessed name. Shared by data preparation and the server.
 */
export function downloadLocations(lock, bytes) {
  if (lock.repository !== 'rewire-bio/rewire-benchmark-data' || !/^[a-f0-9]{40}$/.test(lock.revision)) throw new Error('Invalid pinned producer');
  if (crypto.createHash('sha256').update(bytes).digest('hex') !== lock.manifest_sha256) throw new Error('Download manifest digest mismatch');
  const manifest = JSON.parse(bytes.toString());
  if (manifest.release_id !== lock.release_id || manifest.schema_version !== 1) throw new Error('Download manifest release mismatch');
  const groups = new Map();
  const seen = new Set();
  for (const file of manifest.files) {
    if (!file.destination.startsWith('public/')) continue;
    for (const value of [file.destination, file.source]) {
      if (!/^[a-zA-Z0-9._/-]+$/.test(value) || value.startsWith('/') || value.split('/').some(part => !part || part === '..' || part === '.')) throw new Error('Unsafe download path');
    }
    if (!file.destination.startsWith('public/omics/') && !file.destination.startsWith('public/benchmark-literature/')) throw new Error('Unexpected public download');
    if (!file.source.startsWith('website/files/public/') && !file.source.startsWith('data/omics/releases/')) throw new Error('Unexpected download source');
    if (path.posix.basename(file.source) !== path.posix.basename(file.destination) + '.gz') throw new Error('Unsupported download encoding');
    if (seen.has(file.destination)) throw new Error('Duplicate download destination');
    seen.add(file.destination);
    const destination = '/' + path.posix.dirname(file.destination).slice(7);
    const source = path.posix.dirname(file.source);
    const key = destination + ':' + source;
    if (!groups.has(key)) groups.set(key, { destination, source, files: [] });
    groups.get(key).files.push(path.posix.basename(file.destination));
  }
  return { repository: lock.repository, revision: lock.revision, manifest_sha256: lock.manifest_sha256, groups: [...groups.values()] };
}

/** Site path to exact raw.githubusercontent.com URL at the pinned revision. */
export function downloadUrls(locations) {
  const urls = new Map();
  for (const group of locations.groups)
    for (const file of group.files)
      urls.set(`${group.destination}/${file}`, `https://raw.githubusercontent.com/${locations.repository}/${locations.revision}/${group.source.split('/').map(encodeURIComponent).join('/')}/${encodeURIComponent(file)}.gz`);
  return urls;
}
