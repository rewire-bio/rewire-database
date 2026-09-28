import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const MIN_FREE_BYTES = 45 * 1024 ** 3;

// Only disposable SDK installations on GitHub's Ubuntu VM images. Preserve the
// checkout, archives, Node, Python, Java, Git and system compiler dependencies.
// Source paths: https://github.com/actions/runner-images/tree/main/images/ubuntu/scripts/build
// Go/Ruby cache: toolsets/toolset-2404.json and Install-Toolset.ps1 / install-ruby.sh.
// Rust: install-rust.sh installs into /etc/skel; the runner home receives a copy.
export const UNUSED_TOOL_DIRECTORIES = Object.freeze([
  '/usr/local/lib/android',
  '/usr/share/dotnet',
  '/usr/share/swift',
  '/usr/local/.ghcup',
  '/opt/ghc',
  '/opt/hostedtoolcache/CodeQL',
  '/usr/local/share/powershell',
  '/opt/hostedtoolcache/go',
  '/opt/hostedtoolcache/Ruby',
  '/etc/skel/.rustup',
  '/etc/skel/.cargo',
  '/home/runner/.rustup',
  '/home/runner/.cargo',
]);

const contains = (parent, child) => child === parent || child.startsWith(`${parent}/`);
const gib = bytes => `${(bytes / 1024 ** 3).toFixed(2)} GiB`;

function command(program, args) {
  const result = spawnSync(program, args, { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${program} failed (${result.status}): ${result.stderr.trim()}`);
  return result.stdout;
}

/** Reclaim only known unused SDKs, never arbitrary caches or repository data.
 * Dependencies are injectable for filesystem fixtures; CLI cannot override the
 * platform, safety guards, path allowlist or minimum free-space requirement. */
export function prepareRunnerSpace({
  env = process.env, platform = process.platform, files = fs,
  run = command, log = console.log, dryRun = false,
} = {}) {
  // RUNNER_ENVIRONMENT is documented at:
  // https://docs.github.com/en/actions/reference/workflows-and-actions/variables
  if (platform !== 'linux' || env.GITHUB_ACTIONS !== 'true' ||
      env.RUNNER_ENVIRONMENT !== 'github-hosted' || env.RUNNER_OS !== 'Linux' ||
      !/^ubuntu\d+$/.test(env.ImageOS || '') ||
      env.RUNNER_TOOL_CACHE !== '/opt/hostedtoolcache' || env.HOME !== '/home/runner')
    throw new Error('Runner space preparation requires a GitHub-hosted Ubuntu VM with the expected tool-cache and runner-home paths.');
  if (!env.GITHUB_WORKSPACE || !path.isAbsolute(env.GITHUB_WORKSPACE))
    throw new Error('A valid GITHUB_WORKSPACE is required.');
  const workspace = files.realpathSync(env.GITHUB_WORKSPACE);
  if (!files.lstatSync(workspace).isDirectory()) throw new Error('GITHUB_WORKSPACE must be a directory.');

  // Validate the complete plan before the first removal. Symlinks (including
  // symlinked parents) and any overlap with the checkout fail closed.
  const planned = [];
  for (const directory of UNUSED_TOOL_DIRECTORIES) {
    if (contains(directory, workspace) || contains(workspace, directory))
      throw new Error(`Refusing cleanup that overlaps the checkout: ${directory}`);
    let entry;
    try { entry = files.lstatSync(directory); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    if (!entry.isDirectory() || files.realpathSync(directory) !== directory)
      throw new Error(`Refusing cleanup of a non-directory or symlinked SDK path: ${directory}`);
    planned.push(directory);
  }

  const free = () => {
    const output = run('df', ['-PB1', workspace]);
    const value = output.trim().split('\n').at(-1)?.trim().split(/\s+/)[3];
    const bytes = Number(value);
    if (!/^\d+$/.test(value || '') || !Number.isSafeInteger(bytes))
      throw new Error('Cannot read available workspace bytes from df.');
    return bytes;
  };
  log('Workspace filesystem before preparation:');
  log(run('df', ['-h', workspace]).trim());
  const before = free();
  let available = before;
  const removed = [];
  if (dryRun) {
    for (const directory of planned) log(`Would remove unused SDK: ${directory}`);
    log(`Dry run: no files removed; ${gib(available)} free, ${gib(MIN_FREE_BYTES)} required before dependency installation.`);
    return { dryRun, available, required: MIN_FREE_BYTES, planned, removed };
  }
  for (const directory of planned) {
    if (available >= MIN_FREE_BYTES) break;
    log(`Removing unused SDK: ${directory}`);
    run('sudo', ['-n', 'rm', '-rf', '--one-file-system', '--', directory]);
    removed.push(directory);
    available = free();
  }
  log('Workspace filesystem after preparation:');
  log(run('df', ['-h', workspace]).trim());
  log(`Free space: ${gib(available)} (${available} bytes); reclaimed ${gib(available - before)}.`);
  if (available < MIN_FREE_BYTES)
    throw new Error(`Insufficient temporary build space: need at least 45 GiB free before dependency installation; found ${gib(available)}. All allowed SDK cleanup is exhausted. Preserve the catalogue archives and investigate the runner image.`);
  return { dryRun, available, required: MIN_FREE_BYTES, planned, removed };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length > 1 || (args.length === 1 && args[0] !== '--dry-run'))
      throw new Error('Usage: node scripts/prepare-runner-space.mjs [--dry-run]');
    prepareRunnerSpace({ dryRun: args[0] === '--dry-run' });
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
