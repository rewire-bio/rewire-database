import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertStaticExporter, staticExportCopy } from '../scripts/static-export-links.mjs';

const roots: string[] = [];
function fixture(stem = 'database/exact-result') {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'static-page-links-')));
  roots.push(root);
  const source = path.join(root, '.next/server/app', `${stem}.html`);
  const destination = stem === 'index' ? path.join(root, 'out/index.html') : path.join(root, 'out', stem, 'index.html');
  fs.mkdirSync(path.dirname(source), { recursive: true });
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(source, 'exact source value -0.129; provenance Table 2');
  return { root, source, destination };
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('finished static page links', () => {
  it.each(['index', 'database/exact-result'])('shares %s bytes and retains the export after Next cleanup', async stem => {
    const { root, source, destination } = fixture(stem);
    const state = { linked: 0, bytes: 0 };
    const copy = staticExportCopy(root, fs.promises.copyFile.bind(fs.promises), state);
    await copy(source, destination);
    expect(fs.statSync(source).ino).toBe(fs.statSync(destination).ino);
    expect(state.linked).toBe(1);
    expect(state.bytes).toBe(fs.statSync(source).size);
    fs.rmSync(path.join(root, '.next/server'), { recursive: true });
    expect(fs.readFileSync(destination, 'utf8')).toBe('exact source value -0.129; provenance Table 2');
  });

  it('shares finished RSC with its exact text route', async () => {
    const { root, source, destination } = fixture();
    const rsc = source.replace(/\.html$/, '.rsc'), text = destination.replace(/\.html$/, '.txt');
    fs.renameSync(source, rsc);
    await staticExportCopy(root, fs.promises.copyFile.bind(fs.promises))(rsc, text);
    expect(fs.statSync(rsc).ino).toBe(fs.statSync(text).ino);
  });

  it('preserves existing export bytes rather than overwriting them', async () => {
    const { root, source, destination } = fixture();
    fs.writeFileSync(destination, 'existing export');
    await expect(staticExportCopy(root, fs.promises.copyFile.bind(fs.promises))(source, destination)).rejects.toMatchObject({ code: 'EEXIST' });
    expect(fs.readFileSync(destination, 'utf8')).toBe('existing export');
  });

  it('fails across filesystems without allocating a fallback copy', async () => {
    const { root, source, destination } = fixture();
    const copyFile = vi.fn(fs.promises.copyFile.bind(fs.promises));
    vi.spyOn(fs.promises, 'link').mockRejectedValue(Object.assign(new Error('different device'), { code: 'EXDEV' }));
    await expect(staticExportCopy(root, copyFile)(source, destination)).rejects.toMatchObject({ code: 'EXDEV' });
    expect(copyFile).not.toHaveBeenCalled();
    expect(fs.existsSync(destination)).toBe(false);
  });

  it('rejects source and destination-parent aliases', async () => {
    const { root, source, destination } = fixture();
    const original = `${source}.saved`;
    fs.renameSync(source, original);
    fs.symlinkSync(original, source);
    const copy = staticExportCopy(root, fs.promises.copyFile.bind(fs.promises));
    await expect(copy(source, destination)).rejects.toThrow('canonical');
    fs.unlinkSync(source);
    fs.renameSync(original, source);
    const parent = path.dirname(destination), saved = `${parent}-saved`;
    fs.renameSync(parent, saved);
    fs.symlinkSync(saved, parent);
    await expect(copy(source, destination)).rejects.toThrow('canonical');
  });

  it('rejects a different route or copy flags', async () => {
    const { root, source, destination } = fixture();
    const copy = staticExportCopy(root, fs.promises.copyFile.bind(fs.promises));
    await expect(copy(source, path.join(root, 'out/wrong.html'))).rejects.toThrow('route');
    await expect(copy(source, destination, fs.constants.COPYFILE_EXCL)).rejects.toThrow('route');
  });

  it('leaves unrelated copy semantics unchanged', async () => {
    const { root, source } = fixture();
    const destination = path.join(root, 'out/ordinary-copy.bin');
    const other = path.join(root, 'public/source.html');
    fs.mkdirSync(path.dirname(other));
    fs.copyFileSync(source, other);
    fs.writeFileSync(destination, 'old bytes');
    await staticExportCopy(root, fs.promises.copyFile.bind(fs.promises))(other, destination);
    expect(fs.readFileSync(destination)).toEqual(fs.readFileSync(source));
    expect(fs.statSync(other).ino).not.toBe(fs.statSync(destination).ino);
  });

  it('requires the exact reviewed exporter implementation', () => {
    expect(() => assertStaticExporter(process.cwd())).not.toThrow();
    const { root } = fixture();
    const next = path.join(root, 'node_modules/next');
    fs.mkdirSync(path.join(next, 'dist/export'), { recursive: true });
    fs.writeFileSync(path.join(next, 'package.json'), '{"version":"14.2.16"}');
    fs.writeFileSync(path.join(next, 'dist/export/index.js'), 'unreviewed exporter');
    expect(() => assertStaticExporter(root)).toThrow('reviewed');
  });
});
