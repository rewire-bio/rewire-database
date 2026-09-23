import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { buildStatic } from '../scripts/build-static.mjs';

const roots: string[] = [];
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rewire-static-'));
  roots.push(root);
  const publicRoot = path.join(root, 'public/omics');
  fs.mkdirSync(path.join(publicRoot, 'releases/current'), { recursive: true });
  fs.mkdirSync(path.join(publicRoot, 'releases/old/nested'), { recursive: true });
  fs.writeFileSync(path.join(publicRoot, 'manifest.json'), JSON.stringify({ release_id: 'current' }));
  fs.writeFileSync(path.join(publicRoot, 'releases/current/audit-index.json'), '[{"id":"audit"}]');
  fs.writeFileSync(path.join(publicRoot, 'releases/old/nested/evidence.csv'), 'score\n0.123456789\n');
  fs.mkdirSync(path.join(root, 'workbench'), { recursive: true });
  fs.writeFileSync(path.join(root, 'workbench/unrelated.txt'), 'preserve');
  return root;
}
function exported(root: string) {
  fs.mkdirSync(path.join(root, 'out/omics/releases/current'), { recursive: true });
  fs.copyFileSync(path.join(root, 'public/omics/releases/current/audit-index.json'), path.join(root, 'out/omics/releases/current/audit-index.json'));
}
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

describe('static build archive staging', () => {
  it('keeps current audit assets, restores histories, and exports exact hard links', async () => {
    const root = fixture();
    const source = path.join(root, 'public/omics/releases/old/nested/evidence.csv');
    const original = fs.statSync(source);
    await buildStatic({ root, build: async () => {
      expect(fs.readdirSync(path.join(root, 'public/omics/releases'))).toEqual(['current']);
      expect(fs.readFileSync(path.join(root, 'public/omics/releases/current/audit-index.json'), 'utf8')).toContain('audit');
      exported(root);
    } });
    const target = path.join(root, 'out/omics/releases/old/nested/evidence.csv');
    expect(fs.readFileSync(target)).toEqual(fs.readFileSync(source));
    expect(fs.statSync(source).ino).toBe(original.ino);
    expect(fs.statSync(target).ino).toBe(original.ino);
    expect(fs.statSync(target).dev).toBe(original.dev);
    expect(fs.lstatSync(target).isSymbolicLink()).toBe(false);
    expect(fs.readFileSync(path.join(root, 'workbench/unrelated.txt'), 'utf8')).toBe('preserve');
    expect(fs.existsSync(path.join(root, 'workbench/build-static.lock'))).toBe(false);
  });

  it('restores history after build failure and does not export it', async () => {
    const root = fixture();
    await expect(buildStatic({ root, build: async () => { throw new Error('Next failed'); } })).rejects.toThrow('Next failed');
    expect(fs.readFileSync(path.join(root, 'public/omics/releases/old/nested/evidence.csv'), 'utf8')).toContain('0.123456789');
    expect(fs.existsSync(path.join(root, 'out/omics/releases/old'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'workbench/build-static.lock'))).toBe(false);
  });

  it.each(['SIGINT', 'SIGTERM'])('restores history when interrupted by %s', async reason => {
    const root = fixture(), controller = new AbortController();
    await expect(buildStatic({ root, signal: controller.signal, build: async () => { controller.abort(reason); } })).rejects.toBe(reason);
    expect(fs.existsSync(path.join(root, 'public/omics/releases/old/nested/evidence.csv'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'workbench/build-static.lock'))).toBe(false);
  });

  it('preserves both sides of a restore collision and leaves recovery metadata', async () => {
    const root = fixture();
    await expect(buildStatic({ root, build: async () => {
      fs.mkdirSync(path.join(root, 'public/omics/releases/old'));
      fs.writeFileSync(path.join(root, 'public/omics/releases/old/new.txt'), 'new content');
    } })).rejects.toThrow('restoration requires recovery');
    expect(fs.readFileSync(path.join(root, 'public/omics/releases/old/new.txt'), 'utf8')).toBe('new content');
    expect(fs.readFileSync(path.join(root, 'workbench/build-static.lock/historical/old/nested/evidence.csv'), 'utf8')).toContain('0.123456789');
    expect(JSON.parse(fs.readFileSync(path.join(root, 'workbench/build-static.lock/recovery.json'), 'utf8')).historical).toEqual(['old']);
  });

  it('rejects output collisions after restoring history without overwriting output', async () => {
    const root = fixture();
    await expect(buildStatic({ root, build: async () => {
      exported(root);
      fs.mkdirSync(path.join(root, 'out/omics/releases/old'));
      fs.writeFileSync(path.join(root, 'out/omics/releases/old/sentinel'), 'keep');
    } })).rejects.toThrow('Export collision');
    expect(fs.readFileSync(path.join(root, 'out/omics/releases/old/sentinel'), 'utf8')).toBe('keep');
    expect(fs.existsSync(path.join(root, 'public/omics/releases/old/nested/evidence.csv'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'workbench/build-static.lock'))).toBe(false);
  });

  it('rejects concurrent runs without disturbing the first staging directory', async () => {
    const root = fixture();
    await buildStatic({ root, build: async () => {
      await expect(buildStatic({ root, build: async () => { throw new Error('must not run'); } })).rejects.toThrow('already running or recovery required');
      expect(fs.existsSync(path.join(root, 'workbench/build-static.lock/historical/old/nested/evidence.csv'))).toBe(true);
      exported(root);
    } });
    expect(fs.existsSync(path.join(root, 'public/omics/releases/old/nested/evidence.csv'))).toBe(true);
  });

  it('fails before staging when the manifest cannot identify current assets', async () => {
    const root = fixture();
    fs.writeFileSync(path.join(root, 'public/omics/manifest.json'), '{"release_id":"../outside"}');
    await expect(buildStatic({ root, build: async () => { throw new Error('must not run'); } })).rejects.toThrow('Invalid current release_id');
    expect(fs.existsSync(path.join(root, 'public/omics/releases/old/nested/evidence.csv'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'workbench/build-static.lock'))).toBe(false);
  });
});


