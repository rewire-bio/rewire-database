import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const MIN_FREE_BYTES = 45 * 1024 ** 3;
// Dependency installation is already paid for at the second website check.
export const AFTER_DEPENDENCIES_FREE_BYTES = 44 * 1024 ** 3;

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
  // Additional optional runtimes and non-Google cloud tools. These locations
  // come from the same runner image's install-miniconda/homebrew/aws-tools.sh;
  // Azure's Debian package is built by Azure/azure-cli/scripts/release/debian/prepare.sh.
  '/usr/share/miniconda',
  '/home/linuxbrew/.linuxbrew',
  '/opt/az',
  '/opt/microsoft/powershell',
  '/usr/local/aws-cli',
  // Measured on image 20260920.314.1: 689,377,280 and 672,690,176 bytes.
  // These CI workflows run Node/HTTP tests, with no browser automation. Retain
  // Google Chrome, which is used by the separate manual mobile-lab script.
  '/usr/local/share/chromium',
  '/opt/microsoft/msedge',
  // Image ubuntu24/20260927.320 left these optional SDK copies installed.
  // Pinned installer provenance and measured sizes: docs/runner-space.md.
  // Never remove either home directory itself or a general-purpose cache.
  '/opt/hostedtoolcache/PyPy',
  '/home/packer/.rustup',
  '/home/packer/.cargo',
  '/home/runner/.dotnet',
  '/home/packer/.dotnet',
  '/usr/local/aws-sam-cli',
  // Image ubuntu24/20261004.327 left these C++ package, Edge WebDriver and Kotlin
  // installations after all earlier entries were exhausted (run 37638882775).
  // Pinned installer provenance and measured sizes: docs/runner-space.md.
  '/usr/local/share/vcpkg',
  '/usr/local/share/edge_driver',
  '/usr/share/kotlinc',
]);

