import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { verifyLock } from './prepare-benchmark-data.mjs';
import { usesReleaseAssets } from './release-assets.mjs';
import { downloadCurrentData } from './select-current-data.mjs';

/** Inspect existing path components without following links, including dangling links. */
function checkedDirectory(directory) {
  let stat;
  try { stat = fs.lstatSync(directory); }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  if (stat.isSymbolicLink()) throw new Error(`Symlink checkout path rejected: ${directory}`);
  if (!stat.isDirectory()) throw new Error(`Expected a directory: ${directory}`);
  return true;
}

/**
 * Fetch only the reviewed artifact into the website's dedicated checkout.
 * @param {{ root?: string, git?: (args: string[], options: {cwd: string}) => string }} [options]
 */
export function fetchBenchmarkData({ root = process.cwd(), git } = {}) {
  root = fs.realpathSync(root);
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'benchmark-data.lock.json'), 'utf8'));
  verifyLock(lock);
  const workbench = path.join(root, 'workbench');
  const directory = path.join(workbench, 'benchmark-data');
  checkedDirectory(workbench);
  const exists = checkedDirectory(directory);
  const run = git || ((args, options) => execFileSync('git', args, {
    cwd: options.cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'],
  }));
  const command = args => run(args, { cwd: root });
  if (exists) {
    // Reject a plain directory inside another repository before inspecting or
    // changing its sparse checkout. Never mutate a symlink target checkout.
    const topLevel = command(['-C', directory, 'rev-parse', '--show-toplevel']).trim();
    if (fs.realpathSync(topLevel) !== directory) throw new Error('Data checkout Git root differs from its dedicated directory');
    const remote = command(['-C', directory, 'remote', 'get-url', 'origin']).trim();
    if (![`git@github.com:${lock.repository}.git`, `https://github.com/${lock.repository}.git`].includes(remote)) {
      throw new Error('Data checkout origin differs from the lock');
    }
    if (command(['-C', directory, 'status', '--porcelain']).trim()) {
      throw new Error('Data checkout has local changes; preserve them before fetching');
    }
  } else {
    fs.mkdirSync(workbench, { recursive: true });
    command(['clone', '--no-checkout', '--filter=blob:none', `https://github.com/${lock.repository}.git`, directory]);
  }
  // Only published artifact objects are needed by a frontend build. A release published
  // as assets has only its manifest and receipts there; fetchBenchmarkDataFiles downloads the rest.
  command(['-C', directory, 'sparse-checkout', 'set', 'website', 'data/omics/releases']);
  command(['-C', directory, 'fetch', '--depth=1', 'origin', lock.revision]);
  command(['-C', directory, 'checkout', '--detach', lock.revision]);
  console.log(`Prepared data checkout ${lock.repository}@${lock.revision}; run npm run data:prepare.`);
  return directory;
}

/** Check out the pinned revision, then download its files if they are release assets. */
export async function fetchBenchmarkDataFiles(options = {}) {
  const directory = fetchBenchmarkData(options);
  const lock = JSON.parse(fs.readFileSync(path.join(options.root || process.cwd(), 'benchmark-data.lock.json'), 'utf8'));
  if (usesReleaseAssets(lock)) {
    const count = await downloadCurrentData(lock, fs.readFileSync(path.join(directory, 'website/manifest.json')), directory, options);
    console.log(`Downloaded ${count} release files from ${lock.serving.tag}.`);
  }
  return directory;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await fetchBenchmarkDataFiles();
}
