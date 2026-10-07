import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { prepareBenchmarkData } from './prepare-benchmark-data.mjs';

export const SOURCE_RELATIVE = 'workbench/benchmark-data';
export const RECEIPT_RELATIVE = 'workbench/benchmark-data-release.json';
export const PRODUCER_REMOTES = Object.freeze([
  'https://github.com/rewire-bio/rewire-benchmark-data',
  'https://github.com/rewire-bio/rewire-benchmark-data.git',
]);

const defaultGit = (cwd, args) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const defaultFree = directory => {
  const output = execFileSync('df', ['-PB1', directory], { encoding: 'utf8' });
  const value = output.trim().split('\n').at(-1)?.trim().split(/\s+/)[3];
  if (!/^\d+$/.test(value || '')) throw new Error('Cannot read available workspace bytes from df.');
  return Number(value);
};

/** Remove the CI-managed temporary public producer checkout after the whole
 * pinned release has been hydrated, cached and re-authenticated by the native
 * preparation. Hydrated data, public files, workbench siblings and the root
 * consumer Git are never touched. Dependencies are injectable for fixtures; the
 * CLI cannot override the platform, path, remote or revision checks. */
export async function releasePreparedDataCheckout({
  env = process.env, platform = process.platform, files = fs, git = defaultGit,
  prepare = prepareBenchmarkData, free = defaultFree, log = console.log,
  cwd = process.cwd(), now = () => new Date(),
} = {}) {
  if (platform !== 'linux' || env.GITHUB_ACTIONS !== 'true' ||
      env.RUNNER_ENVIRONMENT !== 'github-hosted' || env.RUNNER_OS !== 'Linux' ||
      !/^ubuntu\d+$/.test(env.ImageOS || '') || env.HOME !== '/home/runner')
    throw new Error('Checkout release requires a GitHub-hosted Ubuntu VM.');
  if (env.BENCHMARK_DATA_ALLOW_UNCOMMITTED !== undefined)
    throw new Error('Refusing checkout release with BENCHMARK_DATA_ALLOW_UNCOMMITTED set.');
  for (const key of ['BENCHMARK_DATA_SOURCE', 'GIT_DIR', 'GIT_WORK_TREE'])
    if (env[key]) throw new Error(`Refusing checkout release with ${key} set.`);
  if (!env.GITHUB_WORKSPACE || !path.isAbsolute(env.GITHUB_WORKSPACE))
    throw new Error('A valid GITHUB_WORKSPACE is required.');

  const workspace = files.realpathSync(env.GITHUB_WORKSPACE);
  if (path.resolve(env.GITHUB_WORKSPACE) !== workspace || path.resolve(cwd) !== workspace || files.realpathSync(cwd) !== workspace) throw new Error('Run from the GITHUB_WORKSPACE root.');
  const directory = (target, what) => {
    const entry = files.lstatSync(target);
    if (entry.isSymbolicLink() || !entry.isDirectory() || files.realpathSync(target) !== target)
      throw new Error(`Refusing ${what}: not a plain directory: ${target}`);
  };
  const source = path.join(workspace, SOURCE_RELATIVE);
  // The root checkout must be an ordinary clone, never a linked worktree.
  directory(path.join(workspace, '.git'), 'root Git directory');
  directory(path.join(workspace, 'workbench'), 'workbench');
  directory(source, 'producer checkout');
  directory(path.join(source, '.git'), 'producer Git directory');

  let lock;
  try { lock = JSON.parse(files.readFileSync(path.join(workspace, 'benchmark-data.lock.json'), 'utf8')); }
  catch { throw new Error('Malformed or missing benchmark-data.lock.json'); }
  if (lock.repository !== 'rewire-bio/rewire-benchmark-data' || !/^[a-f0-9]{40}$/.test(lock.revision))
    throw new Error('Invalid data pin.');
  const remote = git(source, ['remote', 'get-url', 'origin']);
  if (!PRODUCER_REMOTES.includes(remote)) throw new Error(`Unexpected producer remote: ${remote}`);
  const head = git(source, ['rev-parse', 'HEAD']);
  if (head !== lock.revision) throw new Error(`Producer checkout is at ${head}, expected ${lock.revision}.`);

  if (git(source, ['status', '--porcelain', '--untracked-files=all']))
    throw new Error('Refusing to remove a modified producer checkout.');
  const receiptPath = path.join(workspace, RECEIPT_RELATIVE);
  const safeReceipt = target => {
    try {
      const entry = files.lstatSync(target);
      if (entry.isSymbolicLink() || !entry.isFile() || files.realpathSync(target) !== target)
        throw new Error('Refusing an unsafe checkout-release receipt path.');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  };
  for (const target of [receiptPath, `${receiptPath}.tmp`]) safeReceipt(target);
  if (files.existsSync(`${receiptPath}.tmp`)) throw new Error('A checkout-release receipt is already pending.');

  // Full mode authenticates the lock, package, release and every payload,
  // including historical outputs. Any failure throws before deletion.
  const prepared = await prepare({ source, websiteRoot: workspace, currentOnly: false });
  if (prepared?.release_id !== lock.release_id) throw new Error('Prepared release does not match the data pin.');

  directory(source, 'producer checkout');
  for (const target of [receiptPath, `${receiptPath}.tmp`]) safeReceipt(target);
  if (git(source, ['rev-parse', 'HEAD']) !== lock.revision ||
      git(source, ['status', '--porcelain', '--untracked-files=all']))
    throw new Error('Producer checkout changed during verification.');
  files.rmSync(source, { recursive: true });
  const available = free(workspace);
  const receipt = {
    producer_repository: lock.repository,
    producer_commit: lock.revision,
    manifest_sha256: lock.manifest_sha256,
    release_id: lock.release_id,
    removed_path: SOURCE_RELATIVE,
    available_bytes: available,
    released_at: now().toISOString(),
  };
  files.writeFileSync(`${receiptPath}.tmp`, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
  files.renameSync(`${receiptPath}.tmp`, receiptPath);
  log(`Released ${SOURCE_RELATIVE} (${lock.revision}); ${available} bytes free.`);
  return receipt;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length > 2) throw new Error('Usage: node scripts/release-prepared-data-checkout.mjs');
    await releasePreparedDataCheckout();
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
