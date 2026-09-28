import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MIN_FREE_BYTES, UNUSED_TOOL_DIRECTORIES, UNUSED_RUNNER_IMAGES, prepareRunnerSpace } from '../scripts/prepare-runner-space.mjs';

const roots: string[] = [];
const GiB = 1024 ** 3;

function fixture(initialFree = 34 * GiB, perRemoval = GiB) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'rewire-runner-space-')));
  roots.push(root);
  const map = (logical: string) => path.join(root, logical);
  const workspace = '/home/runner/work/rewire-database/rewire-database';
  const preserved = [
    `${workspace}/data/omics/releases/immutable.json`,
    '/opt/hostedtoolcache/node/22/bin/node',
    '/opt/hostedtoolcache/Python/3.12/bin/python3',
    '/usr/lib/jvm/temurin-21/bin/java',
    '/usr/bin/git', '/usr/bin/gcc', '/usr/bin/g++', '/usr/bin/make',
    '/usr/lib/google-cloud-sdk/bin/gcloud',
  ];
  for (const directory of UNUSED_TOOL_DIRECTORIES) {
    fs.mkdirSync(map(directory), { recursive: true });
    fs.writeFileSync(map(`${directory}/unused-sdk`), 'disposable');
  }
  for (const file of preserved) {
    fs.mkdirSync(path.dirname(map(file)), { recursive: true });
    fs.writeFileSync(map(file), 'preserve');
  }
  const env = {
    NODE_ENV: 'test' as const,
    GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted', RUNNER_OS: 'Linux',
    ImageOS: 'ubuntu24', RUNNER_TOOL_CACHE: '/opt/hostedtoolcache', HOME: '/home/runner',
    GITHUB_WORKSPACE: workspace,
  };
  const docker = { enabled: false, containers: '', images: new Set<string>(), reclaimed: GiB, socketSafe: true };
  const files = {
    lstatSync: (file: string) => file === '/run/docker.sock' && docker.enabled
      ? { isSocket: () => docker.socketSafe } : fs.lstatSync(map(file)),
    realpathSync: (file: string) => file === '/run/docker.sock' && docker.enabled
      ? '/run/docker.sock' : `/${path.relative(root, fs.realpathSync(map(file)))}`,
    readdirSync: (file: string) => fs.readdirSync(map(file)),
  } as typeof fs;
  let available = initialFree;
  const removed: string[] = [];
  // Every operation is confined to this temporary fixture. No real df/sudo/rm.
  const run = vi.fn((program: string, args: string[]) => {
    if (program === 'which') return preserved.slice(1).join('\n') + '\n';
    if (program === 'df') {
      expect(args.at(-1)).toBe(env.GITHUB_WORKSPACE);
      return `Filesystem 1B-blocks Used Available Use% Mounted on\n/dev/fixture 100000000000 0 ${available} 0% /\n`;
    }
    if (program === 'docker') {
      expect(args.slice(0, 2)).toEqual(['--host', 'unix:///run/docker.sock']);
      const rest = args.slice(2);
      if (rest[0] === 'system') return 'Docker cache fixture\n';
      if (rest[0] === 'container') return docker.containers;
      if (rest[1] === 'ls') return [...docker.images].join('\n');
      expect(rest.slice(0, 2)).toEqual(['image', 'rm']);
      expect(rest).toHaveLength(3);
      expect(UNUSED_RUNNER_IMAGES).toContain(rest[2]);
      docker.images.delete(rest[2]);
      available += docker.reclaimed;
      return `Deleted ${rest[2]}\n`;
    }
    expect(program).toBe('sudo');
    if (args[1] === 'du') return `${perRemoval}\t${args.at(-1)}\n`;
    expect(args.slice(0, -1)).toEqual(['-n', 'rm', '-rf', '--one-file-system', '--']);
    const directory = args.at(-1)!;
    expect([...UNUSED_TOOL_DIRECTORIES, '/usr/local/julia1.13.0', '/usr/share/az_15.6.1']).toContain(directory);
    fs.rmSync(map(directory), { recursive: true });
    removed.push(directory);
    available += perRemoval;
    return '';
  });
  const log = vi.fn();
  return { root, map, workspace, preserved, env, files, run, log, removed, docker,
    options: { env, files, run, log, platform: 'linux' as NodeJS.Platform } };
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('hosted runner space preparation', () => {
  it('reclaims known SDKs until 45 GiB is available and preserves repository/runtime files', () => {
    const host = fixture();
    const result = prepareRunnerSpace(host.options);
    expect(result.available).toBe(MIN_FREE_BYTES);
    expect(host.removed.length).toBe(11);
    expect(host.removed).toContain('/opt/hostedtoolcache/go');
    expect(host.removed).toContain('/opt/hostedtoolcache/Ruby');
    expect(host.removed).toContain('/etc/skel/.rustup');
    for (const file of host.preserved) expect(fs.readFileSync(host.map(file), 'utf8')).toBe('preserve');
    // Stop at the budget instead of deleting every tool unconditionally.
    expect(fs.existsSync(host.map('/home/runner/.rustup/unused-sdk'))).toBe(true);
    expect(host.log).toHaveBeenCalledWith(expect.stringContaining('48318382080 bytes'));
  });

  it('does not remove tools when sufficient space already exists', () => {
    const host = fixture(MIN_FREE_BYTES);
    expect(prepareRunnerSpace(host.options).removed).toEqual([]);
    expect(host.run.mock.calls.some(([program]) => program === 'sudo')).toBe(false);
  });

  it('dry run reports the plan without removing files or pretending space was reclaimed', () => {
    const host = fixture();
    const result = prepareRunnerSpace({ ...host.options, dryRun: true });
    expect(result.available).toBe(34 * GiB);
    expect(result.planned).toEqual(UNUSED_TOOL_DIRECTORIES);
    expect(host.removed).toEqual([]);
    for (const directory of UNUSED_TOOL_DIRECTORIES)
      expect(fs.readFileSync(host.map(`${directory}/unused-sdk`), 'utf8')).toBe('disposable');
  });

  it.each([
    ['GITHUB_ACTIONS', 'false'], ['RUNNER_ENVIRONMENT', 'self-hosted'],
    ['RUNNER_OS', 'macOS'], ['ImageOS', ''], ['RUNNER_TOOL_CACHE', '/tmp/tools'],
    ['HOME', '/home/someone'],
  ])('refuses cleanup when %s is not trusted hosted-runner metadata', (key, value) => {
    const host = fixture();
    expect(() => prepareRunnerSpace({ ...host.options, env: { ...host.env, [key]: value } }))
      .toThrow('GitHub-hosted Ubuntu VM');
    expect(host.run).not.toHaveBeenCalled();
  });

  it('refuses a non-Linux host regardless of supplied environment values', () => {
    const host = fixture();
    expect(() => prepareRunnerSpace({ ...host.options, platform: 'darwin' })).toThrow('GitHub-hosted Ubuntu VM');
    expect(host.run).not.toHaveBeenCalled();
  });

  it('rejects checkout overlap before any removal', () => {
    const host = fixture();
    host.env.GITHUB_WORKSPACE = '/opt/hostedtoolcache/Ruby';
    expect(() => prepareRunnerSpace(host.options)).toThrow('overlaps the checkout');
    expect(host.run).not.toHaveBeenCalled();
    expect(fs.readFileSync(host.map('/usr/local/lib/android/unused-sdk'), 'utf8')).toBe('disposable');
  });

  it('rejects a symlinked SDK before any removal', () => {
    const host = fixture();
    const target = host.map('/opt/hostedtoolcache/go');
    fs.rmSync(target, { recursive: true });
    fs.symlinkSync(host.map(host.workspace), target, 'dir');
    expect(() => prepareRunnerSpace(host.options)).toThrow('symlinked SDK path');
    expect(host.run).not.toHaveBeenCalled();
  });

  it('rejects an SDK with a symlinked parent before any removal', () => {
    const host = fixture();
    const parent = host.map('/opt/hostedtoolcache');
    fs.renameSync(parent, host.map('/opt/actual-tools'));
    fs.symlinkSync(host.map('/opt/actual-tools'), parent, 'dir');
    expect(() => prepareRunnerSpace(host.options)).toThrow('symlinked SDK path');
    expect(host.run).not.toHaveBeenCalled();
  });

  it('fails early when every allowed SDK has been removed but space remains insufficient', () => {
    const host = fixture(20 * GiB);
    expect(() => prepareRunnerSpace(host.options)).toThrow('need at least 45 GiB');
    expect(host.removed).toEqual(UNUSED_TOOL_DIRECTORIES);
    for (const file of host.preserved) expect(fs.readFileSync(host.map(file), 'utf8')).toBe('preserve');
  });

  it('rejects malformed disk information before deleting tools', () => {
    const host = fixture();
    const run = vi.fn((program: string, args: string[]) => program === 'df'
      ? 'df did not return filesystem information' : host.run(program, args));
    expect(() => prepareRunnerSpace({ ...host.options, run })).toThrow('Cannot read available');
    expect(host.removed).toEqual([]);
  });

  it('recognises only the documented Julia and Azure module version-directory formats', () => {
    const host = fixture(25 * GiB);
    for (const directory of ['/usr/local/julia1.13.0', '/usr/share/az_15.6.1', '/usr/local/julia-project', '/usr/share/az_private']) {
      fs.mkdirSync(host.map(directory));
      fs.writeFileSync(host.map(`${directory}/sentinel`), 'preserve unless SDK');
    }
    const result = prepareRunnerSpace(host.options);
    expect(result.available).toBe(MIN_FREE_BYTES);
    expect(host.removed).toContain('/usr/local/julia1.13.0');
    expect(host.removed).toContain('/usr/share/az_15.6.1');
    expect(fs.existsSync(host.map('/usr/local/julia-project/sentinel'))).toBe(true);
    expect(fs.existsSync(host.map('/usr/share/az_private/sentinel'))).toBe(true);
  });

  it('preserves an active Python runtime provided by an otherwise optional installation', () => {
    const host = fixture(28 * GiB);
    fs.mkdirSync(host.map('/usr/share/miniconda/bin'));
    fs.writeFileSync(host.map('/usr/share/miniconda/bin/python3'), 'active runtime');
    const run = vi.fn((program: string, args: string[]) => program === 'which'
      ? host.run(program, args).replace('/opt/hostedtoolcache/Python/3.12/bin/python3', '/usr/share/miniconda/bin/python3')
      : host.run(program, args));
    expect(prepareRunnerSpace({ ...host.options, run }).available).toBe(MIN_FREE_BYTES);
    expect(host.removed).not.toContain('/usr/share/miniconda');
    expect(host.log).toHaveBeenCalledWith('Preserving active runtime or deployment dependency: /usr/share/miniconda');
    expect(fs.readFileSync(host.map('/usr/share/miniconda/bin/python3'), 'utf8')).toBe('active runtime');
  });

  it('removes only documented preloaded images on the fixed local daemon without force', () => {
    const host = fixture(23 * GiB);
    host.docker.enabled = true;
    host.docker.images = new Set([...UNUSED_RUNNER_IMAGES, 'company/application:keep']);
    const result = prepareRunnerSpace(host.options);
    expect(result.available).toBe(MIN_FREE_BYTES);
    expect(result.removedImages).toEqual(UNUSED_RUNNER_IMAGES.slice(0, 4));
    expect(host.docker.images.has('company/application:keep')).toBe(true);
    expect(host.docker.images.has(UNUSED_RUNNER_IMAGES[4])).toBe(true);
    expect(host.log).toHaveBeenCalledWith('Local Docker cache before preparation:');
  });

  it.each(['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS_VERIFY'])('refuses Docker cleanup with %s overrides', key => {
    const host = fixture(20 * GiB);
    host.docker.enabled = true;
    host.docker.images = new Set(UNUSED_RUNNER_IMAGES);
    expect(() => prepareRunnerSpace({ ...host.options, env: { ...host.env, [key]: 'custom' } }))
      .toThrow('endpoint/context overrides');
    expect(host.run.mock.calls.some(([program]) => program === 'docker')).toBe(false);
    expect(host.docker.images.size).toBe(UNUSED_RUNNER_IMAGES.length);
  });

  it('does not remove images when the daemon already has containers', () => {
    const host = fixture(20 * GiB);
    host.docker.enabled = true;
    host.docker.containers = 'existing-container';
    host.docker.images = new Set(UNUSED_RUNNER_IMAGES);
    expect(() => prepareRunnerSpace(host.options)).toThrow('already has containers');
    expect(host.docker.images.size).toBe(UNUSED_RUNNER_IMAGES.length);
  });

  it('rejects an unexpected local Docker socket', () => {
    const host = fixture(20 * GiB);
    host.docker.enabled = true;
    host.docker.socketSafe = false;
    expect(() => prepareRunnerSpace(host.options)).toThrow('unexpected socket');
    expect(host.run.mock.calls.some(([program]) => program === 'docker')).toBe(false);
  });
});
