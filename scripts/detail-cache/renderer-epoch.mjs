import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

// Everything that can change what a cached page's bytes should be, other
// than catalogue data (tracked separately, per page, by lib/detail-cache).
// Any change here must invalidate every cached page, because it can change
// the shared renderer, the client bundle, or Next's build id (and therefore
// which chunk paths a previously-rendered HTML file still points at).
const EPOCH_PATHS = [
  'app',
  'components',
  'lib',
  'services/omics/src',
  'next.config.mjs',
  'tailwind.config.ts',
  'postcss.config.mjs',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'scripts/detail-cache',
  'lib/detail-cache',
];

function walk(root, relative, hash) {
  const absolute = path.join(root, relative);
  let stat;
  try {
    stat = fs.lstatSync(absolute);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  if (stat.isSymbolicLink()) throw new Error(`Symlink in renderer epoch: ${absolute}`);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      walk(root, path.join(relative, entry.name), hash);
    }
    return;
  }
  hash.update(relative.replace(/\\/g, '/'));
  hash.update('\0');
  hash.update(fs.readFileSync(absolute));
  hash.update('\0');
}

/**
 * Hash of every file that can affect shared rendering (app/components/lib,
 * the query engine, build config, dependency versions) plus every
 * `NEXT_PUBLIC_*` env var actually set and the current local calendar year
 * (Footer.tsx bakes `new Date().getFullYear()` server-side into every page).
 * Pinned as Next's buildId: unchanged epoch -> unchanged buildId -> Next's
 * deterministic content-hashed chunk filenames stay stable build to build,
 * so a previously-cached page's HTML remains a valid reference into the
 * current build's static asset tree. Any change here must drop the whole
 * detail-page cache before the next build runs.
 */
export function computeRendererEpoch(root = process.cwd()) {
  const hash = createHash('sha256');
  for (const relative of EPOCH_PATHS) walk(root, relative, hash);
  const envKeys = Object.keys(process.env).filter((key) => key.startsWith('NEXT_PUBLIC_')).sort();
  for (const key of envKeys) {
    hash.update(key);
    hash.update('=');
    hash.update(process.env[key] ?? '');
    hash.update('\0');
  }
  hash.update(`runtime:${process.version}:${process.platform}:${process.arch}`);
  hash.update(`buildYear:${new Date().getFullYear()}`);
  return hash.digest('hex');
}
