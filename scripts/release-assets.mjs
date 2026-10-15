import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

// Since rewire-benchmark-data stopped committing release files, each release
// publishes the gzip files its website manifest lists as assets of its
// `serving/<release_id>` GitHub release, beside the prepared SQLite file. The
// manifest itself stays in Git at the pinned revision and remains the trust
// anchor: every asset is checked against its entry's SHA-256 and byte count.
// Releases cut before the change have no such assets; their files are read
// from Git at the pinned revision, as before. The lock records which applies.

const MAX_COMPRESSED = 1024 ** 3;
const MAX_EXPANDED = 4 * 1024 ** 3;

/** True when the pinned release's files are GitHub release assets rather than Git files. */
export function usesReleaseAssets(lock) {
  return lock?.serving?.website_assets === true;
}

/** The asset name a manifest destination is published under: its path with `/` as `.`, plus `.gz`. */
export function assetName(destination) {
  if (typeof destination !== 'string' || !/^[A-Za-z0-9_-][A-Za-z0-9._/-]*$/.test(destination) ||
      destination.split('/').some(part => !part || part === '.' || part === '..'))
    throw new Error(`Unsafe release asset destination: ${destination}`);
  return destination.split('/').join('.') + '.gz';
}

export function assetUrl(lock, destination) {
  return `https://github.com/${lock.repository}/releases/download/${lock.serving.tag}/${assetName(destination)}`;
}

/** Asset names for manifest entries; refuses two entries that would share one asset. */
export function assetNames(entries) {
  const names = new Map();
  for (const entry of entries) {
    const name = assetName(entry.destination);
    if (names.has(name)) throw new Error(`Two manifest entries map to release asset ${name}`);
    names.set(name, entry);
  }
  return names;
}

/**
 * Whether a published release carries the website files as assets: every
 * listed entry has its asset (true), none does (false, an older release read
 * from Git), or only some do (an incomplete publication, refused).
 */
export function releaseHasAssets(published, entries) {
  const available = new Set(published);
  const expected = [...assetNames(entries).keys()];
  const present = expected.filter(name => available.has(name));
  if (present.length === expected.length && expected.length) return true;
  if (!present.length) return false;
  const missing = expected.filter(name => !available.has(name));
  throw new Error(`Release assets are incomplete; missing ${missing.length}: ${missing.slice(0, 5).join(', ')}`);
}

function checkEntry(entry) {
  if (!entry || typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256) ||
      !Number.isSafeInteger(entry.bytes) || entry.bytes < 0)
    throw new Error(`Invalid manifest entry for ${entry?.destination}`);
}

/** Expand gzip bytes and compare them with a manifest entry. Returns the expanded bytes. */
export function verifyCompressed(compressed, entry) {
  checkEntry(entry);
  const bytes = zlib.gunzipSync(compressed, { maxOutputLength: entry.bytes + 1 });
  if (bytes.length !== entry.bytes || crypto.createHash('sha256').update(bytes).digest('hex') !== entry.sha256)
    throw new Error(`Release asset ${assetName(entry.destination)} differs from the pinned manifest`);
  return bytes;
}

async function download(url, fetchImpl) {
  const response = await fetchImpl(url, { redirect: 'follow', signal: AbortSignal.timeout(600_000) });
  if (response.status !== 200 || !response.body) throw new Error(`Release asset unavailable (${response.status}): ${url}`);
  return response;
}

/** Download one asset into memory and return its verified expanded bytes. */
export async function fetchVerifiedAsset(lock, entry, { fetchImpl = fetch } = {}) {
  const response = await download(assetUrl(lock, entry.destination), fetchImpl);
  const chunks = [];
  let size = 0;
  for await (const chunk of Readable.fromWeb(response.body)) {
    size += chunk.length;
    if (size > MAX_COMPRESSED) throw new Error(`Release asset ${assetName(entry.destination)} exceeds its size limit`);
    chunks.push(chunk);
  }
  return verifyCompressed(Buffer.concat(chunks), entry);
}

/**
 * Download one asset to `target` (its manifest source path), streaming, and
 * keep it only if its expanded bytes match the entry.
 */
export async function downloadVerifiedAsset(lock, entry, target, { fetchImpl = fetch } = {}) {
  checkEntry(entry);
  if (entry.bytes > MAX_EXPANDED) throw new Error(`Manifest entry too large: ${entry.destination}`);
  const response = await download(assetUrl(lock, entry.destination), fetchImpl);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const staging = `${target}.download-${process.pid}`;
  try {
    let compressed = 0;
    const counted = async function* (source) {
      for await (const chunk of source) {
        compressed += chunk.length;
        if (compressed > MAX_COMPRESSED) throw new Error(`Release asset ${assetName(entry.destination)} exceeds its size limit`);
        yield chunk;
      }
    };
    await pipeline(Readable.fromWeb(response.body), counted, fs.createWriteStream(staging, { flags: 'wx' }));
    const hash = crypto.createHash('sha256');
    let bytes = 0;
    for await (const chunk of fs.createReadStream(staging).pipe(zlib.createGunzip())) {
      bytes += chunk.length;
      if (bytes > entry.bytes) break;
      hash.update(chunk);
    }
    if (bytes !== entry.bytes || hash.digest('hex') !== entry.sha256)
      throw new Error(`Release asset ${assetName(entry.destination)} differs from the pinned manifest`);
    fs.renameSync(staging, target);
  } finally { fs.rmSync(staging, { force: true }); }
  return target;
}
