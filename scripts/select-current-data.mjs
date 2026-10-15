#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { verifyLock, isAllowedDestination, isCurrentOnlyEntry } from './prepare-benchmark-data.mjs';
import { assetNames, downloadVerifiedAsset, usesReleaseAssets } from './release-assets.mjs';

// Return the current-only manifest entries only after authenticating the manifest.
// Hydration still verifies HEAD, every payload hash and every immutable receipt.
export function currentDataEntries(lock, rawManifest) {
  verifyLock(lock);
  if (crypto.createHash('sha256').update(rawManifest).digest('hex') !== lock.manifest_sha256) {
    throw new Error('Manifest SHA-256 mismatch');
  }
  const manifest = JSON.parse(rawManifest.toString());
  if (manifest.schema_version !== 1 || manifest.release_id !== lock.release_id || !Array.isArray(manifest.files)) {
    throw new Error('Invalid pinned website manifest');
  }
  const selected = new Map();
  for (const entry of manifest.files) {
    if (!isAllowedDestination(entry.destination) || !['current', 'historical'].includes(entry.scope) ||
        typeof entry.source !== 'string' || !/^(?:website\/files|data\/omics\/releases)\/[A-Za-z0-9_./-]+\.gz$/.test(entry.source) ||
        entry.source.split('/').some(part => part === '.' || part === '..' || !part)) {
      throw new Error('Unsafe manifest entry');
    }
    if (isCurrentOnlyEntry(entry)) selected.set(entry.source, entry);
  }
  if (!selected.size) throw new Error('Empty current data selection');
  return [...selected.values()].sort((a, b) => a.source.localeCompare(b.source));
}

// Literal non-cone sparse patterns, for a release whose files are in Git.
export function currentDataPatterns(lock, rawManifest) {
  return ['/website/manifest.json', ...currentDataEntries(lock, rawManifest).map(entry => '/' + entry.source)];
}

/**
 * For a release published as assets: write each current file to its manifest
 * source path under `source`, verified against the authenticated manifest.
 */
export async function downloadCurrentData(lock, rawManifest, source, { fetchImpl = fetch } = {}) {
  if (!usesReleaseAssets(lock)) throw new Error('The pinned release is read from Git, not from release assets');
  const entries = currentDataEntries(lock, rawManifest);
  assetNames(entries);
  const root = path.resolve(source);
  for (const entry of entries) {
    const target = path.resolve(root, entry.source);
    if (!target.startsWith(root + path.sep)) throw new Error(`Source escapes the data checkout: ${entry.source}`);
    if (fs.existsSync(target)) {
      if (!fs.lstatSync(target).isFile()) throw new Error(`Not a regular file: ${entry.source}`);
      fs.rmSync(target);
    }
    await downloadVerifiedAsset(lock, entry, target, { fetchImpl });
  }
  return entries.length;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const source = path.resolve(process.argv[2] || 'workbench/benchmark-data');
  const lock = JSON.parse(fs.readFileSync('benchmark-data.lock.json', 'utf8'));
  const manifest = fs.readFileSync(path.join(source, 'website/manifest.json'));
  const patterns = currentDataPatterns(lock, manifest);
  if (execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim() !== lock.revision) {
    throw new Error('Data checkout revision does not match pin');
  }
  if (usesReleaseAssets(lock)) {
    // The files are assets of serving/<release_id>; only the manifest comes from Git.
    const count = await downloadCurrentData(lock, manifest, source);
    console.log(`Downloaded ${count} current payloads from ${lock.serving.tag}, each checked against the SHA-verified manifest.`);
  } else {
    // Releases cut before the files moved to release assets: read them from Git.
    execFileSync('git', ['sparse-checkout', 'set', '--no-cone', '--stdin'], {
      cwd: source, input: patterns.join('\n') + '\n', stdio: ['pipe', 'inherit', 'inherit'],
    });
    console.log(`Selected ${patterns.length - 1} current payloads plus the SHA-verified manifest; no expanded historical archives.`);
  }
}
