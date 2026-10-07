import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { releasePreparedDataCheckout, SOURCE_RELATIVE, RECEIPT_RELATIVE } from '../scripts/release-prepared-data-checkout.mjs';

const roots: string[] = [];
const revision = 'a'.repeat(40);
function fixture() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'rewire-checkout-release-')));
  roots.push(root);
  const source = path.join(root, SOURCE_RELATIVE);
  for (const dir of ['.git', `${SOURCE_RELATIVE}/.git`, 'public/omics/releases/history', 'data/omics/releases', 'workbench/other-task'])
    fs.mkdirSync(path.join(root, dir), { recursive: true });
  const preserved = ['.git/config', 'public/omics/releases/history/results.jsonl', 'data/omics/releases/history.json', 'workbench/other-task/evidence'];
  for (const file of preserved) fs.writeFileSync(path.join(root, file), 'preserve');
  fs.writeFileSync(path.join(source, 'compressed.json.gz'), 'temporary');
  const pin = { repository: 'rewire-bio/rewire-benchmark-data', revision, release_id: 'fixture-release', manifest_sha256: 'b'.repeat(64) };
  fs.writeFileSync(path.join(root, 'benchmark-data.lock.json'), JSON.stringify(pin));
  const env = { NODE_ENV: 'test' as const, GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted', RUNNER_OS: 'Linux', ImageOS: 'ubuntu24', HOME: '/home/runner', GITHUB_WORKSPACE: root };
  const git = vi.fn((_cwd: string, args: string[]) => args[0] === 'remote' ? 'https://github.com/rewire-bio/rewire-benchmark-data' : args[0] === 'status' ? '' : revision);
  const prepare = vi.fn(async (options?: { currentOnly?: boolean }) => {
    expect(options).toEqual({ source, websiteRoot: root, currentOnly: false });
    expect(fs.existsSync(source)).toBe(true);
    return { release_id: pin.release_id, hydratedCount: 0, reusedCount: 0, skippedCount: 0 };
  });
  return { root, source, pin, env, git, prepare, preserved, options: { env, platform: 'linux' as NodeJS.Platform, cwd: root, git, prepare, free: () => 50 * 1024 ** 3, log: vi.fn(), now: () => new Date('2026-10-07T15:00:00Z') } };
}
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