// Pinned installer evidence for the failed CI image (20260920.314.1):
// https://github.com/actions/runner-images/blob/ubuntu24/20260920.314/images/ubuntu/scripts/build/install-docker.sh
export const UNUSED_RUNNER_IMAGES = Object.freeze([
  'ghcr.io/dependabot/dependabot-updater-core:latest',
  'ghcr.io/github/gh-aw-mcpg:latest',
  'ghcr.io/github/gh-aw-firewall/agent:latest',
  'ghcr.io/github/gh-aw-firewall/api-proxy:latest',
  'ghcr.io/github/gh-aw-firewall/squid:latest',
  'ghcr.io/github/github-mcp-server:latest',
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
 * platform, safety guards, path allowlist or the two fixed phase budgets. */
export function prepareRunnerSpace({
  env = process.env, platform = process.platform, files = fs,
  run = command, log = console.log, dryRun = false, phase = 'before-dependencies',
} = {}) {
  if (!['before-dependencies', 'after-dependencies'].includes(phase)) throw new Error('Unknown runner preparation phase');
  const required = phase === 'after-dependencies' ? AFTER_DEPENDENCIES_FREE_BYTES : MIN_FREE_BYTES;
  const budgetContext = phase === 'after-dependencies' ? 'after dependency installation' : 'before dependency installation';
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

  // Installers use versioned names. Match only their exact naming contracts,
  // never broad directory globs: install-julia.sh, Install-PowerShellAzModules.ps1
  // and the Gradle archive extracted by install-java-tools.sh.
  const versioned = [
    ...files.readdirSync('/usr/local').filter(name => /^julia\d+\.\d+\.\d+$/.test(name))
      .map(name => `/usr/local/${name}`),
    ...files.readdirSync('/usr/share').filter(name => /^az_\d+\.\d+\.\d+$/.test(name))
      .map(name => `/usr/share/${name}`),
    ...files.readdirSync('/usr/share').filter(name => /^gradle-\d+\.\d+(\.\d+)?$/.test(name))
      .map(name => `/usr/share/${name}`),
  ].sort();
  // Validate the complete plan before the first removal. Symlinks (including
  // symlinked parents) and any overlap with the checkout fail closed.
  let planned = [];
  for (const directory of [...UNUSED_TOOL_DIRECTORIES, ...versioned]) {
    if (contains(directory, workspace) || contains(workspace, directory))
      throw new Error(`Refusing cleanup that overlaps the checkout: ${directory}`);
    try {
      const entry = files.lstatSync(directory);
      if (!entry.isDirectory() || files.realpathSync(directory) !== directory)
        throw new Error(`Refusing cleanup of a non-directory or symlinked SDK path: ${directory}`);
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      // Some image-builder homes cannot be traversed by the runner. Preserve
      // these optional installations; never elevate inspection to bypass this.
      if (error.code === 'EACCES') {
        log(`Preserving inaccessible optional SDK (EACCES): ${directory}`);
        continue;
      }
      throw error;
    }
    planned.push(directory);
  }

  // Miniconda/Homebrew must not supply any runtime or deployment dependency in
  // this job. Resolve the actual executables before allowing either installation
  // to be removed. Keep every cached Node/CPython/Java version regardless; preserve PyPy if active.
  const requiredTools = ['node', 'python3', 'java', 'git', 'gcc', 'g++', 'make', 'gcloud'];
  const located = run('which', requiredTools).trim().split('\n');
  if (located.length !== requiredTools.length || located.some(file => !path.isAbsolute(file)))
    throw new Error('Cannot identify required runtime and deployment executables.');
  const protectedPaths = located.map(file => files.realpathSync(file));
  for (const key of ['JAVA_HOME', 'CLOUDSDK_PYTHON', 'PYTHONHOME', 'CONDA_PREFIX'])
    if (env[key] && path.isAbsolute(env[key])) protectedPaths.push(files.realpathSync(env[key]));
  planned = planned.filter(directory => {
    if (!protectedPaths.some(file => contains(directory, file))) return true;
    log(`Preserving active runtime or deployment dependency: ${directory}`);
    return false;
  });

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
    log(`Dry run: no files removed; ${gib(available)} free, ${gib(required)} required ${budgetContext}.`);
    return { dryRun, available, required, planned, removed };
  }
  for (const directory of planned) {
    if (available >= required) break;
    log(`Removing unused SDK: ${directory}`);
    log(run('sudo', ['-n', 'du', '-s', '-x', '-B1', '--', directory]).trim());
    run('sudo', ['-n', 'rm', '-rf', '--one-file-system', '--', directory]);
    removed.push(directory);
    available = free();
  }

  const removedImages = [];
  if (available < required) {
    // No global prune, container deletion, volume deletion or registry access.
    // The fixed Unix socket and absent context/TLS overrides restrict this to
    // the disposable hosted VM's own daemon, regardless of default CLI context.
    const overrides = ['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH'];
    if (overrides.some(key => env[key])) throw new Error('Refusing Docker cache cleanup with Docker endpoint/context overrides.');
    let socket;
    try { socket = files.lstatSync('/run/docker.sock'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (socket) {
      if (!socket.isSocket() || files.realpathSync('/run/docker.sock') !== '/run/docker.sock')
        throw new Error('Refusing Docker cache cleanup through an unexpected socket.');
      const docker = args => run('docker', ['--host', 'unix:///run/docker.sock', ...args]);
      log('Local Docker cache before preparation:');
      log(docker(['system', 'df']).trim());
      log(docker(['image', 'ls', '--digests', '--no-trunc']).trim());
      if (docker(['container', 'ls', '--all', '--quiet']).trim())
        throw new Error('Refusing Docker cache cleanup because this runner already has containers.');
      const cached = new Set(docker(['image', 'ls', '--format', '{{.Repository}}:{{.Tag}}']).trim().split('\n'));
      for (const image of UNUSED_RUNNER_IMAGES) {
        if (available >= required) break;
        if (!cached.has(image)) continue;
        log(`Removing unused preloaded runner image: ${image}`);
        log(docker(['image', 'rm', image]).trim()); // Deliberately no --force.
        removedImages.push(image);
        available = free();
      }
      log('Local Docker cache after preparation:');
      log(docker(['system', 'df']).trim());
    } else log('No local Docker socket; no container-cache cleanup attempted.');
  }
  log('Workspace filesystem after preparation:');
  log(run('df', ['-h', workspace]).trim());
  log(`Free space: ${gib(available)} (${available} bytes); reclaimed ${gib(available - before)}.`);
  if (available < required) {
    log('Remaining installation sizes (read-only diagnostics):');
    try { log(run('sudo', ['-n', 'du', '-x', '-B1', '--max-depth=2', '--', '/usr/local', '/usr/share', '/opt', '/home', '/var/lib']).trim()); }
    catch (error) { log(`Size diagnostics failed: ${error.message}`); }
    throw new Error(`Insufficient temporary build space: need at least ${required / 1024 ** 3} GiB free ${budgetContext}; found ${gib(available)}. All allowed SDK/image cleanup is exhausted. Preserve the catalogue archives and investigate the runner inventory above.`);
  }
  return { dryRun, available, required, planned, removed, removedImages };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (new Set(args).size !== args.length || args.some(arg => !['--dry-run', '--after-dependencies'].includes(arg)))
      throw new Error('Usage: node scripts/prepare-runner-space.mjs [--dry-run] [--after-dependencies]');
    prepareRunnerSpace({ dryRun: args.includes('--dry-run'), phase: args.includes('--after-dependencies') ? 'after-dependencies' : 'before-dependencies' });
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