describe('static build CLI interruption', () => {
  it.each([['SIGINT', 130], ['SIGTERM', 143]] as const)('waits for Next to stop and restores archives on %s', async (signal, expectedCode) => {
    const root = fixture();
    const fakeNext = path.join(root, 'node_modules/next/dist/bin/next');
    fs.mkdirSync(path.dirname(fakeNext), { recursive: true });
    fs.writeFileSync(fakeNext, "require('node:fs').writeFileSync('child-ready', String(process.pid)); setInterval(() => {}, 1000);\n");
    const script = fileURLToPath(new URL('../scripts/build-static.mjs', import.meta.url));
    const child = spawn(process.execPath, [script], { cwd: root, stdio: 'pipe' });
    let diagnostics = '';
    child.stderr.on('data', data => { diagnostics += data.toString(); });
    const finished = new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
    const deadline = Date.now() + 5000;
    try {
      while (!fs.existsSync(path.join(root, 'child-ready'))) {
        if (Date.now() > deadline || child.exitCode !== null) throw new Error('Fake Next did not start: ' + diagnostics);
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      expect(fs.existsSync(path.join(root, 'public/omics/releases/old'))).toBe(false);
      child.kill(signal);
      expect(await finished).toBe(expectedCode);
      expect(fs.existsSync(path.join(root, 'public/omics/releases/old/nested/evidence.csv'))).toBe(true);
      expect(fs.existsSync(path.join(root, 'workbench/build-static.lock'))).toBe(false);
    } finally {
      if (child.exitCode === null && child.signalCode === null) { child.kill('SIGTERM'); await finished; }
    }
  });
});
