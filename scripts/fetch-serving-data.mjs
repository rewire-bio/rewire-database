import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { verifyLock } from './prepare-benchmark-data.mjs';

// The prepared release file pages and the public API read: one SQLite file per
// release, published by the producer as a GitHub Release asset and pinned in
// benchmark-data.lock.json by tag, file name and SHA-256.
export const SERVING_DIRECTORY = 'serving';
const MAX_BYTES = 2 * 1024 ** 3;

/** The lock's serving pin: tag serving/<release_id> holding catalogue-<release_id>.sqlite. */
export function verifyServing(lock) {
  verifyLock(lock);
  const serving = lock.serving;
  if (!serving || serving.tag !== `serving/${lock.release_id}` || serving.file !== `catalogue-${lock.release_id}.sqlite` ||
      !/^[a-f0-9]{64}$/.test(serving.sha256 || ''))
    throw new Error('benchmark-data.lock.json needs serving.tag, serving.file and serving.sha256 for its release');
  return serving;
}

export function servingUrl(lock) {
  const serving = verifyServing(lock);
  return `https://github.com/${lock.repository}/releases/download/${serving.tag}/${serving.file}`;
}

// Discrepancies between studies, derived by the knowledge-graph build after the
// release is published, so a lock may have no kg pin yet. Kept under serving/
// by release, since every release publishes a file of the same name.
const KG_FILE = 'discrepancies.json';
const KG_MAX_BYTES = 64 * 1024 ** 2;

/** The lock's kg pin (tag kg/<release_id> holding discrepancies.json), or null when it has none. */
export function verifyKg(lock) {
  verifyLock(lock);
  const kg = lock.kg;
  if (kg === undefined) return null;
  if (!kg || kg.tag !== `kg/${lock.release_id}` || kg.file !== KG_FILE || !/^[a-f0-9]{64}$/.test(kg.sha256 || ''))
    throw new Error('benchmark-data.lock.json kg needs tag kg/<release_id>, file discrepancies.json and sha256');
  return kg;
}

/** Where the pinned discrepancies file lives in a checkout or image, relative to its root; null without a kg pin. */
export function kgPath(lock) {
  return verifyKg(lock) ? `${SERVING_DIRECTORY}/discrepancies-${lock.release_id}.json` : null;
}

export function kgUrl(lock) {
  const kg = verifyKg(lock);
  return kg && `https://github.com/${lock.repository}/releases/download/${kg.tag}/${kg.file}`;
}

export async function fileSha256(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

/** Downloads `url` to `target` through a staging file, refusing more than `limit` bytes or another digest. */
async function download(url, target, sha256, limit, what, fetchImpl) {
  const staging = `${target}.download-${process.pid}`;
  try {
    const response = await fetchImpl(url, { redirect: 'follow', signal: AbortSignal.timeout(600_000) });
    if (response.status !== 200 || !response.body) throw new Error(`${what} unavailable (${response.status}): ${url}`);
    const hash = crypto.createHash('sha256');
    let bytes = 0;
    await pipeline(Readable.fromWeb(response.body), async function* (source) {
      for await (const chunk of source) {
        bytes += chunk.length;
        if (bytes > limit) throw new Error(`${what} exceeds its size limit`);
        hash.update(chunk);
        yield chunk;
      }
    }, fs.createWriteStream(staging, { flags: 'wx' }));
    const digest = hash.digest('hex');
    if (digest !== sha256) throw new Error(`${what} digest ${digest} differs from the lock (${sha256})`);
    fs.renameSync(staging, target);
  } finally { fs.rmSync(staging, { force: true }); }
}

/** Downloads the pinned files into serving/ unless verified copies are already there. Returns the prepared file. */
export async function fetchServingData({ root = process.cwd(), fetchImpl = fetch } = {}) {
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'benchmark-data.lock.json'), 'utf8'));
  const serving = verifyServing(lock);
  const directory = path.join(root, SERVING_DIRECTORY);
  const target = path.join(directory, serving.file);
  const kg = verifyKg(lock);
  const kgTarget = kg && path.join(root, kgPath(lock));
  fs.mkdirSync(directory, { recursive: true });
  if (!fs.existsSync(target) || await fileSha256(target) !== serving.sha256)
    await download(servingUrl(lock), target, serving.sha256, MAX_BYTES, 'Prepared release file', fetchImpl);
  if (kg && (!fs.existsSync(kgTarget) || await fileSha256(kgTarget) !== kg.sha256))
    await download(kgUrl(lock), kgTarget, kg.sha256, KG_MAX_BYTES, 'Discrepancies file', fetchImpl);
  // Earlier releases' files are never read by this checkout.
  const kept = new Set([serving.file, kgTarget && path.basename(kgTarget)]);
  for (const name of fs.readdirSync(directory))
    if (!kept.has(name) && /^(catalogue-.+\.sqlite|discrepancies-.+\.json)$/.test(name)) fs.rmSync(path.join(directory, name));
  return target;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try { console.log(`Prepared release file ${await fetchServingData()}`); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
