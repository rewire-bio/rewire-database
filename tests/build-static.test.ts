import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildStatic } from '../scripts/build-static.mjs';

const roots: string[] = [];
const renderAssets = {
  'manifest.json': '{"release_id":"current"}',
  'use-cases.json': '{"use_cases":[]}',
  'audit-index.json': '[{"id":"audit"}]',
  'audit-runs.json': '[{"id":"run"}]',
};
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rewire-static-'));
  roots.push(root);
  const publicRoot = path.join(root, 'public/omics');
  fs.mkdirSync(path.join(publicRoot, 'releases/current'), { recursive: true });
  fs.mkdirSync(path.join(publicRoot, 'releases/old/nested'), { recursive: true });
  fs.writeFileSync(path.join(publicRoot, 'manifest.json'), JSON.stringify({ release_id: 'current' }));
  for (const [name, content] of Object.entries(renderAssets)) fs.writeFileSync(path.join(publicRoot, 'releases/current', name), content);
  fs.writeFileSync(path.join(publicRoot, 'releases/current/evidence.jsonl'), '{"value":0.123456789}\n');
  fs.writeFileSync(path.join(publicRoot, 'catalogue.json'), '{"records":[]}');
  fs.writeFileSync(path.join(publicRoot, 'releases/old/nested/evidence.csv'), 'score\n0.123456789\n');
  fs.mkdirSync(path.join(root, 'workbench'), { recursive: true });
  fs.writeFileSync(path.join(root, 'workbench/unrelated.txt'), 'preserve');
  return root;
}
function exported(root: string) {
  fs.mkdirSync(path.join(root, 'out/omics/releases/current'), { recursive: true });
  for (const name of Object.keys(renderAssets)) fs.copyFileSync(path.join(root, 'public/omics/releases/current', name), path.join(root, 'out/omics/releases/current', name));
}
afterEach(() => { vi.restoreAllMocks(); for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

describe('static build archive staging', () => {
  it('exports only current downloads while restoring existing local history unchanged', async () => {
    const root = fixture();
    const historical = path.join(root, 'public/omics/releases/old/nested/evidence.csv');
    const before = fs.statSync(historical);
    await buildStatic({ root, currentOnly: true, build: async () => {
      expect(fs.existsSync(historical)).toBe(false);
      exported(root);
    } });
    expect(fs.readFileSync(historical, 'utf8')).toBe('score\n0.123456789\n');
    expect(fs.statSync(historical).ino).toBe(before.ino);
    expect(fs.statSync(historical).mtimeMs).toBe(before.mtimeMs);
    expect(fs.existsSync(path.join(root, 'out/omics/releases/old'))).toBe(false);
    expect(fs.readFileSync(path.join(root, 'out/omics/releases/current/evidence.jsonl'), 'utf8')).toBe('{"value":0.123456789}\n');
    expect(fs.existsSync(path.join(root, 'workbench/build-static.lock'))).toBe(false);
  });

  it('restores local history even when a current-only build fails', async () => {
    const root = fixture();
    await expect(buildStatic({ root, currentOnly: true, build: async () => { throw new Error('Next failed'); } })).rejects.toThrow('Next failed');
    expect(fs.existsSync(path.join(root, 'public/omics/releases/old/nested/evidence.csv'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'public/omics/releases/current/evidence.jsonl'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'out/omics/releases/old'))).toBe(false);
  });

  it('keeps rendering assets, stages downloads, and exports exact hard links for current and historical releases', async () => {
    const root = fixture();
    const source = path.join(root, 'public/omics/releases/old/nested/evidence.csv');
    const original = fs.statSync(source);
    const download = path.join(root, 'public/omics/releases/current/evidence.jsonl');
    const originalDownload = fs.statSync(download);
    await buildStatic({ root, build: async () => {
      expect(fs.readdirSync(path.join(root, 'public/omics/releases'))).toEqual(['current']);
      for (const [name, content] of Object.entries(renderAssets)) expect(fs.readFileSync(path.join(root, 'public/omics/releases/current', name), 'utf8')).toBe(content);
      expect(fs.readFileSync(path.join(root, 'public/omics/catalogue.json'), 'utf8')).toBe('{"records":[]}');
      expect(fs.existsSync(download)).toBe(false);
      expect(JSON.parse(fs.readFileSync(path.join(root, 'workbench/build-static.lock/recovery.json'), 'utf8')).current_files).toEqual(['evidence.jsonl']);
      exported(root);
    } });
    const target = path.join(root, 'out/omics/releases/old/nested/evidence.csv');
    expect(fs.readFileSync(target)).toEqual(fs.readFileSync(source));
    expect(fs.statSync(source).ino).toBe(original.ino);
    expect(fs.statSync(target).ino).toBe(original.ino);
    expect(fs.statSync(target).dev).toBe(original.dev);
    expect(fs.lstatSync(target).isSymbolicLink()).toBe(false);
    const downloadTarget = path.join(root, 'out/omics/releases/current/evidence.jsonl');
    expect(fs.readFileSync(download, 'utf8')).toBe('{"value":0.123456789}\n');
    expect(fs.readFileSync(downloadTarget)).toEqual(fs.readFileSync(download));
    expect(fs.statSync(download).ino).toBe(originalDownload.ino);
    expect(fs.statSync(downloadTarget).ino).toBe(originalDownload.ino);
    expect(fs.statSync(downloadTarget).dev).toBe(originalDownload.dev);
    expect(fs.lstatSync(downloadTarget).isSymbolicLink()).toBe(false);
    expect(fs.readFileSync(path.join(root, 'workbench/unrelated.txt'), 'utf8')).toBe('preserve');
    expect(fs.existsSync(path.join(root, 'workbench/build-static.lock'))).toBe(false);
  });

  it('restores current downloads and history after build failure and does not export them', async () => {
    const root = fixture();
    await expect(buildStatic({ root, build: async () => { throw new Error('Next failed'); } })).rejects.toThrow('Next failed');
    expect(fs.readFileSync(path.join(root, 'public/omics/releases/old/nested/evidence.csv'), 'utf8')).toContain('0.123456789');
    expect(fs.existsSync(path.join(root, 'out/omics/releases/old'))).toBe(false);
    expect(fs.readFileSync(path.join(root, 'public/omics/releases/current/evidence.jsonl'), 'utf8')).toBe('{"value":0.123456789}\n');
    expect(fs.existsSync(path.join(root, 'out/omics/releases/current/evidence.jsonl'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'workbench/build-static.lock'))).toBe(false);
  });

  it('restores already staged files when moving a later current download fails', async () => {
    const root = fixture();
    const laterDownload = path.join(root, 'public/omics/releases/current/z-evidence.csv');
    fs.writeFileSync(laterDownload, 'score\n0.2\n');
    const rename = fs.renameSync;
    vi.spyOn(fs, 'renameSync').mockImplementation((source, destination) => {
      if (source === laterDownload) throw new Error('Staging failed');
      rename(source, destination);
    });
    const build = vi.fn();
    await expect(buildStatic({ root, build })).rejects.toThrow('Staging failed');
    expect(build).not.toHaveBeenCalled();
    expect(fs.readFileSync(laterDownload, 'utf8')).toBe('score\n0.2\n');
    expect(fs.readFileSync(path.join(root, 'public/omics/releases/current/evidence.jsonl'), 'utf8')).toBe('{"value":0.123456789}\n');
    expect(fs.existsSync(path.join(root, 'public/omics/releases/old/nested/evidence.csv'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'workbench/build-static.lock'))).toBe(false);
  });

  it.each(['SIGINT', 'SIGTERM'])('restores current downloads and history when interrupted by %s', async reason => {
    const root = fixture(), controller = new AbortController();
    await expect(buildStatic({ root, signal: controller.signal, build: async () => { controller.abort(reason); } })).rejects.toBe(reason);
    expect(fs.existsSync(path.join(root, 'public/omics/releases/old/nested/evidence.csv'))).toBe(true);
    expect(fs.readFileSync(path.join(root, 'public/omics/releases/current/evidence.jsonl'), 'utf8')).toBe('{"value":0.123456789}\n');
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
    expect(fs.readFileSync(path.join(root, 'public/omics/releases/current/evidence.jsonl'), 'utf8')).toBe('{"value":0.123456789}\n');
  });

  it('preserves current restore collisions and still restores historical files', async () => {
    const root = fixture();
    const download = path.join(root, 'public/omics/releases/current/evidence.jsonl');
    await expect(buildStatic({ root, build: async () => {
      fs.writeFileSync(download, 'new content');
      throw new Error('Next failed');
    } })).rejects.toThrow('restoration requires recovery');
    expect(fs.readFileSync(download, 'utf8')).toBe('new content');
    expect(fs.readFileSync(path.join(root, 'workbench/build-static.lock/current/evidence.jsonl'), 'utf8')).toBe('{"value":0.123456789}\n');
    const receipt = JSON.parse(fs.readFileSync(path.join(root, 'workbench/build-static.lock/recovery.json'), 'utf8'));
    expect(receipt.current_release).toBe('current');
    expect(receipt.current_files).toEqual(['evidence.jsonl']);
    expect(fs.existsSync(path.join(root, 'public/omics/releases/old/nested/evidence.csv'))).toBe(true);
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

  it('preflights current output collisions before linking either release', async () => {
    const root = fixture();
    const target = path.join(root, 'out/omics/releases/current/evidence.jsonl');
    await expect(buildStatic({ root, build: async () => {
      exported(root);
      fs.writeFileSync(target, 'keep output');
    } })).rejects.toThrow('Export collision');
    expect(fs.readFileSync(target, 'utf8')).toBe('keep output');
    expect(fs.existsSync(path.join(root, 'out/omics/releases/old'))).toBe(false);
    expect(fs.readFileSync(path.join(root, 'public/omics/releases/current/evidence.jsonl'), 'utf8')).toBe('{"value":0.123456789}\n');
    expect(fs.existsSync(path.join(root, 'public/omics/releases/old/nested/evidence.csv'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'workbench/build-static.lock'))).toBe(false);
  });

  it('rejects concurrent runs without disturbing the first staging directory', async () => {
    const root = fixture();
    await buildStatic({ root, build: async () => {
      await expect(buildStatic({ root, build: async () => { throw new Error('must not run'); } })).rejects.toThrow('already running or recovery required');
      expect(fs.existsSync(path.join(root, 'workbench/build-static.lock/historical/old/nested/evidence.csv'))).toBe(true);
      expect(fs.existsSync(path.join(root, 'workbench/build-static.lock/current/evidence.jsonl'))).toBe(true);
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

  it.each(['symlink', 'directory'])('rejects a current-release %s before staging any files', async entryKind => {
    const root = fixture();
    const entry = path.join(root, 'public/omics/releases/current/unexpected');
    if (entryKind === 'symlink') fs.symlinkSync(path.join(root, 'public/omics/catalogue.json'), entry);
    else fs.mkdirSync(entry);
    await expect(buildStatic({ root, build: async () => { throw new Error('must not run'); } })).rejects.toThrow('Expected a regular current release file');
    expect(fs.existsSync(path.join(root, 'public/omics/releases/old/nested/evidence.csv'))).toBe(true);
    expect(fs.readFileSync(path.join(root, 'public/omics/releases/current/evidence.jsonl'), 'utf8')).toBe('{"value":0.123456789}\n');
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
      expect(fs.existsSync(path.join(root, 'public/omics/releases/current/evidence.jsonl'))).toBe(false);
      child.kill(signal);
      expect(await finished).toBe(expectedCode);
      expect(fs.existsSync(path.join(root, 'public/omics/releases/old/nested/evidence.csv'))).toBe(true);
      expect(fs.readFileSync(path.join(root, 'public/omics/releases/current/evidence.jsonl'), 'utf8')).toBe('{"value":0.123456789}\n');
      expect(fs.existsSync(path.join(root, 'workbench/build-static.lock'))).toBe(false);
    } finally {
      if (child.exitCode === null && child.signalCode === null) { child.kill('SIGTERM'); await finished; }
    }
  });
});
