#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { verifyLock, isAllowedDestination, isCurrentOnlyEntry } from './prepare-benchmark-data.mjs';

// Return literal non-cone sparse patterns only after authenticating the manifest.
// Hydration still verifies HEAD, every payload hash and every immutable receipt.
export function currentDataPatterns(lock, rawManifest) {
  verifyLock(lock);
  if (crypto.createHash('sha256').update(rawManifest).digest('hex') !== lock.manifest_sha256) {
    throw new Error('Manifest SHA-256 mismatch');
  }
  const manifest = JSON.parse(rawManifest.toString());
  if (manifest.schema_version !== 1 || manifest.release_id !== lock.release_id || !Array.isArray(manifest.files)) {
    throw new Error('Invalid pinned website manifest');
  }
  const sources = new Set();
  for (const entry of manifest.files) {
    if (!isAllowedDestination(entry.destination) || !['current', 'historical'].includes(entry.scope) ||
        typeof entry.source !== 'string' || !/^(?:website\/files|data\/omics\/releases)\/[A-Za-z0-9_./-]+\.gz$/.test(entry.source) ||
        entry.source.split('/').some(part => part === '.' || part === '..' || !part)) {
      throw new Error('Unsafe manifest entry');
    }
    if (isCurrentOnlyEntry(entry)) sources.add('/' + entry.source);
  }
  if (!sources.size) throw new Error('Empty current data selection');
  return ['/website/manifest.json', ...[...sources].sort()];
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const source = path.resolve(process.argv[2] || 'workbench/benchmark-data');
  const lock = JSON.parse(fs.readFileSync('benchmark-data.lock.json', 'utf8'));
  const patterns = currentDataPatterns(lock, fs.readFileSync(path.join(source, 'website/manifest.json')));
  if (execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim() !== lock.revision) {
    throw new Error('Data checkout revision does not match pin');
  }
  execFileSync('git', ['sparse-checkout', 'set', '--no-cone', '--stdin'], {
    cwd: source, input: patterns.join('\n') + '\n', stdio: ['pipe', 'inherit', 'inherit'],
  });
  console.log(`Selected ${patterns.length - 1} current payloads plus the SHA-verified manifest; no expanded historical archives.`);
}