describe('release only a verified CI temporary data checkout', () => {
  it('re-verifies the complete package before removing the clone; preserves archives and siblings', async () => {
    const f = fixture();
    const receipt = await releasePreparedDataCheckout(f.options);
    expect(f.prepare).toHaveBeenCalledOnce();
    expect(fs.existsSync(f.source)).toBe(false);
    for (const file of f.preserved) expect(fs.readFileSync(path.join(f.root, file), 'utf8')).toBe('preserve');
    expect(receipt).toMatchObject({ producer_commit: revision, manifest_sha256: f.pin.manifest_sha256, release_id: 'fixture-release', removed_path: SOURCE_RELATIVE });
    expect(JSON.parse(fs.readFileSync(path.join(f.root, RECEIPT_RELATIVE), 'utf8'))).toEqual(receipt);
  });
  it('preserves the source when native package/payload verification fails', async () => {
    const f = fixture(); f.prepare.mockRejectedValueOnce(new Error('payload checksum mismatch'));
    await expect(releasePreparedDataCheckout(f.options)).rejects.toThrow('checksum mismatch');
    expect(fs.existsSync(f.source)).toBe(true);
  });
  it.each([
    { GITHUB_ACTIONS: 'false' }, { RUNNER_ENVIRONMENT: 'self-hosted' }, { BENCHMARK_DATA_ALLOW_UNCOMMITTED: '1' },
    { BENCHMARK_DATA_SOURCE: '/elsewhere' }, { GIT_DIR: '/elsewhere' },
  ])('rejects unsafe execution metadata %j before preparation', async change => {
    const f = fixture();
    await expect(releasePreparedDataCheckout({ ...f.options, env: { ...f.env, ...change } })).rejects.toThrow();
    expect(f.prepare).not.toHaveBeenCalled(); expect(fs.existsSync(f.source)).toBe(true);
  });
  it.each(['remote', 'revision', 'dirty'])('rejects a producer with a wrong %s', async kind => {
    const f = fixture();
    f.git.mockImplementation((_cwd, args) => args[0] === 'remote' ? (kind === 'remote' ? 'https://github.com/other/repo' : 'https://github.com/rewire-bio/rewire-benchmark-data') : args[0] === 'status' ? (kind === 'dirty' ? '?? unrelated' : '') : (kind === 'revision' ? 'c'.repeat(40) : revision));
    await expect(releasePreparedDataCheckout(f.options)).rejects.toThrow();
    expect(f.prepare).not.toHaveBeenCalled(); expect(fs.existsSync(f.source)).toBe(true);
  });
  it.each(['root', 'source'])('rejects a linked %s worktree', async kind => {
    const f = fixture(); const dir = path.join(kind === 'root' ? f.root : f.source, '.git');
    fs.rmSync(dir, { recursive: true }); fs.writeFileSync(dir, 'gitdir: /other');
    await expect(releasePreparedDataCheckout(f.options)).rejects.toThrow('not a plain directory');
    expect(f.prepare).not.toHaveBeenCalled(); expect(fs.existsSync(f.source)).toBe(true);
  });
  it('rejects a symlinked source before deleting anything', async () => {
    const f = fixture(); fs.renameSync(f.source, `${f.source}-saved`); fs.symlinkSync(`${f.source}-saved`, f.source);
    await expect(releasePreparedDataCheckout(f.options)).rejects.toThrow('not a plain directory');
    expect(fs.existsSync(`${f.source}-saved/compressed.json.gz`)).toBe(true);
  });
  it.each(['', '.tmp'])('rejects a receipt%s symlink without writing its target or deleting source', async suffix => {
    const f = fixture(); const outside = path.join(f.root, 'outside'); fs.writeFileSync(outside, 'preserve');
    fs.symlinkSync(outside, path.join(f.root, `${RECEIPT_RELATIVE}${suffix}`));
    await expect(releasePreparedDataCheckout(f.options)).rejects.toThrow('unsafe');
    expect(fs.readFileSync(outside, 'utf8')).toBe('preserve'); expect(fs.existsSync(f.source)).toBe(true);
  });
  it('rejects an incorrect prepared release', async () => {
    const f = fixture(); f.prepare.mockResolvedValueOnce({ release_id: 'other', hydratedCount: 0, reusedCount: 0, skippedCount: 0 });
    await expect(releasePreparedDataCheckout(f.options)).rejects.toThrow('does not match'); expect(fs.existsSync(f.source)).toBe(true);
  });
  it('preserves a checkout modified during preparation', async () => {
    const f = fixture(); f.prepare.mockImplementationOnce(async () => { f.git.mockImplementation((_cwd, args) => args[0] === 'status' ? '?? changed' : revision); return { release_id: 'fixture-release', hydratedCount: 0, reusedCount: 0, skippedCount: 0 }; });
    await expect(releasePreparedDataCheckout(f.options)).rejects.toThrow('changed during'); expect(fs.existsSync(f.source)).toBe(true);
  });
  it('keeps full hydration and cache save ahead of removal and builds directly only after successful removal', () => {
    const workflow = fs.readFileSync('.github/workflows/firebase.yml', 'utf8');
    const hydrate = workflow.indexOf('- name: Hydrate and verify the pinned release');
    const cache = workflow.indexOf('- name: Cache authenticated compressed data before expansion');
    const release = workflow.indexOf('- name: Release the temporary compressed producer checkout', cache);
    expect(hydrate).toBeGreaterThan(0); expect(cache).toBeGreaterThan(0); expect(hydrate).toBeGreaterThan(cache); expect(release).toBeGreaterThan(hydrate);
    const auth = workflow.indexOf('- name: Authenticate the compressed checkout before caching');
    expect(auth).toBeGreaterThan(0); expect(auth).toBeLessThan(cache);
    expect(workflow.slice(release)).toContain('steps.release-source.outcome');
    expect(workflow.slice(release)).toContain('then node scripts/deployment-metrics.mjs run rendering -- node scripts/build-static.mjs');
  });
});
