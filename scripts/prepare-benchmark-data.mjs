#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';

const RELEASE_ID = /^\d{4}-\d{2}-\d{2}-[a-f0-9]{12}$/;
const MAX_FILE_BYTES = 2 * 1024 ** 3;
const MAX_MANIFEST_BYTES = 64 * 1024 ** 2;

// Inspect every component below the caller-selected root, including dangling links.
function assertSafePath(root, relative, { directory = false, required = false } = {}) {
  const parts = relative.split('/');
  let cursor = root;
  for (let i = 0; i < parts.length; i++) {
    cursor = path.join(cursor, parts[i]);
    let stat;
    try { stat = fs.lstatSync(cursor); } catch (error) {
      if (error.code === 'ENOENT' && !required) return;
      throw error;
    }
    if (stat.isSymbolicLink()) throw new Error(`Symlink path rejected: ${cursor}`);
    const mustBeDirectory = i < parts.length - 1 || directory;
    if (mustBeDirectory ? !stat.isDirectory() : !stat.isFile()) {
      throw new Error(`Expected ${mustBeDirectory ? 'directory' : 'regular file'}: ${cursor}`);
    }
  }
}

function validatePointer(file, destination, releaseId) {
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { throw new Error(`Invalid JSON in current pointer ${destination}`); }
  if (parsed?.release_id !== releaseId) {
    throw new Error(`Stale current pointer in ${destination}: release_id does not match ${releaseId}`);
  }
  return parsed;
}


/**
 * Check if destination relative path is in the strictly allowed whitelist.
 * @param {string} destination
 * @returns {boolean}
 */
export function isAllowedDestination(destination) {
  if (typeof destination !== 'string' || destination.includes('\\') || destination.includes('\0')) return false;
  if (path.isAbsolute(destination) || destination.startsWith('/') || /^[a-zA-Z]:/.test(destination)) {
    return false;
  }
  if (destination.split('/').includes('..') || path.normalize(destination) !== destination) {
    return false;
  }

  if (destination.startsWith('public/omics/')) return true;
  if (destination.startsWith('public/benchmark-literature/')) return true;
  if (destination === 'data/benchmark-literature/papers.json') return true;
  if (destination === 'data/benchmark-literature/results.csv') return true;
  if (destination === 'data/benchmark-runs/mfass-v2.json') return true;
  if (destination === 'data/omics/scope-audit.jsonl') return true;
  if (/^data\/omics\/releases\/[^/]+\.json$/.test(destination)) return true;
  if (destination === 'lib/generated-benchmark-catalog.ts') return true;

  return false;
}

/**
 * Check if a file is currently tracked by git in the repository root.
 * @param {string} root
 * @param {string} filePath
 * @returns {boolean}
 */
