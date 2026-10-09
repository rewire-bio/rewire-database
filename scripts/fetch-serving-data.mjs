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

export async function fileSha256(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

/** Downloads the pinned file into serving/ unless a verified copy is already there. */
export async function fetchServingData({ root = process.cwd(), fetchImpl = fetch } = {}) {
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'benchmark-data.lock.json'), 'utf8'));
  const serving = verifyServing(lock);
  const directory = path.join(root, SERVING_DIRECTORY);
  const target = path.join(directory, serving.file);
  if (fs.existsSync(target) && await fileSha256(target) === serving.sha256) return target;
  fs.mkdirSync(directory, { recursive: true });
  const staging = `${target}.download-${process.pid}`;
  try {
    const response = await fetchImpl(servingUrl(lock), { redirect: 'follow', signal: AbortSignal.timeout(600_000) });
    if (response.status !== 200 || !response.body) throw new Error(`Prepared release file unavailable (${response.status}): ${servingUrl(lock)}`);
    const hash = crypto.createHash('sha256');
    let bytes = 0;
    await pipeline(Readable.fromWeb(response.body), async function* (source) {
      for await (const chunk of source) {
        bytes += chunk.length;
        if (bytes > MAX_BYTES) throw new Error('Prepared release file exceeds its size limit');
        hash.update(chunk);
        yield chunk;
      }
    }, fs.createWriteStream(staging, { flags: 'wx' }));
    const digest = hash.digest('hex');
    if (digest !== serving.sha256) throw new Error(`Prepared release file digest ${digest} differs from the lock (${serving.sha256})`);
    fs.renameSync(staging, target);
  } finally { fs.rmSync(staging, { force: true }); }
  // Earlier releases' files are never read by this checkout.
  for (const name of fs.readdirSync(directory))
    if (name !== serving.file && /^catalogue-.+\.sqlite$/.test(name)) fs.rmSync(path.join(directory, name));
  return target;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try { console.log(`Prepared release file ${await fetchServingData()}`); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
