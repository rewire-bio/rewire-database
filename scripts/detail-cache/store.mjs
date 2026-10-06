import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().filter(key => value[key] !== undefined)
      .map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** HTML and Flight imports use /_next/static/... and "static/...", respectively.
 * Decode browser URLs into exported filesystem names, rejecting traversal and
 * malformed encodings rather than silently omitting an unrecognized dependency.
 */
function referencedStaticPaths(payloads) {
  const files = new Set();
  for (const payload of payloads) {
    const text = Buffer.isBuffer(payload) ? payload.toString('utf8') : payload;
    if (typeof text !== 'string') throw new TypeError('Static asset references require HTML/RSC text');
    const pattern = /(?:\/_next\/static\/|(?<=["'])static\/)([^\s"'<>\\]*)/g;
    for (const match of text.matchAll(pattern)) {
      let relative;
      try { relative = decodeURIComponent(match[1].split(/[?#]/, 1)[0]); }
      catch { throw new Error(`Invalid static asset reference: ${match[0]}`); }
      if (!relative || relative.includes('\\') || /[\x00-\x1f\x7f]/.test(relative) ||
          relative.split('/').some(segment => !segment || segment === '.' || segment === '..')) {
        throw new Error(`Invalid static asset reference: ${match[0]}`);
      }
      files.add(`_next/static/${relative}`);
    }
  }
  return files;
}

/** Keep all shared assets. Only unrelated App Router leaf page chunks can be
 * omitted, and only with explicit HTML/RSC payloads supplying their references.
 * The caller uses the union of every candidate page's payloads for one digest.
 * @param {string} root
 * @param {Array<Buffer|string>} [referencedPayloads]
 */
export function staticAssetHash(root, referencedPayloads = undefined) {
  const hash = createHash('sha256');
  const referenced = referencedPayloads === undefined ? null : referencedStaticPaths(referencedPayloads);
  const seen = new Set();
  function walk(relative) {
    const directory = path.join(root, relative);
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(relative, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile()) {
        const normalized = file.split(path.sep).join('/');
        seen.add(normalized);
        if (referenced && /^_next\/static\/chunks\/app\/(?:[^/]+\/)*page-[^/]+\.js$/.test(normalized) && !referenced.has(normalized)) continue;
        hash.update(normalized).update('\0').update(fs.readFileSync(path.join(root, file))).update('\0');
      }
      else throw new Error(`Non-regular static asset: ${file}`);
    }
  }
  walk('_next/static');
  for (const file of referenced || []) {
    if (!seen.has(file)) throw new Error(`Referenced static asset is missing: ${file}`);
  }
  return hash.digest('hex');
}

const payloads = ['index.html', 'index.txt'];
export function readEntry(directory, key, epoch) {
  try {
    const receipt = JSON.parse(fs.readFileSync(path.join(directory, 'entry.json'), 'utf8'));
    if (!receipt || typeof receipt !== 'object' || !receipt.files || typeof receipt.files !== 'object') return null;
    if (receipt.schema !== 2 || receipt.key !== key || receipt.epoch !== epoch) return null;
    const files = Object.fromEntries(payloads.map(name => [name, fs.readFileSync(path.join(directory, name))]));
    if (payloads.some(name => sha256(files[name]) !== receipt.files[name])) return null;
    return { receipt, files };
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return null;
    throw error;
  }
}

export function saveEntry(directory, output, { key, epoch, assets, dependencies }) {
  const files = Object.fromEntries(payloads.map(name => [name, fs.readFileSync(path.join(output, name))]));
  fs.mkdirSync(directory, { recursive: true });
  for (const name of payloads) fs.writeFileSync(path.join(directory, name), files[name]);
  // Receipt last: an interrupted write is a miss because hashes no longer agree.
  fs.writeFileSync(path.join(directory, 'entry.json'), JSON.stringify({
    schema: 2, key, epoch, assets, dependencies,
    files: Object.fromEntries(payloads.map(name => [name, sha256(files[name])])),
  }) + '\n');
}

export function restoreEntry(entry, output) {
  fs.mkdirSync(output, { recursive: true });
  for (const name of payloads) {
    // A collision means Next unexpectedly rendered this route. Do not overwrite it.
    fs.writeFileSync(path.join(output, name), entry.files[name], { flag: 'wx' });
  }
}