export function isTrackedByGit(root, filePath) {
  try {
    const rel = path.relative(root, filePath);
    execFileSync('git', ['ls-files', '--error-unmatch', rel], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate lock file schema and values.
 * @param {any} lock
 */
export function verifyLock(lock) {
  if (!lock || typeof lock !== 'object' || Array.isArray(lock)) {
    throw new Error('Malformed benchmark-data.lock.json: expected JSON object');
  }
  if (lock.schema_version !== 1) {
    throw new Error(`Unsupported lock schema_version: ${lock.schema_version} (expected 1)`);
  }
  if (lock.repository !== 'rewire-bio/rewire-benchmark-data') {
    throw new Error(`Invalid lock repository: "${lock.repository}" (expected "rewire-bio/rewire-benchmark-data")`);
  }
  if (typeof lock.revision !== 'string' || !/^[0-9a-fA-F]{40}$/.test(lock.revision)) {
    throw new Error(`Invalid lock revision: "${lock.revision}" (expected 40-character hex string)`);
  }
  if (typeof lock.manifest_sha256 !== 'string' || !/^[0-9a-fA-F]{64}$/.test(lock.manifest_sha256)) {
    throw new Error(`Invalid lock manifest_sha256: "${lock.manifest_sha256}" (expected 64-character hex string)`);
  }
  if (typeof lock.release_id !== 'string' || !RELEASE_ID.test(lock.release_id)) {
    throw new Error(`Invalid lock release_id: "${lock.release_id}" (expected YYYY-MM-DD and 12 lowercase hexadecimal characters)`);
  }
}

/**
 * Compute SHA256 of an existing file on disk using streaming.
 * @param {string} filePath
 * @returns {Promise<string>}
 */
export async function hashFile(filePath) {
  const hasher = crypto.createHash('sha256');
  const stream = fs.createReadStream(filePath);
  for await (const chunk of stream) {
    hasher.update(chunk);
  }
  return hasher.digest('hex');
}

/**
 * Decompress a gzip file into a staging file destination using streams,
 * simultaneously calculating uncompressed sha256 and byte length.
 * @param {string} sourceGzPath
 * @param {string} stagedPath
 * @returns {Promise<{ sha256: string, bytes: number }>}
 */
async function decompressAndVerifyToStaging(sourceGzPath, stagedPath, expectedBytes) {
  fs.mkdirSync(path.dirname(stagedPath), { recursive: true });
  const readStream = fs.createReadStream(sourceGzPath);
  const gunzip = zlib.createGunzip();
  const hasher = crypto.createHash('sha256');
  let bytes = 0;

  const tap = new Transform({
    transform(chunk, encoding, callback) {
      bytes += chunk.length;
      if (bytes > expectedBytes) return callback(new Error(`Payload size mismatch: exceeds declared ${expectedBytes} bytes`));
      hasher.update(chunk);
      callback(null, chunk);
    },
  });

  const writeStream = fs.createWriteStream(stagedPath, { flags: 'wx' });
  try {
    await pipeline(readStream, gunzip, tap, writeStream);
  } catch (err) {
    try {
      if (fs.existsSync(stagedPath)) fs.unlinkSync(stagedPath);
    } catch {}
    throw new Error(`Corrupted gzip stream in ${sourceGzPath}: ${err.message}`);
  }

  const sha256 = hasher.digest('hex');
  return { sha256, bytes };
}

/**
 * Prepare benchmark data for the website consumer.
 *
 * @param {object} [options]
 * @param {string} [options.source] - Path to local data checkout (defaults to workbench/benchmark-data)
 * @param {string} [options.websiteRoot] - Consumer website root (defaults to process.cwd())
 * @param {boolean} [options.currentOnly] - If true, hydrate current entries and receipts, skip historical public files
 * @param {(sourceDir: string) => string} [options.getHeadRevision] - Custom git HEAD resolver for testing
 * @returns {Promise<{ release_id: string, hydratedCount: number, reusedCount: number, skippedCount: number }>}
 */
export async function prepareBenchmarkData(options = {}) {
  const websiteRoot = fs.realpathSync(path.resolve(options.websiteRoot || process.cwd()));
  const currentOnly = Boolean(
    options.currentOnly ?? process.argv.includes('--current-only'),
  );

  // 1. Locate source directory
  let sourceDir = options.source;
  if (!sourceDir) {
    const sourceIdx = process.argv.indexOf('--source');
    if (sourceIdx !== -1 && sourceIdx + 1 < process.argv.length) {
      sourceDir = path.resolve(websiteRoot, process.argv[sourceIdx + 1]);
    }
  }
  if (!sourceDir) {
    sourceDir = path.resolve(websiteRoot, process.env.BENCHMARK_DATA_SOURCE || 'workbench/benchmark-data');
  } else {
    sourceDir = path.resolve(websiteRoot, sourceDir);
  }

  if (!fs.existsSync(sourceDir)) {
    throw new Error(
      `Benchmark data source directory not found: "${sourceDir}". Run "npm run data:fetch" to check out benchmark data.`,
    );
  }

  sourceDir = fs.realpathSync(sourceDir);

  // 2. Read and verify benchmark-data.lock.json
  const lockPath = path.join(websiteRoot, 'benchmark-data.lock.json');
  if (!fs.existsSync(lockPath)) {
    throw new Error(`Lockfile not found: ${lockPath}`);
  }
  assertSafePath(websiteRoot, 'benchmark-data.lock.json', { required: true });
  let lock;
  try {
    lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  } catch {
    throw new Error('Malformed benchmark-data.lock.json: invalid JSON');
  }
  verifyLock(lock);

  // 3. Verify source git HEAD revision
  const isCi = Boolean(
    process.env.CI && process.env.CI !== 'false' && process.env.CI !== '0',
  );
  const allowUncommitted = process.env.BENCHMARK_DATA_ALLOW_UNCOMMITTED === '1';

  let headRevision;
  let gitError = null;
  if (typeof options.getHeadRevision === 'function') {
    try {
      headRevision = options.getHeadRevision(sourceDir);
    } catch (err) {
      gitError = err;
    }
  } else {
    try {
      headRevision = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: sourceDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        encoding: 'utf8',
      }).trim();
    } catch (err) {
      gitError = err;
    }
  }

  if (isCi || !allowUncommitted) {
    if (gitError) {
      throw new Error(`Git revision check failed for "${sourceDir}": ${gitError.message}`);
    }
    if (headRevision !== lock.revision) {
      throw new Error(
        `Source git HEAD revision mismatch: expected ${lock.revision}, got ${headRevision}`,
      );
    }
  } else {
    if (gitError || headRevision !== lock.revision) {
      console.warn(
        `[WARN] BENCHMARK_DATA_ALLOW_UNCOMMITTED=1 allowed revision discrepancy (found: ${headRevision ?? 'none'}, locked: ${lock.revision})`,
      );
    }
  }

  // 4. Verify manifest SHA-256 and release ID
  const manifestPath = path.join(sourceDir, 'website', 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest not found: ${manifestPath}`);
  }
  assertSafePath(sourceDir, 'website/manifest.json', { required: true });
  if (fs.statSync(manifestPath).size > MAX_MANIFEST_BYTES) throw new Error('Manifest exceeds size limit');
  const rawManifest = fs.readFileSync(manifestPath);
  const actualManifestSha = crypto.createHash('sha256').update(rawManifest).digest('hex');
  if (actualManifestSha !== lock.manifest_sha256) {
    throw new Error(
      `Manifest SHA-256 mismatch: expected ${lock.manifest_sha256}, got ${actualManifestSha}`,
    );
  }

  let manifest;
  try {
    manifest = JSON.parse(rawManifest.toString('utf8'));
  } catch {
    throw new Error('Malformed manifest.json: invalid JSON');
  }

  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('Malformed manifest.json: expected JSON object');
  }
  if (manifest.schema_version !== 1) {
    throw new Error(`Unsupported manifest schema_version: ${manifest.schema_version} (expected 1)`);
  }
  if (manifest.release_id !== lock.release_id) {
    throw new Error(
      `Manifest release_id mismatch: expected "${lock.release_id}", got "${manifest.release_id}"`,
    );
  }
  if (!Array.isArray(manifest.files)) {
    throw new Error('Malformed manifest.json: files must be an array');
  }

  // 5. Validate manifest file entries and enforce safety rules
  const seenDestinations = new Set();
  const seenSources = new Set();

  for (const entry of manifest.files) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error('Invalid manifest entry: expected object');
    }
    if (typeof entry.destination !== 'string' || !entry.destination) {
      throw new Error('Invalid manifest entry destination');
    }
    if (typeof entry.source !== 'string' || !entry.source) {
      throw new Error(`Invalid manifest entry source for ${entry.destination}`);
    }
    if (typeof entry.sha256 !== 'string' || !/^[0-9a-fA-F]{64}$/.test(entry.sha256)) {
      throw new Error(`Invalid sha256 for ${entry.destination}: expected 64-char hex`);
    }
    if (typeof entry.bytes !== 'number' || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || entry.bytes > MAX_FILE_BYTES) {
      throw new Error(`Invalid bytes for ${entry.destination}: expected non-negative safe integer within 2 GiB limit`);
    }
    if (entry.scope !== 'current' && entry.scope !== 'historical') {
      throw new Error(`Invalid scope for ${entry.destination}: expected 'current' | 'historical'`);
    }

    if ([entry.source, entry.destination].some(value => value.includes('\\') || value.includes('\0'))) {
      throw new Error('Invalid path separator or null byte');
    }
    // Traversal and absolute path rejection
    if (
      path.isAbsolute(entry.destination) ||
      entry.destination.startsWith('/') ||
      /^[a-zA-Z]:/.test(entry.destination)
    ) {
      throw new Error(`Absolute destination path rejected: ${entry.destination}`);
    }
    if (
      path.isAbsolute(entry.source) ||
      entry.source.startsWith('/') ||
      /^[a-zA-Z]:/.test(entry.source)
    ) {
      throw new Error(`Absolute source path rejected: ${entry.source}`);
    }
    if (
      entry.destination.split('/').includes('..') ||
      path.normalize(entry.destination) !== entry.destination
    ) {
      throw new Error(`Path traversal in destination rejected: ${entry.destination}`);
    }
    if (
      entry.source.split('/').includes('..') ||
      path.normalize(entry.source) !== entry.source
    ) {
      throw new Error(`Path traversal in source rejected: ${entry.source}`);
    }

    const resolvedDest = path.resolve(websiteRoot, entry.destination);
    if (!resolvedDest.startsWith(path.resolve(websiteRoot) + path.sep)) {
      throw new Error(`Destination escapes website root: ${entry.destination}`);
    }
    const resolvedSource = path.resolve(sourceDir, entry.source);
    if (!resolvedSource.startsWith(path.resolve(sourceDir) + path.sep)) {
      throw new Error(`Source escapes source root: ${entry.source}`);
    }

    // Whitelist check
    if (!isAllowedDestination(entry.destination)) {
      throw new Error(`Forbidden destination path: ${entry.destination}`);
    }

    if (!entry.source.endsWith('.gz') || !(entry.source.startsWith('website/files/') || /^data\/omics\/releases\/[^/]+\/.+\.gz$/.test(entry.source))) {
      throw new Error(`Forbidden source path: ${entry.source}`);
    }
    const releaseMatch = /^public\/omics\/releases\/([^/]+)\/(.+)$/.exec(entry.destination);
    if (releaseMatch && !RELEASE_ID.test(releaseMatch[1])) throw new Error(`Invalid release directory: ${entry.destination}`);
    const expectedScope = releaseMatch && releaseMatch[1] !== lock.release_id ? 'historical' : 'current';
    if (entry.scope !== expectedScope) throw new Error(`Invalid scope for ${entry.destination}: expected ${expectedScope}`);
    assertSafePath(sourceDir, entry.source, { required: true });
    assertSafePath(websiteRoot, entry.destination);

    // Duplicate checks
    if (seenDestinations.has(entry.destination)) {
      throw new Error(`Duplicate destination in manifest: ${entry.destination}`);
    }
    seenDestinations.add(entry.destination);

    if (seenSources.has(entry.source)) {
      throw new Error(`Duplicate source in manifest: ${entry.source}`);
    }
    seenSources.add(entry.source);
  }

  const byDestination = new Map(manifest.files.map(entry => [entry.destination, entry]));
  for (const destination of [
    'public/omics/manifest.json', 'public/omics/catalogue.json',
    `public/omics/releases/${lock.release_id}/manifest.json`,
    `public/omics/releases/${lock.release_id}/catalogue.json`,
    'public/benchmark-literature/papers.json', 'public/benchmark-literature/results.csv',
    'data/benchmark-literature/papers.json', 'data/benchmark-literature/results.csv',
    'data/benchmark-runs/mfass-v2.json', 'data/omics/scope-audit.jsonl',
    'lib/generated-benchmark-catalog.ts',
    `data/omics/releases/${lock.release_id}.json`,
  ]) {
    if (!byDestination.has(destination)) throw new Error(`Required destination missing: ${destination}`);
  }
  if (!manifest.files.some(entry => entry.destination.startsWith('data/omics/releases/'))) {
    throw new Error('Required release receipts missing');
  }
  for (const name of ['manifest.json', 'catalogue.json']) {
    const pointer = byDestination.get(`public/omics/${name}`);
    const immutable = byDestination.get(`public/omics/releases/${lock.release_id}/${name}`);
    if (pointer.sha256 !== immutable.sha256 || pointer.bytes !== immutable.bytes) {
      throw new Error(`Current pointer differs from immutable release: ${name}`);
    }
  }

  // 6. Stage and verify files in workbench
  const workbenchDir = path.join(websiteRoot, 'workbench');
  assertSafePath(websiteRoot, 'workbench', { directory: true });
  fs.mkdirSync(workbenchDir, { recursive: true });
  const stagingDir = fs.mkdtempSync(path.join(workbenchDir, '.staging-'));

  const stagedFiles = [];
  const verifiedPaths = new Map();
  // Share only immutable archives. Mutable pointers and raw inputs must not
  // share an inode with release history, even when their current bytes match.
  const verifiedArchives = new Map();
  const rememberVerified = (entry, file) => {
    verifiedPaths.set(entry.destination, file);
    if (entry.destination.startsWith('public/omics/releases/') || entry.destination.startsWith('data/omics/releases/')) {
      const key = `${entry.sha256}:${entry.bytes}`;
      if (!verifiedArchives.has(key)) verifiedArchives.set(key, file);
    }
  };
  let reusedCount = 0;
  let skippedCount = 0;

  try {
    for (const entry of manifest.files) {
      const isReceipt =
        entry.destination.startsWith('data/omics/releases/') &&
        entry.destination.endsWith('.json');

      // Scope filtering: --current-only skips historical public files, but hydrates current and receipts
      if (currentOnly && entry.scope === 'historical' && !isReceipt) {
        skippedCount++;
        continue;
      }

      const sourceFilePath = path.join(sourceDir, entry.source);
      if (!fs.existsSync(sourceFilePath)) {
        throw new Error(`Source file not found: ${entry.source}`);
      }
      const sourceStat = fs.lstatSync(sourceFilePath);
      if (sourceStat.isSymbolicLink()) {
        throw new Error(`Symlink source rejected: ${entry.source}`);
      }
      if (!sourceStat.isFile()) {
        throw new Error(`Source is not a regular file: ${entry.source}`);
      }

      const destFilePath = path.join(websiteRoot, entry.destination);
      const isImmutable = entry.destination.startsWith('public/omics/releases/') || isReceipt;

      // Check conflicts with existing files before staging
      if (fs.existsSync(destFilePath)) {
        assertSafePath(websiteRoot, entry.destination);
        const destStat = fs.lstatSync(destFilePath);
        const existingBytes = destStat.size;
        let existingSha = null;

        if (isImmutable) {
          existingSha = await hashFile(destFilePath);
          if (existingBytes !== entry.bytes || existingSha !== entry.sha256) {
            throw new Error(
              `Refusing to overwrite conflicting immutable release file: ${entry.destination}`,
            );
          }
          // Exact match on immutable file: reuse it
          rememberVerified(entry, destFilePath);
          reusedCount++;
          continue;
        }

        // Check tracked raw data
        if (isTrackedByGit(websiteRoot, destFilePath)) {
          existingSha = await hashFile(destFilePath);
          if (existingBytes !== entry.bytes || existingSha !== entry.sha256) {
            throw new Error(
              `Refusing to silently replace tracked raw data: ${entry.destination}. User will remove them during extraction.`,
            );
          }
          // Exact match on tracked raw data: reuse it
          rememberVerified(entry, destFilePath);
          reusedCount++;
          continue;
        }

        // For other files, check if already decompressed and verified
        if (existingBytes === entry.bytes) {
          existingSha = await hashFile(destFilePath);
          if (existingSha === entry.sha256) {
            // Check current pointer validity
            if (
              entry.destination === 'public/omics/manifest.json' ||
              entry.destination === 'public/omics/catalogue.json'
            ) {
              const content = fs.readFileSync(destFilePath, 'utf8');
              const parsed = JSON.parse(content);
              if (parsed.release_id !== lock.release_id) {
                throw new Error(
                  `Stale current pointer in ${entry.destination}: release_id "${parsed.release_id}" !== "${lock.release_id}"`,
                );
              }
            }
            rememberVerified(entry, destFilePath);
            reusedCount++;
            continue;
          }
        }
      }

      const stagedFilePath = path.join(stagingDir, ...entry.destination.split('/'));
      const donor = isImmutable ? verifiedArchives.get(`${entry.sha256}:${entry.bytes}`) : undefined;
      if (donor) {
        // A prior verification is not enough: cached outputs can be changed
        // while this run is staging other files. Recheck immediately before
        // linking, and never replace or relink an existing destination.
        assertSafePath(websiteRoot, path.relative(websiteRoot, donor), { required: true });
        const before = fs.lstatSync(donor);
        if (before.size !== entry.bytes || await hashFile(donor) !== entry.sha256) {
          throw new Error(`Verified archive changed before deduplication: ${donor}`);
        }
        assertSafePath(websiteRoot, path.relative(websiteRoot, donor), { required: true });
        const after = fs.lstatSync(donor);
        if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size ||
            before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) {
          throw new Error(`Verified archive changed during deduplication: ${donor}`);
        }
        fs.mkdirSync(path.dirname(stagedFilePath), { recursive: true });
        fs.linkSync(donor, stagedFilePath); // Fails on collisions; no copy fallback.
      } else {
        // The first instance must be decompressed and verified against the pin.
        const { bytes, sha256 } = await decompressAndVerifyToStaging(
          sourceFilePath,
          stagedFilePath,
          entry.bytes,
        );
        if (bytes !== entry.bytes) {
          throw new Error(`Payload size mismatch for ${entry.destination}: expected ${entry.bytes}, got ${bytes}`);
        }
        if (sha256 !== entry.sha256) {
          throw new Error(`Payload SHA-256 mismatch for ${entry.destination}: expected ${entry.sha256}, got ${sha256}`);
        }
      }

      // Ensure current pointers equal pin
      if (
        entry.destination === 'public/omics/manifest.json' ||
        entry.destination === 'public/omics/catalogue.json'
      ) {
        const content = fs.readFileSync(stagedFilePath, 'utf8');
        let parsed;
        try {
          parsed = JSON.parse(content);
        } catch {
          throw new Error(`Invalid JSON in current pointer ${entry.destination}`);
        }
        if (parsed.release_id !== lock.release_id) {
          throw new Error(
            `Stale current pointer in ${entry.destination}: release_id "${parsed.release_id}" does not match locked release_id "${lock.release_id}"`,
          );
        }
      }

      if (
        entry.scope === 'current' &&
        entry.destination.startsWith('public/omics/releases/')
      ) {
        const releaseFolder = entry.destination.split('/')[3];
        if (releaseFolder !== lock.release_id) {
          throw new Error(
            `Current scope entry "${entry.destination}" does not match locked release_id "${lock.release_id}"`,
          );
        }
      }

      rememberVerified(entry, stagedFilePath);
      stagedFiles.push({ stagedFilePath, destFilePath });
    }

    // Semantic checks apply equally to staged and cached files.
    for (const destination of ['public/omics/manifest.json', 'public/omics/catalogue.json',
      `public/omics/releases/${lock.release_id}/manifest.json`, `public/omics/releases/${lock.release_id}/catalogue.json`]) {
      validatePointer(verifiedPaths.get(destination), destination, lock.release_id);
    }
    // Receipts are immutable manifests. Their declared files must be represented
    // even when a local current-only hydration skips historical payloads.
    for (const entry of manifest.files.filter(entry => entry.destination.startsWith('data/omics/releases/'))) {
      const releaseId = path.basename(entry.destination, '.json');
      if (!RELEASE_ID.test(releaseId)) throw new Error(`Invalid receipt release ID: ${releaseId}`);
      const receipt = validatePointer(verifiedPaths.get(entry.destination), entry.destination, releaseId);
      const archivedManifest = byDestination.get(`public/omics/releases/${releaseId}/manifest.json`);
      if (!archivedManifest || archivedManifest.sha256 !== entry.sha256 || archivedManifest.bytes !== entry.bytes) {
        throw new Error(`Missing or inconsistent immutable manifest for receipt: ${releaseId}`);
      }
      if (!receipt.files || typeof receipt.files !== 'object' || Array.isArray(receipt.files)) {
        throw new Error(`Release manifest must declare files: ${releaseId}`);
      }
      const catalogue = byDestination.get(`public/omics/releases/${releaseId}/catalogue.json`);
      if (!catalogue || receipt.files['catalogue.json'] !== catalogue.sha256 || receipt.catalogue_sha256 !== catalogue.sha256) {
        throw new Error(`Release catalogue_sha256 mismatch: ${releaseId}`);
      }
      for (const [name, digest] of Object.entries(receipt.files)) {
        const destination = `public/omics/releases/${releaseId}/${name}`;
        if (!isAllowedDestination(destination) || name.includes('/') || !byDestination.has(destination)) {
          throw new Error(`Required release artifact missing: ${releaseId}/${name}`);
        }
        if (byDestination.get(destination).sha256 !== digest) throw new Error(`Release artifact digest mismatch: ${releaseId}/${name}`);
      }
    }

    // 7. Atomic per-file promotion ONLY after all verification succeeds
    for (const { stagedFilePath, destFilePath } of stagedFiles) {
      assertSafePath(websiteRoot, path.relative(websiteRoot, destFilePath));
      assertSafePath(websiteRoot, 'workbench', { directory: true, required: true });
      fs.mkdirSync(path.dirname(destFilePath), { recursive: true });
      fs.renameSync(stagedFilePath, destFilePath);
    }
  } finally {
    // Clean up temporary staging directory without touching anything else in workbench
    try {
      if (fs.existsSync(stagingDir)) {
        fs.rmSync(stagingDir, { recursive: true, force: true });
      }
    } catch {}
  }

  return {
    release_id: lock.release_id,
    hydratedCount: stagedFiles.length,
    reusedCount,
    skippedCount,
  };
}

// CLI execution guard
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  prepareBenchmarkData()
    .then(({ release_id, hydratedCount, reusedCount, skippedCount }) => {
      console.log(
        `Hydrated benchmark data (${release_id}): ${hydratedCount} written, ${reusedCount} reused, ${skippedCount} skipped.`,
      );
    })
    .catch((err) => {
      console.error(`Preparation failed: ${err.message}`);
      process.exit(1);
    });
}
